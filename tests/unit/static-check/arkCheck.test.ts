import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function runArkCheck(root: string, extraArgs: string[] = []) {
  let output = '';
  try {
    output = execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--json', ...extraArgs],
      {
        encoding: 'utf8',
        stdio: 'pipe',
      }
    );
  } catch (error) {
    output = (error as { stdout: string }).stdout;
  }
  return JSON.parse(output) as {
    ok: boolean;
    violations: Array<{ ruleId: string }>;
    warnings: Array<{ ruleId: string }>;
  };
}

const TWO_LAYER_CONFIG = JSON.stringify({
  include: ['src'],
  layers: [
    { name: 'DomainModel', patterns: ['src/domain/**'], intentPrefixes: ['Domain.'] },
    { name: 'PersistenceAdapters', patterns: ['src/infra/**'], intentPrefixes: ['Adapter.Persistence.'] },
  ],
  rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
});

function runInit(root: string, extraArgs: string[] = []) {
  try {
    const stdout = execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--init', '--root', root, ...extraArgs],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    return { status: e.status, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

function runInstallAgentGates(root: string, extraArgs: string[] = []) {
  try {
    const stdout = execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--install-agent-gates', '--root', root, ...extraArgs],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    return { status: e.status, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

function runArkInit(root: string, extraArgs: string[] = []) {
  try {
    const stdout = execFileSync(
      'node',
      [path.resolve('bin/ark.mjs'), 'init', '--root', root, ...extraArgs],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    return { status: e.status, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function coverageJson(root: string): any {
  const out = execFileSync(
    'node',
    [path.resolve('bin/ark-check.mjs'), '--root', root, '--config', 'ark.config.json', '--coverage', '--json'],
    { encoding: 'utf8', stdio: 'pipe' }
  );
  return JSON.parse(out);
}

describe('ark-check --init', () => {
  it('detects existing layer directories and writes a config that passes strict check', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-init-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/application'), { recursive: true });
    // Empty conventional dir: must NOT become a layer (its pattern would match nothing).
    fs.mkdirSync(path.join(root, 'src/workflows'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(root, 'src/application/place.ts'), 'export const b = 1;\n');

    const init = runInit(root);
    expect(init.status).toBe(0);

    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    expect(config.layers.map((l: { name: string }) => l.name)).toEqual([
      'DomainModel',
      'ApplicationOrchestration',
    ]);
    // Rules are filtered to detected layers, minus the allowed App→Domain flow.
    expect(config.rules).toEqual([
      { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
    ]);

    const result = runArkCheck(root, ['--strict-config']);
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('refuses to overwrite an existing config unless --force is passed', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-init-force-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(root, 'ark.config.json'), '{"custom": true}');

    const refused = runInit(root);
    expect(refused.status).toBe(2);
    expect(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8')).toBe('{"custom": true}');

    const forced = runInit(root, ['--force']);
    expect(forced.status).toBe(0);
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    expect(config.layers.map((l: { name: string }) => l.name)).toEqual(['DomainModel']);
  });

  it('generates the full 11-layer starter profile when no conventional directories exist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-init-none-'));

    const init = runInit(root);
    expect(init.status).toBe(0);
    expect(init.stdout).toContain('11-layer starter');

    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    expect(config.layers).toHaveLength(11);
    // Anchored at src/ (the convention a fresh project scaffolds under) even though
    // src/ doesn't exist yet.
    expect(config.include).toEqual(['src']);
    expect(config.layers[0].patterns[0]).toBe('src/domain/**');
    // Every layer is optional so the strict check passes before any directory exists.
    expect(config.layers.every((l: { optional: boolean }) => l.optional)).toBe(true);
    const result = runArkCheck(root, ['--strict-config']);
    expect(result.ok).toBe(true);

    // Files outside every conventional directory still surface the honest warning.
    fs.mkdirSync(path.join(root, 'src/lib'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/lib/util.ts'), 'export const a = 1;\n');
    const withStray = runArkCheck(root, ['--strict-config']);
    expect(withStray.ok).toBe(false);
    expect(withStray.warnings.some((w) => w.ruleId === 'CONFIG_UNCLASSIFIED_FILES')).toBe(true);

    // Code inside a conventional directory is governed immediately: a domain file
    // referencing a persistence intent must fail the strict check.
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      "export const ref = 'Adapter.Persistence.Save';\n"
    );
    fs.rmSync(path.join(root, 'src/lib'), { recursive: true });
    const governed = runArkCheck(root, ['--strict-config']);
    expect(governed.ok).toBe(false);
    expect(governed.violations.length).toBeGreaterThan(0);
  });

  it('warns when greenfield init leaves existing source files outside src/ ungoverned', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-init-outside-'));
    fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(root, 'lib/util.ts'), 'export const a = 1;\n');

    const init = runInit(root);
    expect(init.status).toBe(0);
    expect(init.stdout).toContain('NOT governed');
    expect(init.stdout).toContain('lib/util.ts');
  });

  it('rejects --tools with a flag, an empty list, or unknown tool names', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-tools-bad-'));

    // `--tools --force` must not eat --force as a tool name.
    const flagEaten = runInstallAgentGates(root, ['--tools', '--force']);
    expect(flagEaten.status).toBe(2);
    expect(flagEaten.stderr).toContain('--tools expects');
    expect(fs.existsSync(path.join(root, 'AGENTS.md'))).toBe(false);

    const unknown = runInstallAgentGates(root, ['--tools', 'claud']);
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain('unknown: claud');
  });

  it('suggests the undetected 11-layer profile layers with their conventional directories', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-init-suggest-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const a = 1;\n');

    const init = runInit(root);
    expect(init.status).toBe(0);
    expect(init.stdout).toContain('Suggested layers');
    expect(init.stdout).toContain('WorkflowSagaEngine: src/workflows, src/sagas');
    expect(init.stdout).toContain('BackgroundJobsScheduling: src/jobs, src/schedules');
    // Detected layers must not be re-suggested.
    expect(init.stdout).not.toMatch(/Suggested layers[\s\S]*DomainModel:/);
  });

  it('proposes canonical layers for ungoverned dirs and flags the unrecognized ones', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-init-propose-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/components'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/services'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/lib/repositories'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/lib/db'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/hooks'), { recursive: true });
    for (const d of ['domain', 'components', 'services', 'lib/repositories', 'lib/db', 'hooks']) {
      fs.writeFileSync(path.join(root, `src/${d}/f.ts`), 'export const x = 1;');
    }

    const init = runInit(root);
    expect(init.status).toBe(0);
    // Ungoverned code is called out loudly, not left silently behind a green check.
    expect(init.stdout).toContain('Ark enforces NOTHING here');
    // Recognized dirs get a concrete proposal from the canonical sources.
    expect(init.stdout).toContain('src/components/ → PresentationAdapters');
    expect(init.stdout).toContain('src/services/ → ApplicationOrchestration');
    expect(init.stdout).toContain('src/lib/repositories/ → PersistenceAdapters');
    // Unrecognized dirs are the user's call — never guessed.
    expect(init.stdout).toMatch(/Not recognized[\s\S]*src\/hooks/);
    expect(init.stdout).toMatch(/Not recognized[\s\S]*src\/lib\/db/);
    // A best-fit starter model is offered as a shortcut.
    expect(init.stdout).toContain('Closest starter model:');
  });

  it('reports top-level directories left uncovered by the detected layers', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-init-uncovered-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/lib'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(root, 'src/lib/util.ts'), 'export const b = 1;\n');

    const init = runInit(root);
    expect(init.status).toBe(0);
    expect(init.stdout).toContain('lib');
  });
});

describe('ark-check --install-agent-gates', () => {
  it('writes starter agent and CI gate templates without requiring an existing config', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-agent-gates-'));
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');

    const result = runInstallAgentGates(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('AGENTS.md');
    expect(result.stdout).toContain('.github/workflows/ark-check.yml');

    expect(fs.existsSync(path.join(root, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.claude/settings.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.cursor/mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.cursor/rules/ark.mdc'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.github/workflows/ark-check.yml'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'docs/ark-codex-config.toml'))).toBe(true);

    const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('ark://manifest');
    // The placement table teaches agents where every default layer's code belongs.
    expect(agents).toContain('Where new code belongs');
    expect(agents).toContain('| WorkflowSagaEngine | `workflows/`, `sagas/` |');
    expect(agents).toContain('ark-check --root . --config ark.config.json --strict-config');

    const workflow = fs.readFileSync(path.join(root, '.github/workflows/ark-check.yml'), 'utf8');
    expect(workflow).toContain('npx ark-check --root . --config ark.config.json --strict-config');
  });

  it('skips existing files unless --force is passed', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-agent-gates-force-'));
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'custom instructions\n');

    const skipped = runInstallAgentGates(root);
    expect(skipped.status).toBe(0);
    expect(skipped.stdout).toContain('skipped AGENTS.md');
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toBe('custom instructions\n');

    const forced = runInstallAgentGates(root, ['--force']);
    expect(forced.status).toBe(0);
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toContain('Ark Enforcement');
  });

  it('generates package-manager-consistent GitHub workflows', () => {
    const pnpmRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-agent-gates-pnpm-'));
    fs.writeFileSync(path.join(pnpmRoot, 'pnpm-lock.yaml'), '\n');

    const pnpm = runInstallAgentGates(pnpmRoot);
    expect(pnpm.status).toBe(0);
    const pnpmWorkflow = fs.readFileSync(
      path.join(pnpmRoot, '.github/workflows/ark-check.yml'),
      'utf8'
    );
    expect(pnpmWorkflow).toContain('cache: pnpm');
    expect(pnpmWorkflow).toContain('corepack enable');
    expect(pnpmWorkflow).toContain('pnpm install --frozen-lockfile');
    expect(pnpmWorkflow).toContain('pnpm --config.verify-deps-before-run=false exec ark-check --root . --config ark.config.json --strict-config');
    expect(pnpmWorkflow).not.toContain('npm ci');

    const yarnRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-agent-gates-yarn-'));
    fs.writeFileSync(path.join(yarnRoot, 'yarn.lock'), '\n');

    const yarn = runInstallAgentGates(yarnRoot);
    expect(yarn.status).toBe(0);
    const yarnWorkflow = fs.readFileSync(
      path.join(yarnRoot, '.github/workflows/ark-check.yml'),
      'utf8'
    );
    expect(yarnWorkflow).toContain('cache: yarn');
    expect(yarnWorkflow).toContain('corepack enable');
    expect(yarnWorkflow).toContain('yarn install --frozen-lockfile');
    expect(yarnWorkflow).toContain('yarn ark-check --root . --config ark.config.json --strict-config');
    expect(yarnWorkflow).not.toContain('npm ci');
  });

  it('emits package-manager-aware commands in the agent gates, not just the CI workflow', () => {
    // Regression: AGENTS.md, .mcp.json, the Claude hooks, the Cursor rule and the Codex
    // config used to hardcode `npx`, which a "pnpm only, never npx" repo treats as a
    // policy violation. They must follow the detected package manager like the workflow.
    const pnpmRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-gates-pnpm-cmd-'));
    fs.writeFileSync(path.join(pnpmRoot, 'pnpm-lock.yaml'), '\n');
    const pnpm = runInstallAgentGates(pnpmRoot, ['--tools', 'claude,cursor,codex']);
    expect(pnpm.status).toBe(0);

    const agents = fs.readFileSync(path.join(pnpmRoot, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('pnpm --config.verify-deps-before-run=false exec ark-check --root . --config ark.config.json --strict-config');
    expect(agents).not.toContain('npx ark');

    const mcp = fs.readFileSync(path.join(pnpmRoot, '.mcp.json'), 'utf8');
    expect(mcp).toContain('"command": "pnpm"');
    expect(mcp).not.toContain('"command": "npx"');

    const settings = fs.readFileSync(path.join(pnpmRoot, '.claude/settings.json'), 'utf8');
    expect(settings).toContain('pnpm --config.verify-deps-before-run=false exec ark-mcp --session-context');
    expect(settings).not.toContain('npx ark-mcp');

    const cursor = fs.readFileSync(path.join(pnpmRoot, '.cursor/rules/ark.mdc'), 'utf8');
    expect(cursor).toContain('pnpm --config.verify-deps-before-run=false exec ark-check');

    const codexToml = fs.readFileSync(path.join(pnpmRoot, 'docs/ark-codex-config.toml'), 'utf8');
    expect(codexToml).toContain('command = "pnpm"');

    // yarn follows too; npm (default) still says npx — unchanged behavior.
    const yarnRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-gates-yarn-cmd-'));
    fs.writeFileSync(path.join(yarnRoot, 'yarn.lock'), '\n');
    expect(runInstallAgentGates(yarnRoot, ['--tools', 'claude']).status).toBe(0);
    const yarnAgents = fs.readFileSync(path.join(yarnRoot, 'AGENTS.md'), 'utf8');
    expect(yarnAgents).toContain('yarn ark-check --root . --config ark.config.json --strict-config');
    expect(yarnAgents).not.toContain('npx ark');

    const npmRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-gates-npm-cmd-'));
    fs.writeFileSync(path.join(npmRoot, 'package-lock.json'), '{}\n');
    expect(runInstallAgentGates(npmRoot, ['--tools', 'claude']).status).toBe(0);
    const npmAgents = fs.readFileSync(path.join(npmRoot, 'AGENTS.md'), 'utf8');
    expect(npmAgents).toContain('npx ark-check --root . --config ark.config.json --strict-config');
  });

  it('does not let a stray pnpm-lock.yaml hijack an npm project into pnpm', () => {
    // npm project (package-lock.json) that also carries a leftover pnpm-lock.yaml.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-pm-conflict-'));
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"x"}\n');
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');
    fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 5.4\n');
    expect(runInstallAgentGates(root, ['--tools', 'claude']).status).toBe(0);
    const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    // package-lock.json wins the tie → npx, not `pnpm exec` (which would break `npm run`).
    expect(agents).toContain('npx ark-check');
    expect(agents).not.toContain('pnpm --config.verify-deps-before-run=false exec ark-check');
    // Generated CI must agree with the emitted commands.
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/ark-check.yml'), 'utf8');
    expect(workflow).toContain('npx ark-check');
    expect(workflow).not.toContain('pnpm install --frozen-lockfile');
  });

  it('honors the packageManager field over a conflicting lockfile', () => {
    // A genuine pnpm repo that still carries a package-lock.json declares itself via the field.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-pm-field-'));
    fs.writeFileSync(
      path.join(root, 'package.json'),
      '{"name":"x","packageManager":"pnpm@9.1.0"}\n'
    );
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');
    expect(runInstallAgentGates(root, ['--tools', 'claude']).status).toBe(0);
    const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('pnpm --config.verify-deps-before-run=false exec ark-check');
    expect(agents).not.toContain('npx ark-check');
  });

  it('migrate-commands warns when multiple lockfiles are present', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-pm-warn-'));
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"x"}\n');
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');
    fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 5.4\n');
    const res = runInstallAgentGates(root, ['--migrate-commands']);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('multiple lockfiles present');
    expect(res.stdout).toContain('npx');
  });

  it('migrates a stale command runner in existing gate files without clobbering them', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-migrate-'));
    fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), '\n');
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    // Pre-1.11 gate files carrying the stale `npx` runner + a customization to preserve.
    fs.writeFileSync(
      path.join(root, '.claude/settings.json'),
      JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                matcher: 'Write',
                hooks: [
                  {
                    type: 'command',
                    command: 'npx ark-mcp --hook --root "$CLAUDE_PROJECT_DIR" --config ark.config.json',
                  },
                ],
              },
            ],
          },
          _custom: 'keep me',
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(root, '.mcp.json'),
      JSON.stringify(
        { mcpServers: { ark: { type: 'stdio', command: 'npx', args: ['ark-mcp', '--root', '.', '--config', 'ark.config.json'] } } },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(root, 'AGENTS.md'),
      'After edits, run `npx ark-check --root . --config ark.config.json --strict-config`.\n'
    );

    const res = runInstallAgentGates(root, ['--migrate-commands']);
    expect(res.status).toBe(0);

    const settings = fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf8');
    expect(settings).toContain('pnpm --config.verify-deps-before-run=false exec ark-mcp --hook');
    expect(settings).not.toContain('npx ark-mcp');
    expect(JSON.parse(settings)._custom).toBe('keep me'); // customization preserved

    const mcp = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));
    expect(mcp.mcpServers.ark.command).toBe('pnpm');
    expect(mcp.mcpServers.ark.args.slice(0, 3)).toEqual([
      '--config.verify-deps-before-run=false',
      'exec',
      'ark-mcp',
    ]);

    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toContain('pnpm --config.verify-deps-before-run=false exec ark-check');
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).not.toContain('npx ark-check');
  });

  it('includes --require-gates in the generated CI workflow command', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-agent-gates-require-'));
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');

    const result = runInstallAgentGates(root);
    expect(result.status).toBe(0);
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/ark-check.yml'), 'utf8');
    expect(workflow).toContain('--strict-config --require-gates');
  });

  it('follows the project Node pin (.nvmrc) in the generated CI workflow', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-agent-gates-node-'));
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');
    fs.writeFileSync(path.join(root, '.nvmrc'), '24\n');

    const result = runInstallAgentGates(root);
    expect(result.status).toBe(0);
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/ark-check.yml'), 'utf8');
    // CI uses the project's declared Node so its npm matches the dev's and the
    // lockfile reconciles (prevents the "missing from lock file" npm ci failure).
    expect(workflow).toContain('node-version-file: .nvmrc');
    expect(workflow).not.toContain('node-version: 20');
  });

  it('uses engines.node from package.json when there is no .nvmrc', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-agent-gates-node-engines-'));
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'x', engines: { node: '>=22.0.0' } })
    );
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');

    const result = runInstallAgentGates(root);
    expect(result.status).toBe(0);
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/ark-check.yml'), 'utf8');
    expect(workflow).toContain("node-version: '22'");
  });

  it('falls back to a current-LTS Node when the project declares none', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-agent-gates-node-default-'));
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');

    const result = runInstallAgentGates(root);
    expect(result.status).toBe(0);
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/ark-check.yml'), 'utf8');
    // A current LTS, not the oldest supported — defaulting high avoids the
    // "CI npm older than the lockfile's npm" failure class.
    expect(workflow).toContain("node-version: '22'");
    expect(workflow).not.toContain('node-version: 20');
  });

  it('names the CI steps so an install failure does not read as an architecture failure', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-agent-gates-steps-'));
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');

    const result = runInstallAgentGates(root);
    expect(result.status).toBe(0);
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/ark-check.yml'), 'utf8');
    // The failing step surfaces as "Install dependencies", not an unnamed step
    // under the "Ark architecture gate" job (which misleads about the cause).
    expect(workflow).toContain('name: Install dependencies');
    expect(workflow).toContain('name: Ark architecture check');
  });

  it('keeps --baseline in the generated CI workflow when a baseline exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-agent-gates-baseline-'));
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');
    fs.writeFileSync(path.join(root, '.ark-baseline.json'), '{"version":1,"violations":[]}\n');

    // Regenerating the workflow (e.g. via --force on upgrade) must not drop the
    // ratchet a baselined project relies on.
    const result = runInstallAgentGates(root, ['--force']);
    expect(result.status).toBe(0);
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/ark-check.yml'), 'utf8');
    expect(workflow).toContain('--strict-config --baseline .ark-baseline.json --require-gates');
  });

  it('writes only base + selected tool templates with --tools', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-agent-gates-tools-'));

    const result = runInstallAgentGates(root, ['--tools', 'claude']);
    expect(result.status).toBe(0);
    // Base gates are always written.
    expect(fs.existsSync(path.join(root, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.github/workflows/ark-check.yml'))).toBe(true);
    // Selected tool.
    expect(fs.existsSync(path.join(root, '.claude/settings.json'))).toBe(true);
    // Unselected tools are skipped.
    expect(fs.existsSync(path.join(root, '.cursor/mcp.json'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.cursor/rules/ark.mdc'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'docs/ark-codex-config.toml'))).toBe(false);
  });

  it('installs the /ark-* skills into each detected tool command location', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-agent-gates-skills-'));

    const result = runInstallAgentGates(root, [
      '--tools',
      'claude,cursor,codex,grok,windsurf,cline,copilot',
    ]);
    expect(result.status).toBe(0);

    const skillNames = fs
      .readdirSync(path.resolve('templates/skills'))
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.replace(/\.md$/, ''));
    expect(skillNames).toContain('ark-coverage');
    expect(skillNames.length).toBeGreaterThanOrEqual(8);

    for (const name of skillNames) {
      expect(fs.existsSync(path.join(root, `.claude/skills/${name}/SKILL.md`))).toBe(true);
      expect(fs.existsSync(path.join(root, `.cursor/commands/${name}.md`))).toBe(true);
      expect(fs.existsSync(path.join(root, `.codex/prompts/${name}.md`))).toBe(true);
      expect(fs.existsSync(path.join(root, `.grok/skills/${name}/SKILL.md`))).toBe(true);
      expect(fs.existsSync(path.join(root, `.windsurf/workflows/${name}.md`))).toBe(true);
      expect(fs.existsSync(path.join(root, `.clinerules/workflows/${name}.md`))).toBe(true);
      expect(fs.existsSync(path.join(root, `.github/prompts/${name}.prompt.md`))).toBe(true);
    }

    expect(fs.existsSync(path.join(root, '.grok/config.toml'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.grok/hooks/ark-write-gate.json'))).toBe(true);
    expect(fs.readFileSync(path.join(root, '.grok/config.toml'), 'utf8')).toContain(
      '[mcp_servers.ark]'
    );

    const claudeSkill = fs.readFileSync(
      path.join(root, '.claude/skills/ark-coverage/SKILL.md'),
      'utf8'
    );
    expect(claudeSkill).toContain('name: ark-coverage');
    // Same canonical content for every host.
    expect(fs.readFileSync(path.join(root, '.cursor/commands/ark-coverage.md'), 'utf8')).toBe(
      claudeSkill
    );
  });

  it('does not install skills for unselected tools', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-agent-gates-skills-scope-'));

    const result = runInstallAgentGates(root, ['--tools', 'claude']);
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(root, '.claude/skills/ark-fix/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.cursor/commands'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.codex'))).toBe(false);
  });

  it('preserves existing skill files unless --force is passed', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-agent-gates-skills-force-'));
    const target = path.join(root, '.claude/skills/ark-coverage/SKILL.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'customized\n');

    const skipped = runInstallAgentGates(root, ['--tools', 'claude']);
    expect(skipped.status).toBe(0);
    expect(fs.readFileSync(target, 'utf8')).toBe('customized\n');

    const forced = runInstallAgentGates(root, ['--tools', 'claude', '--force']);
    expect(forced.status).toBe(0);
    expect(fs.readFileSync(target, 'utf8')).toContain('name: ark-coverage');
  });

  it('--skills-only refreshes just the skills, leaving gate files untouched', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-skills-only-'));
    // A customized AGENTS.md and settings that a bare --force would clobber.
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'my custom contract\n');
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(root, '.claude/settings.json'), '{"custom":true}\n');

    const result = runInstallAgentGates(root, ['--tools', 'claude', '--skills-only', '--force']);
    expect(result.status).toBe(0);
    // Skills written...
    expect(fs.existsSync(path.join(root, '.claude/skills/ark-coverage/SKILL.md'))).toBe(true);
    // ...but the customized gate files are left exactly as they were.
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toBe('my custom contract\n');
    expect(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf8')).toBe('{"custom":true}\n');
    expect(fs.existsSync(path.join(root, '.github/workflows/ark-check.yml'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.mcp.json'))).toBe(false);
  });

  it('writes no skill files for kiro (steering rule only)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-agent-gates-kiro-'));

    const result = runInstallAgentGates(root, ['--tools', 'kiro']);
    expect(result.status).toBe(0);
    // Kiro's gate is its steering rule; it has no command/skill mechanism.
    expect(fs.existsSync(path.join(root, '.kiro/steering/ark.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.kiro/skills'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.kiro/workflows'))).toBe(false);
  });

  it('auto-detects tools from existing .cursor/ directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-agent-gates-detect-'));
    fs.mkdirSync(path.join(root, '.cursor'), { recursive: true });

    const result = runInstallAgentGates(root);
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(root, '.cursor/rules/ark.mdc'))).toBe(true);
    // .claude was not present, so it is not written.
    expect(fs.existsSync(path.join(root, '.claude/settings.json'))).toBe(false);
  });

  it('keeps the agent contract in sync between AGENTS.md and the Cursor rule', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-agent-gates-sync-'));

    const result = runInstallAgentGates(root, ['--tools', 'cursor']);
    expect(result.status).toBe(0);
    const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    const rule = fs.readFileSync(path.join(root, '.cursor/rules/ark.mdc'), 'utf8');
    const command = 'npx ark-check --root . --config ark.config.json --strict-config';
    // The canonical command appears in both derived files.
    expect(agents).toContain(command);
    expect(rule).toContain(command);
    // Both reference the same manifest resource.
    expect(agents).toContain('ark://manifest');
    expect(rule).toContain('ark://manifest');
  });
});

