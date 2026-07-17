import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHECK = path.resolve('bin/ark-check.mjs');
const REPO = path.resolve('.');

/** Stable path string for permanent-project policy tests; no files are written there. */
function permanentProjectPath(name: string) {
  return path.join(path.parse(process.cwd()).root, 'arkgate-test-workspaces', name);
}

function runCheck(root: string, extra: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [CHECK, '--root', root, ...extra], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function writeTwoLayerOptional(root: string) {
  fs.writeFileSync(
    path.join(root, 'ark.config.json'),
    JSON.stringify(
      {
        include: ['src'],
        layers: [
          {
            name: 'DomainModel',
            patterns: ['src/domain/**'],
            optional: true,
            forbiddenGlobals: ['fetch'],
          },
          {
            name: 'PresentationAdapters',
            patterns: ['src/app/**'],
            optional: true,
          },
          {
            name: 'ApplicationOrchestration',
            patterns: ['src/application/**'],
            optional: true,
          },
          {
            name: 'PersistenceAdapters',
            patterns: ['src/infra/**'],
            optional: true,
          },
        ],
        rules: [
          { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
          { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
          { from: 'ApplicationOrchestration', to: 'DomainModel', allowed: true },
          { from: 'PresentationAdapters', to: 'ApplicationOrchestration', allowed: true },
          { from: 'PersistenceAdapters', to: 'DomainModel', allowed: true },
        ],
      },
      null,
      2
    )
  );
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/application'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/domain/user.ts'), 'export type User = { id: string };\n');
  fs.writeFileSync(path.join(root, 'src/app/page.ts'), 'export const page = 1;\n');
  fs.writeFileSync(path.join(root, 'src/application/use.ts'), 'export const use = 1;\n');
  fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = 1;\n');
  // Extra presentation files for layer-balance educational signal
  for (let i = 0; i < 20; i++) {
    fs.writeFileSync(path.join(root, `src/app/view${i}.ts`), `export const v${i} = ${i};\n`);
  }
}

describe('adoption gaps (doctor + codex-home + report)', () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const t of temps) {
      try {
        fs.rmSync(t, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    temps.length = 0;
  });

  function mk() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-adopt-'));
    temps.push(root);
    return root;
  }

  it('doctor --json reports dual-bin MCP, host gap, and optional-but-populated cores', () => {
    const root = mk();
    writeTwoLayerOptional(root);
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# agent\n');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"adopt-fixture"}\n');
    // Dual bin MCP
    fs.writeFileSync(
      path.join(root, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          ark: {
            type: 'stdio',
            command: 'npx',
            args: ['ark-mcp', 'arkgate-mcp', '--root', '.', '--config', 'ark.config.json'],
          },
        },
      })
    );
    // Incomplete Grok host
    fs.mkdirSync(path.join(root, '.grok'), { recursive: true });

    const r = runCheck(root, ['--config', 'ark.config.json', '--doctor', '--json', '--no-cache']);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.doctor?.adoption).toBeDefined();
    const ids = (out.doctor.adoption.gaps as Array<{ id: string }>).map((g) => g.id);
    expect(ids).toContain('mcp-dual-bin');
    expect(ids.some((id) => id.startsWith('host-grok'))).toBe(true);
    expect(ids.some((id) => id.startsWith('core-optional-'))).toBe(true);
    expect(out.doctor.adoption.coreOptional.length).toBeGreaterThan(0);
    expect(out.doctor.adoption.mcp.ok).toBe(false);
  });

  it('doctor human output names dual-bin and Fix: migrate-commands', () => {
    const root = mk();
    writeTwoLayerOptional(root);
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# agent\n');
    fs.writeFileSync(
      path.join(root, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          ark: {
            type: 'stdio',
            command: 'npx',
            args: ['ark-mcp', 'arkgate-mcp', '--root', '.', '--config', 'ark.config.json'],
          },
        },
      })
    );
    const r = runCheck(root, ['--config', 'ark.config.json', '--doctor', '--no-cache']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Adoption/i);
    expect(r.stdout).toMatch(/ark-mcp\/arkgate-mcp|dual|more than one/i);
    expect(r.stdout).toMatch(/migrate-commands/);
  });

  it('codex-home rewrites temp ark-upgrade root to absolute project + arkgate-mcp without --force', () => {
    const root = mk();
    writeTwoLayerOptional(root);
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# agent\n');
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');

    const fakeCodex = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-codex-home-'));
    temps.push(fakeCodex);
    const configToml = path.join(fakeCodex, 'config.toml');
    const absRoot = path.resolve(root);
    fs.writeFileSync(
      configToml,
      `[mcp_servers.ark]
command = "npx"
args = ["ark-mcp", "--root", "/var/folders/xx/ark-upgrade-tmp123", "--config", "/var/folders/xx/ark-upgrade-tmp123/ark.config.json"]
`
    );

    const r = runCheck(
      root,
      ['--install-agent-gates', '--codex-home', '--tools', 'codex'],
      { CODEX_HOME: fakeCodex }
    );
    expect(r.status).toBe(0);
    const toml = fs.readFileSync(configToml, 'utf8');
    expect(toml).toContain('arkgate-mcp');
    expect(toml).toContain(absRoot);
    expect(toml).not.toMatch(/ark-upgrade-tmp/);
    expect(toml).not.toMatch(/\/var\/folders\/xx/);
    // single preferred bin
    const bins = [...toml.matchAll(/"(arkgate-mcp|ark-mcp)"/g)].map((m) => m[1]);
    expect(bins.filter((b) => b === 'arkgate-mcp' || b === 'ark-mcp').length).toBeGreaterThanOrEqual(1);
    expect(bins.includes('ark-mcp') && bins.includes('arkgate-mcp')).toBe(false);
  });

  /** Neutralize host signals so multi-project severity is not auto-deferred by Grok/Claude env. */
  function neutralHostEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    return {
      GROK_BUILD: '',
      XAI_GROK: '',
      GROK_AGENT: '',
      GROK_WORKSPACE_ROOT: '',
      GROK_SESSION_ID: '',
      CLAUDE_PROJECT_DIR: '',
      CLAUDE_CODE: '',
      CLAUDECODE: '',
      CLAUDE_CODE_ENTRYPOINT: '',
      CURSOR_TRACE_ID: '',
      CURSOR_AGENT: '',
      CURSOR_AGENT_CLI: '',
      CODEX_SANDBOX: '',
      CODEX_THREAD_ID: '',
      CODEX_CI: '',
      CODEX_SESSION_ID: '',
      ARK_ACTIVE_HOST: '',
      ...extra,
    };
  }

  it('doctor prefers the project Codex MCP over an unrelated home primary', () => {
    const root = mk();
    const codexHome = mk();
    writeTwoLayerOptional(root);
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# agent\n');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"codex-project-fixture"}\n');
    fs.mkdirSync(path.join(root, '.codex'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.codex', 'config.toml'),
      '[mcp_servers.ark]\ncommand = "npx"\nargs = ["arkgate-mcp", "--root", ".", "--config", "ark.config.json"]\n'
    );
    fs.writeFileSync(
      path.join(codexHome, 'config.toml'),
      '[mcp_servers.ark]\ncommand = "npx"\nargs = ["arkgate-mcp", "--root", "/another/project"]\n'
    );

    const result = runCheck(
      root,
      ['--config', 'ark.config.json', '--doctor', '--json', '--no-cache'],
      neutralHostEnv({ CODEX_HOME: codexHome, ARK_ACTIVE_HOST: 'codex' })
    );
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout);
    const ids = out.doctor.adoption.gaps.map((gap: { id: string }) => gap.id);
    expect(ids).not.toContain('codex-home-multi-project');
    expect(out.doctor.adoption.codexHome).toBeNull();
    expect(out.doctor.writePath.capabilityEvidence['advisory-write']).toEqual([
      '.codex/config.toml',
    ]);

    fs.writeFileSync(
      path.join(root, '.codex', 'config.toml'),
      '[mcp_servers.ark]\ncommand = "custom"\nargs = ["--root", "."]\n'
    );
    const invalid = runCheck(
      root,
      ['--config', 'ark.config.json', '--doctor', '--json', '--no-cache'],
      neutralHostEnv({ CODEX_HOME: codexHome, ARK_ACTIVE_HOST: 'codex' })
    );
    const invalidOut = JSON.parse(invalid.stdout);
    expect(
      invalidOut.doctor.adoption.gaps.map((gap: { id: string }) => gap.id)
    ).toContain('codex-home-multi-project');
  });

  it('R7 doctor flags multi-project when Codex primary is another permanent project', () => {
    const base = path.join(process.cwd(), '.tmp-r7-codex-doctor');
    fs.rmSync(base, { recursive: true, force: true });
    temps.push(base);
    const rootA = permanentProjectPath('r7-codex-doctor-a');
    const rootB = path.join(base, 'proj-b');
    const codexHome = path.join(base, 'codex-home');
    for (const r of [rootB]) {
      fs.mkdirSync(path.join(r, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(r, 'src/app'), { recursive: true });
      fs.mkdirSync(path.join(r, 'src/application'), { recursive: true });
      fs.mkdirSync(path.join(r, 'src/infra'), { recursive: true });
      writeTwoLayerOptional(r);
      fs.writeFileSync(path.join(r, 'AGENTS.md'), '# agent\n');
      fs.writeFileSync(path.join(r, 'package.json'), '{"name":"r7-fixture"}\n');
    }
    fs.mkdirSync(codexHome, { recursive: true });
    const absA = path.resolve(rootA);
    const absB = path.resolve(rootB);
    // Primary bound to A only — B not yet scoped
    fs.writeFileSync(
      path.join(codexHome, 'config.toml'),
      `[mcp_servers.ark]
command = "npx"
args = ["arkgate-mcp", "--root", "${absA}", "--config", "${absA}/ark.config.json"]
`
    );

    const before = runCheck(
      rootB,
      ['--config', 'ark.config.json', '--doctor', '--json', '--no-cache'],
      neutralHostEnv({ CODEX_HOME: codexHome })
    );
    expect(before.status).toBe(0);
    const beforeJ = JSON.parse(before.stdout);
    const beforeIds = (beforeJ.doctor.adoption.gaps as Array<{ id: string; fix?: string }>).map(
      (g) => g.id
    );
    expect(beforeIds).toContain('codex-home-multi-project');
    expect(beforeJ.doctor.adoption.codexHome?.multiProject).toBe(true);
    expect(beforeJ.doctor.adoption.codexHome?.wrongRoot).toBe(true);
    expect(beforeJ.doctor.adoption.codexHome?.needsRewrite).toBe(false);
    const multiGap = (beforeJ.doctor.adoption.gaps as Array<{
      id: string;
      fix?: string;
      severity?: string;
      deferred?: boolean;
    }>).find((g) => g.id === 'codex-home-multi-project');
    // Unknown host (no session signal): multi-project without scoped table stays warn.
    expect(multiGap?.severity).toBe('warn');
    expect(multiGap?.deferred).toBe(false);
    expect(multiGap?.fix).toMatch(/install-agent-gates/);
    expect(before.stdout + before.stderr).not.toMatch(/codex-home-mcp/); // not the temp-rewrite gap

    // Explicit legacy home fallback: install secondary for B without force.
    const install = runCheck(
      rootB,
      ['--install-agent-gates', '--tools', 'claude', '--codex-home'],
      neutralHostEnv({ CODEX_HOME: codexHome })
    );
    expect(install.status).toBe(0);
    const toml = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
    expect(toml).toContain(absA);
    expect(toml).toContain(absB);
    expect(toml).toMatch(/\[mcp_servers\.ark_proj-b_[a-f0-9]{8}\]/);
    const primary = toml.match(/\[mcp_servers\.ark\][\s\S]*?(?=\n\[|$)/)?.[0] ?? '';
    expect(primary).toContain(absA);
    expect(primary).not.toContain(absB);

    // Doctor after secondary: still multi-project, info + scopedTable
    const after = runCheck(
      rootB,
      ['--config', 'ark.config.json', '--doctor', '--json', '--no-cache'],
      neutralHostEnv({ CODEX_HOME: codexHome })
    );
    expect(after.status).toBe(0);
    const afterJ = JSON.parse(after.stdout);
    const afterGap = (afterJ.doctor.adoption.gaps as Array<{ id: string; severity?: string }>).find(
      (g) => g.id === 'codex-home-multi-project'
    );
    expect(afterGap).toBeTruthy();
    expect(afterGap?.severity).toBe('info');
    expect(afterJ.doctor.adoption.codexHome?.scopedTable).toMatch(/^ark_/);

    // Human doctor mentions multi-project
    const human = runCheck(
      rootB,
      ['--config', 'ark.config.json', '--doctor', '--no-cache'],
      neutralHostEnv({ CODEX_HOME: codexHome })
    );
    expect(human.stdout).toMatch(/Codex primary|multi-project|another project/i);
  });

  it('defers Codex multi-project gap when session host is Grok (not a Top-action blocker)', () => {
    const base = path.join(process.cwd(), '.tmp-r7-codex-defer-grok');
    fs.rmSync(base, { recursive: true, force: true });
    temps.push(base);
    const rootA = permanentProjectPath('r7-codex-defer-grok-a');
    const rootB = path.join(base, 'proj-b');
    const codexHome = path.join(base, 'codex-home');
    for (const r of [rootB]) {
      fs.mkdirSync(path.join(r, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(r, 'src/app'), { recursive: true });
      fs.mkdirSync(path.join(r, 'src/application'), { recursive: true });
      fs.mkdirSync(path.join(r, 'src/infra'), { recursive: true });
      writeTwoLayerOptional(r);
      fs.writeFileSync(path.join(r, 'AGENTS.md'), '# agent\n');
      fs.writeFileSync(path.join(r, 'package.json'), '{"name":"r7-fixture"}\n');
    }
    fs.mkdirSync(codexHome, { recursive: true });
    const absA = path.resolve(rootA);
    fs.writeFileSync(
      path.join(codexHome, 'config.toml'),
      `[mcp_servers.ark]
command = "npx"
args = ["arkgate-mcp", "--root", "${absA}", "--config", "${absA}/ark.config.json"]
`
    );

    const r = runCheck(
      rootB,
      ['--config', 'ark.config.json', '--doctor', '--json', '--no-cache'],
      neutralHostEnv({ CODEX_HOME: codexHome, GROK_BUILD: '1' })
    );
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    const gap = (j.doctor.adoption.gaps as Array<{
      id: string;
      severity?: string;
      deferred?: boolean;
      message?: string;
    }>).find((g) => g.id === 'codex-home-multi-project');
    expect(gap).toBeTruthy();
    expect(gap?.deferred).toBe(true);
    expect(gap?.severity).toBe('info');
    expect(gap?.message).toMatch(/Deferred \(fix when using Codex\)/i);

    const human = runCheck(
      rootB,
      ['--config', 'ark.config.json', '--doctor', '--no-cache'],
      neutralHostEnv({ CODEX_HOME: codexHome, GROK_BUILD: '1' })
    );
    expect(human.stdout).toMatch(/Deferred \(fix when using Codex\)/i);
    expect(human.stdout).toMatch(/When using Codex:/i);
    // Deferred gaps must not appear as numbered Top actions
    expect(human.stdout).not.toMatch(/Top actions[\s\S]*install-agent-gates --tools codex/i);
  });

  it('doctor flags missing lint script when Next production build embeds ESLint (universal deploy-path)', () => {
    const root = mk();
    writeTwoLayerOptional(root);
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# agent\n');
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'next-app-fixture',
        scripts: { build: 'next build' },
        dependencies: { next: '15.0.0', react: '19.0.0' },
      })
    );
    fs.writeFileSync(path.join(root, 'next.config.mjs'), 'export default {};\n');

    const r = runCheck(root, ['--config', 'ark.config.json', '--doctor', '--json', '--no-cache']);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    const ids = (out.doctor.adoption.gaps as Array<{ id: string }>).map((g) => g.id);
    expect(ids).toContain('deploy-path-lint-script-missing');
    expect(out.doctor.adoption.deployPath?.embedsLintInBuild).toBe(true);
    expect(out.doctor.adoption.deployPath?.engines).toContain('next');
  });

  it('doctor flags lint not in CI when Next app has lint script but workflows skip it', () => {
    const root = mk();
    writeTwoLayerOptional(root);
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# agent\n');
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'next-ci-fixture',
        scripts: { build: 'next build', lint: 'eslint .' },
        dependencies: { next: '15.0.0' },
      })
    );
    fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.github', 'workflows', 'ci.yml'),
      'name: CI\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run build\n'
    );

    const r = runCheck(root, ['--config', 'ark.config.json', '--doctor', '--json', '--no-cache']);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    const ids = (out.doctor.adoption.gaps as Array<{ id: string }>).map((g) => g.id);
    expect(ids).toContain('deploy-path-lint-not-in-ci');
  });

  it('does not flag deploy-path lint when ignoreDuringBuilds is true', () => {
    const root = mk();
    writeTwoLayerOptional(root);
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'next-ignore-eslint',
        scripts: { build: 'next build' },
        dependencies: { next: '15.0.0' },
      })
    );
    fs.writeFileSync(
      path.join(root, 'next.config.mjs'),
      'export default { eslint: { ignoreDuringBuilds: true } };\n'
    );

    const r = runCheck(root, ['--config', 'ark.config.json', '--doctor', '--json', '--no-cache']);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    const ids = (out.doctor.adoption.gaps as Array<{ id: string }>).map((g) => g.id);
    expect(ids).not.toContain('deploy-path-lint-script-missing');
    expect(out.doctor.adoption.deployPath?.embedsLintInBuild).toBe(false);
  });

  it('HTML report includes Adoption section distinct from fitness score', () => {
    const root = mk();
    writeTwoLayerOptional(root);
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# agent\n');
    fs.writeFileSync(
      path.join(root, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          ark: {
            type: 'stdio',
            command: 'npx',
            args: ['arkgate-mcp', '--root', '.', '--config', 'ark.config.json'],
          },
        },
      })
    );
    const report = path.join(root, 'out-report.html');
    const r = runCheck(root, [
      '--config',
      'ark.config.json',
      '--report',
      report,
      '--no-cache',
    ]);
    expect(r.status).toBe(0);
    const html = fs.readFileSync(report, 'utf8');
    expect(html).toMatch(/id="adoption"|<h2>Adoption<\/h2>/);
    expect(html).toMatch(/fitness score|Ark score/i);
    expect(html).toMatch(/Layer balance \(educational\)|presentation-heavy|educational/i);
  });

  it('structural adoption template ships in the package templates tree', () => {
    const tmpl = path.join(REPO, 'templates/tests/ark-adoption-gaps.test.ts');
    expect(fs.existsSync(tmpl)).toBe(true);
    const text = fs.readFileSync(tmpl, 'utf8');
    expect(text).toMatch(/arkgate-mcp/);
    expect(text).toMatch(/dual/);
  });
});
