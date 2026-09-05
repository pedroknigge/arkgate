/**
 * Doctor/status ArkOrder section is always notAScore; mergePlanes honesty.
 */
import { describe, expect, it } from 'vitest';
import {
  MERGE_PLANES_DUAL_STAMP,
  composeMergePlanesHonesty,
} from '../../../src/domain/extraMergeTeeth';
import {
  ARKORDER_ONE_BREATH,
  ARK_ORDER_DOCTOR_SCHEMA_VERSION,
  formatArkOrderDoctorLines,
  projectStatusArkOrder,
  summarizeArkOrderSection,
} from '../../../src/domain/arkOrderDoctor';
import {
  formatArkOrderDoctorLines as cliLines,
  projectStatusArkOrder as cliProject,
  summarizeArkOrderSection as cliSummarize,
} from '../../../bin/lib/ark-order-doctor.mjs';
import { printCompactExtraDoctorLines } from '../../../bin/lib/doctor-advisories.mjs';

const extra = {
  mode: 'enforced' as const,
  planeRoots: ['src/main.ts'],
  managedLayers: ['ApplicationOrchestration'],
  xiKeys: ['plan', 'cycle', 'tenancy'],
};

describe('ArkOrder doctor section', () => {
  it('is silent and notAScore when arkOrder is absent', () => {
    const section = summarizeArkOrderSection({});
    expect(section.schemaVersion).toBe(ARK_ORDER_DOCTOR_SCHEMA_VERSION);
    expect(section.notAScore).toBe(true);
    expect(section.active).toBe(false);
    expect(section.mode).toBeNull();
    expect(section.xiKeys).toEqual([]);
    expect(section.residual).toEqual({ count: 0, ruleIds: [] });
    expect(section.extraMergeTeeth).toBe(false);
    expect(section.mergePlanes.arkOrder.present).toBe(false);
    expect(section.mergePlanes.extraMergeTeeth).toBe(false);
    expect(section.note).toMatch(/silent/i);
    expect(JSON.stringify(section)).not.toMatch(/score bar|Excellent|\d+\s*\/\s*10/i);
  });

  it('advisory residual never arms extra merge teeth', () => {
    const section = summarizeArkOrderSection({
      arkOrder: { ...extra, mode: 'advisory' },
      findings: [{ ruleId: 'ARKORDER_XI_FIELD_WRITE' }, { ruleId: 'LAYER_IMPORT_VIOLATION' }],
      classification: { governedPercent: 100, populatedLayerCount: 2 },
    });
    expect(section.active).toBe(true);
    expect(section.mode).toBe('advisory');
    expect(section.notAScore).toBe(true);
    expect(section.xiKeys).toEqual(['plan', 'cycle', 'tenancy']);
    expect(section.residual.ruleIds).toEqual(['ARKORDER_XI_FIELD_WRITE']);
    expect(section.residual.count).toBe(1);
    expect(section.extraMergeTeeth).toBe(false);
    expect(section.mergePlanes.arkOrder.extraMergeTeeth).toBe(false);
    expect(section.mergePlanes.extraMergeTeeth).toBe(false);
    expect(section.failMergeWhen).toBe(section.mergePlanes.failMergeWhen);
    expect(section.failMergeWhen).toMatch(/advisory ArkOrder never merge-blocks/i);
  });

  it('enforced + classified arms teeth; under-floor demotes', () => {
    const findings = [{ ruleId: 'ARKORDER_XI_FIELD_WRITE' }, { ruleId: 'ARKORDER_XI_FIELD_WRITE' }];
    const armed = summarizeArkOrderSection({
      arkOrder: extra,
      findings,
      classification: { governedPercent: 80, populatedLayerCount: 1 },
    });
    expect(armed.extraMergeTeeth).toBe(true);
    expect(armed.mergePlanes.extraMergeTeeth).toBe(true);
    expect(armed.mergePlanes.arkOrder.extraMergeTeeth).toBe(true);
    expect(armed.residual.count).toBe(1);
    expect(armed.failMergeWhen).toBe(armed.mergePlanes.failMergeWhen);
    expect(armed.failMergeWhen).toMatch(/Enforced ArkOrder/i);

    const deferred = summarizeArkOrderSection({
      arkOrder: extra,
      findings,
      classification: { governedPercent: 0, populatedLayerCount: 0 },
    });
    expect(deferred.extraMergeTeeth).toBe(false);
    expect(deferred.mergePlanes.extraMergeTeeth).toBe(false);
    expect(deferred.mergePlanes.failMergeWhen).toMatch(/teeth floor|governed/i);
  });

  it('human lines lead with the one-breath and never invent a score', () => {
    const lines = formatArkOrderDoctorLines(
      summarizeArkOrderSection({
        arkOrder: extra,
        findings: [{ ruleId: 'ARKORDER_XI_FIELD_WRITE' }],
        classification: { governedPercent: 90, populatedLayerCount: 1 },
      })
    );
    expect(lines[0]).toBe(ARKORDER_ONE_BREATH);
    expect(lines.some((line) => /not a score/i.test(line))).toBe(true);
    expect(lines.join('\n')).toMatch(/ARKORDER_XI_FIELD_WRITE/);
    expect(lines.join('\n')).toMatch(/plan, cycle, tenancy/);
    expect(lines.join('\n')).not.toMatch(/\b\d+\s*\/\s*10\b|Excellent/);
  });

  it('status slice treats missing residual as unknown, not green', () => {
    expect(projectStatusArkOrder({ present: false })).toEqual({
      notAScore: true,
      present: false,
      mode: null,
      extraMergeTeeth: false,
      residual: 0,
    });
    expect(
      projectStatusArkOrder({
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
      arkOrder: extra,
      findings: [{ ruleId: 'ARKORDER_XI_FIELD_WRITE' }],
      classification: { governedPercent: 100, populatedLayerCount: 1 },
    };
    expect(cliSummarize(input)).toEqual(summarizeArkOrderSection(input));
    expect(cliProject({ present: true, mode: 'enforced', residual: 2 })).toEqual(
      projectStatusArkOrder({ present: true, mode: 'enforced', residual: 2 })
    );
    expect(cliLines(summarizeArkOrderSection(input))).toEqual(
      formatArkOrderDoctorLines(summarizeArkOrderSection(input))
    );
    expect(
      composeMergePlanesHonesty({
        arkRules: { active: false },
        arkOrder: { present: true, mode: 'enforced', residualCount: 1 },
        classification: { governedPercent: 100, populatedLayerCount: 1 },
      }).arkOrder
    ).toMatchObject({ present: true, mode: 'enforced', extraMergeTeeth: true, residualCount: 1 });
    expect(
      composeMergePlanesHonesty({
        arkOrder: { present: true, mode: 'enforced' },
      }).dualPlaneStamp
    ).toBe(MERGE_PLANES_DUAL_STAMP);
  });

  it('human lines cover off, empty residual, unnamed keys, and residual cap', () => {
    expect(formatArkOrderDoctorLines(summarizeArkOrderSection({}))).toEqual([
      'ArkOrder extra is off — silent on Layers (not a score).',
    ]);
    expect(formatArkOrderDoctorLines({ notAScore: false } as never)).toEqual([]);

    const clean = formatArkOrderDoctorLines(
      summarizeArkOrderSection({
        arkOrder: { mode: 'enforced', planeRoots: ['src/main.ts'] },
        classification: { governedPercent: 90, populatedLayerCount: 1 },
      })
    );
    expect(clean[0]).toBe(ARKORDER_ONE_BREATH);
    expect(clean.join('\n')).toMatch(/none named/);
    expect(clean.join('\n')).toMatch(/Residual: none/);

    const many = Array.from({ length: 13 }, (_, i) => ({ ruleId: `ARKORDER_CAP_${i}` }));
    const capped = formatArkOrderDoctorLines(
      summarizeArkOrderSection({
        arkOrder: extra,
        findings: many,
        classification: { governedPercent: 90, populatedLayerCount: 1 },
      })
    );
    expect(capped.join('\n')).toMatch(/\+1 more/);
  });

  it('compact doctor prints the one-breath only when the extra is on', () => {
    const printed: string[] = [];
    const io = { line: (_mark: string, text: string) => printed.push(text), warn: '!' };
    printCompactExtraDoctorLines({ arkOrder: { active: false, notAScore: true } }, io);
    expect(printed).toEqual([]);

    printCompactExtraDoctorLines(
      {
        arkOrder: {
          active: true,
          notAScore: true,
          mode: 'enforced',
          xiKeys: ['plan', 'cycle', 'tenancy'],
          residual: { count: 1 },
        },
      },
      io
    );
    expect(printed[0]).toBe(ARKORDER_ONE_BREATH);
    expect(printed[1]).toMatch(/xiKeys=plan, cycle, tenancy/);
    expect(printed[1]).toMatch(/residual=1/);

    printed.length = 0;
    printCompactExtraDoctorLines(
      {
        arkOrder: { active: true, notAScore: true, mode: 'advisory', residual: { count: 0 } },
      },
      io
    );
    expect(printed[1]).toMatch(/residual=0/);
    expect(printed[1]).toMatch(/unnamed/);
  });
});
