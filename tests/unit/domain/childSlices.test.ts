/**
 * Nested wall (#326 PR1). The universe wall stays first. childSlices is opt-in.
 */
import { describe, expect, it } from 'vitest';
import { baselineKey } from '../../../src/domain/baselineKey';
import {
  applyAdvisorySiblingRatchet,
  anyChildWallAdvisory,
  childWallSiblingsAdvisory,
  childSliceConfigFindings,
  childSlicePatternMatches,
  importerInEnforcedSubtree,
  composeSliceDenialMessage,
  findDeniedEdgeDecision,
  peerIsolationDenyExplanation,
  sliceCountReport,
  sliceFindingExtras,
  type EdgeRule,
} from '../../../src/domain/layerMatch';
import { evaluateArchitectureGraph } from '../../../src/kernel/graphEvaluate';

const layers = [{ name: 'Application', patterns: ['src/lib/**'] }];

const universeRule: EdgeRule = {
  from: 'Application',
  to: 'Application',
  allowed: false,
  peerIsolation: true,
  sliceFolders: ['features'],
  sharedRoots: ['lib/shared'],
};

const childRule: EdgeRule = {
  ...universeRule,
  childSlices: {
    sliceFolders: ['lib/features/*/*', 'lib/repositories/features/*/*'],
    sliceIdentity: 'stars',
    commonFolders: ['domain'],
    siblings: 'deny',
    parentMayImportChild: false,
  },
};

function decide(rule: EdgeRule, fromPath: string, toPath: string) {
  return findDeniedEdgeDecision([rule], 'Application', 'Application', {
    fromPath,
    toPath,
    layers,
  });
}

