import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withDistLock } from '../helpers/distLock';

const root = process.cwd();
const checkBin = path.join(root, 'bin', 'structrail-check.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'structrail-identity-'));

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function readJson(file: string) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeProject(configNames: string[]) {
  const project = fs.mkdtempSync(path.join(tmp, 'config-'));
  fs.mkdirSync(path.join(project, 'src'), { recursive: true });
  fs.writeFileSync(path.join(project, 'src', 'index.ts'), 'export const value = 1;\n');
  const config = JSON.stringify(
    {
      include: ['src'],
      layers: [{ name: 'Application', patterns: ['src/**'] }],
      rules: [],
    },
    null,
    2
  );
  for (const name of configNames) fs.writeFileSync(path.join(project, name), `${config}\n`);
  return project;
}

function runCheck(project: string, args: string[] = []) {
  return spawnSync(
    process.execPath,
    [checkBin, '--root', project, '--json', '--no-cache', ...args],
    {
      cwd: root,
      encoding: 'utf8',
    }
  );
}

function pack(cwd: string, destination: string) {
  const output = execFileSync(
    'npm',
    ['pack', '--pack-destination', destination, '--silent'],
    {
      cwd,
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        ...process.env,
        npm_config_cache: path.join(tmp, 'npm-cache'),
        npm_config_ignore_scripts: 'true',
      },
    }
  ).trim();
  return path.join(destination, output.split(/\r?\n/).at(-1)!);
}

function localBin(consumer: string, name: string) {
  return path.join(
    consumer,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? `${name}.cmd` : name
  );
}

describe('Structrail v3 identity and ArkGate compatibility contract', () => {
  it('makes Structrail the primary package and prepares an exact-version ArkGate wrapper', () => {
    const primary = readJson(path.join(root, 'package.json'));
    expect(primary.name).toBe('structrail');
    expect(primary.version).toBe('3.0.0');
    expect(primary.description).toMatch(/^Structrail\b/);
    expect(primary.mcpName).toBe('io.github.pedroknigge/structrail');
    expect(primary.bin).toEqual({
      structrail: 'bin/structrail.mjs',
      'structrail-check': 'bin/structrail-check.mjs',
      'structrail-mcp': 'bin/structrail-mcp.mjs',
    });

    const legacy = readJson(path.join(root, 'compat', 'arkgate', 'package.json'));
    expect(legacy.name).toBe('arkgate');
    expect(legacy.version).toBe(primary.version);
    expect(legacy.deprecated).toContain('structrail');
    expect(legacy.dependencies).toEqual({ structrail: primary.version });
    expect(legacy.bin).toEqual({
      arkgate: 'bin/arkgate.mjs',
      'arkgate-check': 'bin/arkgate-check.mjs',
      'arkgate-mcp': 'bin/arkgate-mcp.mjs',
      ark: 'bin/arkgate.mjs',
      'ark-check': 'bin/arkgate-check.mjs',
      'ark-mcp': 'bin/arkgate-mcp.mjs',
    });
    expect(Object.keys(legacy.exports).sort()).toEqual([
      '.',
      './eslint',
      './nestjs',
      './package.json',
      './runtime',
    ]);
  });

  it('discovers the canonical config, supports the legacy filename, and rejects ambiguity', () => {
    const canonical = runCheck(writeProject(['structrail.config.json']));
    expect(canonical.status, canonical.stderr).toBe(0);
    expect(JSON.parse(canonical.stdout)).toMatchObject({ ok: true });

    const legacyProject = writeProject(['ark.config.json']);
    const legacy = runCheck(legacyProject);
    expect(legacy.status, legacy.stderr).toBe(0);
    expect(JSON.parse(legacy.stdout).deprecations).toContainEqual(
      expect.objectContaining({
        code: 'legacy-config-filename',
        replacement: 'structrail.config.json',
      })
    );

    const ambiguousProject = writeProject(['structrail.config.json', 'ark.config.json']);
    const ambiguous = runCheck(ambiguousProject);
    expect(ambiguous.status).toBe(2);
    expect(JSON.parse(ambiguous.stdout)).toMatchObject({
      ok: false,
      error: 'ambiguous-config',
    });

    const explicitLegacy = runCheck(ambiguousProject, ['--config', 'ark.config.json']);
    expect(explicitLegacy.status, explicitLegacy.stderr).toBe(0);
    expect(JSON.parse(explicitLegacy.stdout).deprecations).toContainEqual(
      expect.objectContaining({ code: 'legacy-config-filename' })
    );
  });

  it('installs both tarballs with equivalent imports and disjoint primary/legacy bins', () => {
    const packs = path.join(tmp, 'packs');
    const consumer = path.join(tmp, 'consumer');
    fs.mkdirSync(packs, { recursive: true });
    fs.mkdirSync(consumer, { recursive: true });
    fs.writeFileSync(
      path.join(consumer, 'package.json'),
      `${JSON.stringify({ name: 'identity-consumer', private: true, type: 'module' }, null, 2)}\n`
    );

    let primaryTarball = '';
    withDistLock(() => {
      primaryTarball = pack(root, packs);
    });
    const legacyTarball = pack(path.join(root, 'compat', 'arkgate'), packs);
    const typescriptTarball = pack(path.join(root, 'node_modules', 'typescript'), packs);
    execFileSync(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
        '--offline',
        primaryTarball,
        legacyTarball,
        typescriptTarball,
      ],
      {
        cwd: consumer,
        stdio: 'pipe',
        timeout: 60_000,
        env: { ...process.env, npm_config_cache: path.join(tmp, 'npm-cache') },
      }
    );

    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        [
          "const primary = await import('structrail');",
          "const legacy = await import('arkgate');",
          "const primaryRuntime = await import('structrail/runtime');",
          "const legacyRuntime = await import('arkgate/runtime');",
          "const primaryEslint = await import('structrail/eslint');",
          "const legacyEslint = await import('arkgate/eslint');",
          "if (primary.version !== legacy.version) throw new Error('root export mismatch');",
          "if (primaryRuntime.version !== legacyRuntime.version) throw new Error('runtime mismatch');",
          "if (primaryEslint.default !== legacyEslint.default) throw new Error('eslint mismatch');",
        ].join('\n'),
      ],
      { cwd: consumer, stdio: 'pipe' }
    );

    for (const name of [
      'structrail',
      'structrail-check',
      'structrail-mcp',
      'arkgate',
      'arkgate-check',
      'arkgate-mcp',
      'ark',
      'ark-check',
      'ark-mcp',
    ]) {
      expect(fs.existsSync(localBin(consumer, name)), name).toBe(true);
    }

    const primaryVersion = execFileSync(localBin(consumer, 'structrail-check'), ['--version'], {
      cwd: consumer,
      encoding: 'utf8',
    }).trim();
    const legacyVersion = execFileSync(localBin(consumer, 'arkgate-check'), ['--version'], {
      cwd: consumer,
      encoding: 'utf8',
    }).trim();
    expect(primaryVersion).toBe('3.0.0');
    expect(legacyVersion).toBe(primaryVersion);

    const primaryCliVersion = execFileSync(localBin(consumer, 'structrail'), ['--version'], {
      cwd: consumer,
      encoding: 'utf8',
    }).trim();
    const legacyCliVersion = execFileSync(localBin(consumer, 'arkgate'), ['--version'], {
      cwd: consumer,
      encoding: 'utf8',
    }).trim();
    expect(primaryCliVersion).toBe(primaryVersion);
    expect(legacyCliVersion).toBe(primaryVersion);
  }, 120_000);
});
