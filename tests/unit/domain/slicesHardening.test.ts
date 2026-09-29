/**
 * Hierarchical slices hardening (#335, #336, #337 and the 4.8.23 slice audit).
 * Pure Domain + Kernel graph evaluation. CLI surfaces live in static-check tests.
 */
import { describe, expect, it } from 'vitest';
import { baselineKey } from '../../../src/domain/baselineKey';
import {
  applyAdvisorySiblingRatchet,
  composeSliceDenialMessage,
  crossParentViaSharedHubs,
  findDeniedEdgeDecision,
  isChildWallCrossing,
  pathMatchesSharedWalkStop,
  resolveGovernedSlice,
  sharedImportsSliceMode,
  sharedImportsSliceStopAt,
  siblingRatchetMode,
  sliceAliasDestination,
  sliceAliasReport,
  sliceConsumerMessage,
  sliceIdForPath,
  sliceIdentityCollisions,
  type EdgeRule,
} from '../../../src/domain/layerMatch';
import { loadArkConfigContract } from '../../../src/domain/configContract';
import { loadArkConfigContract as loadGeneratedArkConfigContract } from '../../../bin/lib/config-contract.mjs';
import { classifyArkPolicyDelta } from '../../../src/domain/policyDelta';
import { evaluateArchitectureGraph } from '../../../src/kernel/graphEvaluate';
import { violationsFor } from '../../../src/kernel/moduleGraph';

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
    sliceFolders: ['lib/features/*/*'],
    sliceIdentity: 'stars',
    commonFolders: ['domain'],
    siblings: 'deny',
  },
};

function decide(rule: EdgeRule, fromPath: string, toPath: string) {
  return findDeniedEdgeDecision([rule], 'Application', 'Application', { fromPath, toPath, layers });
}

describe('commonFolders only at the child position', () => {
  it('a sibling importing another feature\'s own domain/ folder is a CROSS_SIBLING_SLICE', () => {
    const decision = decide(
      childRule,
      'src/lib/features/projects/scm/leak.ts',
      'src/lib/features/projects/rfi/domain/entity.ts'
    );
    expect(decision?.sliceVerdict?.reasonId).toBe('CROSS_SIBLING_SLICE');
    expect(resolveGovernedSlice('src/lib/features/projects/rfi/domain/entity.ts', childRule)).toEqual({
      universeId: 'features/projects',
      childId: 'features/projects/rfi',
    });
  });

  it('a feature\'s own domain/ folder may import its own feature', () => {
    expect(
      decide(childRule, 'src/lib/features/projects/rfi/domain/uses-own.ts', 'src/lib/features/projects/rfi/service.ts')
    ).toBeUndefined();
  });

  it('universe-level domain/ stays common: children import it; it may not import a child', () => {
    expect(
      decide(childRule, 'src/lib/features/projects/scm/ok.ts', 'src/lib/features/projects/domain/codes.ts')
    ).toBeUndefined();
    const reverse = decide(
      childRule,
      'src/lib/features/projects/domain/codes.ts',
      'src/lib/features/projects/rfi/rfi-intake.ts'
    );
    expect(reverse?.sliceVerdict?.crossing).toBe('parent-imports-child');
  });
});

