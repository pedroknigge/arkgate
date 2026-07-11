import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = process.cwd();
const cli = path.join(repo, 'bin', 'structrail.mjs');
const checkCli = path.join(repo, 'bin', 'structrail-check.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'structrail-cli-identity-'));

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function project(name: string) {
  const root = path.join(tmp, name);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export const value = 1;\n');
  fs.writeFileSync(
    path.join(root, 'package.json'),
    `${JSON.stringify({ name, private: true, type: 'module' }, null, 2)}\n`
  );
  return root;
}

function run(root: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args, '--root', root], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, CODEX_HOME: path.join(root, 'codex-home') },
  });
}

function runCheck(root: string, args: string[]) {
  return spawnSync(process.execPath, [checkCli, '--root', root, '--no-cache', ...args], {
    cwd: repo,
    encoding: 'utf8',
  });
}

function writeLegacyConfig(root: string) {
  fs.writeFileSync(
    path.join(root, 'ark.config.json'),
    `${JSON.stringify(
      {
        include: ['src'],
        layers: [{ name: 'Application', patterns: ['src/**'] }],
        rules: [],
      },
      null,
      2
    )}\n`
  );
}

describe('Structrail CLI identity', () => {
  it('uses Structrail for the guided start contract and generated surfaces', () => {
    const root = project('guided-start');
    const result = run(root, [
      'start',
      '--yes',
      '--no-install',
      '--no-strict',
      '--tools',
      'claude',
    ]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Let's set up Structrail for your project.");
    expect(result.stdout).toContain('Setting up Structrail contract');
    expect(fs.existsSync(path.join(root, 'structrail.config.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'ark.config.json'))).toBe(false);

    const mcp = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));
    expect(Object.keys(mcp.mcpServers)).toEqual(['structrail']);
    expect(mcp.mcpServers.structrail.args).toContain('structrail.config.json');
    expect(
      fs.existsSync(path.join(root, '.github', 'workflows', 'structrail-check.yml'))
    ).toBe(true);
  });

  it('previews, applies, and safely repeats the config identity migration', () => {
    const root = project('migrate-config');
    writeLegacyConfig(root);
    fs.writeFileSync(
      path.join(root, 'package.json'),
      `${JSON.stringify(
        {
          name: 'migrate-config',
          private: true,
          scripts: {
            'check:architecture':
              'npx arkgate-check --root . --config ark.config.json --strict',
          },
        },
        null,
        2
      )}\n`
    );
    fs.writeFileSync(
      path.join(root, '.mcp.json'),
      `${JSON.stringify(
        {
          mcpServers: {
            ark: {
              command: 'npx',
              args: ['arkgate-mcp', '--root', '.', '--config', 'ark.config.json'],
            },
          },
        },
        null,
        2
      )}\n`
    );
    fs.writeFileSync(
      path.join(root, 'src', 'identity-note.ts'),
      "export const historicalFixture = 'ark.config.json';\n"
    );

    const preview = run(root, ['migrate-config']);
    expect(preview.status, preview.stderr).toBe(0);
    expect(preview.stdout).toContain('Config identity migration preview');
    expect(preview.stdout).toContain('ark.config.json -> structrail.config.json');
    expect(preview.stdout).toContain('--apply');
    expect(fs.existsSync(path.join(root, 'ark.config.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'structrail.config.json'))).toBe(false);

    const applied = run(root, ['migrate-config', '--apply']);
    expect(applied.status, applied.stderr).toBe(0);
    expect(applied.stdout).toContain('Renamed ark.config.json -> structrail.config.json');
    expect(fs.existsSync(path.join(root, 'ark.config.json'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'structrail.config.json'))).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts['check:architecture']).toContain('structrail-check');
    expect(pkg.scripts['check:architecture']).toContain('structrail.config.json');

    const mcp = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));
    expect(Object.keys(mcp.mcpServers)).toEqual(['structrail']);
    expect(mcp.mcpServers.structrail.args).toContain('structrail-mcp');
    expect(mcp.mcpServers.structrail.args).toContain('structrail.config.json');
    expect(fs.readFileSync(path.join(root, 'src', 'identity-note.ts'), 'utf8')).toContain(
      'ark.config.json'
    );

    const beforeRepeat = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
    const repeated = run(root, ['migrate-config', '--apply']);
    expect(repeated.status, repeated.stderr).toBe(0);
    expect(repeated.stdout).toContain('already uses structrail.config.json');
    expect(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(beforeRepeat);
  });

  it('refuses to migrate when both config identities exist', () => {
    const root = project('migrate-conflict');
    writeLegacyConfig(root);
    fs.copyFileSync(
      path.join(root, 'ark.config.json'),
      path.join(root, 'structrail.config.json')
    );

    const result = run(root, ['migrate-config', '--apply']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Both structrail.config.json and ark.config.json exist');
    expect(fs.existsSync(path.join(root, 'ark.config.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'structrail.config.json'))).toBe(true);
  });

  it('uses only canonical identity in normal check, plan, doctor, and coverage output', () => {
    const root = project('check-output');
    fs.writeFileSync(
      path.join(root, 'structrail.config.json'),
      `${JSON.stringify(
        {
          include: ['src'],
          layers: [{ name: 'Application', patterns: ['src/**'] }],
          rules: [],
        },
        null,
        2
      )}\n`
    );

    const help = runCheck(root, ['--help']);
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain('Usage: structrail-check');
    expect(help.stdout).toContain('product name Structrail');
    expect(help.stdout).toContain('structrail.config.json');

    const cases = [
      { args: ['--plan'], heading: 'Structrail plan' },
      { args: ['--doctor'], heading: 'Structrail doctor' },
      { args: ['--coverage'], heading: 'Structrail coverage' },
      { args: [], heading: 'Structrail check passed' },
    ];
    const legacySurface =
      /\bArkGate\b|\bArk\b|ark\.config\.json|\barkgate-(?:check|mcp)\b|\bark-(?:check|mcp)\b|\/ark-[a-z]/;

    for (const entry of cases) {
      const result = runCheck(root, entry.args);
      expect(result.status, result.stderr).toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toContain(entry.heading);
      expect(output).not.toMatch(legacySurface);
    }
  });

  it('uses canonical filenames and commands for new plans and reports', () => {
    const root = project('generated-output');
    fs.writeFileSync(
      path.join(root, 'structrail.config.json'),
      `${JSON.stringify(
        {
          include: ['src'],
          layers: [{ name: 'Application', patterns: ['src/**'] }],
          rules: [],
        },
        null,
        2
      )}\n`
    );

    const recommend = runCheck(root, ['--recommend', '--write-plan', '--json']);
    expect(recommend.status, recommend.stderr).toBe(0);
    const recommendation = JSON.parse(recommend.stdout);
    expect(recommendation.adoptionPlanPath).toBe('structrail-adoption-plan.json');
    expect(recommendation.initCommand).toContain('structrail init');
    expect(recommendation.adoptCommand).toContain('structrail-check --recommend --write-plan');
    expect(recommendation.checkCommand).toContain(
      'structrail-check --root . --config structrail.config.json --strict-config'
    );
    expect(fs.existsSync(path.join(root, 'structrail-adoption-plan.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'ark-adoption-plan.json'))).toBe(false);
    expect(
      fs.readFileSync(path.join(root, 'structrail-adoption-plan.json'), 'utf8')
    ).not.toMatch(/\bark(?:gate)?(?:-check)?\b|ark\.config\.json/);

    const report = runCheck(root, ['--report', '--no-open']);
    expect(report.status, report.stderr).toBe(0);
    const reportPath = path.join(root, 'structrail-report.html');
    expect(fs.existsSync(reportPath)).toBe(true);
    expect(fs.existsSync(path.join(root, 'ark-report.html'))).toBe(false);
    const reportHtml = fs.readFileSync(reportPath, 'utf8');
    expect(reportHtml).toContain('Structrail architecture report');
    expect(reportHtml).toContain('/structrail-explain');
    expect(reportHtml).not.toMatch(/\bArkGate\b|\bArk\b|\bark(?:gate)?-(?:check|mcp)\b|\/ark-/);
  });
});
