import { describe, expect, it } from 'vitest';
import { buildEffectiveArkRules, duplicateArkRuleIds, loadArkRulesContract, sliceScopeEscapes } from '../../../src/domain/arkRulesContract';
import { classifyArkPolicyDelta } from '../../../src/domain/policyDelta';
import { isLawRelativePath } from '../../../src/domain/teamParliament';
import {
  resolveSliceRulePlan,
  sliceAliasOwesMove,
  sliceAliasReport,
  sliceRuleIdsForFile,
} from '../../../src/domain/layerMatch';
import type { EdgeRule } from '../../../src/domain/layerMatch';

const rule = {
  from: 'DomainModel',
  to: 'DomainModel',
  allowed: false,
  peerIsolation: true,
  sliceFolders: ['features'],
  sliceIdentity: 'stars',
  childSlices: {
    sliceFolders: ['features/*/*'],
    sliceIdentity: 'stars',
    siblings: 'deny',
    arkRulesFile: 'arkrules.<Layer>.json',
    sliceAliases: [
      { from: 'src/app/**', to: 'features/projects/rfi', pinned: true, reason: 'framework-route' },
      { from: 'src/lib/compliance/**', to: 'features/projects/compliance' },
    ],
  },
} as EdgeRule;

const files = [
  'src/features/projects/rfi/domain/intake.ts',
  'src/app/projects/rfi/page.tsx',
  'src/lib/compliance/hold.ts',
];

function invariantFile(id: string, appliesTo?: string[]) {
  return loadArkRulesContract({
    schemaVersion: '1.0',
    layer: 'DomainModel',
    invariants: [{ id, description: id, mode: 'advisory', ...(appliesTo ? { appliesTo } : {}) }],
  }).config;
}

describe('resolveSliceRulePlan', () => {
  it('names a file only at a child root the governed index already resolved', () => {
    const plan = resolveSliceRulePlan({
      files,
      rules: [rule],
      layers: ['DomainModel', 'Application'],
    });
    expect(plan).toEqual([
      {
        path: 'src/features/projects/rfi/arkrules.Application.json',
        childId: 'features/projects/rfi',
        layer: 'Application',
        defaultAppliesTo: ['src/features/projects/rfi/**'],
      },
      {
        path: 'src/features/projects/rfi/arkrules.DomainModel.json',
        childId: 'features/projects/rfi',
        layer: 'DomainModel',
        defaultAppliesTo: ['src/features/projects/rfi/**'],
      },
    ]);
    expect(plan.some((entry) => entry.path.includes('/scm/'))).toBe(false);
  });

  it('names the same slice file when that path is the only index entry', () => {
    const plan = resolveSliceRulePlan({
      files: ['src/features/projects/rfi/arkrules.DomainModel.json'],
      rules: [rule],
      layers: ['DomainModel'],
    });
    expect(plan.map((entry) => entry.path)).toEqual([
      'src/features/projects/rfi/arkrules.DomainModel.json',
    ]);
    expect(plan[0]?.childId).toBe('features/projects/rfi');
  });

  it('rejects a pattern that is not a single <Layer> filename', () => {
    const starred = {
      ...rule,
      childSlices: { ...rule.childSlices!, arkRulesFile: 'arkrules.*.json' },
    } as EdgeRule;
    expect(resolveSliceRulePlan({ files, rules: [starred], layers: ['DomainModel'] })).toEqual([]);
  });
});