describe('sliceIdentity "stars" keeps a star before the last literal', () => {
  it('different modules keep different ids', () => {
    expect(sliceIdForPath('src/modules/orders/api/v1/x.ts', ['modules/*/api/*'], 'stars')).toBe('orders/api/v1');
    expect(sliceIdForPath('src/modules/users/api/v1/y.ts', ['modules/*/api/*'], 'stars')).toBe('users/api/v1');
  });

  it('ids for patterns without a leading star are unchanged', () => {
    expect(sliceIdForPath('src/lib/features/projects/rfi/a.ts', ['lib/features/*/*'], 'stars')).toBe(
      'features/projects/rfi'
    );
    expect(
      sliceIdForPath('src/lib/repositories/features/projects/rfi/a.ts', ['lib/repositories/features/*/*'], 'stars')
    ).toBe('features/projects/rfi');
  });

  it('an orders → users import is a cross-slice deny under stars', () => {
    const rule: EdgeRule = {
      from: 'Api',
      to: 'Api',
      allowed: false,
      peerIsolation: true,
      sliceFolders: ['modules/*/api/*'],
      sliceIdentity: 'stars',
    };
    const decision = findDeniedEdgeDecision([rule], 'Api', 'Api', {
      fromPath: 'src/modules/orders/api/v1/order.ts',
      toPath: 'src/modules/users/api/v1/user.ts',
      layers: [{ name: 'Api', patterns: ['src/modules/**'] }],
    });
    expect(decision?.peerIsolationReason).toBe('cross-slice');
  });

  it('collision stems keep the leading star; a directory maps back through it', () => {
    const hits = sliceIdentityCollisions([
      {
        from: 'Api',
        to: 'Api',
        sliceFolders: ['modules/*/api/*', 'packages/*/api/*', 'lib/features/*/*'],
        sliceIdentity: 'stars',
      },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.stem).toBe('*/api/*');
    expect(
      sliceAliasDestination('src/legacy/orders-v1.ts', 'orders/api/v1', {
        sliceFolders: ['modules/*/api/*'],
        sliceIdentity: 'stars',
      })
    ).toBe('src/modules/orders/api/v1');
  });

  it('config load accepts an alias target shaped by a star before the last literal', () => {
    const input = {
      include: ['src'],
      layers: [{ name: 'Api', patterns: ['src/modules/**', 'src/legacy/**'] }],
      rules: [
        {
          from: 'Api',
          to: 'Api',
          allowed: false,
          peerIsolation: true,
          sliceFolders: ['modules/*/api'],
          sliceIdentity: 'stars',
          childSlices: {
            sliceFolders: ['modules/*/api/*'],
            sliceIdentity: 'stars',
            sliceAliases: [{ from: 'legacy/**', to: 'orders/api/v1' }],
          },
        },
      ],
    };
    for (const load of [loadArkConfigContract, loadGeneratedArkConfigContract]) {
      expect(() => load(input)).not.toThrow();
    }
  });
});

describe('sliceAliases folder form', () => {
  const aliasRule: EdgeRule = {
    ...childRule,
    childSlices: {
      ...childRule.childSlices!,
      sliceAliases: [{ from: 'lib/compliance', to: 'features/projects/compliance' }],
    },
  };

  it('a folder without a wildcard covers its subtree', () => {
    expect(resolveGovernedSlice('src/lib/compliance/uses-management.ts', aliasRule)).toEqual({
      universeId: 'features/projects',
      childId: 'features/projects/compliance',
    });
    const decision = decide(
      aliasRule,
      'src/lib/compliance/uses-management.ts',
      'src/lib/features/management/eos/eos-summary.ts'
    );
    expect(decision?.sliceVerdict?.reasonId).toBe('CROSS_PARENT_SLICE');
    expect(
      sliceAliasReport([aliasRule], ['src/lib/compliance/a.ts', 'src/lib/features/projects/rfi/x.ts'])?.moves[0]
        ?.files
    ).toEqual(['src/lib/compliance/a.ts']);
  });

  it('a folder-form alias that overlaps a slice folder is rejected at config load', () => {
    const input = {
      include: ['src'],
      layers,
      rules: [
        {
          ...universeRule,
          childSlices: {
            sliceFolders: ['lib/features/*/*'],
            sliceIdentity: 'stars',
            sliceAliases: [{ from: 'lib/features', to: 'features/projects/compliance' }],
          },
        },
      ],
    };
    for (const load of [loadArkConfigContract, loadGeneratedArkConfigContract]) {
      expect(() => load(input)).toThrow('overlaps a slice folder');
    }
  });

  it('two aliases where a folder form covers the other glob are rejected', () => {
    const input = {
      include: ['src'],
      layers,
      rules: [
        {
          ...universeRule,
          childSlices: {
            sliceFolders: ['lib/features/*/*'],
            sliceIdentity: 'stars',
            sliceAliases: [
              { from: 'lib/compliance', to: 'features/projects/compliance' },
              { from: 'lib/compliance/deep/**', to: 'features/projects/deep' },
            ],
          },
        },
      ],
    };
    expect(() => loadArkConfigContract(input)).toThrow('two slice aliases match the same file');
  });
});

describe('alias target universe no file belongs to', () => {
  it('doctor flags a typo universe; a real one stays silent', () => {
    const typo: EdgeRule = {
      ...childRule,
      childSlices: {
        ...childRule.childSlices!,
        sliceAliases: [{ from: 'lib/compliance/**', to: 'features/typoverse/compliance' }],
      },
    };
    const files = ['src/lib/compliance/b.ts', 'src/lib/features/projects/rfi/a.ts'];
    const report = sliceAliasReport([typo], files);
    expect(report?.moves[0]).toMatchObject({ unknownUniverse: true });
    expect(report?.moves[0]?.advisory).toContain('features/typoverse');
    const real: EdgeRule = {
      ...typo,
      childSlices: {
        ...typo.childSlices!,
        sliceAliases: [{ from: 'lib/compliance/**', to: 'features/projects/compliance' }],
      },
    };
    expect(sliceAliasReport([real], files)?.moves[0]?.unknownUniverse).toBeUndefined();
  });

  it('config load still accepts the shape (it cannot see the tree)', () => {
    const input = {
      include: ['src'],
      layers,
      rules: [
        {
          ...universeRule,
          childSlices: {
            sliceFolders: ['lib/features/*/*'],
            sliceIdentity: 'stars',
            sliceAliases: [{ from: 'lib/compliance/**', to: 'features/typoverse/compliance' }],
          },
        },
      ],
    };
    expect(() => loadArkConfigContract(input)).not.toThrow();
  });
});

describe('childSlices needs a peerIsolation deny rule', () => {
  const base = { include: ['src'], layers };
  const child = { sliceFolders: ['lib/features/*/*'], sliceIdentity: 'stars' };
  it.each([
    ['no peerIsolation', { from: 'Application', to: 'Application', allowed: false, childSlices: child }],
    [
      'peerIsolation with allowed: true',
      { from: 'Application', to: 'Application', allowed: true, peerIsolation: true, childSlices: child },
    ],
  ])('rejects %s', (_name, rule) => {
    for (const load of [loadArkConfigContract, loadGeneratedArkConfigContract]) {
      expect(() => load({ ...base, rules: [rule] })).toThrow('$.rules[0].childSlices');
      expect(() => load({ ...base, rules: [rule] })).toThrow('requires peerIsolation: true and allowed: false');
    }
  });
  it('accepts it on a peerIsolation deny rule', () => {
    expect(() =>
      loadArkConfigContract({
        ...base,
        rules: [{ from: 'Application', to: 'Application', allowed: false, peerIsolation: true, childSlices: child }],
      })
    ).not.toThrow();
  });
});

const graphConfig = { layers: [{ name: 'Features', patterns: ['src/**'] }] };

function hop(from: string, to: string, line = 1) {
  return { from, fromLayer: 'Features', to, toLayer: 'Features', line, kind: 'import' };
}

function graphRule(extra: Partial<EdgeRule> = {}): EdgeRule {
  return {
    from: 'Features',
    to: 'Features',
    allowed: false,
    peerIsolation: true,
    sliceFolders: ['features'],
    sharedRoots: ['ui', 'kernel', 'lib/feature-registrations.ts'],
    sharedImportsSlice: 'deny-cross-parent',
    ...extra,
  };
}

function viaShared(rule: EdgeRule, edges: ReturnType<typeof hop>[]) {
  const result = evaluateArchitectureGraph({
    config: graphConfig as never,
    rules: [rule] as never,
    files: [],
    contentViolations: [],
    edges,
  });
  return {
    hits: result.violations.filter((row) => row.reasonId === 'CROSS_PARENT_VIA_SHARED'),
    warnings: result.warnings,
  };
}

describe('CROSS_PARENT_VIA_SHARED honors the universe allowedCrossSlice (directed)', () => {
  const edges = [
    hop('src/features/projects/p.ts', 'src/ui/bridge.ts'),
    hop('src/ui/bridge.ts', 'src/features/management/m.ts'),
    hop('src/features/management/q.ts', 'src/ui/back.ts'),
    hop('src/ui/back.ts', 'src/features/projects/r.ts'),
  ];
  it('a declared projects → management edge is not laundering; the reverse still is', () => {
    const { hits } = viaShared(
      graphRule({ allowedCrossSlice: [{ from: 'features/projects', to: 'features/management' }] }),
      edges
    );
    expect(hits.map((row) => `${row.file} -> ${row.target}`)).toEqual([
      'src/features/management/q.ts -> src/features/projects/r.ts',
    ]);
  });
  it('without the declaration both paths are reported', () => {
    expect(viaShared(graphRule(), edges).hits).toHaveLength(2);
  });
  it('childSlices.allowedCrossSlice never clears it', () => {
    const { hits } = viaShared(
      graphRule({
        childSlices: {
          sliceFolders: ['features/*/*'],
          allowedCrossSlice: [{ from: 'features/*/*', to: 'features/*/*' }],
        },
      }),
      edges
    );
    expect(hits).toHaveLength(2);
  });
});

describe('sharedImportsSlice stopAt (#335)', () => {
  const stopAt = ['kernel/bootstrap.ts', 'kernel/registrations/**', 'lib/feature-registrations.ts'];
  const edges = [
    hop('src/features/management/hours/deps.ts', 'src/kernel/bootstrap.ts'),
    hop('src/kernel/bootstrap.ts', 'src/lib/feature-registrations.ts'),
    hop('src/lib/feature-registrations.ts', 'src/features/projects/bid/admission.ts'),
    hop('src/kernel/bootstrap.ts', 'src/kernel/registrations/index.ts'),
    hop('src/kernel/registrations/index.ts', 'src/kernel/internal/listener.ts'),
    hop('src/kernel/internal/listener.ts', 'src/features/operations/x.ts'),
    hop('src/features/management/a.ts', 'src/ui/shared.ts'),
    hop('src/ui/shared.ts', 'src/features/operations/b.ts'),
  ];

  it('the string form reports every path through the composition root (regression pin)', () => {
    expect(viaShared(graphRule(), edges).hits).toHaveLength(3);
  });

  it('the object form stops the walk at composition roots and keeps the real path', () => {
    const { hits, warnings } = viaShared(
      graphRule({ sharedImportsSlice: { mode: 'deny-cross-parent', stopAt } }),
      edges
    );
    expect(hits).toEqual([
      expect.objectContaining({
        file: 'src/features/management/a.ts',
        target: 'src/features/operations/b.ts',
        via: ['src/ui/shared.ts'],
      }),
    ]);
    // stopAt does not silence the direct shared-root hop warnings.
    expect(
      warnings.some(
        (row) =>
          row.ruleId === 'SHARED_IMPORTS_SLICE' && row.file === 'src/lib/feature-registrations.ts'
      )
    ).toBe(true);
  });

  it.each([['kernel/registrations'], ['kernel/registrations/**'], ['src/kernel/registrations/**']])(
    'stop spelled %s matches like a shared root or an alias glob',
    (spelling) => {
      expect(pathMatchesSharedWalkStop('src/kernel/registrations/a/b.ts', [spelling])).toBe(true);
    }
  );

  it('matching is case-insensitive, accepts app/, and refuses a blanket stop', () => {
    expect(pathMatchesSharedWalkStop('src/Kernel/Bootstrap.ts', ['kernel/bootstrap.ts'])).toBe(true);
    expect(pathMatchesSharedWalkStop('app/kernel/bootstrap.ts', ['kernel/bootstrap.ts'])).toBe(true);
    expect(pathMatchesSharedWalkStop('src/kernel/bootstrap.ts', ['**'])).toBe(false);
    expect(pathMatchesSharedWalkStop('src/kernel/bootstrap.ts', ['*'])).toBe(false);
    expect(pathMatchesSharedWalkStop('src/kernel/bootstrap.ts', [])).toBe(false);
  });

  it('a slice destination that matches a stop is still reported; stops only block shared nodes', () => {
    const { hits } = viaShared(
      graphRule({ sharedImportsSlice: { mode: 'deny-cross-parent', stopAt: ['features/operations/**'] } }),
      edges
    );
    expect(hits.length).toBe(3);
  });

  it('a longer real path through another shared root is still reported', () => {
    const { hits } = viaShared(graphRule({ sharedImportsSlice: { mode: 'deny-cross-parent', stopAt } }), [
      hop('src/features/management/a.ts', 'src/kernel/bootstrap.ts'),
      hop('src/kernel/bootstrap.ts', 'src/features/operations/b.ts'),
      hop('src/features/management/a.ts', 'src/ui/one.ts'),
      hop('src/ui/one.ts', 'src/ui/two.ts'),
      hop('src/ui/two.ts', 'src/features/operations/b.ts'),
    ]);
    expect(hits).toEqual([
      expect.objectContaining({ file: 'src/features/management/a.ts', via: ['src/ui/one.ts', 'src/ui/two.ts'] }),
    ]);
  });

  it('mode and stop helpers never read the object as a string', () => {
    expect(sharedImportsSliceMode('deny')).toBe('deny');
    expect(sharedImportsSliceMode({ mode: 'deny-cross-parent', stopAt: ['a'] })).toBe('deny-cross-parent');
    expect(sharedImportsSliceMode(undefined)).toBeUndefined();
    expect(sharedImportsSliceMode({ mode: 'x' })).toBeUndefined();
    expect(sharedImportsSliceStopAt('deny-cross-parent')).toEqual([]);
    expect(sharedImportsSliceStopAt({ mode: 'deny-cross-parent', stopAt: ['a', 3, ''] })).toEqual(['a']);
  });

  it('per-edge verdicts for the object form match the string deny-cross-parent (never deny)', () => {
    const edge = { fromPath: 'src/ui/shared.ts', toPath: 'src/features/operations/b.ts', layers: graphConfig.layers };
    const asString = findDeniedEdgeDecision([graphRule()], 'Features', 'Features', edge);
    const asObject = findDeniedEdgeDecision(
      [graphRule({ sharedImportsSlice: { mode: 'deny-cross-parent', stopAt } })],
      'Features',
      'Features',
      edge
    );
    expect(asString).toBeUndefined();
    expect(asObject).toBeUndefined();
    const denying = findDeniedEdgeDecision([graphRule({ sharedImportsSlice: 'deny' })], 'Features', 'Features', edge);
    expect(denying?.peerIsolationReason).toBe('shared-imports-slice');
  });

  it('doctor hub advisory names a shared file on most findings', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, index) => ({
        reasonId: 'CROSS_PARENT_VIA_SHARED',
        via: ['src/kernel/bootstrap.ts', `src/ui/${index}.ts`],
      })),
      { reasonId: 'CROSS_PARENT_VIA_SHARED', via: ['src/ui/x.ts'] },
      { reasonId: 'CROSS_PARENT_VIA_SHARED' },
    ];
    const report = crossParentViaSharedHubs(rows);
    expect(report?.hubs).toEqual([{ file: 'src/kernel/bootstrap.ts', count: 10, share: 0.83 }]);
    expect(report?.nextAction).toContain('sharedImportsSlice.stopAt');
    expect(crossParentViaSharedHubs(rows.slice(0, 9))).toBeNull();
    expect(
      crossParentViaSharedHubs(
        Array.from({ length: 12 }, (_, index) => ({ reasonId: 'CROSS_PARENT_VIA_SHARED', via: [`src/ui/${index}.ts`] }))
      )
    ).toBeNull();
  });

  it('config load accepts both string forms and the object; rejects bad objects', () => {
    const load = (value: unknown) =>
      loadArkConfigContract({
        include: ['src'],
        layers,
        rules: [{ ...universeRule, sharedImportsSlice: value }],
      });
    for (const loader of [loadArkConfigContract, loadGeneratedArkConfigContract]) {
      for (const ok of ['deny', 'deny-cross-parent', { mode: 'deny-cross-parent', stopAt }]) {
        expect(() =>
          loader({ include: ['src'], layers, rules: [{ ...universeRule, sharedImportsSlice: ok }] })
        ).not.toThrow();
      }
    }
    const path = '$.rules[0].sharedImportsSlice';
    expect(() => load('nope')).toThrow(path);
    expect(() => load(3)).toThrow('must be "deny", "deny-cross-parent", or');
    expect(() => load({ mode: 'deny', stopAt: ['a'] })).toThrow(`${path}.mode`);
    expect(() => load({ mode: 'deny-cross-parent' })).toThrow(`${path}.stopAt: is required`);
    expect(() => load({ mode: 'deny-cross-parent', stopAt: [] })).toThrow('non-empty array');
    expect(() => load({ mode: 'deny-cross-parent', stopAt: ['**'] })).toThrow('must not cover the whole tree');
    expect(() => load({ mode: 'deny-cross-parent', stopAt: [1] })).toThrow(`${path}.stopAt[0]`);
    expect(() => load({ mode: 'deny-cross-parent', stopAt: ['a', 'A/'] })).toThrow('duplicate stopAt entry');
    expect(() => load({ mode: 'deny-cross-parent', stopAt: ['a'], foo: 1 })).toThrow(`${path}.foo: unknown field`);
  });
});

