/**
 * sliceIdentity stars — doctor names both colliding prefixes.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectAnalysisConfigWarnings } from '../../../src/kernel/configWarnings';
import type { ArkConfig } from '../../../src/domain/configTypes';
import { computeDoctorAdvisories, printCompactExtraDoctorLines } from '../../../bin/lib/doctor-advisories.mjs';
import { renderAdvisorySections } from '../../../bin/lib/html-report-advisories.mjs';

const temps: string[] = [];

afterEach(() => {
  for (const root of temps.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const collidingRules = [
  {
    from: 'Application',
    to: 'Persistence',
    allowed: false,
    peerIsolation: true,
    sliceFolders: ['admin/features/*', 'public/features/*'],
    sliceIdentity: 'stars' as const,
  },
];

describe('sliceIdentity doctor warning', () => {
  it('names both colliding paths in the check warning and on the doctor screen', () => {
    const config = {
      schemaVersion: '1.3',
      include: ['src'],
      layers: [{ name: 'Application', patterns: ['src/app/**'] }],
      rules: collidingRules,
    } as ArkConfig;
    const warnings = collectAnalysisConfigWarnings({
      config,
      rules: collidingRules,
      files: [],
    });
    const hit = warnings.find((warning) => warning.ruleId === 'CONFIG_SLICE_IDENTITY_COLLISION');
    expect(hit?.failsStrict).toBe(false);
    expect(hit?.message).toContain('admin/features/*');
    expect(hit?.message).toContain('public/features/*');

    const lines: string[] = [];
    printCompactExtraDoctorLines(
      {
        sliceIdentity: {
          notAScore: true,
          collisions: [{ message: hit?.message }],
        },
      },
      { line: (_mark: string, text: string) => lines.push(text), warn: '!' }
    );
    expect(lines.join('\n')).toContain('admin/features/*');
    expect(lines.join('\n')).toContain('public/features/*');

    const html = renderAdvisorySections({
      sliceIdentity: { notAScore: true, collisions: [{ message: hit?.message }] },
    });
    expect(html).toContain('data-advisory="sliceIdentity"');
    expect(html).toContain('admin/features/*');
    expect(html).toContain('public/features/*');
  });

  it('doctor advisories carry the collision only when stars prefixes collapse', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-slice-identity-'));
    temps.push(root);
    const coverage = { governed: { classifiedFiles: 0, totalFiles: 0, percent: 0 }, layers: [] };
    const config = {
      include: ['src'],
      layers: [{ name: 'Application', patterns: ['src/**'] }],
      rules: collidingRules,
    };
    const advisories = computeDoctorAdvisories(root, config, coverage, collidingRules, [], undefined);
    const message = advisories.sliceIdentity.collisions.map((row) => row.message).join('\n');
    expect(message).toContain('admin/features/*');
    expect(message).toContain('public/features/*');

    const quiet = computeDoctorAdvisories(
      root,
      { ...config, rules: [{ ...collidingRules[0], sliceIdentity: 'path' }] },
      coverage,
      [{ ...collidingRules[0], sliceIdentity: 'path' }],
      [],
      undefined
    );
    expect(quiet.sliceIdentity).toBeUndefined();
  });
});
