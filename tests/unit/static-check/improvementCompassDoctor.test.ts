/**
 * IC03 — doctor wires improvementCompass; residual never flips verdict/ok.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// eslint-disable-next-line -- runtime .mjs under test
import { runDoctor } from '../../../bin/lib/doctor-plan.mjs';
// eslint-disable-next-line
import { buildDoctorImprovementCompass } from '../../../bin/lib/improvement-compass-doctor.mjs';
// eslint-disable-next-line
import { buildStatusManifest } from '../../../bin/lib/status-manifest.mjs';

describe('IC03 doctor improvementCompass wiring', () => {
  it('adapter maps smells and walls into residual lenses', () => {
    const compass = buildDoctorImprovementCompass({
      designSmells: [{ id: 'domain-logic-in-ui', evidence: ['src/ui/x.ts'] }],
      violations: [{ ruleId: 'LAYER_IMPORT_VIOLATION', file: 'src/a.ts' }],
      designWeak: true,
      stackKind: 'typescript',
    });
    expect(compass.notAScore).toBe(true);
    expect(compass.schemaVersion).toBe('1.0');
    expect(compass.topResidual).toContain('soc');
    expect(compass.topResidual).toContain('coupling');
    expect(compass.lenses.find((l) => l.id === 'scalability')?.status).toBe('out-of-scope');
  });

  it('runDoctor JSON includes improvementCompass without changing ok from residual alone', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-ic03-doctor-'));
    try {
      fs.writeFileSync(
        path.join(root, 'ark.config.json'),
        JSON.stringify({
          include: ['src'],
          layers: [{ name: 'DomainModel', patterns: ['src/**'] }],
          rules: [],
        })
      );
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src/ok.ts'), 'export const x = 1;\n');

      let jsonText = '';
      runDoctor(
        root,
        {
          include: ['src'],
          layers: [{ name: 'DomainModel', patterns: ['src/**'] }],
          rules: [],
        },
        [path.join(root, 'src/ok.ts')],
        [],
        // No blocking violations — residual design smells alone must not flip ok.
        [],
        true,
        {
          completeness: 'complete',
          writeJson: (s: string) => {
            jsonText = s;
          },
        }
      );

      const payload = JSON.parse(jsonText);
      expect(payload.doctor.improvementCompass).toBeDefined();
      expect(payload.doctor.improvementCompass.notAScore).toBe(true);
      expect(payload.doctor.improvementCompass.lenses).toHaveLength(15);
      // Clean edges + complete analysis → ok true even when compass may note partial lenses
      expect(payload.ok).toBe(true);
      // Residual lenses must not invent a fail
      expect(payload.doctor.improvementCompass).not.toHaveProperty('valid');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('status manifest accepts optional thin improvementCompass without affecting nextAction gate', () => {
    const without = buildStatusManifest({
      arkgateVersion: '4.3.0',
      resolvedRoot: '/repo',
      resolvedConfigPath: '/repo/ark.config.json',
      lastCheckVerdict: 'pass',
      activeViolations: 0,
    });
    expect(without.improvementCompass).toBeUndefined();

    const withCompass = buildStatusManifest({
      arkgateVersion: '4.3.0',
      resolvedRoot: '/repo',
      resolvedConfigPath: '/repo/ark.config.json',
      lastCheckVerdict: 'pass',
      activeViolations: 0,
      improvementCompass: {
        schemaVersion: '1.0',
        notAScore: true,
        topResidual: ['soc', 'dip'],
      },
    });
    expect(withCompass.improvementCompass).toEqual({
      schemaVersion: '1.0',
      notAScore: true,
      topResidual: ['soc', 'dip'],
    });
    // Same pass verdict residual does not invent fail nextAction from compass alone
    expect(withCompass.nextAction.id).toBe(without.nextAction.id);
  });
});