const siblingViolation = (file: string, fromLayer = 'Application') => ({
  ruleId: 'LAYER_IMPORT_VIOLATION',
  file,
  fromLayer,
  toLayer: fromLayer,
  target: `${file}.target`,
  reasonId: 'CROSS_SIBLING_SLICE',
  failsStrict: false as const,
  severity: 'warning',
  message: 'cross-sibling slice',
});

function ratchetRule(siblings: unknown, layer = 'Application'): EdgeRule {
  return {
    ...universeRule,
    from: layer,
    to: layer,
    childSlices: { sliceFolders: ['lib/features/*/*'], siblings: siblings as never },
  };
}

describe('advisory sibling ratchet (#336)', () => {
  const a = siblingViolation('src/a.ts');
  const b = siblingViolation('src/b.ts');
  const keys = [baselineKey(a), baselineKey(b)];
  const advisory = { default: 'advisory', enforce: ['features/projects/rfi'] };

  it('an empty baseline promotes nothing (advisory is advisory on day 1)', () => {
    const judged = applyAdvisorySiblingRatchet([a, b], keys, new Set(), { rules: [ratchetRule(advisory)] });
    expect(judged.map((row) => row.severity)).toEqual(['warning', 'warning']);
  });

  it('a legacy baseline without sibling keys promotes nothing', () => {
    const judged = applyAdvisorySiblingRatchet([a, b], keys, new Set(['LAYER_IMPORT_VIOLATION|x|A|B|y']), {
      rules: [ratchetRule(advisory)],
    });
    expect(judged.every((row) => row.failsStrict === false)).toBe(true);
  });

  it('auto: once a crossing of this rule is recorded, only the new one fails and says why', () => {
    const judged = applyAdvisorySiblingRatchet([a, b], keys, new Set([baselineKey(a)]), {
      rules: [ratchetRule(advisory)],
    });
    expect(judged[0]?.failsStrict).toBe(false);
    expect(judged[1]).toMatchObject({ failsStrict: true, severity: 'error' });
    expect(judged[1]?.message).toContain('past the recorded baseline for Application → Application');
    expect(
      applyAdvisorySiblingRatchet([a], [baselineKey(a)], new Set([baselineKey(a)]), { rules: [ratchetRule(advisory)] })[0]
        ?.failsStrict
    ).toBe(false);
  });

  it('per rule: a recorded crossing in one rule does not arm another rule', () => {
    const c = siblingViolation('src/c.ts', 'Persistence');
    const judged = applyAdvisorySiblingRatchet(
      [a, c],
      [baselineKey(a), baselineKey(c)],
      new Set([baselineKey(a)]),
      { rules: [ratchetRule(advisory), ratchetRule(advisory, 'Persistence')] }
    );
    expect(judged[1]?.failsStrict).toBe(false);
  });

  it('ratchet: true promotes any unrecorded advisory crossing; ratchet: false never does', () => {
    const strict = applyAdvisorySiblingRatchet([a, b], keys, new Set(), {
      rules: [ratchetRule({ ...advisory, ratchet: true })],
    });
    expect(strict.every((row) => row.severity === 'error')).toBe(true);
    const measure = applyAdvisorySiblingRatchet([a, b], keys, new Set([baselineKey(a)]), {
      rules: [ratchetRule({ ...advisory, ratchet: false })],
    });
    expect(measure.every((row) => row.failsStrict === false)).toBe(true);
  });

  it('enforced crossings are untouched in every mode', () => {
    const enforced = { ...a, file: 'src/e.ts', failsStrict: undefined, severity: 'error' };
    for (const ratchet of [undefined, true, false]) {
      const judged = applyAdvisorySiblingRatchet([enforced], [baselineKey(enforced)], new Set(), {
        rules: [ratchetRule({ default: 'advisory', ...(ratchet === undefined ? {} : { ratchet }) })],
      });
      expect(judged[0]).toEqual(enforced);
    }
  });

  it('siblingRatchetMode reads only a boolean on the object form', () => {
    expect(siblingRatchetMode('advisory')).toBe('auto');
    expect(siblingRatchetMode({ default: 'advisory' })).toBe('auto');
    expect(siblingRatchetMode({ default: 'advisory', ratchet: true })).toBe('always');
    expect(siblingRatchetMode({ default: 'advisory', ratchet: false })).toBe('never');
    expect(siblingRatchetMode('deny')).toBe('auto');
  });

  it('config accepts ratchet and rejects a non-boolean at its path', () => {
    const build = (ratchet: unknown) => ({
      include: ['src'],
      layers,
      rules: [
        {
          ...universeRule,
          childSlices: { sliceFolders: ['lib/features/*/*'], siblings: { default: 'advisory', ratchet } },
        },
      ],
    });
    for (const load of [loadArkConfigContract, loadGeneratedArkConfigContract]) {
      expect(load(build(false)).config.rules[0]?.childSlices?.siblings).toEqual({
        default: 'advisory',
        ratchet: false,
      });
      expect(() => load(build('yes'))).toThrow('$.rules[0].childSlices.siblings.ratchet: must be a boolean');
    }
  });

  it('policy delta: ratchet false weakens, true strengthens, and removal is judged from the old mode', () => {
    const configWith = (siblings: unknown) =>
      loadArkConfigContract({
        include: ['src'],
        layers,
        rules: [{ ...universeRule, childSlices: { sliceFolders: ['lib/features/*/*'], siblings } }],
      }).config;
    const kinds = (before: unknown, after: unknown) =>
      classifyArkPolicyDelta(configWith(before), configWith(after)).findings.map(
        (row: { id: string; classification: string }) => `${row.id.split(':').pop()}:${row.classification}`
      );
    expect(kinds({ default: 'advisory' }, { default: 'advisory', ratchet: false })).toEqual([
      'child-slices-siblings-ratchet:weakening',
    ]);
    expect(kinds({ default: 'advisory' }, { default: 'advisory', ratchet: true })).toEqual([
      'child-slices-siblings-ratchet:strengthening',
    ]);
    expect(kinds({ default: 'advisory', ratchet: true }, { default: 'advisory' })).toEqual([
      'child-slices-siblings-ratchet:weakening',
    ]);
    expect(kinds({ default: 'advisory', ratchet: false }, { default: 'advisory' })).toEqual([
      'child-slices-siblings-ratchet:strengthening',
    ]);
  });
});