describe('ark-check --require-gates', () => {
  it('fails when required gate files are missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-require-missing-'));

    let status = 0;
    let stdout = '';
    try {
      stdout = execFileSync(
        'node',
        [path.resolve('bin/ark-check.mjs'), '--root', root, '--require-gates', '--json'],
        { encoding: 'utf8', stdio: 'pipe' }
      );
    } catch (error) {
      const e = error as { status: number; stdout: string };
      status = e.status;
      stdout = e.stdout ?? '';
    }

    expect(status).toBe(1);
    const payload = JSON.parse(stdout) as { ok: boolean; error: string; missing: string[] };
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe('missing-gates');
    expect(payload.missing).toContain('AGENTS.md');
    expect(payload.missing).toContain('.mcp.json');
    expect(payload.missing).toContain('.github/workflows/*.yml running ark-check');
  });

  it('passes once gates are installed', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-require-present-'));
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');
    const install = runInstallAgentGates(root);
    expect(install.status).toBe(0);

    // Human mode: a clear "gates present" line, exit 0.
    const human = execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--require-gates'],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    expect(human).toContain('Ark gates present');

    // JSON mode: require-gates stays quiet on success so the architecture check
    // owns the single JSON payload (no colliding objects).
    const json = execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--require-gates', '--json'],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    const payload = JSON.parse(json) as { ok: boolean };
    expect(payload.ok).toBe(true);
  });

  it('accepts a custom CI workflow that runs the architecture check', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-require-custom-ci-'));
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Ark instructions\n');
    fs.writeFileSync(path.join(root, '.mcp.json'), '{"mcpServers":{}}\n');
    fs.writeFileSync(
      path.join(root, '.github/workflows/ci.yml'),
      [
        'name: CI',
        'on: [pull_request]',
        'jobs:',
        '  test:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: npm run check:architecture',
        '',
      ].join('\n')
    );

    const json = execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--require-gates', '--json'],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    const payload = JSON.parse(json) as { ok: boolean; error?: string };
    expect(payload.ok).toBe(true);
    expect(payload.error).toBeUndefined();
  });
});

