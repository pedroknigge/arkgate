/**
 * RN08 — doctor/status ArkRun section is always notAScore; mergePlanes honesty.
 */
import { describe, expect, it } from 'vitest';
import {
  MERGE_PLANES_DUAL_STAMP,
  composeMergePlanesHonesty,
  extraMergeTeethAllowed,
} from '../../../src/domain/extraMergeTeeth';
import {
  ARK_RUN_DOCTOR_SCHEMA_VERSION,
  formatArkRunDoctorLines,
  projectStatusArkRun,
  summarizeArkRunSection,
} from '../../../src/domain/arkRunDoctor';
import {
  composeMergePlanesHonesty as cliCompose,
  extraMergeTeethAllowed as cliAllowed,
} from '../../../bin/lib/extra-merge-teeth.mjs';
import {
  formatArkRunDoctorLines as cliLines,
  projectStatusArkRun as cliProject,
  summarizeArkRunSection as cliSummarize,
} from '../../../bin/lib/ark-run-doctor.mjs';

const extra = {
  mode: 'enforced' as const,
  compositionRoots: ['src/main.ts'],
  managedLayers: ['ApplicationOrchestration'],
  requireDeclarations: true,
};

describe('RN08 ArkRun doctor section', () => {
  it('is silent and notAScore when arkRun is absent', () => {
    const section = summarizeArkRunSection({});
    expect(section.schemaVersion).toBe(ARK_RUN_DOCTOR_SCHEMA_VERSION);
    expect(section.notAScore).toBe(true);
    expect(section.active).toBe(false);
    expect(section.mode).toBeNull();
    expect(section.residual).toEqual({ count: 0, ruleIds: [] });
    expect(section.extraMergeTeeth).toBe(false);
    expect(section.mergePlanes.arkRun.present).toBe(false);
    expect(section.mergePlanes.extraMergeTeeth).toBe(false);
    expect(section.note).toMatch(/silent/i);
    expect(section.notAScore).toBe(true);
    expect(JSON.stringify(section)).not.toMatch(/score bar|Excellent|\d+\s*\/\s*10/i);
  });

  it('advisory residual never arms extra merge teeth', () => {
    const section = summarizeArkRunSection({
      arkRun: { ...extra, mode: 'advisory' },
      findings: [{ ruleId: 'ARKRUN_MISSING_ROOT' }, { ruleId: 'LAYER_IMPORT_VIOLATION' }],
      classification: { governedPercent: 100, populatedLayerCount: 2 },
    });
    expect(section.active).toBe(true);
    expect(section.mode).toBe('advisory');
    expect(section.notAScore).toBe(true);
    expect(section.residual.ruleIds).toEqual(['ARKRUN_MISSING_ROOT']);
    expect(section.residual.count).toBe(1);
    expect(section.extraMergeTeeth).toBe(false);
    expect(section.mergePlanes.arkRun.extraMergeTeeth).toBe(false);
    expect(section.mergePlanes.extraMergeTeeth).toBe(false);
    expect(section.failMergeWhen).toBe(section.mergePlanes.failMergeWhen);
    expect(section.failMergeWhen).toMatch(/advisory ArkRun never merge-blocks/i);
  });

  it('advisory ArkRun failMergeWhen follows mergePlanes even when ArkRules teeth are armed', () => {
    const section = summarizeArkRunSection({
      arkRun: { ...extra, mode: 'advisory' },
      findings: [{ ruleId: 'ARKRUN_MISSING_ROOT' }],
      classification: { governedPercent: 100, populatedLayerCount: 2 },
      arkRules: { active: true, structureEnforced: 1, structureTotal: 1 },
    });
    expect(section.extraMergeTeeth).toBe(false);
    expect(section.mergePlanes.extraMergeTeeth).toBe(true);
    expect(section.failMergeWhen).toBe(section.mergePlanes.failMergeWhen);
    expect(section.failMergeWhen).toMatch(/structure\/invariant/i);
    expect(section.failMergeWhen).not.toBe('Layer graph only — advisory ArkRun never merge-blocks.');
  });

  it('enforced + classified arms teeth; under-floor demotes', () => {
    const findings = [{ ruleId: 'ARKRUN_DIRECT_NEW' }, { ruleId: 'ARKRUN_DIRECT_NEW' }];
    const armed = summarizeArkRunSection({
      arkRun: extra,
      findings,
      classification: { governedPercent: 80, populatedLayerCount: 1 },
    });
    expect(armed.extraMergeTeeth).toBe(true);
    expect(armed.mergePlanes.extraMergeTeeth).toBe(true);
    expect(armed.mergePlanes.arkRun.extraMergeTeeth).toBe(true);
    expect(armed.residual.count).toBe(1);
    expect(armed.failMergeWhen).toBe(armed.mergePlanes.failMergeWhen);
    expect(armed.failMergeWhen).toMatch(/Enforced ArkRun/i);

    const deferred = summarizeArkRunSection({
      arkRun: extra,
      findings,
      classification: { governedPercent: 0, populatedLayerCount: 0 },
    });
    expect(deferred.extraMergeTeeth).toBe(false);
    expect(deferred.mergePlanes.extraMergeTeeth).toBe(false);
    expect(deferred.mergePlanes.failMergeWhen).toMatch(/teeth floor|governed/i);
  });

  it('human lines never invent a score', () => {
    const lines = formatArkRunDoctorLines(
      summarizeArkRunSection({
        arkRun: extra,
        findings: [{ ruleId: 'ARKRUN_KERNEL_IN_DOMAIN' }],
        classification: { governedPercent: 90, populatedLayerCount: 1 },
      })
    );
    expect(lines.some((line) => /not a score/i.test(line))).toBe(true);
    expect(lines.join('\n')).toMatch(/ARKRUN_KERNEL_IN_DOMAIN/);
    expect(lines.join('\n')).not.toMatch(/\b\d+\s*\/\s*10\b|Excellent/);
  });

  it('status slice treats missing residual as unknown, not green', () => {
    expect(projectStatusArkRun({ present: false })).toEqual({
      notAScore: true,
      present: false,
      mode: null,
      extraMergeTeeth: false,
      residual: 0,
    });
    expect(
      projectStatusArkRun({
        present: true,
        mode: 'advisory',
        extraMergeTeeth: true,
        residual: null,
      })
    ).toEqual({
      notAScore: true,
      present: true,
      mode: 'advisory',
      extraMergeTeeth: false,
      residual: null,
    });
  });

  it('CLI artifacts stay in parity with Domain', () => {
    const input = {
      arkRun: extra,
      findings: [{ ruleId: 'ARKRUN_MISSING_ROOT' }],
      classification: { governedPercent: 100, populatedLayerCount: 1 },
    };
    expect(cliSummarize(input)).toEqual(summarizeArkRunSection(input));
    expect(cliProject({ present: true, mode: 'enforced', residual: 2 })).toEqual(
      projectStatusArkRun({ present: true, mode: 'enforced', residual: 2 })
    );
    expect(cliLines(summarizeArkRunSection(input))).toEqual(
      formatArkRunDoctorLines(summarizeArkRunSection(input))
    );
    expect(cliAllowed({ governedPercent: 50, populatedLayerCount: 1 })).toBe(
      extraMergeTeethAllowed({ governedPercent: 50, populatedLayerCount: 1 })
    );
    expect(cliCompose({ arkRun: { present: true, mode: 'enforced' } }).dualPlaneStamp).toBe(
      MERGE_PLANES_DUAL_STAMP
    );
    expect(
      composeMergePlanesHonesty({
        arkRules: { active: true, structureEnforced: 1, structureTotal: 1 },
        arkRun: { present: true, mode: 'advisory', residualCount: 3 },
        classification: { governedPercent: 100, populatedLayerCount: 1 },
      }).arkRun
    ).toMatchObject({ present: true, mode: 'advisory', extraMergeTeeth: false, residualCount: 3 });
  });
});
