import { describe, expect, it } from 'vitest';
import {
  EXTRA_MERGE_TEETH_GOVERNED_FLOOR,
  classifyResolvedLayerCoverage,
  demoteExtraPlaneTeethUnderClassificationFloor,
  extraMergeTeethAllowed,
  isArkRunRuleId,
  isExtraPlaneFinding,
} from '../../../src/domain/extraMergeTeeth';
import {
  EXTRA_MERGE_TEETH_GOVERNED_FLOOR as cliFloor,
  extraMergeTeethAllowed as cliAllowed,
} from '../../../bin/lib/extra-merge-teeth.mjs';

describe('RN07 extra-plane merge teeth', () => {
  it('unknown classification allows teeth; empty/under-floor does not', () => {
    expect(extraMergeTeethAllowed()).toBe(true);
    expect(extraMergeTeethAllowed({})).toBe(true);
    expect(extraMergeTeethAllowed({ governedPercent: null, populatedLayerCount: null })).toBe(
      true
    );
    expect(extraMergeTeethAllowed({ governedPercent: 0, populatedLayerCount: 0 })).toBe(false);
    expect(extraMergeTeethAllowed({ governedPercent: 49, populatedLayerCount: 1 })).toBe(false);
    expect(extraMergeTeethAllowed({ governedPercent: 50, populatedLayerCount: 0 })).toBe(false);
    expect(extraMergeTeethAllowed({ governedPercent: 50, populatedLayerCount: 1 })).toBe(true);
    expect(EXTRA_MERGE_TEETH_GOVERNED_FLOOR).toBe(50);
    expect(cliFloor).toBe(EXTRA_MERGE_TEETH_GOVERNED_FLOOR);
    expect(cliAllowed({ governedPercent: 0, populatedLayerCount: 0 })).toBe(false);
  });

  it('classifies resolved files by non-empty layer', () => {
    expect(
      classifyResolvedLayerCoverage([
        { layer: 'DomainModel' },
        { layer: 'DomainModel' },
        { layer: null },
        {},
      ])
    ).toEqual({ governedPercent: 50, populatedLayerCount: 1 });
    expect(classifyResolvedLayerCoverage([])).toEqual({
      governedPercent: 0,
      populatedLayerCount: 0,
    });
  });

  it('demotes ArkRun and ArkRules extra-plane findings under the floor', () => {
    const violations = [
      { ruleId: 'ARKRUN_KERNEL_IN_DOMAIN', failsStrict: true, severity: 'error' },
      { ruleId: 'ARKRULE_STRUCTURE', arkruleId: 'factory', failsStrict: true, severity: 'error' },
      { ruleId: 'LAYER_IMPORT_VIOLATION', failsStrict: true, severity: 'error' },
    ];
    demoteExtraPlaneTeethUnderClassificationFloor(violations, {
      governedPercent: 10,
      populatedLayerCount: 1,
    });
    expect(violations[0]).toMatchObject({ failsStrict: false, severity: 'warning' });
    expect(violations[1]).toMatchObject({ failsStrict: false, severity: 'warning' });
    expect(violations[2]).toMatchObject({ failsStrict: true, severity: 'error' });
    expect(isArkRunRuleId('ARKRUN_DIRECT_NEW')).toBe(true);
    expect(isExtraPlaneFinding({ ruleId: 'ARKRUN_DIRECT_NEW' })).toBe(true);
    expect(isExtraPlaneFinding({ ruleId: 'LAYER_IMPORT_VIOLATION' })).toBe(false);
  });
});
