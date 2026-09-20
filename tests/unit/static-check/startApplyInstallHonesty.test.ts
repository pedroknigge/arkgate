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
import {
  classifyStartInstallFailure,
  explainPnpmMaturityBlock,
  formatStartPackageInstallFailure,
  startInstallRecovery,
} from '../../../bin/lib/start-install-recovery.mjs';
import { setupUsage } from '../../../bin/lib/first-run-help.mjs';
import {
  PACKAGE_UNRESOLVED_NEXT_ACTION,
  collectDoctorNextActions,
  preferredDoctorPrimaryNextAction,
} from '../../../bin/lib/doctor-next-actions.mjs';
import { ADOPTED_NOT, NOT_ADOPTED_NEXT_ACTION } from '../../../bin/lib/adoption-stance.mjs';

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

  it('pins the package spec when Age blocked a local add', () => {
    expect(arkPackageRecoveryCommand('arkgate-check', '--doctor', 'arkgate@4.8.18')).toBe(
      'npx --package=arkgate@4.8.18 arkgate-check --doctor'
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

  it('classifies Age stderr and does not replay the doomed add (#292)', () => {
    const dump = [
      'Progress: resolved 1, reused 0, downloaded 0, added 0',
      'ERR_PNPM_NO_MATURE_MATCHING_VERSION  No matching version found for arkgate@^4.8.18 published by now within 7 days waiting period (minimumReleaseAge).',
      'Time to become mature: 6 days 23 hours',
      'The following packages failed the maturity check:',
      '  arkgate  4.8.18  published 1h ago  wait 7d',
      'If you need this package, add it to minimumReleaseAgeExclude.',
    ].join('\n');
    expect(classifyStartInstallFailure(dump)).toMatchObject({
      kind: 'pnpm-age',
      ageWindow: '7 days',
    });
    expect(explainPnpmMaturityBlock(dump)).toBe(
      'This repo waits before trusting new npm packages (pnpm Age — 7 days).'
    );
    const recovery = startInstallRecovery({
      exitStatus: 1,
      installCommand: 'pnpm add -D arkgate@^4.8.18 -w',
      hostOutput: dump,
    });
    expect(recovery.kind).toBe('pnpm-age');
    expect(recovery.replayInstallCommand).toBeNull();
    expect(recovery.primaryCommand).toBe('npx --package=arkgate@4.8.18 arkgate-check --doctor');
    const text = formatStartPackageInstallFailure({
      exitStatus: 1,
      installCommand: 'pnpm add -D arkgate@^4.8.18 -w',
      hostOutput: dump,
    });
    expect(text).toMatch(/This repo waits before trusting new npm packages \(pnpm Age — 7 days\)/);
    expect(text).toContain('npx --package=arkgate@4.8.18 arkgate-check --doctor');
    expect(text).toMatch(/minimumReleaseAgeExclude in pnpm config or pnpm-workspace\.yaml/);
    expect(text).toMatch(/CLI flag is not enough/);
    expect(text).not.toContain('pnpm add -D arkgate@^4.8.18 -w');
    expect(text).not.toMatch(/pin an older release or exclude arkgate temporarily/);
    expect(text).not.toMatch(/Time to become mature/);
    expect(text).not.toMatch(/The following packages failed the maturity check/);
    expect(classifyStartInstallFailure('yarn: simulated install fail').kind).toBe('generic');
    expect(explainPnpmMaturityBlock('yarn: simulated install fail')).toBeNull();
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
  it('prints the maturity one-liner and hides pnpm internals when add fails (#268)', () => {
    const root = layeredFixture('ark-apply-pnpm-mature-');
    write(root, 'pnpm-workspace.yaml', 'packages: []\n');
    write(root, 'pnpm-lock.yaml', 'lockfileVersion: "9.0"\n');
    const fakeBin = path.join(root, '.fake-bin');
    fs.mkdirSync(fakeBin, { recursive: true });
    fs.writeFileSync(
      path.join(fakeBin, 'pnpm'),
      [
        '#!/bin/sh',
        'echo "Progress: resolved 1, reused 0, downloaded 0, added 0" >&2',
        'echo "ERR_PNPM_NO_MATURE_MATCHING_VERSION  No matching version found for arkgate published within 7 days waiting period (minimumReleaseAge)." >&2',
        'echo "Time to become mature: 6 days 23 hours" >&2',
        'echo "The following packages failed the maturity check:" >&2',
        'echo "  arkgate  wait 7d" >&2',
        'exit 1',
        '',
      ].join('\n'),
      { mode: 0o755 }
    );

    const result = spawnSync(process.execPath, [ARK, 'start', '--root', root, '--apply', '--yes', '--no-strict', '--tools', 'claude'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}` },
    });
    const out = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

    expect(result.status, out).not.toBe(0);
    expect(result.stderr).toMatch(/This repo waits before trusting new npm packages \(pnpm Age — 7 days\)/);
    expect(result.stderr).toContain(`npx --package=arkgate@${CLI_VERSION} arkgate-check --doctor`);
    expect(result.stderr).toMatch(/minimumReleaseAgeExclude in pnpm config or pnpm-workspace\.yaml/);
    expect(result.stderr).toMatch(/CLI flag is not enough/);
    expect(result.stderr).toMatch(/Package install failed \(exit 1\)/);
    expect(result.stderr).not.toMatch(/^\s*pnpm add /m);
    expect(result.stderr).not.toMatch(/pin an older release or exclude arkgate temporarily/);
    expect(out).not.toMatch(/Time to become mature/);
    expect(out).not.toMatch(/The following packages failed the maturity check/);
  });

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

    const doctor = spawnSync(
      process.execPath,
      [path.join(REPO, 'bin/ark-check.mjs'), '--root', root, '--doctor', '--json'],
      { encoding: 'utf8' }
    );
    expect(doctor.status, `${doctor.stdout}\n${doctor.stderr}`).toBe(0);
    const payload = JSON.parse(doctor.stdout) as { doctor?: { primaryNextAction?: string } };
    expect(payload.doctor?.primaryNextAction).toBe(PACKAGE_UNRESOLVED_NEXT_ACTION);
    expect(payload.doctor?.primaryNextAction).not.toMatch(/required GitHub status/i);
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

  it('one-minute path leads with npx, not npm install -D arkgate (#268)', () => {
    for (const rel of ['README.md', 'docs/use.md', 'docs/develop.md']) {
      const text = fs.readFileSync(path.join(REPO, rel), 'utf8');
      const heading = rel === 'docs/develop.md' ? '## Default integration' : /## (?:Start in one minute|In one minute)/;
      const from = typeof heading === 'string' ? text.indexOf(heading) : text.search(heading);
      expect(from, rel).toBeGreaterThanOrEqual(0);
      const fence = text.slice(from).match(/```bash\n([\s\S]*?)```/);
      expect(fence, rel).toBeTruthy();
      const block = fence?.[1] ?? '';
      expect(block, rel).toMatch(/^npx arkgate start/m);
      expect(block, rel).not.toMatch(/^npm install -D arkgate/m);
      expect(text, rel).toMatch(/pnpm add -w/);
      expect(text, rel).toMatch(/workspace:\*/);
      expect(text, rel).toMatch(/pnpm Age|minimumReleaseAge/);
      expect(text, rel).toMatch(/minimumReleaseAgeExclude/);
    }
  });
});

function nextActionsCtx(extra: Record<string, unknown> = {}) {
  return {
    operatingMode: 'enforce',
    activeCount: 0,
    gatesMissing: [],
    analysisComplete: true,
    designSmells: [],
    postGreenPath: null,
    coverageHonesty: { greenIsNotEnforcement: false, worseThanNoGate: false },
    cov: { suggestions: [] },
    skillGaps: [],
    agentHomeGaps: [],
    staleRunners: [],
    adoption: { gaps: [] },
    designFitness: {},
    adopted: ADOPTED_NOT,
    root: '/tmp',
    ...extra,
  };
}

describe('doctor #1 after unresolved package (#268)', () => {
  it('leads with install, not make CI required, when the pin is present and unresolved', () => {
    const pinned = { packageInstalled: false, packageVersionTruth: { code: 'PACKAGE_PIN_MATCHES' } };
    const actions = collectDoctorNextActions(nextActionsCtx(pinned));
    expect(actions[0]).toBe(PACKAGE_UNRESOLVED_NEXT_ACTION);
    expect(actions).toContain(NOT_ADOPTED_NEXT_ACTION);
    expect(actions[0]).not.toBe(NOT_ADOPTED_NEXT_ACTION);
    expect(preferredDoctorPrimaryNextAction({ adopted: ADOPTED_NOT, ...pinned })).toBe(
      PACKAGE_UNRESOLVED_NEXT_ACTION
    );
  });

  it('keeps make CI required when there is no pin, or self-host', () => {
    expect(collectDoctorNextActions(nextActionsCtx())[0]).toBe(NOT_ADOPTED_NEXT_ACTION);
    expect(collectDoctorNextActions(nextActionsCtx({ packageInstalled: true }))[0]).toBe(
      NOT_ADOPTED_NEXT_ACTION
    );
    expect(
      collectDoctorNextActions(
        nextActionsCtx({
          packageInstalled: false,
          packageVersionTruth: { code: 'PACKAGE_PIN_ABSENT' },
        })
      )[0]
    ).toBe(NOT_ADOPTED_NEXT_ACTION);
    expect(
      collectDoctorNextActions(
        nextActionsCtx({
          packageInstalled: false,
          selfHost: true,
          packageVersionTruth: { code: 'PACKAGE_PIN_MATCHES' },
        })
      )[0]
    ).toBe(NOT_ADOPTED_NEXT_ACTION);
    expect(preferredDoctorPrimaryNextAction({ adopted: ADOPTED_NOT })).toBe(NOT_ADOPTED_NEXT_ACTION);
  });
});