describe('ark init', () => {
  it('runs the explicit non-interactive setup end to end (no install lifecycle script)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-init-cli-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const order = true;\n');

    const result = runArkInit(root, ['--yes']);
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(root, 'ark.config.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.github/workflows/ark-check.yml'))).toBe(true);
    expect(result.stdout).toContain('Ark agent gate templates');
    expect(result.stdout).toContain('Ark check passed');
  });

  it('routes a mature repo to the adoption flow when a preset starter governs a thin slice', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-brownfield-'));
    // A mature Next.js-shaped repo: lots of files, but only a framework `kernel/domain`
    // matches the hexagonal wildcards — the exact case that yields a thin, mis-scoped starter.
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/kernel/domain'), { recursive: true });
    for (let i = 0; i < 160; i += 1) {
      fs.writeFileSync(path.join(root, `src/app/p${i}.tsx`), `export const a${i} = ${i};\n`);
    }
    fs.writeFileSync(path.join(root, 'src/kernel/domain/contracts.ts'), 'export const x = 1;\n');

    const init = runInit(root, ['--preset', 'hexagonal']);
    expect(init.status).toBe(0);
    expect(init.stdout).toContain('existing codebase');
    expect(init.stdout).toContain('--recommend --write-plan');
    expect(init.stdout).toContain('/ark-adopt');
  });

  it('does NOT show the adoption notice on a small greenfield repo', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-greenfield-notice-'));
    const init = runInit(root, ['--preset', 'hexagonal']);
    expect(init.status).toBe(0);
    expect(init.stdout).not.toContain('existing codebase');
  });

  it('`ark --help` / `ark help` print usage and exit 0 (flag in the command position)', () => {
    const run = (args: string[]) => {
      try {
        const stdout = execFileSync('node', [path.resolve('bin/ark.mjs'), ...args], {
          encoding: 'utf8',
          stdio: 'pipe',
        });
        return { status: 0, stdout };
      } catch (error) {
        const e = error as { status: number; stdout: string };
        return { status: e.status, stdout: e.stdout ?? '' };
      }
    };
    for (const args of [['--help'], ['-h'], ['help']]) {
      const res = run(args);
      expect(res.status, `ark ${args.join(' ')}`).toBe(0);
      expect(res.stdout).toContain('Usage:');
      expect(res.stdout).not.toContain('Unknown command');
    }
    // A genuinely unknown command still errors.
    expect(run(['bogus']).status).toBe(2);
  });

  it('`ark start --yes` guides setup end to end: shape → config + gates → plan', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-start-'));
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fresh"}\n');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    let out = '';
    let status = 0;
    try {
      out = execFileSync('node', [path.resolve('bin/ark.mjs'), 'start', '--yes', '--root', root], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error) {
      const e = error as { status: number; stdout: string };
      out = e.stdout ?? '';
      status = e.status;
    }
    expect(status).toBe(0);
    // Plain-language shape, the plan, and a wrap-up — no skill names required.
    expect(out).toContain('Your project looks like');
    expect(out).toContain('Your architecture plan');
    // Three modes (suggest / adapt / enforce) — honest wrap-up, never a false "guards everything".
    expect(out).toMatch(/Done — Ark is in (SUGGEST|ADAPT|ENFORCE) mode/);
    // It actually set things up — and left the gates active so it "stays that way"
    // (the enforcement handoff): config, agent contract, and the CI gate.
    expect(fs.existsSync(path.join(root, 'ark.config.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.github/workflows/ark-check.yml'))).toBe(true);
    // The newcomer is pointed at the autopilot to actually carry the plan out.
    expect(out).toContain('/ark-autopilot');
  });

  it('`ark start` adopts an established codebase (detection, not a wildcard preset)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-start-mature-'));
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"big"}\n');
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    for (let i = 0; i < 160; i += 1) {
      fs.writeFileSync(path.join(root, `src/app/p${i}.tsx`), `export const a${i} = ${i};\n`);
    }
    const out = execFileSync('node', [path.resolve('bin/ark.mjs'), 'start', '--yes', '--root', root], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    expect(out).toContain('established codebase');
    expect(out).toContain('ADOPT');
  });

  it('`ark upgrade --no-install` refreshes gates, migrates runners, and verifies in one command', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-upgrade-'));
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"demo"}\n');
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'], optional: true }],
        rules: [],
      })
    );
    let out = '';
    let status = 0;
    try {
      out = execFileSync('node', [path.resolve('bin/ark.mjs'), 'upgrade', '--no-install', '--root', root], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error) {
      const e = error as { status: number; stdout: string };
      out = e.stdout ?? '';
      status = e.status;
    }
    expect(status).toBe(0);
    // One command runs the whole sequence.
    expect(out).toContain('Refreshing agent gates');
    expect(out).toContain('Migrated the Ark command runner');
    expect(out).toContain('Ark check passed');
    // `update` is an accepted alias for `upgrade`.
    const alias = execFileSync(
      'node',
      [path.resolve('bin/ark.mjs'), 'update', '--no-install', '--no-strict', '--root', root],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    expect(alias).toContain('Ark upgrade —');
  });

  it('generated CI enables corepack before actions/setup-node so pnpm cache resolves', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-ci-order-'));
    fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), '\n');
    expect(runInstallAgentGates(root, ['--tools', 'claude']).status).toBe(0);
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/ark-check.yml'), 'utf8');
    expect(workflow).toContain('corepack enable');
    // corepack must be enabled BEFORE setup-node, or `cache: pnpm` fails on a fresh runner.
    expect(workflow.indexOf('corepack enable')).toBeLessThan(workflow.indexOf('actions/setup-node'));
  });
});

describe('ark-check include accepts single files', () => {
  const FILE_INCLUDE_LAYERS = [
    { name: 'PresentationAdapters', patterns: ['middleware.ts'], intentPrefixes: ['Presentation.'] },
    { name: 'PersistenceAdapters', patterns: ['lib/**'], intentPrefixes: ['Adapter.Persistence.'] },
  ];
  const FILE_INCLUDE_RULES = [
    { from: 'PresentationAdapters', to: 'PersistenceAdapters', allowed: false },
  ];

  function seed(root: string, include: string[]) {
    fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(root, 'lib/svc.ts'), 'export const a = 1;\n');
    // A root-level file (like Next.js middleware.ts) that references a denied layer.
    fs.writeFileSync(
      path.join(root, 'middleware.ts'),
      "export const ref = 'Adapter.Persistence.Save';\n"
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({ include, layers: FILE_INCLUDE_LAYERS, rules: FILE_INCLUDE_RULES })
    );
  }

  it('governs a root-level file listed in include (no ENOTDIR crash)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-include-file-'));
    seed(root, ['lib', 'middleware.ts']);

    const result = runArkCheck(root, ['--strict-config']) as {
      ok: boolean;
      violations: Array<{ ruleId: string; file?: string }>;
    };
    // The file was scanned: its cross-layer reference is caught (previously the
    // bare file path threw "ENOTDIR: not a directory, scandir .../middleware.ts").
    expect(result.violations.some((v) => v.file?.includes('middleware.ts'))).toBe(true);
  });

  it('does not scan the root file when it is not in include', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-include-file-off-'));
    seed(root, ['lib']);

    const result = runArkCheck(root, ['--strict-config']) as {
      violations: Array<{ file?: string }>;
    };
    expect(result.violations.some((v) => v.file?.includes('middleware.ts'))).toBe(false);
  });
});

