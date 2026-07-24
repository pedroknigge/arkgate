/**
 * Stale global CLI vs project node_modules/arkgate — upgrade fail-closed guard.
 * ESM imports so V8 coverage attributes hits to bin/lib/upgrade-command.mjs.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildUpgradeNextCommand,
  compareSemverCore,
  evaluateStaleUpgradeCli,
  isPathInside,
  recoveryUseLocal,
  resolveProjectArkgatePackageJson,
  runUpgradeCommand,
} from '../../../bin/lib/upgrade-command.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function write(root: string, rel: string, body: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

describe('compareSemverCore / isPathInside / recoveryUseLocal', () => {
  it('orders major.minor.patch cores', () => {
    expect(compareSemverCore('2.6.0', '4.0.0')).toBe(-1);
    expect(compareSemverCore('4.0.0', '4.0.0')).toBe(0);
    expect(compareSemverCore('4.1.0', '4.0.0')).toBe(1);
    expect(compareSemverCore('v3.8.2', '3.8.0')).toBe(1);
    expect(compareSemverCore('3.8.0-beta.1', '3.8.0')).toBe(0);
    expect(compareSemverCore('', '1.0.0')).toBe(-1);
    // Non-numeric core → 0.0.0
    expect(compareSemverCore('not-a-version', '0.0.1')).toBe(-1);
    expect(compareSemverCore('not-a-version', '0.0.0')).toBe(0);
  });

  it('detects path containment', () => {
    const root = path.join(os.tmpdir(), 'ark-path-root');
    expect(isPathInside(path.join(root, 'bin'), root)).toBe(true);
    expect(isPathInside(root, root)).toBe(true);
    expect(isPathInside(path.join(root, '..', 'other'), root)).toBe(false);
  });

  it('recoveryUseLocal prefers package-manager runner and notes hoisted monorepos', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-recovery-'));
    try {
      write(tmp, 'package.json', JSON.stringify({ name: 'consumer', private: true }, null, 2));
      const text = recoveryUseLocal(tmp);
      expect(text).toMatch(/project-local CLI/i);
      expect(text).toMatch(/^(Use the project-local)/);
      expect(text).toMatch(/\barkgate\b/);
      expect(text).toMatch(/node_modules\/arkgate\/bin\/ark\.mjs/);
      expect(text).toMatch(/Hoisted monorepos/i);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('buildUpgradeNextCommand (project-local, never bare ark)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-next-cmd-'));
    write(tmp, 'package.json', JSON.stringify({ name: 'consumer', private: true }, null, 2));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('emits package-manager runner + arkgate, not bare ark', () => {
    const cmd = buildUpgradeNextCommand(
      {
        root: tmp,
        install: false,
        json: true,
        strict: false,
        tools: 'claude',
      },
      'sha256:abc'
    );
    expect(cmd).toMatch(/^(npx|pnpm |yarn )/);
    expect(cmd).toMatch(/\barkgate\b/);
    expect(cmd).toMatch(/--plan-digest sha256:abc/);
    expect(cmd).not.toMatch(/^ark /);
    expect(cmd).not.toMatch(/\bark upgrade\b/);
  });

  it('uses pnpm exec on pnpm lockfile projects', () => {
    write(tmp, 'pnpm-lock.yaml', 'lockfileVersion: 9\n');
    const cmd = buildUpgradeNextCommand(
      { root: tmp, install: false, json: false, strict: true },
      'sha256:def'
    );
    expect(cmd).toMatch(/^pnpm /);
    expect(cmd).toMatch(/exec arkgate/);
    expect(cmd).not.toMatch(/^ark /);
  });

  it('install apply omits plan-digest; acceptConflicts and strict flags appear', () => {
    const withInstall = buildUpgradeNextCommand(
      { root: tmp, install: true, json: false, strict: true, acceptConflicts: true },
      'sha256:ignored'
    );
    expect(withInstall).not.toMatch(/--plan-digest/);
    expect(withInstall).toMatch(/--accept-conflicts/);
    expect(withInstall).not.toMatch(/--no-strict/);
    expect(withInstall).toMatch(/--apply/);
  });
});

describe('evaluateStaleUpgradeCli', () => {
  let tmp: string;
  let fakeGlobal: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-stale-cli-'));
    fakeGlobal = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-global-cli-'));
    write(tmp, 'package.json', JSON.stringify({ name: 'consumer', private: true }, null, 2));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(fakeGlobal, { recursive: true, force: true });
  });

  it('allows projects with no local node_modules/arkgate', () => {
    const result = evaluateStaleUpgradeCli(tmp, {
      cliVersion: '2.6.0',
      cliPackageRoot: fakeGlobal,
    });
    expect(result.refuse).toBe(false);
    expect(result.reason).toBe('no-local-arkgate');
  });

  it('allows project-local CLI even when versions differ (older local still trusted)', () => {
    write(
      tmp,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '4.0.0' }, null, 2)
    );
    const projectRoot = path.join(tmp, 'node_modules', 'arkgate');
    const result = evaluateStaleUpgradeCli(tmp, {
      cliVersion: '2.6.0',
      cliPackageRoot: projectRoot,
    });
    expect(result.refuse).toBe(false);
    expect(result.reason).toBe('project-local-cli');
  });

  it('allows project-local CLI when node_modules/arkgate is a symlink (realpath)', () => {
    const realPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-real-pkg-'));
    write(
      realPkg,
      'package.json',
      JSON.stringify({ name: 'arkgate', version: '4.0.0' }, null, 2)
    );
    fs.mkdirSync(path.join(tmp, 'node_modules'), { recursive: true });
    fs.symlinkSync(realPkg, path.join(tmp, 'node_modules', 'arkgate'));
    try {
      const result = evaluateStaleUpgradeCli(tmp, {
        cliVersion: '2.6.0',
        cliPackageRoot: realPkg,
      });
      expect(result.refuse).toBe(false);
      expect(result.reason).toBe('project-local-cli');
    } finally {
      fs.rmSync(realPkg, { recursive: true, force: true });
    }
  });

  it('refuses outside-tree CLI older than project install (pre-managed wording)', () => {
    write(
      tmp,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '4.0.0' }, null, 2)
    );
    const result = evaluateStaleUpgradeCli(tmp, {
      cliVersion: '2.6.0',
      cliPackageRoot: fakeGlobal,
    });
    expect(result.refuse).toBe(true);
    expect(result.reason).toBe('stale-outside-cli');
    expect(result.message).toMatch(/Refusing ark upgrade/);
    expect(result.message).toMatch(/v2\.6\.0/);
    expect(result.message).toMatch(/v4\.0\.0/);
    // Package-manager runner is primary; shallow node path is secondary / install-root only.
    expect(result.message).toMatch(/npx arkgate upgrade|pnpm (?:exec )?arkgate|yarn arkgate/);
    expect(result.message).toMatch(/package-manager runner preferred/i);
    expect(result.message).toMatch(/node_modules\/arkgate\/bin\/ark\.mjs/);
    expect(result.message).toMatch(/Global\/stale arkgate 2\.x/);
  });

  it('refuses modern-but-stale outside CLI without blaming mutative 2.x', () => {
    write(
      tmp,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '4.0.0' }, null, 2)
    );
    const result = evaluateStaleUpgradeCli(tmp, {
      cliVersion: '3.9.2',
      cliPackageRoot: fakeGlobal,
    });
    expect(result.refuse).toBe(true);
    expect(result.reason).toBe('stale-outside-cli');
    expect(result.message).toMatch(/v3\.9\.2/);
    expect(result.message).toMatch(/Older outside-tree CLI must not manage/);
    expect(result.message).not.toMatch(/Global\/stale arkgate 2\.x/);
  });

  it('allows outside-tree CLI newer than project install', () => {
    write(
      tmp,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '3.8.2' }, null, 2)
    );
    const result = evaluateStaleUpgradeCli(tmp, {
      cliVersion: '4.0.0',
      cliPackageRoot: fakeGlobal,
    });
    expect(result.refuse).toBe(false);
    expect(result.reason).toBe('outside-cli-ok');
  });

  it('allows outside-tree CLI at the same version', () => {
    write(
      tmp,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '4.0.0' }, null, 2)
    );
    const result = evaluateStaleUpgradeCli(tmp, {
      cliVersion: '4.0.0',
      cliPackageRoot: fakeGlobal,
    });
    expect(result.refuse).toBe(false);
    expect(result.reason).toBe('outside-cli-ok');
  });

  it('refuses outside-tree CLI with unknown version when project install exists', () => {
    write(
      tmp,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '4.0.0' }, null, 2)
    );
    const result = evaluateStaleUpgradeCli(tmp, {
      cliVersion: null,
      cliPackageRoot: fakeGlobal,
    });
    expect(result.refuse).toBe(true);
    expect(result.reason).toBe('outside-tree-unknown-version');
    expect(result.message).toMatch(/Refusing ark upgrade/);
  });

  it('refuses outside-tree CLI when project package.json is unreadable', () => {
    write(tmp, 'node_modules/arkgate/package.json', '{ not-json');
    const result = evaluateStaleUpgradeCli(tmp, {
      cliVersion: '2.6.0',
      cliPackageRoot: fakeGlobal,
    });
    expect(result.refuse).toBe(true);
    expect(result.reason).toBe('project-unreadable');
    expect(result.message).toMatch(/cannot read the project's arkgate version/);
  });

  it('refuses outside-tree CLI when project package version is missing', () => {
    write(
      tmp,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate' }, null, 2)
    );
    const result = evaluateStaleUpgradeCli(tmp, {
      cliVersion: '2.6.0',
      cliPackageRoot: fakeGlobal,
    });
    expect(result.refuse).toBe(true);
    expect(result.reason).toBe('project-version-missing');
  });

  it('resolves hoisted monorepo install via Node module resolution', () => {
    // Workspace root hosts arkgate; nested package is --root without shallow node_modules/arkgate.
    write(
      tmp,
      'package.json',
      JSON.stringify(
        {
          name: 'ws-root',
          private: true,
          workspaces: ['packages/*'],
          devDependencies: { arkgate: '4.0.0' },
        },
        null,
        2
      )
    );
    write(
      tmp,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '4.0.0' }, null, 2)
    );
    const app = path.join(tmp, 'packages', 'app');
    write(
      app,
      'package.json',
      JSON.stringify(
        { name: 'app', private: true, devDependencies: { arkgate: '4.0.0' } },
        null,
        2
      )
    );
    expect(fs.existsSync(path.join(app, 'node_modules', 'arkgate', 'package.json'))).toBe(false);
    const resolved = resolveProjectArkgatePackageJson(app);
    expect(resolved).toBeTruthy();
    expect(path.basename(path.dirname(resolved as string))).toBe('arkgate');

    const refuse = evaluateStaleUpgradeCli(app, {
      cliVersion: '2.6.0',
      cliPackageRoot: fakeGlobal,
    });
    expect(refuse.refuse).toBe(true);
    expect(refuse.reason).toBe('stale-outside-cli');
    expect(refuse.projectVersion).toBe('4.0.0');
    // Recovery prefers package-manager form (works from nested --root without shallow path).
    expect(refuse.message).toMatch(/npx arkgate upgrade|pnpm (?:exec )?arkgate|yarn arkgate/);
    expect(refuse.message).toMatch(/Hoisted monorepos/i);
    expect(refuse.message).toMatch(/package-manager runner preferred/i);
  });
});

describe('runUpgradeCommand stale guard integration', () => {
  let tmp: string;
  let fakeGlobal: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-stale-run-'));
    fakeGlobal = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-global-run-'));
    write(tmp, 'package.json', JSON.stringify({ name: 'consumer', private: true }, null, 2));
    stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(fakeGlobal, { recursive: true, force: true });
  });

  it('exits non-zero before install/plan when CLI is stale global', () => {
    write(
      tmp,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '4.0.0' }, null, 2)
    );
    const packageInstallArgv = vi.fn(() => {
      throw new Error('packageInstallArgv must not run when guard refuses');
    });
    const code = runUpgradeCommand(
      { root: tmp, apply: true, install: true, json: false, strict: true },
      {
        cliVersion: '2.6.0',
        cliPackageRoot: fakeGlobal,
        packageInstallArgv,
        arkCheck: path.join(REPO, 'bin/ark-check.mjs'),
        runArkCheck: () => 0,
      }
    );
    expect(code).toBe(2);
    expect(packageInstallArgv).not.toHaveBeenCalled();
    const joined = stderrSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(joined).toMatch(/Refusing ark upgrade/);
    expect(joined).toMatch(/v2\.6\.0/);
    expect(joined).toMatch(/v4\.0\.0/);
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('emits machine-readable JSON on refuse when --json is set', () => {
    write(
      tmp,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '4.0.0' }, null, 2)
    );
    const packageInstallArgv = vi.fn(() => {
      throw new Error('packageInstallArgv must not run when guard refuses');
    });
    const code = runUpgradeCommand(
      { root: tmp, apply: false, install: false, json: true, strict: true },
      {
        cliVersion: '2.6.0',
        cliPackageRoot: fakeGlobal,
        packageInstallArgv,
        arkCheck: path.join(REPO, 'bin/ark-check.mjs'),
        runArkCheck: () => 0,
      }
    );
    expect(code).toBe(2);
    expect(packageInstallArgv).not.toHaveBeenCalled();
    const stdout = stdoutSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    const report = JSON.parse(stdout) as {
      refused: boolean;
      reason: string;
      message: string;
      cliVersion: string;
      projectVersion: string;
      nextCommand: string;
    };
    expect(report.refused).toBe(true);
    expect(report.reason).toBe('stale-outside-cli');
    expect(report.cliVersion).toBe('2.6.0');
    expect(report.projectVersion).toBe('4.0.0');
    expect(report.message).toMatch(/Refusing ark upgrade/);
    expect(report.nextCommand).toMatch(/^(npx|pnpm |yarn )/);
    expect(report.nextCommand).toMatch(/\barkgate\b/);
    // Human multi-line refuse stays off stderr when --json (agents parse stdout only).
    const stderr = stderrSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(stderr).not.toMatch(/Refusing ark upgrade/);
  });

  it('does not refuse when no local arkgate (install path may proceed)', () => {
    // No node_modules/arkgate — guard allows; install argv is invoked for apply+install.
    // Fail install offline with process.execPath (exit 1): never hits the registry and never
    // re-enters a published CLI (which would dump bare-ark nextCommand from another package).
    const packageInstallArgv = vi.fn(() => [
      process.execPath,
      ['-e', 'process.exit(1)'],
    ]);
    const code = runUpgradeCommand(
      { root: tmp, apply: true, install: true, json: true, strict: false },
      {
        cliVersion: '2.6.0',
        cliPackageRoot: fakeGlobal,
        packageInstallArgv,
        arkCheck: path.join(REPO, 'bin/ark-check.mjs'),
        runArkCheck: () => 0,
        shouldSkipArkgateInstall: () => ({ skip: false }),
      }
    );
    expect(packageInstallArgv).toHaveBeenCalled();
    // Install fails before re-entry; exit is the spawn status (1), not stale-CLI refuse (2).
    expect(code).toBe(1);
    expect(fs.existsSync(path.join(tmp, 'node_modules', 'arkgate'))).toBe(false);
    const joined = stderrSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(joined).not.toMatch(/Refusing ark upgrade/);
    expect(joined).toMatch(/Package update failed/);
    // Recovery guidance stays project-local (npx/pnpm/yarn arkgate), not bare PATH ark.
    expect(joined).toMatch(/\barkgate\b/);
    expect(joined).not.toMatch(/Then: ark upgrade/);
  });

  it('allows project-local CLI path for preview and emits project-local nextCommand', () => {
    write(
      tmp,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '4.0.0' }, null, 2)
    );
    const projectRoot = path.join(tmp, 'node_modules', 'arkgate');
    const code = runUpgradeCommand(
      {
        root: tmp,
        apply: false,
        install: false,
        json: true,
        strict: false,
        tools: 'claude',
      },
      {
        cliVersion: '4.0.0',
        cliPackageRoot: projectRoot,
        packageInstallArgv: () => ['npm', ['install', '-D', 'arkgate']],
        arkCheck: path.join(REPO, 'bin/ark-check.mjs'),
        runArkCheck: () => 0,
      }
    );
    expect(code).toBe(0);
    const joinedErr = stderrSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(joinedErr).not.toMatch(/Refusing ark upgrade/);
    const stdout = stdoutSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    const report = JSON.parse(stdout) as { nextCommand: string };
    expect(report.nextCommand).toMatch(/^(npx|pnpm |yarn )/);
    expect(report.nextCommand).toMatch(/\barkgate\b/);
    expect(report.nextCommand).toMatch(/--plan-digest /);
    expect(report.nextCommand).not.toMatch(/^ark /);
  });

  it('human preview path (non-json) exits 0 without refuse for project-local CLI', () => {
    write(
      tmp,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '4.0.0' }, null, 2)
    );
    const projectRoot = path.join(tmp, 'node_modules', 'arkgate');
    const code = runUpgradeCommand(
      { root: tmp, apply: false, install: false, json: false, strict: false },
      {
        cliVersion: '4.0.0',
        cliPackageRoot: projectRoot,
        packageInstallArgv: () => ['false', []],
        arkCheck: path.join(REPO, 'bin/ark-check.mjs'),
        runArkCheck: () => 0,
      }
    );
    expect(code).toBe(0);
    expect(stderrSpy.mock.calls.join('\n')).not.toMatch(/Refusing/);
  });

  it('skip-install re-enters fake local CLI and returns its exit status', () => {
    write(
      tmp,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '4.0.0' }, null, 2)
    );
    write(
      tmp,
      'node_modules/arkgate/bin/ark.mjs',
      '#!/usr/bin/env node\nprocess.exit(7);\n'
    );
    const projectRoot = path.join(tmp, 'node_modules', 'arkgate');
    const packageInstallArgv = vi.fn(() => {
      throw new Error('must skip install');
    });
    const code = runUpgradeCommand(
      { root: tmp, apply: true, install: true, json: false, strict: false },
      {
        cliVersion: '4.0.0',
        cliPackageRoot: projectRoot,
        packageInstallArgv,
        shouldSkipArkgateInstall: () => ({ skip: true, installedVersion: '4.0.0' }),
        arkCheck: path.join(REPO, 'bin/ark-check.mjs'),
        runArkCheck: () => 0,
      }
    );
    expect(packageInstallArgv).not.toHaveBeenCalled();
    expect(code).toBe(7);
    expect(stdoutSpy.mock.calls.map((c) => c.join(' ')).join('\n')).toMatch(
      /Package already at arkgate@4\.0\.0/
    );
  });

  it('apply without plan-digest fails closed with digest error (covers apply path)', () => {
    write(
      tmp,
      'node_modules/arkgate/package.json',
      JSON.stringify({ name: 'arkgate', version: '4.0.0' }, null, 2)
    );
    write(tmp, 'ark.config.json', JSON.stringify({ schemaVersion: '1.1', include: ['src'], layers: [], rules: [] }));
    const projectRoot = path.join(tmp, 'node_modules', 'arkgate');
    const code = runUpgradeCommand(
      {
        root: tmp,
        apply: true,
        install: false,
        planDigest: 'sha256:deadbeef',
        json: false,
        strict: false,
      },
      {
        cliVersion: '4.0.0',
        cliPackageRoot: projectRoot,
        packageInstallArgv: () => ['false', []],
        arkCheck: path.join(REPO, 'bin/ark-check.mjs'),
        runArkCheck: () => 0,
      }
    );
    // Digest mismatch or plan refuse → exit 2 from apply catch.
    expect(code).toBe(2);
    expect(stderrSpy.mock.calls.map((c) => c.join(' ')).join('\n').length).toBeGreaterThan(0);
  });

  it('uses injectable evaluateStaleUpgradeCli when provided', () => {
    const evaluateStaleUpgradeCli = vi.fn(() => ({
      refuse: true,
      reason: 'injected',
      message: 'injected refuse',
      cliVersion: '1.0.0',
      projectVersion: '4.0.0',
    }));
    const code = runUpgradeCommand(
      { root: tmp, apply: false, install: false, json: false, strict: true },
      {
        evaluateStaleUpgradeCli,
        cliVersion: '1.0.0',
        cliPackageRoot: fakeGlobal,
        packageInstallArgv: () => ['false', []],
        arkCheck: path.join(REPO, 'bin/ark-check.mjs'),
        runArkCheck: () => 0,
      }
    );
    expect(code).toBe(2);
    expect(evaluateStaleUpgradeCli).toHaveBeenCalled();
    expect(stderrSpy.mock.calls.map((c) => c.join(' ')).join('\n')).toMatch(/injected refuse/);
  });
});
