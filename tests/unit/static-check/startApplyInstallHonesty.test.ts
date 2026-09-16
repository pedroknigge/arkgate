/**
 * Issue #258: start --apply must not look green when package install fails,
 * and the next doctor command must use package `arkgate` (never a bare
 * `npx arkgate-check` 404).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { pinArkgateDevDependency } from '../../../bin/lib/field-install.mjs';
import { arkPackageRecoveryCommand } from '../../../bin/lib/package-manager.mjs';
import { formatStartPackageInstallFailure } from '../../../bin/lib/start-preview.mjs';
import { setupUsage } from '../../../bin/lib/first-run-help.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARK = path.join(REPO, 'bin', 'ark.mjs');
const CLI_VERSION = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version as string;
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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

function layeredFixture(prefix: string, pkg: Record<string, unknown> = {}) {
  const root = tempRoot(prefix);
  write(
    root,
    'package.json',
    `${JSON.stringify({ name: 'start-install-honesty', private: true, ...pkg }, null, 2)}\n`
  );
  write(root, 'src/domain/value.ts', 'export const value = 1;\n');
  write(root, 'src/application/use.ts', 'export const use = 1;\n');
  write(root, 'src/presentation/page.ts', 'export const page = 1;\n');
  write(root, 'src/infrastructure/db.ts', 'export const db = 1;\n');
  return root;
}

describe('arkPackageRecoveryCommand', () => {
  it('runs the bin from package arkgate — never a bare npx arkgate-check', () => {
    expect(arkPackageRecoveryCommand('arkgate-check', '--doctor')).toBe(
      'npx --package=arkgate arkgate-check --doctor'
    );
    expect(arkPackageRecoveryCommand('arkgate-check', '--doctor')).not.toMatch(
      /(?:^|[\s`])npx arkgate-check(?:\s|$)/
    );
  });
});

describe('formatStartPackageInstallFailure', () => {
  it('prints the exact install plus a recoverable doctor command', () => {
    const text = formatStartPackageInstallFailure({
      exitStatus: 1,
      installCommand: 'yarn add -D arkgate@^4.8.15',
    });
    expect(text).toMatch(/Package install failed \(exit 1\)/);
    expect(text).toContain('yarn add -D arkgate@^4.8.15');
    expect(text).toContain('npx --package=arkgate arkgate-check --doctor');
    expect(text).toMatch(/command in the arkgate package/);
    expect(text).not.toMatch(/(?:^|[\s`])npx arkgate-check(?:\s|$)/);
    expect(text).not.toMatch(/Applied \d+ start mutation/);
  });
});

describe('pinArkgateDevDependency bumps an older caret to this CLI', () => {
  it('rewrites ^older to the shipped CLI caret', () => {
    const root = tempRoot('ark-pin-bump-');
    write(
      root,
      'package.json',
      JSON.stringify({ name: 'behind', private: true, devDependencies: { arkgate: '^4.8.14' } }, null, 2)
    );
    const result = pinArkgateDevDependency(root);
    expect(result.changed).toBe(true);
    expect(result.reason).toBe('bumped');
    expect(result.version).toBe(`^${CLI_VERSION}`);
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      devDependencies?: { arkgate?: string };
    };
    expect(pkg.devDependencies?.arkgate).toBe(`^${CLI_VERSION}`);
  });

  it('leaves a matching pin and a moving latest spec alone', () => {
    const matchRoot = tempRoot('ark-pin-match-');
    write(
      matchRoot,
      'package.json',
      JSON.stringify(
        { name: 'match', private: true, devDependencies: { arkgate: `^${CLI_VERSION}` } },
        null,
        2
      )
    );
    expect(pinArkgateDevDependency(matchRoot)).toMatchObject({
      changed: false,
      reason: 'already-present',
      version: `^${CLI_VERSION}`,
    });

    const latestRoot = tempRoot('ark-pin-latest-');
    write(
      latestRoot,
      'package.json',
      JSON.stringify({ name: 'latest', private: true, devDependencies: { arkgate: 'latest' } }, null, 2)
    );
    expect(pinArkgateDevDependency(latestRoot)).toMatchObject({
      changed: false,
      reason: 'already-present',
      version: 'latest',
    });
  });
});

describe('start --apply install fail is not green (#258)', () => {
  it('exits non-zero and prints yarn add + recoverable doctor when yarn fails', () => {
    const root = layeredFixture('ark-apply-yarn-fail-');
    write(root, 'yarn.lock', '# yarn lockfile v1\n');
    const fakeBin = path.join(root, '.fake-bin');
    fs.mkdirSync(fakeBin, { recursive: true });
    fs.writeFileSync(path.join(fakeBin, 'yarn'), '#!/bin/sh\necho "yarn: simulated install fail" >&2\nexit 1\n', {
      mode: 0o755,
    });

    const result = spawnSync(process.execPath, [ARK, 'start', '--root', root, '--apply', '--yes', '--no-strict', '--tools', 'claude'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}` },
    });
    const out = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

    expect(result.status, out).not.toBe(0);
    expect(out).toMatch(/Package install failed \(exit 1\)/);
    expect(out).toMatch(/yarn add -D arkgate@/);
    expect(out).toContain('npx --package=arkgate arkgate-check --doctor');
    expect(out).not.toMatch(/run the install command when online/);
    expect(out).not.toMatch(/(?:^|[\s`])npx arkgate-check(?:\s|$)/);
    expect(fs.existsSync(path.join(root, 'ark.config.json'))).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      devDependencies?: { arkgate?: string };
    };
    expect(pkg.devDependencies?.arkgate).toBe(`^${CLI_VERSION}`);
  });

  it('start --apply --skip-package-manager bumps an older pin to this CLI', () => {
    const root = layeredFixture('ark-apply-pin-bump-', {
      devDependencies: { arkgate: '^4.8.14' },
    });
    const result = spawnSync(
      process.execPath,
      [ARK, 'start', '--root', root, '--apply', '--yes', '--no-strict', '--tools', 'claude', '--skip-package-manager'],
      { encoding: 'utf8' }
    );
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      devDependencies?: { arkgate?: string };
    };
    expect(pkg.devDependencies?.arkgate).toBe(`^${CLI_VERSION}`);
    expect(pkg.devDependencies?.arkgate).not.toBe('^4.8.14');
  });
});

describe('first-contact copy does not teach a 404 doctor command', () => {
  it('setup help names the recoverable doctor command', () => {
    const help = setupUsage();
    expect(help).toContain('npx --package=arkgate arkgate-check --doctor');
    expect(help).toMatch(/arkgate-check --doctor/);
  });

  it('README / use / develop one-minute paths use --package=arkgate', () => {
    for (const rel of ['README.md', 'docs/use.md', 'docs/develop.md']) {
      const text = fs.readFileSync(path.join(REPO, rel), 'utf8');
      expect(text, rel).toContain('npx --package=arkgate arkgate-check --doctor');
    }
  });
});