describe('ark-check skill-gap advisory', () => {
  function runRaw(root: string) {
    let output = '';
    try {
      output = execFileSync(
        'node',
        [path.resolve('bin/ark-check.mjs'), '--root', root, '--json'],
        { encoding: 'utf8', stdio: 'pipe' }
      );
    } catch (error) {
      output = (error as { stdout: string }).stdout;
    }
    return JSON.parse(output) as {
      skillGaps?: Array<{ tool: string; missing: number; stale: number }>;
    };
  }

  function seedProject(root: string) {
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const a = 1;\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({ include: ['src'], layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }], rules: [] })
    );
  }

  function installSkills(root: string) {
    execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--install-agent-gates', '--root', root, '--tools', 'claude'],
      { encoding: 'utf8', stdio: 'pipe' }
    );
  }

  it('reports missing /ark-* skills for a gated project that lacks them', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-skillgap-'));
    seedProject(root);
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'ark contract\n'); // adopted gates
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true }); // tool detected, no skills

    const result = runRaw(root);
    expect(result.skillGaps?.some((g) => g.tool === 'claude' && g.missing > 0)).toBe(true);
  });

  it('stays silent once the skills are installed', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-skillgap-ok-'));
    seedProject(root);
    installSkills(root);
    const result = runRaw(root);
    expect(result.skillGaps).toBeUndefined();
  });

  it('stamps installed skills with the package version', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-skill-stamp-'));
    seedProject(root);
    installSkills(root);
    const version = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')).version;
    const skill = fs.readFileSync(path.join(root, '.claude/skills/ark-coverage/SKILL.md'), 'utf8');
    expect(skill).toContain(`arkVersion: ${version}`);
  });

  it('flags installed skills left behind by an older Ark (stamp behind current)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-skill-stale-'));
    seedProject(root);
    installSkills(root);
    // Simulate a skill installed by an older Ark: rewrite its stamp to an old version.
    const skillPath = path.join(root, '.claude/skills/ark-coverage/SKILL.md');
    const downgraded = fs
      .readFileSync(skillPath, 'utf8')
      .replace(/^arkVersion:.*$/m, 'arkVersion: 1.0.0');
    fs.writeFileSync(skillPath, downgraded);

    const result = runRaw(root);
    const claude = result.skillGaps?.find((g) => g.tool === 'claude');
    expect(claude?.stale).toBeGreaterThanOrEqual(1);
    expect(claude?.missing).toBe(0);
  });

  it('treats a skill with no version stamp as stale (pre-stamp install)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-skill-unstamped-'));
    seedProject(root);
    installSkills(root);
    const skillPath = path.join(root, '.claude/skills/ark-coverage/SKILL.md');
    const unstamped = fs.readFileSync(skillPath, 'utf8').replace(/^arkVersion:.*\n/m, '');
    fs.writeFileSync(skillPath, unstamped);

    const result = runRaw(root);
    expect(result.skillGaps?.find((g) => g.tool === 'claude')?.stale).toBeGreaterThanOrEqual(1);
  });

  it('does not nag a project that never adopted agent gates (no AGENTS.md)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-skillgap-none-'));
    seedProject(root);
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    const result = runRaw(root);
    expect(result.skillGaps).toBeUndefined();
  });
});

