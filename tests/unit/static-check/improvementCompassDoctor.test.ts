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
          layers: [
            { name: 'DomainModel', patterns: ['src/domain/**'] },
            { name: 'PresentationAdapters', patterns: ['src/ui/**'] },
          ],
          rules: [
            { from: 'PresentationAdapters', to: 'DomainModel', allowed: true },
            { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
          ],
        })
      );
      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(root, 'src/ui'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src/domain/types.ts'), 'export type Id = string;\n');
      // domain-logic-in-ui smell seed (can* business rule in UI path)
      fs.writeFileSync(
        path.join(root, 'src/ui/canBuy.ts'),
        'export function canBuy(amount: number) { return amount > 0 && amount < 1000; }\n'
      );

      let jsonText = '';
      runDoctor(
        root,
        {
          include: ['src'],
          layers: [
            { name: 'DomainModel', patterns: ['src/domain/**'] },
            { name: 'PresentationAdapters', patterns: ['src/ui/**'] },
          ],
          rules: [
            { from: 'PresentationAdapters', to: 'DomainModel', allowed: true },
            { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
          ],
        },
        [path.join(root, 'src/domain/types.ts'), path.join(root, 'src/ui/canBuy.ts')],
        [
          { from: 'PresentationAdapters', to: 'DomainModel', allowed: true },
          { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
        ],
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
      // Complete analysis + zero blocking violations → ok true even with residual lenses
      expect(payload.ok).toBe(true);
      expect(payload.doctor.improvementCompass).not.toHaveProperty('valid');
      // Residual projection may appear from smells; never a gate fail by itself
      const residual = payload.doctor.improvementCompass.topResidual as string[];
      expect(Array.isArray(residual)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('adapter residual smells leave ok-path callers free of verdict fields', () => {
    const compass = buildDoctorImprovementCompass({
      designSmells: [
        { id: 'domain-logic-in-ui' },
        { id: 'god-module' },
      ],
      designWeak: true,
      goldenPatternPresent: false,
      physicalCohesion: { findings: [{ concept: 'order', files: 50, anchors: [] }] },
    });
    expect(compass.topResidual.length).toBeGreaterThan(0);
    expect(compass.notAScore).toBe(true);
    expect(compass).not.toHaveProperty('valid');
    expect(compass.lenses.find((l) => l.id === 'cohesion')?.status).toBe('residual');
  });

  it('report-depth and doctor adapters share physicalCohesion residual projection', () => {
    // Same fact shape both doctor-plan and html-report-depth pass into the adapter.
    const facts = {
      designSmells: [] as { id: string }[],
      violations: [] as { ruleId: string }[],
      designWeak: false,
      physicalCohesion: {
        findings: [
          {
            concept: 'billing',
            files: 45,
            anchorCount: 2,
            anchors: [{ path: 'src/a', files: 25 }, { path: 'src/b', files: 20 }],
          },
        ],
      },
      baselineStale: 2,
    };
    const doctorSide = buildDoctorImprovementCompass(facts);
    const reportSide = buildDoctorImprovementCompass({
      ...facts,
      // report depth also passes frozen residual / baselineExists like doctor
      baselineExists: true,
      frozenResidual: 2,
    });
    expect(doctorSide.topResidual).toContain('cohesion');
    expect(doctorSide.topResidual).toContain('srp');
    expect(reportSide.topResidual).toContain('cohesion');
    // both mark maintainability from baselineStale
    expect(doctorSide.lenses.find((l) => l.id === 'maintainability')?.status).toBe('residual');
    expect(reportSide.lenses.find((l) => l.id === 'maintainability')?.status).toBe('residual');
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
