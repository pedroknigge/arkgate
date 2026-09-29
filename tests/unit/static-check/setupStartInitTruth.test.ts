/**
 * Setup-cluster regressions for `ark start` / `ark init`:
 * - explicit --archetype/--preset drives the written contract (not only the gate bypass)
 * - an existing contract is a locked shape: idempotent re-run + remove-host restore apply
 * - host removal never runs the package manager
 * - init pins arkgate (generated CI/hooks call local bins) and leaves no root ark-report.html
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARK = path.join(REPO, 'bin', 'ark.mjs');
const ARK_CHECK = path.join(REPO, 'bin', 'ark-check.mjs');
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(root);
  return root;
}

function write(root: string, rel: string, body: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

function run(bin: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

/** src/domain + src/app: auto-detection reads this as a UI surface (feature-sliced layers). */
function domainAppFixture(prefix: string) {
  const root = tempRoot(prefix);
  write(root, 'package.json', `${JSON.stringify({ name: 'shape-fixture', type: 'module' })}\n`);
  write(root, 'src/domain/a.ts', 'export const a = 1;\n');
  write(root, 'src/app/b.ts', "import { a } from '../domain/a';\nexport const b = a;\n");
  write(root, 'tsconfig.json', '{}\n');
  return root;
}

function plannedLayerNames(stdout: string): string[] {
  const preview = JSON.parse(stdout) as {
    changes: Array<{ path: string; afterBase64?: string }>;
  };
  const config = preview.changes.find((change) => change.path === 'ark.config.json');
  expect(config?.afterBase64).toBeTruthy();
  const parsed = JSON.parse(Buffer.from(config!.afterBase64!, 'base64').toString('utf8')) as {
    layers: Array<{ name: string }>;
  };
  return parsed.layers.map((layer) => layer.name);
}

function initPresetLayerNames(preset: string): string[] {
  const root = tempRoot('ark-init-preset-');
  write(root, 'src/domain/a.ts', 'export const a = 1;\n');
  const init = run(ARK_CHECK, ['--root', root, '--init', '--preset', preset]);
  expect(init.status, init.stderr).toBe(0);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8')) as {
    layers: Array<{ name: string }>;
  };
  return config.layers.map((layer) => layer.name);
}

describe('ark start — explicit shape is the written contract', () => {
  it('--preset hexagonal and --archetype api-backend plan the preset layers, not the detected ones', () => {
    const hexagonal = initPresetLayerNames('hexagonal');
    for (const flags of [
      ['--preset', 'hexagonal'],
      ['--archetype', 'api-backend'],
    ]) {
      const root = domainAppFixture('ark-start-explicit-');
      const preview = run(ARK, ['start', '--root', root, '--tools', 'claude', ...flags, '--json', '--no-install']);
      expect(preview.status, preview.stderr).toBe(0);
      expect(plannedLayerNames(preview.stdout)).toEqual(hexagonal);
    }
  });

  it('start --apply --archetype writes the preset contract', () => {
    const root = domainAppFixture('ark-start-explicit-apply-');
    const applied = run(ARK, [
      'start',
      '--root',
      root,
      '--tools',
      'claude',
      '--archetype',
      'api-backend',
      '--apply',
      '--yes',
      '--no-install',
    ]);
    expect(applied.status, applied.stderr).toBe(0);
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8')) as {
      layers: Array<{ name: string }>;
    };
    expect(config.layers.map((layer) => layer.name)).toEqual(initPresetLayerNames('hexagonal'));
  });
});