describe('inner-wall message (#337)', () => {
  const U = 'Universe wall: consume the other universe endpoint.';
  const C = 'Inner wall: move the shared piece to universe common.';
  const withMessages = (childMessage?: string): EdgeRule => ({
    ...childRule,
    message: U,
    childSlices: { ...childRule.childSlices!, ...(childMessage ? { message: childMessage } : {}) },
  });
  const sibling = ['src/lib/features/projects/rfi/load-rfi.ts', 'src/lib/features/projects/scm/scm-board.ts'] as const;
  const common = ['src/lib/features/projects/domain/project-codes.ts', 'src/lib/features/projects/rfi/rfi-intake.ts'] as const;
  const parent = ['src/lib/features/projects/rfi/load-rfi.ts', 'src/lib/features/management/eos/eos-summary.ts'] as const;
  const message = (rule: EdgeRule, [fromPath, toPath]: readonly [string, string], surface: 'import' | 'intent' = 'import') =>
    composeSliceDenialMessage({
      surface,
      verdict: decide(rule, fromPath, toPath)!.sliceVerdict!,
      fromLayer: 'Application',
      toLayer: 'Application',
      kind: 'import',
      fromPath,
      toPath,
      ruleMessage: rule.message,
      childMessage: rule.childSlices?.message,
    });

  it('a sibling finding never reuses the universe rule message', () => {
    const text = message(withMessages(), sibling);
    expect(text).not.toContain(U);
    expect(text).toBe(
      `Application must not import another slice of Application (${sibling[0]} → ${sibling[1]}): cross-sibling slice features/projects/rfi → features/projects/scm inside features/projects.`
    );
  });

  it('childSlices.message is the inner-wall text', () => {
    expect(message(withMessages(C), sibling)).toBe(
      `${C} (cross-sibling slice features/projects/rfi → features/projects/scm inside features/projects.)`
    );
    expect(message(withMessages(C), common)).toBe(
      `${C} (universe common imports child features/projects/rfi. parentMayImportChild is off.)`
    );
    expect(message(withMessages(), common)).not.toContain(U);
  });

  it('a cross-parent finding keeps the rule message and ignores the inner text', () => {
    expect(message(withMessages(C), parent).startsWith(`${U} (cross-parent slice`)).toBe(true);
  });

  it('intent surface uses the inner text for a sibling and the default otherwise', () => {
    const verdict = decide(withMessages(C), ...sibling)!.sliceVerdict!;
    expect(
      composeSliceDenialMessage({
        surface: 'intent',
        verdict,
        fromLayer: 'Application',
        toLayer: 'Application',
        ruleMessage: U,
        childMessage: C,
        defaultMessage: 'D.',
      })
    ).toBe(`${C} ${verdict.explanation}`);
    expect(
      composeSliceDenialMessage({
        surface: 'intent',
        verdict,
        fromLayer: 'Application',
        toLayer: 'Application',
        ruleMessage: U,
        defaultMessage: 'D.',
      })
    ).toBe(`D. ${verdict.explanation}`);
  });

  it('isChildWallCrossing / sliceConsumerMessage pick the wall', () => {
    const rule = withMessages(C);
    for (const [crossing, inner] of [
      ['none', false],
      ['cross-parent', false],
      ['fail-closed', false],
      ['cross-sibling', true],
      ['parent-imports-child', true],
    ] as const) {
      const verdict = { crossing, decision: 'deny' as const };
      expect(isChildWallCrossing(verdict)).toBe(inner);
      expect(sliceConsumerMessage(rule, verdict)).toBe(inner ? C : U);
    }
    expect(sliceConsumerMessage(withMessages(), { crossing: 'cross-sibling', decision: 'deny' })).toBeUndefined();
  });

  it('ark-check graph and the pure analysis API use the same choice', () => {
    const rule = withMessages();
    const edge = { from: sibling[0], fromLayer: 'Application', to: sibling[1], toLayer: 'Application', line: 1, kind: 'import' };
    const graph = evaluateArchitectureGraph({
      config: { layers } as never,
      rules: [rule] as never,
      files: [],
      contentViolations: [],
      edges: [edge],
    });
    expect(graph.violations[0]?.message).not.toContain(U);
    const pure = violationsFor([edge as never], { layers, rules: [rule] } as never);
    expect(pure[0]?.message).not.toContain(U);
    const pureInner = violationsFor([edge as never], { layers, rules: [withMessages(C)] } as never);
    expect(pureInner[0]?.message).toBe(C);
    const pureParent = violationsFor(
      [{ ...edge, to: parent[1] } as never],
      { layers, rules: [withMessages(C)] } as never
    );
    expect(pureParent[0]?.message).toBe(U);
  });

  it('config accepts childSlices.message and rejects an empty one; policy delta stays silent', () => {
    const build = (value: unknown) => ({
      include: ['src'],
      layers,
      rules: [{ ...universeRule, childSlices: { sliceFolders: ['lib/features/*/*'], message: value } }],
    });
    for (const load of [loadArkConfigContract, loadGeneratedArkConfigContract]) {
      expect(load(build('Inner')).config.rules[0]?.childSlices?.message).toBe('Inner');
      expect(() => load(build(''))).toThrow('$.rules[0].childSlices.message');
      expect(() => load(build(3))).toThrow('$.rules[0].childSlices.message');
    }
    const before = loadArkConfigContract(build('Inner')).config;
    const after = loadArkConfigContract(build('Other text')).config;
    expect(classifyArkPolicyDelta(before, after).findings).toEqual([]);
  });
});

