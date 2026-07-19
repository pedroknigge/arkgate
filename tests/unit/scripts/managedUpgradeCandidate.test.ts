import { describe, expect, it } from 'vitest';

import {
  MANAGED_UPGRADE_CHECKS,
  MANAGED_UPGRADE_HOSTS,
  buildUpgradeArguments,
  managedUpgradeCandidateReportOk,
  parseArguments,
} from '../../harness/managed-upgrade-candidate.mjs';

const PLAN_DIGEST = `sha256:${'a'.repeat(64)}`;

function completeReport() {
  return {
    schemaVersion: 1,
    candidate: {
      source: '/tmp/release/arkgate-3.7.0.tgz',
      copied: '/tmp/work/candidate/arkgate-3.7.0.tgz',
      sha256: 'b'.repeat(64),
      checksumRequired: true,
      checksumVerified: true,
    },
    errors: [],
    cells: MANAGED_UPGRADE_HOSTS.map((host) => ({
      host,
      checks: Object.fromEntries(MANAGED_UPGRADE_CHECKS.map((name) => [name, { ok: true }])),
      errors: [],
      ok: true,
    })),
  };
}

describe('Z06 packed managed-upgrade harness', () => {
  it('requires exactly one packed candidate input', () => {
    expect(
      parseArguments([
        '--artifact-dir',
        '/tmp/release-artifacts/gate',
        '--out',
        '/tmp/managed-upgrade/report.json',
      ])
    ).toMatchObject({
      artifactDir: '/tmp/release-artifacts/gate',
      out: '/tmp/managed-upgrade/report.json',
    });
    expect(() => parseArguments([])).toThrow('provide exactly one');
    expect(() =>
      parseArguments(['--tarball', '/tmp/arkgate.tgz', '--artifact-dir', '/tmp/release'])
    ).toThrow('provide exactly one');
  });

  it('binds every apply to the exact preview digest', () => {
    expect(
      buildUpgradeArguments('/tmp/consumer', 'codex', {
        apply: true,
        planDigest: PLAN_DIGEST,
        acceptConflicts: true,
      })
    ).toEqual([
      'upgrade',
      '--root',
      '/tmp/consumer',
      '--tools',
      'codex',
      '--no-install',
      '--no-strict',
      '--accept-conflicts',
      '--apply',
      '--plan-digest',
      PLAN_DIGEST,
      '--json',
    ]);
    expect(() =>
      buildUpgradeArguments('/tmp/consumer', 'codex', { apply: true })
    ).toThrow('exact planDigest');
    expect(() => buildUpgradeArguments('/tmp/consumer', 'unknown')).toThrow('unsupported host');
  });

  it('fails closed when any host or required check is absent', () => {
    expect(MANAGED_UPGRADE_HOSTS).toEqual([
      'claude',
      'cursor',
      'codex',
      'grok',
      'windsurf',
      'cline',
      'copilot',
      'kiro',
      'roo',
      'continue',
      'gemini',
    ]);
    const complete = completeReport();
    expect(managedUpgradeCandidateReportOk(complete)).toBe(true);

    const missingHost = completeReport();
    missingHost.cells.pop();
    expect(managedUpgradeCandidateReportOk(missingHost)).toBe(false);

    const missingCheck = completeReport();
    delete missingCheck.cells[0].checks.idempotence;
    expect(managedUpgradeCandidateReportOk(missingCheck)).toBe(false);

    const failedCheck = completeReport();
    failedCheck.cells[0].checks['preview-binding'] = { ok: false };
    expect(managedUpgradeCandidateReportOk(failedCheck)).toBe(false);

    const unverifiedArtifact = completeReport();
    unverifiedArtifact.candidate.checksumVerified = false;
    expect(managedUpgradeCandidateReportOk(unverifiedArtifact)).toBe(false);
  });
});