describe('ark start — existing contract is a locked shape', () => {
  it('idempotent re-run and the remove-host restore command apply on a low-coverage project', () => {
    const root = tempRoot('ark-start-restore-');
    write(root, 'src/routes/x.ts', 'export const x = 1;\n');
    for (const dir of ['widgets', 'misc', 'stuff']) {
      write(root, `src/${dir}/one.ts`, 'export const one = 1;\n');
      write(root, `src/${dir}/two.ts`, 'export const two = 2;\n');
    }
    const base = ['--root', root, '--tools', 'claude', '--apply', '--yes', '--no-install'];
    const first = run(ARK, ['start', ...base, '--archetype', 'api-backend']);
    expect(first.status, first.stderr).toBe(0);

    const rerun = run(ARK, ['start', ...base]);
    expect(rerun.status, `${rerun.stdout}${rerun.stderr}`).toBe(0);
    expect(rerun.stderr).not.toMatch(/shape confidence \/ coverage gate failed/);

    const removed = run(ARK, ['start', '--root', root, '--remove-host', 'claude', '--apply', '--no-install']);
    expect(removed.status, removed.stderr).toBe(0);
    expect(fs.existsSync(path.join(root, '.claude/settings.json'))).toBe(false);

    const restored = run(ARK, ['start', ...base]);
    expect(restored.status, `${restored.stdout}${restored.stderr}`).toBe(0);
    expect(fs.existsSync(path.join(root, '.claude/settings.json'))).toBe(true);
  });
});

describe('ark start --remove-host', () => {
  it('never runs the package manager or edits package.json', () => {
    const root = domainAppFixture('ark-start-remove-no-install-');
    const setup = run(ARK, [
      'start',
      '--root',
      root,
      '--tools',
      'claude',
      '--preset',
      'hexagonal',
      '--apply',
      '--yes',
      '--no-install',
    ]);
    expect(setup.status, setup.stderr).toBe(0);
    const shimDir = tempRoot('ark-npm-shim-');
    const log = path.join(shimDir, 'npm.log');
    for (const pm of ['npm', 'pnpm', 'yarn']) {
      write(shimDir, pm, `#!/bin/sh\necho "${pm} $@" >> "${log}"\nexit 0\n`);
      fs.chmodSync(path.join(shimDir, pm), 0o755);
    }
    const before = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
    const removed = run(ARK, ['start', '--root', root, '--remove-host', 'claude', '--apply'], {
      PATH: `${shimDir}${path.delimiter}${process.env.PATH ?? ''}`,
    });
    expect(removed.status, removed.stderr).toBe(0);
    expect(removed.stdout).not.toMatch(/Installing package/);
    expect(fs.existsSync(log)).toBe(false);
    expect(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(before);
  });
});

describe('ark init', () => {
  it('pins arkgate before writing gates that call its bins, and keeps the HTML report under .ark/', () => {
    const root = tempRoot('ark-init-pin-');
    write(root, 'package.json', `${JSON.stringify({ name: 'init-pin', version: '1.0.0', type: 'module' })}\n`);
    write(root, 'src/domain/a.ts', 'export const a = 1;\n');
    write(root, 'src/application/b.ts', 'export const b = 1;\n');
    const result = run(ARK, [
      'init',
      '--root',
      root,
      '--archetype',
      'crud-product',
      '--tools',
      'claude',
      '--yes',
      '--skip-package-manager',
    ]);
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      devDependencies?: Record<string, string>;
    };
    expect(pkg.devDependencies?.arkgate).toMatch(/^\^\d+\.\d+\.\d+/);
    expect(result.stdout).toMatch(/Pinned arkgate@/);
    expect(fs.existsSync(path.join(root, 'ark-report.html'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.ark/reports/origin.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.ark/reports/latest.html'))).toBe(true);
  });

  it('respects --no-install and warns when there is no package.json', () => {
    const noPin = tempRoot('ark-init-no-install-');
    write(noPin, 'package.json', `${JSON.stringify({ name: 'no-install' })}\n`);
    write(noPin, 'src/domain/a.ts', 'export const a = 1;\n');
    const skipped = run(ARK, ['init', '--root', noPin, '--preset', 'hexagonal', '--yes', '--no-install']);
    expect(skipped.status, skipped.stderr).toBe(0);
    expect(skipped.stdout).toMatch(/Skipping arkgate package pin \(--no-install\)/);
    const pkg = JSON.parse(fs.readFileSync(path.join(noPin, 'package.json'), 'utf8'));
    expect(pkg.devDependencies).toBeUndefined();

    const bare = tempRoot('ark-init-no-pkg-');
    write(bare, 'src/domain/a.ts', 'export const a = 1;\n');
    const warned = run(ARK, ['init', '--root', bare, '--preset', 'hexagonal', '--yes']);
    expect(warned.status, warned.stderr).toBe(0);
    expect(warned.stdout).toMatch(/Warning: no package\.json/);
  });
});