describe('policy delta for sharedImportsSlice stopAt (#335)', () => {
  const configWith = (value: unknown) =>
    loadArkConfigContract({
      include: ['src'],
      layers,
      rules: [{ ...universeRule, sharedImportsSlice: value }],
    }).config;
  const ids = (before: unknown, after: unknown) =>
    classifyArkPolicyDelta(configWith(before), configWith(after)).findings.map(
      (row: { id: string; classification: string }) => `${row.id.split(':').pop()}:${row.classification}`
    );
  const object = (stopAt: string[]) => ({ mode: 'deny-cross-parent', stopAt });

  it('adding a stop weakens, removing strengthens, swapping needs judgment', () => {
    expect(ids('deny-cross-parent', object(['kernel/bootstrap.ts']))).toEqual([
      'shared-walk-stop-added:weakening',
    ]);
    expect(
      ids(object(['kernel/bootstrap.ts', 'kernel/registrations/**']), object(['kernel/bootstrap.ts']))
    ).toEqual(['shared-walk-stop-removed:strengthening']);
    expect(ids(object(['a.ts']), object(['b.ts']))).toEqual(['shared-walk-stop-changed:judgment-required']);
  });

  it('an identical object is no change; a mode change keeps the existing finding', () => {
    expect(ids(object(['a.ts']), object(['a.ts/']))).toEqual([]);
    expect(ids(object(['a.ts']), 'deny')).toEqual(['shared-imports-slice:strengthening']);
  });
});
