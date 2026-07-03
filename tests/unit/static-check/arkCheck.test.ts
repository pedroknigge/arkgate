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
    // Every layer is optional so the strict check passes before any directory exists.
    expect(config.layers.every((l: { optional: boolean }) => l.optional)).toBe(true);
    const result = runArkCheck(root, ['--strict-config']);
    expect(result.ok).toBe(true);

    // Files outside every conventional directory still surface the honest warning.
    fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(root, 'lib/util.ts'), 'export const a = 1;\n');
    const withStray = runArkCheck(root, ['--strict-config']);
    expect(withStray.ok).toBe(false);
    expect(withStray.warnings.some((w) => w.ruleId === 'CONFIG_UNCLASSIFIED_FILES')).toBe(true);

    // Code inside a conventional directory is governed immediately: a domain file
    // referencing a persistence intent must fail the strict check.
    fs.mkdirSync(path.join(root, 'domain'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'domain/order.ts'),
      "export const ref = 'Adapter.Persistence.Save';\n"
    );
    fs.rmSync(path.join(root, 'lib'), { recursive: true });
    const governed = runArkCheck(root, ['--strict-config']);
    expect(governed.ok).toBe(false);
    expect(governed.violations.length).toBeGreaterThan(0);
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
    expect(pnpmWorkflow).toContain('pnpm exec ark-check --root . --config ark.config.json --strict-config');
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

  it('includes --require-gates in the generated CI workflow command', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-agent-gates-require-'));
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');

    const result = runInstallAgentGates(root);
    expect(result.status).toBe(0);
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/ark-check.yml'), 'utf8');
    expect(workflow).toContain('--strict-config --require-gates');
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
    expect(payload.missing).toContain('.github/workflows/ark-check.yml');
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
});

describe('ark init', () => {
  it('runs the explicit non-interactive setup without using postinstall prompts', () => {
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

  it('postinstall only prints the explicit init command', () => {
    const output = execFileSync('node', [path.resolve('bin/ark-postinstall.mjs')], {
      encoding: 'utf8',
      stdio: 'pipe',
    });

    expect(output).toContain('Ark installed, but not enforced yet.');
    expect(output).toContain('npx ark init');
    expect(output).toContain('npx ark init --yes');
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
