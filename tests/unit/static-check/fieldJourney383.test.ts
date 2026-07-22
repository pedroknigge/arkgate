/**
 * 3.8.3 field journey: pnpm workspace install argv, skip-when-current, start pin default.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  installDevHint,
  isPnpmWorkspaceRoot,
  packageInstallArgv,
  shouldSkipArkgateInstall,
} from '../../../bin/ark-shared.mjs';

const ARK = path.resolve('bin/ark.mjs');

function tempRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function write(root: string, rel: string, body: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

describe('3.8.3 packageInstallArgv workspace awareness', () => {
  it('adds -w for pnpm workspace roots', () => {
    const root = tempRoot('ark-383-pnpm-ws-');
    write(root, 'package.json', JSON.stringify({ name: 'ws-root', private: true }, null, 2));
    write(root, 'pnpm-workspace.yaml', 'packages:\n  - apps/*\n');
    write(root, 'pnpm-lock.yaml', 'lockfileVersion: 9\n');
    expect(isPnpmWorkspaceRoot(root)).toBe(true);
    const [cmd, args] = packageInstallArgv(root, 'latest');
    expect(cmd).toBe('pnpm');
    expect(args).toEqual(['add', '-D', 'arkgate@latest', '-w']);
    expect(installDevHint(root, 'arkgate@latest')).toContain('-w');
  });

  it('does not add -w for plain pnpm projects', () => {
    const root = tempRoot('ark-383-pnpm-plain-');
    write(root, 'package.json', JSON.stringify({ name: 'plain', private: true }, null, 2));
    write(root, 'pnpm-lock.yaml', 'lockfileVersion: 9\n');
    expect(isPnpmWorkspaceRoot(root)).toBe(false);
    const [cmd, args] = packageInstallArgv(root, 'latest');
    expect(cmd).toBe('pnpm');
    expect(args).toEqual(['add', '-D', 'arkgate@latest']);
    expect(args).not.toContain('-w');
  });

  it('keeps npm install shape for package-lock projects', () => {
    const root = tempRoot('ark-383-npm-');
    write(root, 'package.json', JSON.stringify({ name: 'npm-app', private: true }, null, 2));
    write(root, 'package-lock.json', '{}\n');
    const [cmd, args] = packageInstallArgv(root, '^3.8.3');
    expect(cmd).toBe('npm');
    expect(args).toEqual(['install', '-D', 'arkgate@^3.8.3']);
  });

  it('adds -W for yarn workspace roots', () => {
    const root = tempRoot('ark-383-yarn-ws-');
    write(
      root,
      'package.json',
      JSON.stringify({ name: 'yarn-ws', private: true, workspaces: ['packages/*'] }, null, 2)
    );
    write(root, 'yarn.lock', '# yarn\n');
    const [cmd, args] = packageInstallArgv(root, 'latest');
    expect(cmd).toBe('yarn');
    expect(args).toEqual(['add', '-D', 'arkgate@latest', '-W']);
  });

  it('skips install when node_modules arkgate matches CLI version', () => {
    const root = tempRoot('ark-383-skip-');
    write(root, 'package.json', JSON.stringify({ name: 'skip', private: true }, null, 2));
    write(
      root,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '3.8.2' }, null, 2)
    );
    expect(shouldSkipArkgateInstall(root, '3.8.2')).toMatchObject({
      skip: true,
      installedVersion: '3.8.2',
      reason: 'already-current',
    });
    expect(shouldSkipArkgateInstall(root, '3.8.3').skip).toBe(false);
  });
});

describe('3.8.3 start pins arkgate by default', () => {
  it('start --apply without --install still pins package.json (opt out with --no-install)', () => {
    const root = tempRoot('ark-383-start-pin-');
    write(
      root,
      'package.json',
      JSON.stringify({ name: 'fresh-start', version: '0.0.0', private: true }, null, 2)
    );
    write(root, 'src/index.ts', 'export const x = 1;\n');
    const result = spawnSync(
      process.execPath,
      [
        ARK,
        'start',
        '--apply',
        '--root',
        root,
        '--no-strict',
        '--tools',
        'grok',
        '--skip-package-manager',
        '--json',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    // Preview+apply path: --json prints preview then applies
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      devDependencies?: { arkgate?: string };
    };
    expect(pkg.devDependencies?.arkgate).toBeTruthy();
    expect(fs.existsSync(path.join(root, '.mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'ark.config.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'AGENTS.md'))).toBe(true);
  });

  it('start --no-install does not pin arkgate', () => {
    const root = tempRoot('ark-383-start-noinstall-');
    write(
      root,
      'package.json',
      JSON.stringify({ name: 'fresh-noinstall', version: '0.0.0', private: true }, null, 2)
    );
    write(root, 'src/index.ts', 'export const x = 1;\n');
    const result = spawnSync(
      process.execPath,
      [
        ARK,
        'start',
        '--apply',
        '--root',
        root,
        '--no-install',
        '--no-strict',
        '--tools',
        'grok',
        '--json',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      devDependencies?: { arkgate?: string };
    };
    expect(pkg.devDependencies?.arkgate).toBeUndefined();
  });
});