describe('slice ArkRules merge', () => {
  it('namespaces a discovered id and fills the default appliesTo', () => {
    const merged = buildEffectiveArkRules([
      { layer: 'DomainModel', sourceFile: 'arkrules/DomainModel.json', file: invariantFile('INV-UNIVERSE-CODES') },
      {
        layer: 'DomainModel',
        sourceFile: 'src/features/projects/rfi/arkrules.DomainModel.json',
        file: invariantFile('rfi-intake'),
        childId: 'features/projects/rfi',
        defaultAppliesTo: ['src/features/projects/rfi/**'],
      },
    ]);
    expect(merged.byLayer.DomainModel?.sourceFiles).toEqual([
      'arkrules/DomainModel.json',
      'src/features/projects/rfi/arkrules.DomainModel.json',
    ]);
    const slice = merged.invariants.find((row) => row.id === 'features/projects/rfi#rfi-intake');
    expect(slice?.appliesTo).toEqual(['src/features/projects/rfi/**']);
    expect(slice?.provenance.childId).toBe('features/projects/rfi');
    expect(merged.invariants.some((row) => row.id === 'rfi-intake')).toBe(false);
  });

  it('names ARKRULE_DUPLICATE_ID inputs and ARKRULE_SCOPE_ESCAPES_SLICE inputs', () => {
    const dupes = duplicateArkRuleIds([
      { layer: 'DomainModel', sourceFile: 'arkrules/DomainModel.dup-a.json', file: invariantFile('INV-DUP') },
      { layer: 'DomainModel', sourceFile: 'arkrules/DomainModel.dup-b.json', file: invariantFile('INV-DUP') },
    ]);
    expect(dupes).toEqual([
      {
        id: 'INV-DUP',
        layer: 'DomainModel',
        sourceFiles: ['arkrules/DomainModel.dup-a.json', 'arkrules/DomainModel.dup-b.json'],
      },
    ]);
    const escapes = sliceScopeEscapes({
      layer: 'DomainModel',
      sourceFile: 'src/features/projects/scm/arkrules.DomainModel.json',
      file: invariantFile('scm-board', ['src/features/projects/rfi/**']),
      childId: 'features/projects/scm',
      defaultAppliesTo: ['src/features/projects/scm/**'],
    });
    expect(escapes).toEqual([{ id: 'scm-board', pattern: 'src/features/projects/rfi/**' }]);
  });

  it('counts a discovered path as arkrules-ref-added', () => {
    const base = { schemaVersion: '1.3' as const, include: ['src'], layers: [{ name: 'DomainModel', patterns: ['src/**'] }], rules: [], arkRules: { DomainModel: 'arkrules/DomainModel.json' } };
    const delta = classifyArkPolicyDelta(base, base, {
      baseArkRules: buildEffectiveArkRules([
        { layer: 'DomainModel', sourceFile: 'arkrules/DomainModel.json', file: invariantFile('INV-UNIVERSE-CODES') },
      ]),
      candidateArkRules: buildEffectiveArkRules([
        { layer: 'DomainModel', sourceFile: 'arkrules/DomainModel.json', file: invariantFile('INV-UNIVERSE-CODES') },
        {
          layer: 'DomainModel',
          sourceFile: 'src/features/projects/rfi/arkrules.DomainModel.json',
          file: invariantFile('rfi-intake'),
          childId: 'features/projects/rfi',
          defaultAppliesTo: ['src/features/projects/rfi/**'],
        },
      ]),
    });
    expect(
      delta.findings.some(
        (finding) =>
          finding.id.includes('arkrules-ref-added') &&
          finding.path === 'src/features/projects/rfi/arkrules.DomainModel.json'
      )
    ).toBe(true);
  });
});

describe('pinned slice aliases', () => {
  it('lists a pinned route separately and keeps the compliance alias as debt', () => {
    const report = sliceAliasReport([rule], files);
    expect(sliceAliasOwesMove([rule])).toBe(true);
    expect(report?.moves.map((move) => move.files).flat()).toEqual(['src/lib/compliance/hold.ts']);
    expect(report?.pinned?.[0]).toMatchObject({
      from: 'src/app/**',
      to: 'features/projects/rfi',
      reason: 'framework-route',
      files: ['src/app/projects/rfi/page.tsx'],
    });
    const pinnedOnly = {
      ...rule,
      childSlices: {
        ...rule.childSlices!,
        sliceAliases: [{ from: 'src/app/**', to: 'features/projects/rfi', pinned: true, reason: 'framework-route' }],
      },
    } as EdgeRule;
    expect(sliceAliasOwesMove([pinnedOnly])).toBe(false);
    expect(sliceAliasReport([pinnedOnly], files)?.moves).toEqual([]);
  });

  it('does not pin on a reason alone', () => {
    const labeled = {
      ...rule,
      childSlices: {
        ...rule.childSlices!,
        sliceAliases: [{ from: 'src/app/**', to: 'features/projects/rfi', reason: 'framework-route' }],
      },
    } as EdgeRule;
    expect(sliceAliasOwesMove([labeled])).toBe(true);
    expect(sliceAliasReport([labeled], files)?.pinned).toBeUndefined();
  });
});

describe('slice rule law path', () => {
  it('treats arkrules.<Layer>.json as law and leaves product source alone', () => {
    expect(isLawRelativePath('src/features/projects/rfi/arkrules.DomainModel.json')).toBe(true);
    expect(isLawRelativePath('src/features/projects/arkrules.DomainModel.json')).toBe(true);
    expect(isLawRelativePath('src/features/projects/rfi/domain/intake.ts')).toBe(false);
  });

  it('returns the slice ids ark_place shows beside the layer', () => {
    expect(
      sliceRuleIdsForFile('src/features/projects/rfi/domain/intake.ts', [rule], [
        { id: 'features/projects/rfi#rfi-intake', childId: 'features/projects/rfi' },
        { id: 'INV-UNIVERSE-CODES' },
      ])
    ).toEqual(['features/projects/rfi#rfi-intake']);
  });
});