describe('nested slice wall', () => {
  it('keeps a universe deny byte-identical when childSlices is absent', () => {
    const fromPath = 'src/lib/features/projects/rfi/load-rfi.ts';
    const toPath = 'src/lib/features/management/eos/eos-summary.ts';
    const decision = decide(universeRule, fromPath, toPath);
    expect(decision?.peerIsolationReason).toBe('cross-slice');
    expect(decision?.sliceVerdict?.reasonId).toBeUndefined();
    expect(decision?.sliceVerdict?.explanation).toBe(
      peerIsolationDenyExplanation('cross-slice', {
        fromPath,
        toPath,
        fromSlice: 'features/projects',
        toSlice: 'features/management',
      })
    );
    expect(sliceFindingExtras(decision?.sliceVerdict)).toEqual({});
    const message = composeSliceDenialMessage({
      surface: 'import',
      verdict: decision!.sliceVerdict!,
      fromLayer: 'Application',
      toLayer: 'Application',
      kind: 'import',
      fromPath,
      toPath,
    });
    expect(message).toBe(
      `Application must not import another slice of Application (${fromPath} → ${toPath}): ${decision?.sliceVerdict?.explanation}`
    );
  });

  it('names a universe deny CROSS_PARENT_SLICE only when the child wall is configured', () => {
    const decision = decide(
      childRule,
      'src/lib/features/projects/rfi/load-rfi.ts',
      'src/lib/features/management/eos/eos-summary.ts'
    );
    expect(decision?.sliceVerdict?.reasonId).toBe('CROSS_PARENT_SLICE');
    expect(decision?.sliceVerdict?.decision).toBe('deny');
    expect(sliceFindingExtras(decision?.sliceVerdict)).toMatchObject({
      reasonId: 'CROSS_PARENT_SLICE',
      universeFrom: 'projects',
      universeTo: 'management',
    });
  });

  it('does not let the child wall excuse a shared-root or allowed cross-universe edge', () => {
    expect(
      decide(childRule, 'src/lib/shared/format.ts', 'src/lib/features/projects/scm/scm-board.ts')
    ).toBeUndefined();
    const allowed: EdgeRule = {
      ...childRule,
      allowedCrossSlice: [{ from: 'features/projects', to: 'features/management' }],
    };
    expect(
      decide(
        allowed,
        'src/lib/features/projects/rfi/load-rfi.ts',
        'src/lib/features/management/eos/eos-summary.ts'
      )
    ).toBeUndefined();
  });

  it('allows a child to import universe common and denies the reverse without a reasonId', () => {
    expect(
      decide(
        childRule,
        'src/lib/features/projects/rfi/load-rfi.ts',
        'src/lib/features/projects/domain/project-codes.ts'
      )
    ).toBeUndefined();
    expect(
      decide(
        childRule,
        'src/lib/features/projects/rfi/load-rfi.ts',
        'src/lib/repositories/features/projects/rfi-repository.ts'
      )
    ).toBeUndefined();
    const parent = decide(
      childRule,
      'src/lib/features/projects/domain/project-codes.ts',
      'src/lib/features/projects/rfi/rfi-intake.ts'
    );
    expect(parent?.sliceVerdict?.crossing).toBe('parent-imports-child');
    expect(parent?.sliceVerdict?.reasonId).toBeUndefined();
    expect(parent?.sliceVerdict?.decision).toBe('deny');
    const opened: EdgeRule = {
      ...childRule,
      childSlices: { ...childRule.childSlices!, parentMayImportChild: true },
    };
    expect(
      decide(
        opened,
        'src/lib/features/projects/domain/project-codes.ts',
        'src/lib/features/projects/rfi/rfi-intake.ts'
      )
    ).toBeUndefined();
  });

  it('denies a sibling as an error, or as a warning when siblings is advisory', () => {
    const denied = decide(
      childRule,
      'src/lib/features/projects/rfi/load-rfi.ts',
      'src/lib/features/projects/scm/scm-board.ts'
    );
    expect(denied?.sliceVerdict?.reasonId).toBe('CROSS_SIBLING_SLICE');
    expect(denied?.sliceVerdict?.decision).toBe('deny');
    expect(sliceFindingExtras(denied?.sliceVerdict).failsStrict).toBeUndefined();
    const advisory: EdgeRule = {
      ...childRule,
      childSlices: { ...childRule.childSlices!, siblings: 'advisory' },
    };
    const warned = decide(
      advisory,
      'src/lib/features/projects/rfi/load-rfi.ts',
      'src/lib/features/projects/scm/scm-board.ts'
    );
    expect(sliceFindingExtras(warned?.sliceVerdict)).toMatchObject({
      reasonId: 'CROSS_SIBLING_SLICE',
      failsStrict: false,
      severity: 'warning',
    });
    expect(anyChildWallAdvisory([advisory])).toBe(true);
    expect(anyChildWallAdvisory([childRule])).toBe(false);
  });

  it('clears a matching sibling crossing and still denies another universe', () => {
    const allowed: EdgeRule = {
      ...childRule,
      allowedCrossSlice: [{ from: 'features/*', to: 'features/*' }],
      childSlices: {
        ...childRule.childSlices!,
        allowedCrossSlice: [
          null as never,
          { from: 'features/projects/*', to: 'features/projects/d2d-item' },
          { from: 'features/*/*', to: 'features/management/eos' },
        ],
      },
    };
    expect(
      decide(
        allowed,
        'src/lib/features/projects/scm/scm-board.ts',
        'src/lib/features/projects/d2d-item/d2d-item.ts'
      )
    ).toBeUndefined();
    expect(
      decide(
        allowed,
        'src/lib/features/projects/rfi/load-rfi.ts',
        'src/lib/features/projects/scm/scm-board.ts'
      )?.sliceVerdict?.reasonId
    ).toBe('CROSS_SIBLING_SLICE');
    expect(
      decide(
        allowed,
        'src/lib/features/projects/rfi/load-rfi.ts',
        'src/lib/features/management/eos/eos-summary.ts'
      )?.sliceVerdict?.reasonId
    ).toBe('CROSS_PARENT_SLICE');
    const warnings = childSliceConfigFindings(
      [allowed, allowed],
      ['src/lib/features/projects/rfi/load-rfi.ts']
    );
    const span = warnings.filter((row) => row.ruleId === 'CONFIG_CHILD_SLICE_CROSS_UNIVERSE');
    expect(span).toHaveLength(1);
    expect(span[0]?.failsStrict).toBe(false);
    expect(span[0]?.message).toContain('cannot cross the universe wall');
    expect(childSlicePatternMatches('features/projects/*', 'features/projects/d2d-item')).toBe(true);
    expect(childSlicePatternMatches('features/*', 'features/projects/rfi')).toBe(false);
    expect(childSlicePatternMatches('features/proj*', 'features/projects/rfi')).toBe(false);
    expect(childSlicePatternMatches('*', 'features/projects')).toBe(false);
    expect(childSlicePatternMatches('features/./rfi', 'features/rfi')).toBe(false);
  });

  it('treats a child id that does not extend the universe id as common and warns', () => {
    const mismatched: EdgeRule = {
      ...universeRule,
      childSlices: {
        sliceFolders: ['lib/features/*/*'],
        sliceIdentity: 'path',
      },
    };
    const findings = childSliceConfigFindings(
      [mismatched],
      ['src/lib/features/projects/rfi/load-rfi.ts']
    );
    expect(findings.map((row) => row.ruleId)).toEqual([
      'CONFIG_CHILD_SLICES_VERSION',
      'CONFIG_CHILD_SLICE_EXTENDS',
    ]);
    expect(findings.every((row) => row.failsStrict === false)).toBe(true);
  });

  it('counts doctor slices per level and only for universe pairs that occur', () => {
    const report = sliceCountReport([
      { reasonId: 'CROSS_PARENT_SLICE', universeFrom: 'projects', universeTo: 'management' },
      { reasonId: 'CROSS_PARENT_SLICE', universeFrom: 'management', universeTo: 'projects' },
      { reasonId: 'CROSS_SIBLING_SLICE', universeFrom: 'projects', universeTo: 'projects' },
      { reasonId: 'LAYER_IMPORT_VIOLATION' },
    ]);
    expect(report).toEqual({
      crossParent: 2,
      crossSibling: 1,
      pairs: [
        { from: 'management', to: 'projects', count: 1 },
        { from: 'projects', to: 'management', count: 1 },
      ],
    });
    expect(sliceCountReport([{ reasonId: 'LAYER_IMPORT_VIOLATION' }])).toBeNull();
  });

  it('leaves reasonId out of the baseline key and ratchets only unrecorded advisory siblings', () => {
    const violation = {
      ruleId: 'LAYER_IMPORT_VIOLATION',
      file: 'src/a.ts',
      fromLayer: 'Application',
      toLayer: 'Application',
      target: 'src/b.ts',
      reasonId: 'CROSS_SIBLING_SLICE',
      failsStrict: false as const,
      severity: 'warning',
    };
    expect(baselineKey(violation)).toBe(baselineKey({ ...violation, reasonId: undefined }));
    const recorded = new Set([baselineKey(violation)]);
    const second = { ...violation, file: 'src/c.ts' };
    const judged = applyAdvisorySiblingRatchet(
      [violation, second],
      [baselineKey(violation), baselineKey(second)],
      recorded
    );
    expect(judged[0]?.failsStrict).toBe(false);
    expect(judged[1]).toMatchObject({ failsStrict: true, severity: 'error' });
    const held = applyAdvisorySiblingRatchet(
      [violation],
      [baselineKey(violation)],
      recorded
    );
    expect(held[0]?.failsStrict).toBe(false);
  });

  it('keeps an enforced sibling as an error and still ratchets a new advisory sibling', () => {
    const enforced = {
      ruleId: 'LAYER_IMPORT_VIOLATION',
      file: 'src/enforced.ts',
      fromLayer: 'Application',
      toLayer: 'Application',
      target: 'src/other.ts',
      reasonId: 'CROSS_SIBLING_SLICE',
      severity: 'error',
    };
    const advisory = {
      ...enforced,
      file: 'src/advisory.ts',
      failsStrict: false as const,
      severity: 'warning',
    };
    const promoted = applyAdvisorySiblingRatchet(
      [enforced, advisory],
      [baselineKey(enforced), baselineKey(advisory)],
      new Set([baselineKey(enforced)])
    );
    expect(promoted[0]).toEqual(enforced);
    expect(promoted[1]).toMatchObject({ failsStrict: true, severity: 'error' });
    const held = applyAdvisorySiblingRatchet(
      [enforced, advisory],
      [baselineKey(enforced), baselineKey(advisory)],
      new Set([baselineKey(advisory)])
    );
    expect(held[0]).toEqual(enforced);
    expect(held[1]?.failsStrict).toBe(false);
  });

  it('denies an enforced subtree and warns the other sibling crossings', () => {
    const rule: EdgeRule = {
      ...childRule,
      childSlices: {
        ...childRule.childSlices!,
        siblings: { default: 'advisory', enforce: ['features/projects/rfi'] },
      },
    };
    const enforced = decide(
      rule,
      'src/lib/features/projects/rfi/load-rfi.ts',
      'src/lib/features/projects/scm/scm-board.ts'
    );
    const warned = decide(
      rule,
      'src/lib/features/projects/scm/scm-board.ts',
      'src/lib/features/projects/rfi/load-rfi.ts'
    );
    expect(sliceFindingExtras(enforced?.sliceVerdict)).toMatchObject({
      reasonId: 'CROSS_SIBLING_SLICE',
    });
    expect(sliceFindingExtras(enforced?.sliceVerdict).failsStrict).toBeUndefined();
    expect(sliceFindingExtras(warned?.sliceVerdict)).toMatchObject({
      reasonId: 'CROSS_SIBLING_SLICE',
      failsStrict: false,
      severity: 'warning',
    });
    const byPath: EdgeRule = {
      ...rule,
      childSlices: {
        ...rule.childSlices!,
        siblings: { default: 'advisory', enforce: ['lib/features/projects/rfi'] },
      },
    };
    expect(
      sliceFindingExtras(
        decide(
          byPath,
          'src/lib/features/projects/rfi/load-rfi.ts',
          'src/lib/features/projects/scm/scm-board.ts'
        )?.sliceVerdict
      ).failsStrict
    ).toBeUndefined();
    const denyAll: EdgeRule = {
      ...rule,
      childSlices: {
        ...rule.childSlices!,
        siblings: { default: 'deny', enforce: [] },
      },
    };
    expect(
      sliceFindingExtras(
        decide(
          denyAll,
          'src/lib/features/projects/scm/scm-board.ts',
          'src/lib/features/projects/rfi/load-rfi.ts'
        )?.sliceVerdict
      ).failsStrict
    ).toBeUndefined();
  });

  it('does not let an enforce list make a cross-parent advisory', () => {
    const rule: EdgeRule = {
      ...childRule,
      childSlices: {
        ...childRule.childSlices!,
        siblings: { default: 'advisory', enforce: ['features/projects/rfi'] },
      },
    };
    const parent = decide(
      rule,
      'src/lib/features/projects/rfi/load-rfi.ts',
      'src/lib/features/management/eos/eos-summary.ts'
    );
    expect(parent?.sliceVerdict?.reasonId).toBe('CROSS_PARENT_SLICE');
    expect(parent?.sliceVerdict?.decision).toBe('deny');
  });

  it('treats an advisory default as unfinished even when some subtrees are enforced', () => {
    expect(childWallSiblingsAdvisory('advisory')).toBe(true);
    expect(childWallSiblingsAdvisory('deny')).toBe(false);
    expect(childWallSiblingsAdvisory(undefined)).toBe(false);
    expect(childWallSiblingsAdvisory({ default: 'advisory', enforce: ['features/projects/rfi'] })).toBe(
      true
    );
    expect(childWallSiblingsAdvisory({ default: 'deny', enforce: ['features/projects/rfi'] })).toBe(false);
    expect(
      anyChildWallAdvisory([
        { childSlices: { siblings: { default: 'advisory', enforce: ['features/projects/rfi'] } } },
      ])
    ).toBe(true);
    expect(anyChildWallAdvisory([{ childSlices: { siblings: 'deny' } }])).toBe(false);
    expect(anyChildWallAdvisory(undefined)).toBe(false);
  });

  it('matches a child id or a subtree path and ignores bare names and stars', () => {
    const file = 'src/lib/features/projects/rfi/load-rfi.ts';
    const child = 'features/projects/rfi';
    expect(importerInEnforcedSubtree(file, child, ['features/projects/rfi'])).toBe(true);
    expect(importerInEnforcedSubtree(file, child, ['SRC/lib/features/projects/rfi'])).toBe(true);
    expect(importerInEnforcedSubtree(file, child, ['lib/features/projects/rfi///'])).toBe(true);
    expect(importerInEnforcedSubtree(file, child, ['rfi'])).toBe(false);
    expect(importerInEnforcedSubtree(file, child, ['features/projects/*'])).toBe(false);
    expect(importerInEnforcedSubtree(file, child, ['features/projects/scm'])).toBe(false);
    expect(importerInEnforcedSubtree(undefined, child, ['features/projects/rfi'])).toBe(true);
    expect(importerInEnforcedSubtree(file, undefined, ['features/projects/rfi'])).toBe(false);
    expect(importerInEnforcedSubtree(file, child, [])).toBe(false);
    expect(importerInEnforcedSubtree(file, child, [7 as unknown as string])).toBe(false);
    expect(importerInEnforcedSubtree(file, child, [''])).toBe(false);
    expect(importerInEnforcedSubtree('lib/features/projects/rfi', 'other', ['lib/features/projects/rfi'])).toBe(
      true
    );
  });

  it('keeps the check message for a plain cross-slice edge when the child wall is off', () => {
    const from = 'src/lib/features/projects/rfi/load-rfi.ts';
    const to = 'src/lib/features/management/eos/eos-summary.ts';
    const result = evaluateArchitectureGraph({
      config: { layers, rules: [universeRule] },
      rules: [universeRule],
      files: [from, to],
      contentViolations: [],
      edges: [
        { from, fromLayer: 'Application', to, toLayer: 'Application', line: 1, kind: 'import' },
      ],
    });
    const row = result.violations[0];
    expect(row?.reasonId).toBeUndefined();
    expect(row?.message).toContain('cross-slice edge features/projects → features/management');
    expect(row?.message).not.toContain('cross-parent slice');
  });

  it('intent copy stays on the default sentence for a plain cross-slice deny', () => {
    const decision = decide(
      universeRule,
      'src/lib/features/projects/rfi/load-rfi.ts',
      'src/lib/features/management/eos/eos-summary.ts'
    );
    const message = composeSliceDenialMessage({
      surface: 'intent',
      verdict: decision!.sliceVerdict!,
      fromLayer: 'Application',
      toLayer: 'Application',
      defaultMessage: 'Application must not reference Application intent billing.v1.',
    });
    expect(message).toBe('Application must not reference Application intent billing.v1.');
  });
});
