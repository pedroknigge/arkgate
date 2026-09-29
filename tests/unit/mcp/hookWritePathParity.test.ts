/**
 * The one-shot PreToolUse hook is a hard write gate: it must fail closed when it
 * cannot run, judge aliased spellings of the same workspace, reconstruct the full
 * Codex apply_patch grammar, and enforce the same extra planes (ArkRules structure,
 * ArkOrder) that CI enforces on the written file.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withDistLock } from '../../helpers/distLock';

const repo = process.cwd();
let runtimeDir: string | undefined;
let mcpBin = path.join(repo, 'bin', 'ark-mcp.mjs');
const checkBin = path.join(repo, 'bin', 'ark-check.mjs');
const cleanup: string[] = [];

beforeAll(() => {
  withDistLock(() => {
    execSync('npm run build', { stdio: 'ignore' });
    runtimeDir = fs.mkdtempSync(path.join(repo, '.ark-hook-parity-'));
    fs.cpSync(path.join(repo, 'bin'), path.join(runtimeDir, 'bin'), { recursive: true });
    fs.cpSync(path.join(repo, 'dist'), path.join(runtimeDir, 'dist'), { recursive: true });
    fs.copyFileSync(path.join(repo, 'package.json'), path.join(runtimeDir, 'package.json'));
  });
  mcpBin = path.join(runtimeDir!, 'bin', 'ark-mcp.mjs');
}, 180000);

afterAll(() => {
  for (const dir of [runtimeDir, ...cleanup]) {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

const BASE_CONFIG = {
  schemaVersion: '1.3',
  include: ['src'],
  layers: [
    { name: 'DomainModel', patterns: ['src/domain/**'] },
    { name: 'Infrastructure', patterns: ['src/infra/**'] },
  ],
  rules: [{ from: 'DomainModel', to: 'Infrastructure', allowed: false }],
};
const BAD_IMPORT = "import { y } from '../infra/b';\nexport const c = y;\n";

function project(config: unknown, files: Record<string, string> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-hook-parity-'));
  cleanup.push(dir);
  const all: Record<string, string> = {
    'package.json': '{"name":"fx","private":true}',
    'src/infra/b.ts': 'export const y = 1;\n',
    'src/domain/a.ts': 'export const a = 1;\n',
    ...files,
  };
  if (config !== undefined) {
    all['ark.config.json'] = typeof config === 'string' ? config : JSON.stringify(config);
  }
  for (const [rel, content] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}

function hook(
  root: string,
  payload: unknown,
  { bin = mcpBin, env = {} }: { bin?: string; env?: Record<string, string> } = {}
) {
  const result = spawnSync(
    process.execPath,
    [bin, '--hook', '--root', root, '--config', 'ark.config.json'],
    { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...env } }
  );
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

const write = (root: string, rel: string, content: string) => ({
  tool_name: 'Write',
  tool_input: { file_path: path.join(root, rel), content },
});
const patch = (lines: string[]) => ({
  tool_name: 'apply_patch',
  tool_input: { command: ['*** Begin Patch', ...lines, '*** End Patch'].join('\n') },
});

describe('hook fails closed when the gate cannot run', () => {
  it('blocks a governed write when ark.config.json is malformed (exit 2, not 1)', () => {
    const root = project('{ "include": ["src"], "layers": [ ,,, }');
    const out = hook(root, write(root, 'src/domain/c.ts', BAD_IMPORT));
    expect(out.status).toBe(2);
    expect(out.stderr).toMatch(/write gate could not run/);
    expect(out.stderr).toMatch(/WRITE_GATE_UNAVAILABLE/);
  });

  it('blocks when the schemaVersion is unsupported; a project with no config is not blocked', () => {
    const invalid = project({ schemaVersion: '9.9' });
    expect(hook(invalid, write(invalid, 'src/domain/c.ts', BAD_IMPORT)).status).toBe(2);
    // No ark.config.json anywhere up the tree: not an Ark project (4.8.23 never blocked it).
    const missing = project(undefined);
    const out = hook(missing, write(missing, 'src/domain/c.ts', BAD_IMPORT));
    expect(out.status).toBe(0);
    expect(out.stderr).toMatch(/no ark\.config\.json found/);
  });

  it('walks up from the payload to the Ark root when the hook runs from a subdirectory', () => {
    const root = project(BASE_CONFIG);
    const good = write(root, 'src/domain/good.ts', 'export const good = 1;\n');
    const bad = write(root, 'src/domain/c.ts', BAD_IMPORT);
    // Host ran the hook from src/ with `--root .` and the --root-env var unset.
    const run = (payload: unknown) => {
      const result = spawnSync(
        process.execPath,
        [mcpBin, '--hook', '--root', '.', '--root-env', 'ARK_TEST_UNSET_ROOT', '--config', 'ark.config.json'],
        {
          input: JSON.stringify(payload),
          encoding: 'utf8',
          cwd: path.join(root, 'src'),
          env: { ...process.env, ARK_TEST_UNSET_ROOT: '' },
        }
      );
      return { status: result.status, stderr: result.stderr };
    };
    expect(run(good).status).toBe(0);
    const denied = run(bad);
    expect(denied.status).toBe(2);
    expect(denied.stderr).not.toMatch(/WRITE_GATE_UNAVAILABLE/);

    // A file outside any Ark project is never blocked.
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-hook-outside-'));
    cleanup.push(outside);
    expect(run(write(outside, 'x.ts', BAD_IMPORT)).status).toBe(0);

    // A discovered Ark root whose config cannot load still fails closed.
    const broken = project('{ broken');
    const result = spawnSync(
      process.execPath,
      [mcpBin, '--hook', '--root', '.', '--config', 'ark.config.json'],
      {
        input: JSON.stringify(write(broken, 'src/domain/c.ts', BAD_IMPORT)),
        encoding: 'utf8',
        cwd: path.join(broken, 'src'),
      }
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/WRITE_GATE_UNAVAILABLE/);
  });

  it('emits Grok deny JSON on stdout and still lets the config itself be repaired', () => {
    const root = project('{ broken');
    const grok = hook(root, {
      toolName: 'write',
      toolInput: { file_path: path.join(root, 'src/domain/c.ts'), content: BAD_IMPORT },
    });
    expect(grok.status).toBe(2);
    expect(JSON.parse(grok.stdout.trim().split('\n')[0])).toMatchObject({ decision: 'deny' });
    const repair = hook(root, write(root, 'ark.config.json', JSON.stringify(BASE_CONFIG)));
    expect(repair.status).toBe(0);
  });

  it('blocks when dist/ is missing (launcher fail-closed, no runtime import)', () => {
    const bare = fs.mkdtempSync(path.join(repo, '.ark-hook-nodist-'));
    cleanup.push(bare);
    fs.cpSync(path.join(repo, 'bin'), path.join(bare, 'bin'), { recursive: true });
    const root = project(BASE_CONFIG);
    const out = hook(root, write(root, 'src/domain/c.ts', BAD_IMPORT), {
      bin: path.join(bare, 'bin', 'ark-mcp.mjs'),
    });
    expect(out.status).toBe(2);
    expect(out.stderr).toMatch(/dist\/index\.js/);
  });

  it('denies a write that would leave ark.config.json unloadable', () => {
    const root = project(BASE_CONFIG);
    const out = hook(root, write(root, 'ark.config.json', '{ broken'));
    expect(out.status).toBe(2);
    expect(out.stderr).toMatch(/unloadable/);
    expect(hook(root, write(root, 'ark.config.json', JSON.stringify(BASE_CONFIG))).status).toBe(0);
  });

  it('keeps plumbing fail-open: malformed payload and non-file tools allow', () => {
    const root = project('{ broken');
    const garbage = spawnSync(
      process.execPath,
      [mcpBin, '--hook', '--root', root, '--config', 'ark.config.json'],
      { input: 'not json', encoding: 'utf8' }
    );
    expect(garbage.status).toBe(0);
    expect(hook(root, { tool_name: 'Bash', tool_input: { command: 'ls' } }).status).toBe(0);
  });
});

describe('hook judges aliased spellings of the same workspace', () => {
  it('blocks a violating write through a symlinked checkout', () => {
    const root = project(BASE_CONFIG);
    const linkParent = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-hook-link-'));
    cleanup.push(linkParent);
    const link = path.join(linkParent, 'link');
    fs.symlinkSync(root, link);
    const out = hook(root, write(link, 'src/domain/c.ts', BAD_IMPORT));
    expect(out.status).toBe(2);
    expect(out.stderr).toMatch(/LAYER_IMPORT_VIOLATION/);
    // And the reverse spelling: root via the link, file via the real path.
    expect(hook(link, write(root, 'src/domain/c.ts', BAD_IMPORT)).status).toBe(2);
  });

  it.skipIf(fs.realpathSync(os.tmpdir()) === os.tmpdir())(
    'blocks /tmp vs /private/tmp style realpath aliases in both directions',
    () => {
      const root = project(BASE_CONFIG);
      const real = fs.realpathSync(root);
      expect(hook(root, write(real, 'src/domain/c.ts', BAD_IMPORT)).status).toBe(2);
      expect(hook(real, write(root, 'src/domain/c.ts', BAD_IMPORT)).status).toBe(2);
    }
  );

  it('still allows a path that is truly outside the root', () => {
    const root = project(BASE_CONFIG);
    const other = project(BASE_CONFIG);
    expect(hook(root, write(other, 'src/domain/c.ts', BAD_IMPORT)).status).toBe(0);
  });
});

describe('hook reconstructs the full Codex apply_patch grammar', () => {
  const addImport = "+import { y } from '../infra/b';";

  it('blocks a forbidden import in a patch that ends with *** End of File', () => {
    const root = project(BASE_CONFIG);
    const out = hook(
      root,
      patch(['*** Update File: src/domain/a.ts', '@@', ' export const a = 1;', addImport, '*** End of File'])
    );
    expect(out.status).toBe(2);
    expect(out.stderr).toMatch(/must not import/);
  });

  it('blocks a first hunk without an @@ header', () => {
    const root = project(BASE_CONFIG);
    const out = hook(root, patch(['*** Update File: src/domain/a.ts', addImport, ' export const a = 1;']));
    expect(out.status).toBe(2);
  });

  it('judges *** Move to: at the destination (clean move allowed, forbidden move blocked)', () => {
    const root = project(BASE_CONFIG);
    const blocked = hook(
      root,
      patch([
        '*** Update File: src/domain/a.ts',
        '*** Move to: src/domain/moved.ts',
        '@@',
        addImport,
        ' export const a = 1;',
      ])
    );
    expect(blocked.status).toBe(2);
    const clean = hook(
      root,
      patch([
        '*** Update File: src/domain/a.ts',
        '*** Move to: src/domain/moved.ts',
        '@@',
        '-export const a = 1;',
        '+export const a = 2;',
      ])
    );
    expect(clean.status).toBe(0);
  });

  it('says so on stderr when a patch truly cannot be reconstructed', () => {
    const root = project(BASE_CONFIG);
    const out = hook(root, patch(['*** Update File: src/domain/a.ts', 'garbage line']));
    expect(out.status).toBe(0);
    expect(out.stderr).toMatch(/could not be fully reconstructed/);
  });
});

describe('hook enforces the extra planes CI enforces on the same file', () => {
  const ARKRULES_CONFIG = { ...BASE_CONFIG, arkRules: { DomainModel: 'arkrules/DomainModel.json' } };
  const rulesFile = (mode: 'enforced' | 'advisory') =>
    JSON.stringify({
      schemaVersion: '1.0',
      layer: 'DomainModel',
      structure: [{ id: 'DM-PRIV-1', sensor: 'aggregate-private-state', mode }],
      invariants: [],
    });
  const BAD_ORDER = 'export class Order { public total = 0; add(n: number) { this.total += n; } }\n';

  it('blocks an enforced ArkRules structure finding on Write and on apply_patch', () => {
    const root = project(ARKRULES_CONFIG, { 'arkrules/DomainModel.json': rulesFile('enforced') });
    const out = hook(root, write(root, 'src/domain/order.ts', BAD_ORDER));
    expect(out.status).toBe(2);
    expect(out.stderr).toMatch(/aggregate-private-state/);
    expect(out.stderr).toMatch(/ARKRULE_STRUCTURE/);
    const patched = hook(root, patch(['*** Add File: src/domain/order.ts', `+${BAD_ORDER.trim()}`]));
    expect(patched.status).toBe(2);
    // CI agrees once the file lands.
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), BAD_ORDER);
    const ci = spawnSync(
      process.execPath,
      [checkBin, '--root', root, '--config', path.join(root, 'ark.config.json'), '--json'],
      { encoding: 'utf8' }
    );
    expect(JSON.parse(ci.stdout).violations.map((v: { ruleId: string }) => v.ruleId)).toContain(
      'ARKRULE_STRUCTURE'
    );
    // Ratchet: editing the legacy file without adding a new finding is allowed.
    const edit = hook(root, {
      tool_name: 'Edit',
      tool_input: {
        file_path: path.join(root, 'src/domain/order.ts'),
        old_string: 'n: number',
        new_string: 'amount: number',
      },
    });
    expect(edit.status).toBe(0);
  });

  it('leaves advisory ArkRules to CI warnings (write allowed)', () => {
    const root = project(ARKRULES_CONFIG, { 'arkrules/DomainModel.json': rulesFile('advisory') });
    expect(hook(root, write(root, 'src/domain/order.ts', BAD_ORDER)).status).toBe(0);
  });

  it('fails closed when a referenced ArkRules file is missing', () => {
    const root = project(ARKRULES_CONFIG);
    const out = hook(root, write(root, 'src/domain/order.ts', 'export const q = 1;\n'));
    expect(out.status).toBe(2);
    expect(out.stderr).toMatch(/referenced ArkRules file/);
  });

  it('fails closed on an EXISTING file too (the ratchet never cancels a contract failure)', () => {
    const root = project(ARKRULES_CONFIG);
    // src/domain/a.ts exists on disk; its current version reports the same contract
    // failure, which must not be counted as pre-existing debt.
    const out = hook(root, write(root, 'src/domain/a.ts', BAD_ORDER));
    expect(out.status).toBe(2);
    expect(out.stderr).toMatch(/WRITE_GATE_UNAVAILABLE/);
    expect(out.stderr).toMatch(/referenced ArkRules file/);
    const edit = hook(root, {
      tool_name: 'Edit',
      tool_input: {
        file_path: path.join(root, 'src/domain/a.ts'),
        old_string: 'a = 1',
        new_string: 'a = 2',
      },
    });
    expect(edit.status).toBe(2);
  });

  it('treats referenced arkrules/*.json as law files: a broken or deleted one is denied', () => {
    const root = project(ARKRULES_CONFIG, { 'arkrules/DomainModel.json': rulesFile('enforced') });
    const broken = hook(root, write(root, 'arkrules/DomainModel.json', '{ broken'));
    expect(broken.status).toBe(2);
    expect(broken.stderr).toMatch(/WRITE_GATE_UNAVAILABLE/);
    expect(broken.stderr).toMatch(/arkrules\/DomainModel\.json/);
    const invalid = hook(root, write(root, 'arkrules/DomainModel.json', '{"schemaVersion":"1.0"}'));
    expect(invalid.status).toBe(2);
    const deleted = hook(root, patch(['*** Delete File: arkrules/DomainModel.json']));
    expect(deleted.status).toBe(2);
    expect(deleted.stderr).toMatch(/would be deleted/);
    // A valid replacement (e.g. demoting to advisory in a law change) is not blocked here.
    expect(hook(root, write(root, 'arkrules/DomainModel.json', rulesFile('advisory'))).status).toBe(0);
    // Unreferenced JSON is not law.
    expect(hook(root, write(root, 'arkrules/Other.json', '{ broken')).status).toBe(0);
    // The enforced rule still blocks after the denied tamper attempt.
    const out = hook(root, write(root, 'src/domain/a.ts', BAD_ORDER));
    expect(out.status).toBe(2);
    expect(out.stderr).toMatch(/ARKRULE_STRUCTURE/);
    // Structure denies carry the ArkRule action, not the layer-import "move the import" line.
    expect(out.stderr).not.toMatch(/Move the import or run \/ark-place/);
  });

  it('apply_patch ratchets pre-existing ArkRules debt (baseline brownfield) but blocks new debt', () => {
    const root = project(ARKRULES_CONFIG, {
      'arkrules/DomainModel.json': rulesFile('enforced'),
      'src/domain/order.ts': BAD_ORDER,
    });
    const clean = hook(
      root,
      patch(['*** Update File: src/domain/a.ts', '@@', '-export const a = 1;', '+export const a = 2;'])
    );
    expect(clean.status).toBe(0);
    const edited = hook(
      root,
      patch(['*** Update File: src/domain/order.ts', '@@', `-${BAD_ORDER.trim()}`, `+${BAD_ORDER.trim().replace('n: number', 'amount: number').replace('+= n', '+= amount')}`])
    );
    expect(edited.status).toBe(0);
    const added = hook(
      root,
      patch(['*** Add File: src/domain/cart.ts', '+export class Cart { public items = 0; }'])
    );
    expect(added.status).toBe(2);
    expect(added.stderr).toMatch(/Cart/);
    expect(added.stderr).not.toMatch(/class Order/);
  });

  it('blocks enforced ArkOrder kernel-in-domain and generic update', () => {
    const main =
      "import { createOrderPlane } from 'arkgate/order';\n" +
      'export const plane = createOrderPlane({} as never);\n';
    const config = {
      ...BASE_CONFIG,
      layers: [
        ...BASE_CONFIG.layers,
        { name: 'ApplicationOrchestration', patterns: ['src/app/**', 'src/main.ts'] },
      ],
      arkOrder: {
        mode: 'enforced',
        planeRoots: ['src/main.ts'],
        managedLayers: ['ApplicationOrchestration'],
        xiKeys: ['plan'],
      },
    };
    const root = project(config, { 'src/main.ts': main });
    const kernel = hook(
      root,
      write(root, 'src/domain/x.ts', "import { createOrderPlane } from 'arkgate/order';\nexport const z = createOrderPlane;\n")
    );
    expect(kernel.status).toBe(2);
    expect(kernel.stderr).toMatch(/ARKORDER_KERNEL_IN_DOMAIN/);
    const update = hook(root, write(root, 'src/main.ts', `${main}plane.update({ plan: 'pro' });\n`));
    expect(update.status).toBe(2);
    expect(update.stderr).toMatch(/ARKORDER_GENERIC_UPDATE/);

    const advisoryRoot = project(
      { ...config, arkOrder: { ...config.arkOrder, mode: 'advisory' } },
      { 'src/main.ts': main }
    );
    expect(
      hook(
        advisoryRoot,
        write(advisoryRoot, 'src/domain/x.ts', "import { createOrderPlane } from 'arkgate/order';\nexport const z = createOrderPlane;\n")
      ).status
    ).toBe(0);
  });
});

describe('arkgate-mcp --help / --version', () => {
  it('prints and exits without starting the stdio server', () => {
    const version = spawnSync(process.execPath, [mcpBin, '--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(version.status).toBe(0);
    const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
    expect(version.stdout.trim()).toBe(pkg.version);
    const help = spawnSync(process.execPath, [mcpBin, '--help'], {
      input: '',
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(help.status).toBe(0);
    expect(help.stdout).toMatch(/^Usage: arkgate-mcp/);
  });
});