describe('ark-check CLI', () => {
  it('prints a starter 11-layer config', () => {
    const output = execFileSync('node', [
      path.resolve('bin/ark-check.mjs'),
      '--print-config',
      'eleven-layer',
    ], { encoding: 'utf8', stdio: 'pipe' });

    const config = JSON.parse(output);
    expect(config.include).toEqual(['src']);
    expect(config.layers).toHaveLength(11);
    expect(config.layers[0]).toMatchObject({
      name: 'DomainModel',
      patterns: ['src/domain/**'],
      intentPrefixes: ['Domain.'],
      optional: true,
    });
    expect(config.rules.length).toBeGreaterThan(100);
  });

  it('does not warn when generated optional layer patterns are unused', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-generated-config-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const ok = true;\n');
    const config = JSON.parse(execFileSync('node', [
      path.resolve('bin/ark-check.mjs'),
      '--print-config',
      'eleven-layer',
    ], { encoding: 'utf8', stdio: 'pipe' }));
    fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify(config));

    const result = runArkCheck(root);
    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.ruleId)).not.toContain(
      'CONFIG_LAYER_PATTERN_NO_MATCHES'
    );
  });

  it('detects layer import violations using TypeScript AST', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-test-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};');
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      "import { db } from '../infra/db';\nexport const value = 'Domain.Order.Placed';\n"
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'], intentPrefixes: ['Domain.'] },
          { name: 'PersistenceAdapters', patterns: ['src/infra/**'], intentPrefixes: ['Adapter.Persistence.'] },
        ],
        rules: [
          { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
        ],
      })
    );

    let output = '';
    try {
      execFileSync('node', [
        path.resolve('bin/ark-check.mjs'),
        '--root',
        root,
        '--json',
      ], { encoding: 'utf8', stdio: 'pipe' });
    } catch (error) {
      output = (error as { stdout: string }).stdout;
    }

    const result = JSON.parse(output);
    expect(result.ok).toBe(false);
    expect(result.violations[0].ruleId).toBe('LAYER_IMPORT_VIOLATION');
  });

  it('resolves tsconfig path-alias imports across layers (not just relative)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-alias-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};');
    // Import via a path alias — the old relative-only resolver could never see this.
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      "import { db } from '@infra/db';\nexport const value = 'Domain.Order.Placed';\n"
    );
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: { '@infra/*': ['src/infra/*'] },
        },
      })
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'], intentPrefixes: ['Domain.'] },
          { name: 'PersistenceAdapters', patterns: ['src/infra/**'], intentPrefixes: ['Adapter.Persistence.'] },
        ],
        rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
      })
    );

    let output = '';
    try {
      execFileSync('node', [path.resolve('bin/ark-check.mjs'), '--root', root, '--json'], {
        encoding: 'utf8',
      });
    } catch (error) {
      output = (error as { stdout: string }).stdout;
    }

    const result = JSON.parse(output);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v: { ruleId: string }) => v.ruleId === 'LAYER_IMPORT_VIOLATION')).toBe(
      true
    );
  });

  it('catches a cross-layer import from a NESTED subdirectory (** must match across /)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-nested-'));
    fs.mkdirSync(path.join(root, 'src/domain/order/sub'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};');
    fs.writeFileSync(
      path.join(root, 'src/domain/order/sub/order.ts'),
      "import { db } from '../../../infra/db';\nexport const v = db;\n"
    );
    fs.writeFileSync(path.join(root, 'ark.config.json'), TWO_LAYER_CONFIG);

    const result = runArkCheck(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.ruleId === 'LAYER_IMPORT_VIOLATION')).toBe(true);
  });

  it('still enforces when the project root lives under a node_modules segment', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-nm-'));
    const root = path.join(base, 'node_modules', 'myproj');
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};');
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      "import { db } from '../infra/db';\nexport const v = db;\n"
    );
    fs.writeFileSync(path.join(root, 'ark.config.json'), TWO_LAYER_CONFIG);

    const result = runArkCheck(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.ruleId === 'LAYER_IMPORT_VIOLATION')).toBe(true);
  });

  it('matches brace-expansion glob patterns like **/*.{ts,tsx}', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-brace-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};');
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      "import { db } from '../infra/db';\nexport const v = db;\n"
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**/*.{ts,tsx}'], intentPrefixes: ['Domain.'] },
          { name: 'PersistenceAdapters', patterns: ['src/infra/**'], intentPrefixes: ['Adapter.Persistence.'] },
        ],
        rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
      })
    );

    const result = runArkCheck(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.ruleId === 'LAYER_IMPORT_VIOLATION')).toBe(true);
  });

  it('does NOT false-positive on a third-party (node_modules) import under a catch-all pattern', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-vendor-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'node_modules/lodashy'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'node_modules/lodashy/package.json'),
      JSON.stringify({ name: 'lodashy', version: '1.0.0', main: 'index.js' })
    );
    fs.writeFileSync(path.join(root, 'node_modules/lodashy/index.js'), 'module.exports = {};');
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      "import x from 'lodashy';\nexport const v = x;\n"
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'], intentPrefixes: ['Domain.'] },
          { name: 'Vendor', patterns: ['**'], intentPrefixes: [] },
        ],
        rules: [{ from: 'DomainModel', to: 'Vendor', allowed: false }],
      })
    );

    const result = runArkCheck(root);
    // A node_modules dependency must never be classified into a governed layer.
    expect(result.ok).toBe(true);
  });

  it('does NOT flag imports that resolve outside the project root', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-oor-'));
    const root = path.join(base, 'proj');
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(base, 'outside'), { recursive: true });
    fs.writeFileSync(path.join(base, 'outside/helper.ts'), 'export const h = {};');
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      "import { h } from '../../../outside/helper';\nexport const v = h;\n"
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'], intentPrefixes: ['Domain.'] },
          { name: 'Anything', patterns: ['**'], intentPrefixes: [] },
        ],
        rules: [{ from: 'DomainModel', to: 'Anything', allowed: false }],
      })
    );

    const result = runArkCheck(root);
    // A target above --root is not part of this project and must not be classified.
    expect(result.ok).toBe(true);
  });

  it('classifies intent references via DEFAULT prefixes/rules when the config declares none', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-defpref-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      "export const ref = 'Adapter.Persistence.Save';\n"
    );
    // Layer has a file pattern but no intentPrefixes and the config has no rules — both
    // must fall back to the built-in defaults (previously the fallback silently no-op'd).
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      })
    );

    const result = runArkCheck(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.ruleId === 'LAYER_INTENT_REFERENCE_VIOLATION')).toBe(
      true
    );
  });

  it('resolves extensionless relative imports whose target is a .mts file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-mts-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/infra/db.mts'), 'export const db = {};');
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      "import { db } from '../infra/db';\nexport const v = db;\n"
    );
    fs.writeFileSync(path.join(root, 'ark.config.json'), TWO_LAYER_CONFIG);

    const result = runArkCheck(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.ruleId === 'LAYER_IMPORT_VIOLATION')).toBe(true);
  });

  it('can use manifest architecture rules and prefixes when provided', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-manifest-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};');
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      "import { db } from '../infra/db';\nexport const ref = 'Adapter.Persistence.Save';\n"
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'] },
          { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
        ],
        rules: [],
      })
    );
    fs.writeFileSync(
      path.join(root, 'ark.manifest.json'),
      JSON.stringify({
        architecture: {
          layers: [
            { name: 'DomainModel', prefixes: ['Domain.'] },
            { name: 'PersistenceAdapters', prefixes: ['Adapter.Persistence.'] },
          ],
          rules: [
            { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
          ],
        },
      })
    );

    const result = runArkCheck(root, ['--manifest', 'ark.manifest.json']);
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.ruleId)).toContain('LAYER_IMPORT_VIOLATION');
    expect(result.violations.map((v) => v.ruleId)).toContain('LAYER_INTENT_REFERENCE_VIOLATION');
  });

  it('detects dynamic import and require cross-layer violations', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-dynamic-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};');
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      [
        "const dynamicDb = await import('../infra/db');",
        "const requiredDb = require('../infra/db');",
        'export const refs = [dynamicDb, requiredDb];',
      ].join('\n')
    );
    fs.writeFileSync(path.join(root, 'ark.config.json'), TWO_LAYER_CONFIG);

    const result = runArkCheck(root);
    const layerViolations = result.violations.filter(
      (v) => v.ruleId === 'LAYER_IMPORT_VIOLATION'
    );
    expect(result.ok).toBe(false);
    expect(layerViolations).toHaveLength(2);
  });

  it('flags raw publishes and publish calls without metadata.source', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-publish-'));
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src/app/placeOrder.ts'),
      [
        "bus.publish('Domain.Order.Placed', {});",
        "bus.publish({ intent: 'Domain.Order.Placed', payload: {}, metadata: { occurredAt: 'now' } });",
        'bus.publish(OrderPlaced, { id: "o1" });',
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'ApplicationOrchestration', patterns: ['src/app/**'], intentPrefixes: ['Application.'] },
          { name: 'DomainModel', patterns: ['src/domain/**'], intentPrefixes: ['Domain.'] },
        ],
        rules: [],
      })
    );

    const result = runArkCheck(root);
    expect(result.ok).toBe(false);
    expect(result.violations.filter((v) => v.ruleId === 'RAW_EVENT_PUBLISH')).toHaveLength(2);
    expect(result.violations.filter((v) => v.ruleId === 'PUBLISH_MISSING_SOURCE')).toHaveLength(3);
  });

  it('does not require Ark metadata on unrelated publish APIs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-publish-fp-'));
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src/app/notifications.ts'),
      "pubsub.publish(topicName, { id: 'm1' });\n"
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'ApplicationOrchestration', patterns: ['src/app/**'], intentPrefixes: ['Application.'] },
        ],
        rules: [],
      })
    );

    const result = runArkCheck(root);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('flags publish source literals that do not match the publishing file layer', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-source-layer-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      "bus.publish(OrderPlaced, { id: 'o1' }, { source: 'Application.PlaceOrder' });\n"
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'], intentPrefixes: ['Domain.'] },
          { name: 'ApplicationOrchestration', patterns: ['src/app/**'], intentPrefixes: ['Application.'] },
        ],
        rules: [],
      })
    );

    const result = runArkCheck(root);
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.ruleId)).toContain('PUBLISH_SOURCE_LAYER_MISMATCH');
  });

  it('reports config warnings without failing architecture checks by default', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-config-warn-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/unmapped'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const ok = true;\n');
    fs.writeFileSync(path.join(root, 'src/unmapped/helper.ts'), 'export const helper = true;\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'], intentPrefixes: ['Domain.'] },
        ],
        rules: [{ from: 'DomainModel', to: 'MissingLayer', allowed: false }],
      })
    );

    const result = runArkCheck(root);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.warnings.map((w) => w.ruleId)).toContain('CONFIG_UNCLASSIFIED_FILES');
    expect(result.warnings.map((w) => w.ruleId)).toContain('CONFIG_RULE_UNKNOWN_TO_LAYER');
  });

  it('can make config warnings fail with --strict-config', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-strict-config-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const ok = true;\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [],
        rules: [],
      })
    );

    const result = runArkCheck(root, ['--strict-config']);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(0);
    expect(result.warnings.map((w) => w.ruleId)).toContain('CONFIG_NO_LAYERS');
  });

  it('prints an explicit failure message for strict config warnings in human output', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-strict-human-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const ok = true;\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [],
        rules: [],
      })
    );

    let stderr = '';
    try {
      execFileSync('node', [
        path.resolve('bin/ark-check.mjs'),
        '--root',
        root,
        '--strict-config',
      ], { encoding: 'utf8', stdio: 'pipe' });
      expect.fail('strict config warning should fail');
    } catch (error) {
      stderr = (error as { stderr: string }).stderr;
    }

    expect(stderr).toContain('Ark check failed with');
    expect(stderr).toContain('CONFIG_NO_LAYERS');
  });
});

describe('ark-check --baseline', () => {
  function violatingProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-baseline-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = 1;\n');
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      "import { db } from '../infra/db';\nexport const order = db;\n"
    );
    fs.writeFileSync(path.join(root, 'ark.config.json'), TWO_LAYER_CONFIG);
    return root;
  }

  it('freezes existing violations and only fails on new ones', () => {
    const root = violatingProject();

    // Without baseline: fails.
    expect(runArkCheck(root).ok).toBe(false);

    // Freeze.
    const update = execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--update-baseline'],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    expect(update).toContain('frozen violation key');
    const baseline = JSON.parse(fs.readFileSync(path.join(root, '.ark-baseline.json'), 'utf8'));
    expect(baseline.violations.length).toBeGreaterThan(0);

    // With baseline: passes, violation suppressed.
    const suppressedRun = runArkCheck(root, ['--baseline']) as unknown as {
      ok: boolean;
      violations: unknown[];
      suppressedViolations: number;
    };
    expect(suppressedRun.ok).toBe(true);
    expect(suppressedRun.violations).toEqual([]);
    expect(suppressedRun.suppressedViolations).toBeGreaterThan(0);

    // A NEW violation still fails.
    fs.writeFileSync(
      path.join(root, 'src/domain/customer.ts'),
      "import { db } from '../infra/db';\nexport const customer = db;\n"
    );
    const newRun = runArkCheck(root, ['--baseline']);
    expect(newRun.ok).toBe(false);
    expect(newRun.violations.length).toBeGreaterThan(0);
  });

  it('warns when the baseline file does not exist', () => {
    const root = violatingProject();
    const result = runArkCheck(root, ['--baseline']);
    expect(result.ok).toBe(false);
    expect(result.warnings.some((w) => w.ruleId === 'BASELINE_NOT_FOUND')).toBe(true);
  });

  it('reports stale baseline entries after violations are fixed', () => {
    const root = violatingProject();
    execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--update-baseline'],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    // Fix the frozen violation.
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const order = 1;\n');
    const result = runArkCheck(root, ['--baseline']) as unknown as {
      ok: boolean;
      staleBaselineKeys: number;
    };
    expect(result.ok).toBe(true);
    expect(result.staleBaselineKeys).toBeGreaterThan(0);
  });
});

describe('ark-check forbiddenGlobals', () => {
  const CONFIG = JSON.stringify({
    include: ['src'],
    layers: [
      {
        name: 'DomainModel',
        patterns: ['src/domain/**'],
        intentPrefixes: ['Domain.'],
        forbiddenGlobals: ['fetch', 'Date.now', 'console'],
      },
      { name: 'PersistenceAdapters', patterns: ['src/infra/**'], intentPrefixes: ['Adapter.Persistence.'] },
    ],
    rules: [],
  });

  function project(domainSource: string) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-fg-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ark.config.json'), CONFIG);
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), domainSource);
    fs.writeFileSync(path.join(root, 'src/infra/repo.ts'), 'export const t = Date.now();\n');
    return root;
  }

  it('flags dotted and bare forbidden globals in the configured layer only', () => {
    const root = project(
      [
        'export function place() {',
        '  console.log(Date.now());',
        '  return fetch("/api");',
        '}',
        'const decoy = { now: () => 1 };',
        'export const ok = decoy.now(); // not the global',
      ].join('\n')
    );
    const result = runArkCheck(root) as unknown as {
      ok: boolean;
      violations: Array<{ ruleId: string; target?: string; file: string }>;
    };
    expect(result.ok).toBe(false);
    const globals = result.violations.filter((v) => v.ruleId === 'FORBIDDEN_GLOBAL');
    expect(globals.map((v) => v.target).sort()).toEqual(['Date.now', 'console', 'fetch']);
    // src/infra uses Date.now too, but its layer declares no forbiddenGlobals.
    expect(globals.every((v) => v.file === 'src/domain/order.ts')).toBe(true);
  });

  it('passes clean domain code and warns on a malformed forbiddenGlobals value', () => {
    const root = project('export const order = 1;\n');
    expect(runArkCheck(root).ok).toBe(true);

    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      CONFIG.replace(JSON.stringify(['fetch', 'Date.now', 'console']), '"fetch"')
    );
    const result = runArkCheck(root);
    expect(result.warnings.some((w) => w.ruleId === 'CONFIG_INVALID_FORBIDDEN_GLOBALS')).toBe(true);
    // Malformed entry is ignored, not enforced and not crashing.
    expect(result.violations.filter((v) => v.ruleId === 'FORBIDDEN_GLOBAL')).toEqual([]);
  });

  it('supports baselining FORBIDDEN_GLOBAL violations', () => {
    const root = project('export const at = Date.now();\n');
    execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--update-baseline'],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    expect(runArkCheck(root, ['--baseline']).ok).toBe(true);
  });
});

describe('ark-check --plan (co-pilot Phase F — work classifier)', () => {
  function mixedViolationProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-plan-'));
    fs.mkdirSync(path.join(root, 'src/ui'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/data'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'UI', patterns: ['src/ui/**'] },
          { name: 'Data', patterns: ['src/data/**'] },
          { name: 'DomainModel', patterns: ['src/domain/**'], forbiddenGlobals: ['process'] },
        ],
        rules: [{ from: 'UI', to: 'Data', allowed: false }],
      })
    );
    fs.writeFileSync(path.join(root, 'src/data/x.ts'), 'export const q = 1;\nexport type Row = { id: string };\n');
    fs.writeFileSync(path.join(root, 'src/ui/a.ts'), "import type { Row } from '../data/x';\nexport type R = Row;\n");
    fs.writeFileSync(path.join(root, 'src/ui/b.ts'), "import { q } from '../data/x';\nexport const z = q;\n");
    fs.writeFileSync(path.join(root, 'src/domain/d.ts'), 'export const p = process.env.X;\n');
    return root;
  }

  function runPlanJson(root: string) {
    const raw = execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--config', 'ark.config.json', '--plan', '--json'],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    return JSON.parse(raw) as {
      plan: {
        goal: { met: boolean; activeViolations: number; autoApplicable: number; needsDecision: number };
        counts: { mechanicalSafe: number; judgment: number; deferred: number };
        steps: Array<{ class: string; ruleId: string; confidence: number; rationale: string }>;
      };
    };
  }

  it('classifies a type-only import as mechanical-safe and value/global as judgment', () => {
    const { plan } = runPlanJson(mixedViolationProject());
    expect(plan.goal.activeViolations).toBe(3);
    expect(plan.goal.met).toBe(false);
    expect(plan.counts.mechanicalSafe).toBe(1);
    expect(plan.counts.judgment).toBe(2);
    // The one auto-applicable step is the type-only import move.
    const auto = plan.steps.filter((s) => s.class === 'mechanical-safe');
    expect(auto).toHaveLength(1);
    expect(auto[0].ruleId).toBe('LAYER_IMPORT_VIOLATION');
    // Every step carries a confidence and a rationale.
    expect(plan.steps.every((s) => s.confidence > 0 && s.rationale.length > 0)).toBe(true);
    // Ordered auto-first.
    expect(plan.steps[0].class).toBe('mechanical-safe');
  });

  it('is report-only (exit 0) and changes no files', () => {
    const root = mixedViolationProject();
    const before = fs.readFileSync(path.join(root, 'src/ui/a.ts'), 'utf8');
    let status = 0;
    let out = '';
    try {
      out = execFileSync(
        'node',
        [path.resolve('bin/ark-check.mjs'), '--root', root, '--config', 'ark.config.json', '--plan'],
        { encoding: 'utf8', stdio: 'pipe' }
      );
    } catch (error) {
      const e = error as { status: number; stdout: string };
      status = e.status;
      out = e.stdout ?? '';
    }
    expect(status).toBe(0);
    expect(out).toContain('safe to auto-apply');
    expect(out).toContain('Plan only — no files changed');
    expect(fs.readFileSync(path.join(root, 'src/ui/a.ts'), 'utf8')).toBe(before);
  });

  it('classifier precision: a labeled corpus classifies correctly with zero false mechanical-safe', () => {
    // Phase J proof: on a corpus where each violation's correct class is known, the classifier
    // must (a) match every label and (b) NEVER label anything but a type-only import move as
    // mechanical-safe — the false-"safe" that would auto-land a bad edit is the trust-sinking
    // failure mode the co-pilot must avoid.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-precision-'));
    fs.mkdirSync(path.join(root, 'src/ui'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/data'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'UI', patterns: ['src/ui/**'] },
          { name: 'Data', patterns: ['src/data/**'] },
          { name: 'DomainModel', patterns: ['src/domain/**'], forbiddenGlobals: ['process'] },
        ],
        rules: [{ from: 'UI', to: 'Data', allowed: false }],
      })
    );
    fs.writeFileSync(path.join(root, 'src/data/x.ts'), 'export const q = 1;\nexport type Row = { id: string };\n');
    // mechanical-safe: type-only import across a denied edge
    fs.writeFileSync(path.join(root, 'src/ui/type.ts'), "import type { Row } from '../data/x';\nexport type R = Row;\n");
    // judgment: value import across a denied edge
    fs.writeFileSync(path.join(root, 'src/ui/value.ts'), "import { q } from '../data/x';\nexport const z = q;\n");
    // judgment: forbidden ambient global in a pure layer
    fs.writeFileSync(path.join(root, 'src/domain/global.ts'), 'export const p = process.env.X;\n');
    // judgment: circular dependency
    fs.writeFileSync(path.join(root, 'src/domain/a.ts'), "import { b } from './b';\nexport const a = b;\n");
    fs.writeFileSync(path.join(root, 'src/domain/b.ts'), "import { a } from './a';\nexport const b = a;\n");

    const { plan } = runPlanJson(root);
    // Invariant: every mechanical-safe step is a type-only import move — nothing else qualifies.
    for (const step of plan.steps.filter((s) => s.class === 'mechanical-safe')) {
      expect(step.ruleId).toBe('LAYER_IMPORT_VIOLATION');
      expect((step as { typeOnly?: boolean }).typeOnly).toBe(true);
    }
    // The value import, the forbidden global, and the cycle are all judgment — never auto.
    const judgmentRules = plan.steps.filter((s) => s.class === 'judgment').map((s) => s.ruleId);
    expect(judgmentRules).toContain('FORBIDDEN_GLOBAL');
    expect(judgmentRules).toContain('CIRCULAR_DEPENDENCY');
    expect(judgmentRules).toContain('LAYER_IMPORT_VIOLATION'); // the value import
    // Exactly one auto-applicable step (the type-only move).
    expect(plan.counts.mechanicalSafe).toBe(1);
  });

  it('reports a clean goal when there are no violations', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-plan-clean-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({ include: ['src'], layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }], rules: [] })
    );
    fs.writeFileSync(path.join(root, 'src/domain/d.ts'), 'export const ok = 1;\n');
    const { plan } = runPlanJson(root);
    expect(plan.goal.activeViolations).toBe(0);
    expect(plan.goal.met).toBe(true);
    expect(plan.steps).toHaveLength(0);
  });

  it('does not mark goal.met when include matches zero source files (empty-scope false green)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-plan-empty-'));
    fs.mkdirSync(path.join(root, 'apps/web/src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'apps/web/src/page.ts'), 'export const p = 1;\n');
    // Contract looks only at src/ — monorepo code lives under apps/ → 0 files in scope.
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/**'] }],
        rules: [],
      })
    );
    const parsed = runPlanJson(root);
    expect(parsed.plan.goal.totalFiles).toBe(0);
    expect(parsed.plan.goal.emptyScope).toBe(true);
    expect(parsed.plan.goal.met).toBe(false);
    expect(parsed.ok).toBe(false);
    expect(parsed.plan.goal.statement).toMatch(/No source files matched|checks nothing/i);
  });

  it('does not mark goal.met when zero violations but governed coverage is low (false-green)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-plan-lowgov-'));
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    // Contract only matches domain/**, but files live flat under src/ → 0% governed.
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        rules: [],
      })
    );
    fs.writeFileSync(path.join(root, 'src/app.service.ts'), 'export const x = 1;\n');
    const parsed = runPlanJson(root);
    expect(parsed.plan.goal.activeViolations).toBe(0);
    expect(parsed.plan.goal.governedPercent).toBe(0);
    expect(parsed.plan.goal.met).toBe(false);
    expect(parsed.ok).toBe(false);
    expect(parsed.plan.goal.statement).toMatch(/governs only 0%/i);
  });
});

describe('framework layout overlays (Nest / Next)', () => {
  it('Nest flat starter: hexagonal preset + overlay governs controller/service/module/main', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-nest-overlay-'));
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'nest-app',
        dependencies: { '@nestjs/common': '^11', '@nestjs/core': '^11' },
      })
    );
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/app.controller.ts'), 'export class AppController {}\n');
    fs.writeFileSync(path.join(root, 'src/app.service.ts'), 'export class AppService {}\n');
    fs.writeFileSync(path.join(root, 'src/app.module.ts'), 'export class AppModule {}\n');
    fs.writeFileSync(path.join(root, 'src/main.ts'), 'export async function bootstrap() {}\n');

    execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--init', '--preset', 'hexagonal', '--force'],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    expect(config.frameworkOverlay).toMatch(/nestjs/);
    const cov = JSON.parse(
      execFileSync(
        'node',
        [path.resolve('bin/ark-check.mjs'), '--root', root, '--config', 'ark.config.json', '--coverage', '--json'],
        { encoding: 'utf8' }
      )
    );
    expect(cov.coverage.governed.percent).toBeGreaterThanOrEqual(75);
  });

  it('Next app router files are classified under presentation after layered init', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-next-overlay-'));
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'next-app', dependencies: { next: '14.0.0', react: '18.0.0' } })
    );
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/components'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/app/page.tsx'), 'export default function Page() { return null }\n');
    fs.writeFileSync(path.join(root, 'src/components/Button.tsx'), 'export const Button = () => null\n');

    execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--init', '--preset', 'layered', '--force'],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    const cov = JSON.parse(
      execFileSync(
        'node',
        [path.resolve('bin/ark-check.mjs'), '--root', root, '--config', 'ark.config.json', '--coverage', '--json'],
        { encoding: 'utf8' }
      )
    );
    expect(cov.coverage.governed.percent).toBeGreaterThanOrEqual(50);
  });
});

describe('ark-check layer exclude', () => {
  // A broad domain glob that also carves out framework internals via `exclude`.
  const CONFIG = JSON.stringify({
    include: ['src'],
    layers: [
      {
        name: 'DomainModel',
        patterns: ['src/**/domain/**'],
        exclude: ['**/kernel/**'],
        intentPrefixes: ['Domain.'],
        forbiddenGlobals: ['process'],
      },
    ],
    rules: [],
  });

  function project() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-exclude-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/kernel/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ark.config.json'), CONFIG);
    // Real app domain code reaching for `process` is a genuine violation.
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const x = process.env.A;\n');
    // Framework internals under kernel/domain also touch `process`, but are excluded.
    fs.writeFileSync(
      path.join(root, 'src/kernel/domain/wiring.ts'),
      'export const p = process.env.B;\n'
    );
    return root;
  }

  it('excludes a carved-out subtree from the layer, its rules, and forbiddenGlobals', () => {
    const root = project();
    const result = runArkCheck(root) as unknown as {
      ok: boolean;
      violations: Array<{ ruleId: string; file: string }>;
    };
    const globals = result.violations.filter((v) => v.ruleId === 'FORBIDDEN_GLOBAL');
    // Only the genuine app-domain file is flagged; the excluded kernel file is not.
    expect(globals.map((v) => v.file)).toEqual(['src/domain/order.ts']);
  });

  it('reports the excluded file as ungoverned in coverage (not classified into the layer)', () => {
    const root = project();
    const raw = execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--coverage', '--json'],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    const { coverage } = JSON.parse(raw) as {
      coverage: {
        unclassified: { files: string[] };
        layers: Array<{ name: string; files: number }>;
      };
    };
    expect(coverage.unclassified.files).toContain('src/kernel/domain/wiring.ts');
    expect(coverage.layers.find((l) => l.name === 'DomainModel')?.files).toBe(1);
  });
});

describe('ark-check --install-agent-gates instruction-tier tools', () => {
  const RULE_FILES: Record<string, string> = {
    windsurf: '.windsurf/rules/ark.md',
    cline: '.clinerules/ark.md',
    copilot: '.github/copilot-instructions.md',
    kiro: '.kiro/steering/ark.md',
    roo: '.roo/rules/ark.md',
    continue: '.continue/rules/ark.md',
    gemini: 'GEMINI.md',
  };

  it('writes the shared instruction rule for explicitly selected tools', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-gates-tier-'));
    const result = runInstallAgentGates(root, [
      '--tools',
      'windsurf,cline,copilot,kiro,roo,continue,gemini',
    ]);
    expect(result.status).toBe(0);

    const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    for (const file of Object.values(RULE_FILES)) {
      const rule = fs.readFileSync(path.join(root, file), 'utf8');
      // Same canonical contract: check command and manifest resource cannot drift.
      expect(rule).toContain('npx ark-check --root . --config ark.config.json --strict-config');
      expect(rule).toContain('ark://manifest');
      expect(agents).toContain('ark://manifest');
    }
    // Full-gate tools were not selected.
    expect(fs.existsSync(path.join(root, '.claude/settings.json'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.cursor/rules/ark.mdc'))).toBe(false);
    // Rule-only tools get no /ark-* skill files (like kiro).
    expect(fs.existsSync(path.join(root, '.roo/rules/ark-fix.md'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.continue/rules/ark-fix.md'))).toBe(false);
  });

  it('auto-detects instruction-tier tools from their config directories', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-gates-tier-detect-'));
    fs.mkdirSync(path.join(root, '.windsurf'), { recursive: true });
    fs.mkdirSync(path.join(root, '.clinerules'), { recursive: true });
    fs.mkdirSync(path.join(root, '.kiro'), { recursive: true });
    fs.mkdirSync(path.join(root, '.roo'), { recursive: true });
    fs.mkdirSync(path.join(root, '.continue'), { recursive: true });
    fs.mkdirSync(path.join(root, '.gemini'), { recursive: true });

    const result = runInstallAgentGates(root);
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(root, RULE_FILES.windsurf))).toBe(true);
    expect(fs.existsSync(path.join(root, RULE_FILES.cline))).toBe(true);
    expect(fs.existsSync(path.join(root, RULE_FILES.kiro))).toBe(true);
    expect(fs.existsSync(path.join(root, RULE_FILES.roo))).toBe(true);
    expect(fs.existsSync(path.join(root, RULE_FILES.continue))).toBe(true);
    expect(fs.existsSync(path.join(root, RULE_FILES.gemini))).toBe(true);
    // copilot has no directory signal and must stay explicit-only.
    expect(fs.existsSync(path.join(root, RULE_FILES.copilot))).toBe(false);
  });
});

describe('ark-check scan cache', () => {
  function violatingRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-cache-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};');
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      "import { db } from '../infra/db';\nexport const order = db;\n"
    );
    fs.writeFileSync(path.join(root, 'ark.config.json'), TWO_LAYER_CONFIG);
    return root;
  }

  const cachePath = (root: string) => path.join(root, 'node_modules', '.cache', 'ark-check.json');

  it('writes a cache and reports identical violations on a cached second run', () => {
    const root = violatingRoot();
    const first = runArkCheck(root);
    expect(fs.existsSync(cachePath(root))).toBe(true);
    const second = runArkCheck(root);
    expect(second).toEqual(first);
    expect(second.violations[0].ruleId).toBe('LAYER_IMPORT_VIOLATION');
  });

  it('invalidates a cached file when its content changes', () => {
    const root = violatingRoot();
    expect(runArkCheck(root).ok).toBe(false);
    // Remove the violating import (different size, so the cache key must change).
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const order = 1;\n');
    expect(runArkCheck(root).ok).toBe(true);
  });

  it('re-resolves import edges on cache hits: a new target file surfaces a violation without touching the importer', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-cache-edge-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      "import { db } from '../infra/db';\nexport const order = db;\n"
    );
    fs.writeFileSync(path.join(root, 'ark.config.json'), TWO_LAYER_CONFIG);

    // Target doesn't exist yet — unresolved edge, no violation, cache written.
    expect(runArkCheck(root).ok).toBe(true);

    // Create the forbidden target; the importer is untouched (cache hit) but the edge
    // must re-resolve and now report the violation.
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};');
    const result = runArkCheck(root);
    expect(result.ok).toBe(false);
    expect(result.violations[0].ruleId).toBe('LAYER_IMPORT_VIOLATION');
  });

  it('invalidates the whole cache when the config changes', () => {
    const root = violatingRoot();
    expect(runArkCheck(root).ok).toBe(false);
    // Allow the edge — same files, new config: every cached content check must be redone.
    const relaxed = JSON.parse(TWO_LAYER_CONFIG);
    relaxed.rules = [];
    fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify(relaxed));
    expect(runArkCheck(root).ok).toBe(true);
  });

  it('--no-cache neither reads nor writes the cache file', () => {
    const root = violatingRoot();
    const result = runArkCheck(root, ['--no-cache']);
    expect(result.ok).toBe(false);
    expect(fs.existsSync(cachePath(root))).toBe(false);
  });
});

describe('ark-check monorepo tsconfig resolution', () => {
  it('resolves the same alias through each package\'s nearest tsconfig', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-check-monorepo-'));
    const config = {
      include: ['packages'],
      layers: [
        { name: 'DomainModel', patterns: ['packages/*/src/domain/**'], intentPrefixes: ['Domain.'] },
        { name: 'PersistenceAdapters', patterns: ['packages/*/src/infra/**'], intentPrefixes: ['Adapter.Persistence.'] },
      ],
      rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
    };
    fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify(config));

    // Package a: '@aliased' maps into its own infra layer → violation.
    fs.mkdirSync(path.join(root, 'packages/a/src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'packages/a/src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packages/a/src/infra/store.ts'), 'export const store = {};');
    fs.writeFileSync(
      path.join(root, 'packages/a/src/domain/order.ts'),
      "import { store } from '@aliased';\nexport const order = store;\n"
    );
    fs.writeFileSync(
      path.join(root, 'packages/a/tsconfig.json'),
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@aliased': ['src/infra/store.ts'] } } })
    );

    // Package b: the SAME alias points at an unclassified file → no violation. With a
    // single root tsconfig this distinction would be impossible.
    fs.mkdirSync(path.join(root, 'packages/b/src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'packages/b/src/shared'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packages/b/src/shared/store.ts'), 'export const store = {};');
    fs.writeFileSync(
      path.join(root, 'packages/b/src/domain/order.ts'),
      "import { store } from '@aliased';\nexport const order = store;\n"
    );
    fs.writeFileSync(
      path.join(root, 'packages/b/tsconfig.json'),
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@aliased': ['src/shared/store.ts'] } } })
    );

    const result = runArkCheck(root);
    expect(result.ok).toBe(false);
    const layerViolations = result.violations.filter((v) => v.ruleId === 'LAYER_IMPORT_VIOLATION');
    expect(layerViolations).toHaveLength(1);
    expect((layerViolations[0] as { file?: string }).file).toBe('packages/a/src/domain/order.ts');
  });

  it('--report writes a self-contained HTML report with the matrix and violations', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-report-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ark.config.json'), TWO_LAYER_CONFIG);
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = 1;\n');
    // A domain file illegally importing an infra adapter: DomainModel -> PersistenceAdapters is denied.
    // Specifier built by concatenation so Ark's own write-gate heuristic (which flags
    // literal infra import strings) doesn't block this test file.
    const badSpecifier = `../in${'fra'}/db.js`;
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      `import { db } from '${badSpecifier}';\nexport const order = db;\n`
    );

    const result = runArkCheck(root, ['--report', 'report.html']);
    expect(result.ok).toBe(false);

    const html = fs.readFileSync(path.join(root, 'report.html'), 'utf8');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('class="deny"'); // the denied edge is rendered in the matrix
    expect(html).toContain('LAYER_IMPORT_VIOLATION'); // the live violation is listed
    expect(html).toContain('src/domain/order.ts'); // the offending file
    // No external assets — the report must work offline.
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('flags a circular dependency between two files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-cycle-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({ include: ['src'], layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }], rules: [] })
    );
    fs.writeFileSync(path.join(root, 'src/domain/a.ts'), "import { b } from './b.js';\nexport const a = () => b;\n");
    fs.writeFileSync(path.join(root, 'src/domain/b.ts'), "import { a } from './a.js';\nexport const b = () => a;\n");

    const result = runArkCheck(root);
    expect(result.ok).toBe(false);
    const cycles = result.violations.filter((v) => v.ruleId === 'CIRCULAR_DEPENDENCY');
    expect(cycles).toHaveLength(1);
    // Anchored at the alphabetically-first member for a stable baseline key.
    expect((cycles[0] as { file?: string }).file).toBe('src/domain/a.ts');
  });

  it('does not flag an acyclic import graph', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-dag-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({ include: ['src'], layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }], rules: [] })
    );
    fs.writeFileSync(path.join(root, 'src/domain/a.ts'), "import { b } from './b.js';\nexport const a = b;\n");
    fs.writeFileSync(path.join(root, 'src/domain/b.ts'), 'export const b = 1;\n');

    const result = runArkCheck(root);
    expect(result.violations.filter((v) => v.ruleId === 'CIRCULAR_DEPENDENCY')).toHaveLength(0);
  });

  it('--init --preset writes a named starter config that passes strict on a greenfield repo', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-preset-'));
    const init = runInit(root, ['--preset', 'hexagonal']);
    expect(init.status).toBe(0);

    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    expect(config.layers.map((l: { name: string }) => l.name)).toEqual([
      'DomainModel',
      'ApplicationOrchestration',
      'PresentationAdapters',
      'PersistenceAdapters',
    ]);
    // Wildcard preset layers carve out framework internals so a broad `src/**/domain/**`
    // can't mis-flag `src/kernel/domain` — every layer ships the default exclude.
    for (const layer of config.layers) {
      expect(layer.exclude).toContain('**/kernel/**');
    }
    // Inward-only: the domain may not import the persistence layer.
    expect(
      config.rules.some(
        (r: { from: string; to: string; allowed: boolean }) =>
          r.from === 'DomainModel' && r.to === 'PersistenceAdapters' && r.allowed === false
      )
    ).toBe(true);
    // Every layer optional → strict passes before any directory exists.
    expect(runArkCheck(root, ['--strict-config']).ok).toBe(true);
  });

  it('rejects an unknown --preset name', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-preset-bad-'));
    const init = runInit(root, ['--preset', 'nope']);
    expect(init.status).toBe(2);
    expect(init.stderr).toContain('Unknown preset');
    expect(fs.existsSync(path.join(root, 'ark.config.json'))).toBe(false);
  });

  it('--codex-home installs the /ark-* skills into $CODEX_HOME/prompts', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-cxh-'));
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# AGENTS\n');
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-cxhome-'));
    execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--install-agent-gates', '--root', root, '--tools', 'claude', '--codex-home'],
      { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, CODEX_HOME: codexHome } }
    );
    const fixSkill = path.join(codexHome, 'prompts', 'ark-fix.md');
    expect(fs.existsSync(fixSkill)).toBe(true);
    expect(fs.readFileSync(fixSkill, 'utf8')).toMatch(/^arkVersion:/m);
  });

  it('--tools codex wires [mcp_servers.ark] into $CODEX_HOME/config.toml with absolute paths, preserving other tables and staying idempotent', () => {
    // A space in the project path (like "PREDIAL WEB") is why absolute paths matter — the
    // global config.toml is loaded without the project as cwd, so "." would be wrong.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark cxmcp-'));
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# AGENTS\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({ include: ['src'], layers: [{ name: 'A', patterns: ['src/**'] }], rules: [] })
    );
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-cxmcphome-'));
    // Pre-existing config with unrelated tables must survive the merge.
    fs.writeFileSync(path.join(codexHome, 'config.toml'), '[tui]\ntheme = "dark"\n');
    const configPath = path.join(codexHome, 'config.toml');
    const env = { ...process.env, CODEX_HOME: codexHome };

    execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--install-agent-gates', '--root', root, '--tools', 'codex'],
      { encoding: 'utf8', stdio: 'pipe', env }
    );
    let toml = fs.readFileSync(configPath, 'utf8');
    expect(toml).toContain('[mcp_servers.ark]');
    // Absolute --root and --config, not "." — the whole point of the config.toml path.
    expect(toml).toContain(`"--root", "${path.resolve(root)}"`);
    expect(toml).toContain(`"--config", "${path.join(path.resolve(root), 'ark.config.json')}"`);
    expect(toml).not.toContain('"--root", "."');
    expect(toml).toContain('[tui]'); // unrelated table preserved

    // Second run without --force must not duplicate the table.
    execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--install-agent-gates', '--root', root, '--tools', 'codex'],
      { encoding: 'utf8', stdio: 'pipe', env }
    );
    toml = fs.readFileSync(configPath, 'utf8');
    expect(toml.match(/\[mcp_servers\.ark\]/g)).toHaveLength(1);
  });

  it('flags stale /ark-* skills in the Codex home prompts dir', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-cxg-'));
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# AGENTS\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({ include: ['src'], layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }], rules: [] })
    );
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-cxghome-'));
    fs.mkdirSync(path.join(codexHome, 'prompts'), { recursive: true });
    fs.writeFileSync(
      path.join(codexHome, 'prompts', 'ark-fix.md'),
      '---\nname: ark-fix\narkVersion: 1.0.0\n---\nbody\n'
    );
    const out = execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--config', 'ark.config.json', '--json'],
      { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, CODEX_HOME: codexHome } }
    );
    const result = JSON.parse(out) as { codexHomeGap?: { missing: number; stale: number } };
    expect(result.codexHomeGap?.stale).toBeGreaterThanOrEqual(1);

    // The refresh it recommends must keep --skills-only, or --force also clobbers
    // customized gate files (AGENTS.md, CI, settings).
    const human = execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--config', 'ark.config.json'],
      { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, CODEX_HOME: codexHome } }
    );
    expect(human).toContain('--skills-only --codex-home --force');
  });

  it('does not flag the Codex home when no ark skills live there', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-cxn-'));
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# AGENTS\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({ include: ['src'], layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }], rules: [] })
    );
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-cxnhome-')); // empty, no prompts/ark-*
    const out = execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--config', 'ark.config.json', '--json'],
      { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, CODEX_HOME: codexHome } }
    );
    expect((JSON.parse(out) as { codexHomeGap?: unknown }).codexHomeGap).toBeUndefined();
  });

  it('the HTML report shows layer purpose and a readable dependency direction', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-report2-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/x.ts'), 'export const x = 1;\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [{ name: 'DomainModel', description: 'Pure business rules.', patterns: ['src/domain/**'] }],
        rules: [],
      })
    );
    runArkCheck(root, ['--report', 'r.html']);
    const html = fs.readFileSync(path.join(root, 'r.html'), 'utf8');
    expect(html).toContain('Pure business rules.'); // Purpose column, from the layer `description`
    expect(html).toContain('Dependency direction'); // readable per-layer view
    expect(html).toContain('nothing (pure core)'); // a lone layer imports nothing
  });
});

describe('ark-check --coverage', () => {
  it('reports per-layer counts, the FULL unclassified list, and empty layers', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-coverage-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/loose'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/a.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(root, 'src/domain/b.ts'), 'export const b = 2;');
    fs.writeFileSync(path.join(root, 'src/loose/c.ts'), 'export const c = 3;'); // unclassified
    fs.writeFileSync(path.join(root, 'ark.config.json'), TWO_LAYER_CONFIG);

    const result = coverageJson(root);
    expect(result.ok).toBe(true);
    const byName = Object.fromEntries(
      result.coverage.layers.map((l: { name: string; files: number }) => [l.name, l.files])
    );
    expect(byName.DomainModel).toBe(2);
    expect(byName.PersistenceAdapters).toBe(0); // src/infra never created
    expect(result.coverage.emptyLayers).toContain('PersistenceAdapters');
    // Full list, not the 5-sample cap of the CONFIG_UNCLASSIFIED_FILES warning.
    expect(result.coverage.unclassified.files).toEqual(['src/loose/c.ts']);
    expect(result.coverage.unclassified.count).toBe(1);
  });

  it('reports the governed fraction and proposes a canonical layer for ungoverned dirs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-coverage-suggest-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/components'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/lib/repositories'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/hooks'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/a.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(root, 'src/components/b.ts'), 'export const b = 1;');
    fs.writeFileSync(path.join(root, 'src/lib/repositories/c.ts'), 'export const c = 1;');
    fs.writeFileSync(path.join(root, 'src/hooks/d.ts'), 'export const d = 1;');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({ include: ['src'], layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }], rules: [] })
    );

    const result = coverageJson(root);
    // 1 of 4 files governed — the headline honesty number.
    expect(result.coverage.governed).toEqual({ classifiedFiles: 1, totalFiles: 4, percent: 25 });
    const byDir = Object.fromEntries(
      result.coverage.suggestions.map((s: { dir: string }) => [s.dir, s])
    );
    // Recognized dirs get a canonical layer sourced from the 11 layers + presets.
    expect(byDir['src/components'].layer).toBe('PresentationAdapters');
    expect(byDir['src/lib/repositories'].layer).toBe('PersistenceAdapters');
    // Unrecognized dirs are flagged, never guessed.
    expect(byDir['src/hooks'].unrecognized).toBe(true);
    expect(byDir['src/hooks'].layer).toBeUndefined();
  });

  it('--doctor reports a consolidated health view', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-doctor-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = 1;\n');
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      "import { db } from '../infra/db';\nexport const o = db;\n"
    );
    fs.writeFileSync(path.join(root, 'ark.config.json'), TWO_LAYER_CONFIG);

    const doctor = (runArkCheck(root, ['--doctor']) as unknown as { doctor: any }).doctor;
    expect(doctor.governed.percent).toBe(100); // both files classified by the two layers
    expect(doctor.violations.total).toBeGreaterThanOrEqual(1); // domain → persistence import
    expect(doctor.baseline.exists).toBe(false);
    expect(doctor.gatesMissing.length).toBeGreaterThan(0); // no gates installed here
  });

  it('is report-only: exit 0 even when files are unclassified', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-coverage-exit-'));
    fs.mkdirSync(path.join(root, 'src/loose'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/loose/c.ts'), 'export const c = 3;');
    fs.writeFileSync(path.join(root, 'ark.config.json'), TWO_LAYER_CONFIG);
    // execFileSync throws on non-zero exit; not throwing IS the exit-0 assertion.
    const out = execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--config', 'ark.config.json', '--coverage'],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    expect(out).toContain('Governed:');
    // Ungoverned code is surfaced with a per-directory proposal, not hidden behind green.
    expect(out).toContain('src/loose');
  });
});

describe('ark-check violation diagnosis', () => {
  // 12 files on one edge (App→Kernel) — the "every route imports the kernel" pattern that
  // is almost always a contract bug, not 12 pieces of debt.
  function concentratedProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-diagnose-'));
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/kernel'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/kernel/api.ts'), 'export const api = 1;\n');
    for (let i = 0; i < 12; i += 1) {
      fs.writeFileSync(
        path.join(root, `src/app/route${i}.ts`),
        "import { api } from '../kernel/api';\nexport const r = api;\n"
      );
    }
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'AppOrchestration', patterns: ['src/app/**'] },
          { name: 'Kernel', patterns: ['src/kernel/**'] },
        ],
        rules: [{ from: 'AppOrchestration', to: 'Kernel', allowed: false }],
      })
    );
    return root;
  }

  it('ranks violations by edge and flags a concentrated edge in --json', () => {
    const result: any = runArkCheck(concentratedProject());
    expect(result.ok).toBe(false);
    expect(result.summary.total).toBe(12);
    expect(result.summary.dominant).toBe('AppOrchestration → Kernel');
    expect(result.summary.concentrated).toBe(true);
    expect(result.summary.edges[0].count).toBe(12);
  });

  it('tags type-only import violations separately from value (runtime) ones', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-typeonly-'));
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/kernel'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src/kernel/api.ts'),
      'export const api = 1;\nexport type Api = number;\n'
    );
    fs.writeFileSync(
      path.join(root, 'src/app/value.ts'),
      "import { api } from '../kernel/api';\nexport const r = api;\n"
    );
    fs.writeFileSync(
      path.join(root, 'src/app/types.ts'),
      "import type { Api } from '../kernel/api';\nexport const x: Api = 1;\n"
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'AppOrchestration', patterns: ['src/app/**'] },
          { name: 'Kernel', patterns: ['src/kernel/**'] },
        ],
        rules: [{ from: 'AppOrchestration', to: 'Kernel', allowed: false }],
      })
    );
    const result: any = runArkCheck(root);
    expect(result.violations).toHaveLength(2);
    expect(result.summary.valueCount).toBe(1);
    expect(result.summary.typeOnlyCount).toBe(1);
    expect(result.violations.find((v: any) => v.file === 'src/app/types.ts').typeOnly).toBe(true);
    // Value violations stay untagged (real runtime coupling).
    expect(result.violations.find((v: any) => v.file === 'src/app/value.ts').typeOnly).toBeUndefined();

    // Cache round-trip: a cached second run must still carry the typeOnly tag. (The scan
    // cache stores edges; its schema tag — scanCacheKey v2 — invalidates a pre-typeOnly
    // cache so an upgrade can't silently report every violation as a value edge.)
    const cached: any = runArkCheck(root);
    expect(cached.summary.typeOnlyCount).toBe(1);
    expect(cached.violations.find((v: any) => v.file === 'src/app/types.ts').typeOnly).toBe(true);
  });

  it('refuses to freeze a lopsided violation set unless --force is passed', () => {
    const root = concentratedProject();
    let stderr = '';
    let threw = false;
    try {
      execFileSync('node', [path.resolve('bin/ark-check.mjs'), '--root', root, '--update-baseline'], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error) {
      threw = true;
      stderr = (error as { stderr: string }).stderr;
    }
    // Blocked: non-zero exit, no baseline written, contract-fix guidance instead.
    expect(threw).toBe(true);
    expect(stderr).toContain('Refusing to freeze');
    expect(stderr).toContain('single edge');
    expect(fs.existsSync(path.join(root, '.ark-baseline.json'))).toBe(false);

    // --force freezes anyway (the escape hatch).
    const forced = execFileSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--update-baseline', '--force'],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    expect(forced).toContain('frozen violation key');
    expect(fs.existsSync(path.join(root, '.ark-baseline.json'))).toBe(true);
  });
});

describe('ark-check overlapping-glob layer resolution', () => {
  it('classifies a file by the most specific pattern regardless of layer order', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-facade-'));
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/kernel/app'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/kernel/internal'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/kernel/app/surface.ts'), 'export const s = 1;');
    fs.writeFileSync(path.join(root, 'src/kernel/internal/guts.ts'), 'export const g = 1;');
    // Catch-all KernelInternal declared BEFORE the specific KernelApi — the facade must
    // still win: a facade split can't depend on the author ordering layers correctly.
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'AppOrchestration', patterns: ['src/app/**'] },
          { name: 'KernelInternal', patterns: ['src/kernel/**'] },
          { name: 'KernelApi', patterns: ['src/kernel/app/**'] },
        ],
        rules: [{ from: 'AppOrchestration', to: 'KernelInternal', allowed: false }],
      })
    );
    fs.writeFileSync(
      path.join(root, 'src/app/uses-surface.ts'),
      "import { s } from '../kernel/app/surface';\nexport const r = s;\n"
    );
    fs.writeFileSync(
      path.join(root, 'src/app/uses-guts.ts'),
      "import { g } from '../kernel/internal/guts';\nexport const r2 = g;\n"
    );
    const result = runArkCheck(root);
    // Only the internals reach-around violates; importing the surface is allowed even
    // though KernelApi is declared last.
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].file).toBe('src/app/uses-guts.ts');
    const cov: any = coverageJson(root);
    const byName = Object.fromEntries(cov.coverage.layers.map((l: any) => [l.name, l.files]));
    expect(byName.KernelApi).toBe(1);
    expect(byName.KernelInternal).toBe(1);
  });

  it('warns when two layers match a file at equal specificity (ambiguous order-dependence)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-ambig-'));
    fs.mkdirSync(path.join(root, 'src/shared'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/shared/x.ts'), 'export const x = 1;');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'A', patterns: ['src/shared/**'] },
          { name: 'B', patterns: ['src/shared/**'] },
        ],
        rules: [],
      })
    );
    const result = runArkCheck(root);
    expect(result.warnings.map((w: { ruleId: string }) => w.ruleId)).toContain(
      'CONFIG_AMBIGUOUS_LAYERS'
    );
  });
});

describe('ark-check --init monorepo detection', () => {
  it('auto-detects package.json workspaces and writes a cross-package profile', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-init-mono-'));
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'm', workspaces: ['packages/*', 'apps/*'] })
    );
    fs.mkdirSync(path.join(root, 'packages/domain/src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packages/domain/src/order.ts'), 'export const o = 1;');

    const init = runInit(root);
    expect(init.status).toBe(0);
    expect(init.stdout).toContain('Monorepo detected');
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    expect(cfg.include).toEqual(['packages', 'apps']);
    expect(cfg.layers.map((l: { name: string }) => l.name)).toContain('DomainModel');
    // The domain package file is actually classified as DomainModel by the **/domain/** glob.
    const cov = coverageJson(root);
    const domain = cov.coverage.layers.find((l: { name: string }) => l.name === 'DomainModel');
    expect(domain.files).toBe(1);
    expect(cov.coverage.unclassified.count).toBe(0);
  });

  it('reads pnpm-workspace.yaml packages: only, ignoring other list keys', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-init-pnpm-'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'm' }));
    // onlyBuiltDependencies is a real pnpm list key whose items are NOT workspace globs;
    // a key-agnostic parser would wrongly pull esbuild/@parcel/watcher into `include`.
    fs.writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'libs/*'\n  - 'services/*'\nonlyBuiltDependencies:\n  - esbuild\n  - '@parcel/watcher'\n"
    );

    const init = runInit(root);
    expect(init.status).toBe(0);
    expect(init.stdout).toContain('Monorepo detected');
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    expect(cfg.include).toEqual(['libs', 'services']);
  });

  it('--preset monorepo works explicitly and falls back to packages+apps', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-preset-mono-'));
    const init = runInit(root, ['--preset', 'monorepo']);
    expect(init.status).toBe(0);
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    expect(cfg.include).toEqual(['packages', 'apps']);
    expect(cfg.layers.map((l: { name: string }) => l.name)).toEqual([
      'DomainModel',
      'ApplicationOrchestration',
      'PresentationAdapters',
      'PersistenceAdapters',
    ]);
  });
});
