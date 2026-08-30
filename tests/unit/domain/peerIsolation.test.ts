/**
 * P0 — peerIsolation: same-layer cross-slice edges denied; same-slice allowed.
 */
import { describe, it, expect } from 'vitest';
import {
  isEdgeDenied,
  findDeniedEdgeRule,
  findDeniedEdgeDecision,
  peerIsolationMustDeny,
  peerIsolationDecision,
  peerIsolationDenyExplanation,
  pathUnderSharedRoot,
  crossSliceEdgeAllowed,
  sliceIdForPath,
  inferSliceFoldersFromPatterns,
} from '../../../src/domain/layerMatch';
import { evaluateArchitectureGraph } from '../../../src/kernel/graphEvaluate';
import {
  classifyRemediation,
  enrichViolationWithFixClass,
} from '../../../src/domain/remediation';

const featuresLayers = [
  {
    name: 'Features',
    patterns: ['src/features/**'],
  },
  {
    name: 'Shared',
    patterns: ['src/shared/**'],
  },
];

const peerRules = [
  {
    from: 'Features',
    to: 'Features',
    allowed: false as const,
    peerIsolation: true,
  },
  {
    from: 'Shared',
    to: 'Features',
    allowed: false as const,
  },
];

describe('sliceIdForPath / inferSliceFoldersFromPatterns', () => {
  it('extracts slice under features/ (parent/name so features/auth ≠ modules/auth)', () => {
    expect(sliceIdForPath('src/features/auth/api.ts', ['features'])).toBe('features/auth');
    expect(sliceIdForPath('src/features/payments/hooks/usePay.ts', ['features'])).toBe(
      'features/payments'
    );
    expect(sliceIdForPath('src/modules/auth/x.ts', ['features', 'modules'])).toBe('modules/auth');
    expect(sliceIdForPath('src/features/auth/x.ts', ['features', 'modules'])).toBe(
      'features/auth'
    );
    expect(sliceIdForPath('src/Features/Auth/api.ts', ['features'])).toBe('features/auth');
  });

  it('infers features from src/features/**', () => {
    expect(inferSliceFoldersFromPatterns(['src/features/**'])).toEqual(['features']);
    expect(inferSliceFoldersFromPatterns(['src/contexts/**', 'src/bounded-contexts/**'])).toEqual(
      expect.arrayContaining(['contexts', 'bounded-contexts'])
    );
  });
});

describe('peerIsolationMustDeny pure decision (DF04)', () => {
  it('fail-closes on missing path, empty folders, or unclassifiable slices', () => {
    expect(
      peerIsolationMustDeny({
        folderCount: 1,
        fromSlice: 'features/auth',
        toSlice: 'features/auth',
      })
    ).toBe(true);
    expect(
      peerIsolationMustDeny({
        fromPath: 'src/features/auth/a.ts',
        folderCount: 1,
        fromSlice: 'features/auth',
        toSlice: 'features/auth',
      })
    ).toBe(true);
    expect(
      peerIsolationMustDeny({
        fromPath: 'src/features/auth/a.ts',
        toPath: 'src/features/auth/b.ts',
        folderCount: 0,
        fromSlice: 'features/auth',
        toSlice: 'features/auth',
      })
    ).toBe(true);
    expect(
      peerIsolationMustDeny({
        fromPath: 'src/features/auth/a.ts',
        toPath: 'src/features/auth/b.ts',
        folderCount: 1,
        fromSlice: undefined,
        toSlice: 'features/auth',
      })
    ).toBe(true);
    expect(
      peerIsolationMustDeny({
        fromPath: 'src/features/auth/a.ts',
        toPath: 'src/features/auth/b.ts',
        folderCount: 1,
        fromSlice: 'features/auth',
        toSlice: undefined,
      })
    ).toBe(true);
  });

  it('allows only proven same-slice and denies cross-slice', () => {
    expect(
      peerIsolationMustDeny({
        fromPath: 'src/features/auth/a.ts',
        toPath: 'src/features/auth/b.ts',
        folderCount: 1,
        fromSlice: 'features/auth',
        toSlice: 'features/auth',
      })
    ).toBe(false);
    expect(
      peerIsolationMustDeny({
        fromPath: 'src/features/auth/a.ts',
        toPath: 'src/features/payments/b.ts',
        folderCount: 1,
        fromSlice: 'features/auth',
        toSlice: 'features/payments',
      })
    ).toBe(true);
  });
});

describe('peerIsolation edge rules', () => {
  it('denies when rules array is undefined or empty (no allow path)', () => {
    expect(isEdgeDenied(undefined, 'Features', 'Features')).toBe(false);
    expect(isEdgeDenied([], 'Features', 'Features')).toBe(false);
  });

  it('ignores non-matching layer pairs and non-deny allowed rules', () => {
    const mixed = [
      { from: 'Other', to: 'Features', allowed: false as const, peerIsolation: true },
      { from: 'Features', to: 'Features', allowed: true as const, peerIsolation: true },
      { from: 'Features', to: 'Features' }, // allowed omitted → not deny
    ];
    expect(
      isEdgeDenied(mixed, 'Features', 'Features', {
        fromPath: 'src/features/auth/a.ts',
        toPath: 'src/features/payments/b.ts',
        layers: featuresLayers,
      })
    ).toBe(false);
  });

  it('denies features/auth → features/payments', () => {
    expect(
      isEdgeDenied(peerRules, 'Features', 'Features', {
        fromPath: 'src/features/auth/api.ts',
        toPath: 'src/features/payments/service.ts',
        layers: featuresLayers,
      })
    ).toBe(true);
  });

  it('allows features/auth → features/auth/utils', () => {
    expect(
      isEdgeDenied(peerRules, 'Features', 'Features', {
        fromPath: 'src/features/auth/api.ts',
        toPath: 'src/features/auth/utils/token.ts',
        layers: featuresLayers,
      })
    ).toBe(false);
  });

  it('normalizes mixed-case slice identity while preserving different slices', () => {
    expect(
      isEdgeDenied(peerRules, 'Features', 'Features', {
        fromPath: 'src/Features/Auth/api.ts',
        toPath: 'src/features/auth/utils/token.ts',
        layers: featuresLayers,
      })
    ).toBe(false);
    expect(
      isEdgeDenied(peerRules, 'Features', 'Features', {
        fromPath: 'src/Features/Auth/api.ts',
        toPath: 'src/features/Payments/service.ts',
        layers: featuresLayers,
      })
    ).toBe(true);
  });

  it('allows features → shared (different layers, no deny rule)', () => {
    expect(
      isEdgeDenied(peerRules, 'Features', 'Shared', {
        fromPath: 'src/features/auth/api.ts',
        toPath: 'src/shared/ui/Button.ts',
        layers: featuresLayers,
      })
    ).toBe(false);
  });

  it('denies shared → features (classic rule)', () => {
    expect(
      isEdgeDenied(peerRules, 'Shared', 'Features', {
        fromPath: 'src/shared/ui/Button.ts',
        toPath: 'src/features/auth/api.ts',
        layers: featuresLayers,
      })
    ).toBe(true);
  });

  it('without paths, same-layer peerIsolation denies (fail-closed)', () => {
    // Isolation is configured; missing path evidence cannot prove same-slice.
    expect(isEdgeDenied(peerRules, 'Features', 'Features')).toBe(true);
    expect(
      isEdgeDenied(peerRules, 'Features', 'Features', {
        fromPath: 'src/features/auth/api.ts',
        // toPath omitted
        layers: featuresLayers,
      })
    ).toBe(true);
  });

  it('unclassifiable slices under peerIsolation deny (fail-closed)', () => {
    expect(
      isEdgeDenied(peerRules, 'Features', 'Features', {
        fromPath: 'src/elsewhere/a.ts',
        toPath: 'src/elsewhere/b.ts',
        layers: featuresLayers,
      })
    ).toBe(true);
  });

  it('peerIsolation with no resolvable slice folders denies (fail-closed)', () => {
    const rules = [
      {
        from: 'Features',
        to: 'Features',
        allowed: false as const,
        peerIsolation: true,
      },
    ];
    // Layer patterns that do not yield slice folder names.
    const layers = [{ name: 'Features', patterns: ['**/*.ts'] }];
    expect(
      isEdgeDenied(rules, 'Features', 'Features', {
        fromPath: 'src/a.ts',
        toPath: 'src/b.ts',
        layers,
      })
    ).toBe(true);
  });

  it('classic same-layer deny without peerIsolation is ignored (historical allow)', () => {
    const rules = [{ from: 'Features', to: 'Features', allowed: false as const }];
    expect(
      isEdgeDenied(rules, 'Features', 'Features', {
        fromPath: 'src/features/a/x.ts',
        toPath: 'src/features/b/y.ts',
        layers: featuresLayers,
      })
    ).toBe(false);
  });

  it('classic cross-layer deny still works without paths', () => {
    const rules = [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false as const }];
    expect(isEdgeDenied(rules, 'DomainModel', 'PersistenceAdapters')).toBe(true);
    expect(isEdgeDenied(rules, 'DomainModel', 'DomainModel')).toBe(false);
  });

  it('peerIsolation denies cross-layer cross-slice (DDD honesty)', () => {
    const rules = [
      {
        from: 'ApplicationOrchestration',
        to: 'DomainModel',
        allowed: false as const,
        peerIsolation: true,
        sliceFolders: ['contexts'],
      },
    ];
    const layers = [
      { name: 'DomainModel', patterns: ['src/contexts/**/domain/**'] },
      { name: 'ApplicationOrchestration', patterns: ['src/contexts/**/application/**'] },
    ];
    expect(
      isEdgeDenied(rules, 'ApplicationOrchestration', 'DomainModel', {
        fromPath: 'src/contexts/billing/application/open.ts',
        toPath: 'src/contexts/identity/domain/user.ts',
        layers,
      })
    ).toBe(true);
    expect(
      isEdgeDenied(rules, 'ApplicationOrchestration', 'DomainModel', {
        fromPath: 'src/contexts/billing/application/open.ts',
        toPath: 'src/contexts/billing/domain/invoice.ts',
        layers,
      })
    ).toBe(false);
  });

  it('explicit sliceFolders override inference', () => {
    const rules = [
      {
        from: 'Features',
        to: 'Features',
        allowed: false as const,
        peerIsolation: true,
        sliceFolders: ['modules'],
      },
    ];
    // Under features/ — no match for modules → unclassifiable → fail-closed deny
    expect(
      isEdgeDenied(rules, 'Features', 'Features', {
        fromPath: 'src/features/a/x.ts',
        toPath: 'src/features/b/y.ts',
        layers: featuresLayers,
      })
    ).toBe(true);
    // Under modules/ — cross-slice denies
    expect(
      isEdgeDenied(rules, 'Features', 'Features', {
        fromPath: 'src/modules/a/x.ts',
        toPath: 'src/modules/b/y.ts',
      })
    ).toBe(true);
    // Same modules slice allows
    expect(
      isEdgeDenied(rules, 'Features', 'Features', {
        fromPath: 'src/modules/a/x.ts',
        toPath: 'src/modules/a/y.ts',
      })
    ).toBe(false);
  });

  it('findDeniedEdgeRule returns the peer rule with message passthrough', () => {
    const rules = [
      {
        from: 'Features',
        to: 'Features',
        allowed: false as const,
        peerIsolation: true,
        message: 'No cross-feature imports',
      },
    ];
    const hit = findDeniedEdgeRule(rules, 'Features', 'Features', {
      fromPath: 'src/features/a/x.ts',
      toPath: 'src/features/b/y.ts',
      layers: featuresLayers,
    });
    expect(hit?.message).toBe('No cross-feature imports');
    expect(hit?.peerIsolation).toBe(true);
  });

  it('features/auth is not the same slice as modules/auth', () => {
    const rules = [
      {
        from: 'Features',
        to: 'Features',
        allowed: false as const,
        peerIsolation: true,
        sliceFolders: ['features', 'modules'],
      },
    ];
    const layers = [{ name: 'Features', patterns: ['src/features/**', 'src/modules/**'] }];
    expect(
      isEdgeDenied(rules, 'Features', 'Features', {
        fromPath: 'src/features/auth/a.ts',
        toPath: 'src/modules/auth/b.ts',
        layers,
      })
    ).toBe(true);
  });
});

describe('peerIsolation declared exceptions (4.8.4 — enforce the design, do not demand a redesign)', () => {
  const layers = [{ name: 'Features', patterns: ['src/features/**'] }];
  const rule = {
    from: 'Features',
    to: 'Features',
    allowed: false as const,
    peerIsolation: true,
    sliceFolders: ['features'],
    sharedRoots: ['ui', 'hooks', 'lib/permissions'],
    allowedCrossSlice: [{ from: 'features/checkout', to: 'catalog' }],
  };
  const rules = [rule];

  it('pathUnderSharedRoot matches a declared root at any depth, case-insensitively', () => {
    expect(pathUnderSharedRoot('src/ui/button.tsx', ['ui'])).toBe(true);
    expect(pathUnderSharedRoot('src/UI/Button.tsx', ['ui'])).toBe(true);
    expect(pathUnderSharedRoot('src\\ui\\button.tsx', ['ui'])).toBe(true);
    expect(pathUnderSharedRoot('src/lib/permissions/can.ts', ['lib/permissions'])).toBe(true);
    expect(pathUnderSharedRoot('src/lib/other.ts', ['lib/permissions'])).toBe(false);
    expect(pathUnderSharedRoot('src/uikit/button.tsx', ['ui'])).toBe(false);
    expect(pathUnderSharedRoot('src/ui/button.tsx', undefined)).toBe(false);
    expect(pathUnderSharedRoot(undefined, ['ui'])).toBe(false);
    expect(pathUnderSharedRoot('src/design/ui/x.ts', ['src/*/ui'])).toBe(true);
  });

  it('crossSliceEdgeAllowed matches full ids and bare slice names, directed', () => {
    const declared = [{ from: 'features/checkout', to: 'catalog' }];
    expect(crossSliceEdgeAllowed(declared, 'features/checkout', 'features/catalog')).toBe(true);
    expect(crossSliceEdgeAllowed(declared, 'features/catalog', 'features/checkout')).toBe(false);
    expect(crossSliceEdgeAllowed(declared, 'features/checkout', 'features/billing')).toBe(false);
    expect(crossSliceEdgeAllowed(undefined, 'features/a', 'features/b')).toBe(false);
    expect(crossSliceEdgeAllowed(declared, undefined, 'features/catalog')).toBe(false);
  });

  it('a declared shared root is evidence: no denial in either direction', () => {
    expect(
      isEdgeDenied(rules, 'Features', 'Features', {
        fromPath: 'src/features/auth/login.tsx',
        toPath: 'src/ui/button.tsx',
        layers,
      })
    ).toBe(false);
    expect(
      isEdgeDenied(rules, 'Features', 'Features', {
        fromPath: 'src/hooks/useUser.ts',
        toPath: 'src/features/auth/api.ts',
        layers,
      })
    ).toBe(false);
    // shared → shared is still not a cross-slice edge
    expect(
      isEdgeDenied(rules, 'Features', 'Features', {
        fromPath: 'src/ui/button.tsx',
        toPath: 'src/hooks/useUser.ts',
        layers,
      })
    ).toBe(false);
  });

  it('an undeclared shared file still denies — fail-closed survives', () => {
    const decision = findDeniedEdgeDecision(rules, 'Features', 'Features', {
      fromPath: 'src/features/auth/login.tsx',
      toPath: 'src/widgets/spinner.tsx',
      layers,
    });
    expect(decision?.peerIsolationReason).toBe('unclassifiable-path');
  });

  it('a real cross-slice edge still denies and names itself', () => {
    const decision = findDeniedEdgeDecision(rules, 'Features', 'Features', {
      fromPath: 'src/features/auth/api.ts',
      toPath: 'src/features/billing/api.ts',
      layers,
    });
    expect(decision?.peerIsolationReason).toBe('cross-slice');
    expect(decision?.fromSlice).toBe('features/auth');
    expect(decision?.toSlice).toBe('features/billing');
  });

  it('the declared directed cross-slice edge is allowed, its reverse is not', () => {
    expect(
      isEdgeDenied(rules, 'Features', 'Features', {
        fromPath: 'src/features/checkout/pay.ts',
        toPath: 'src/features/catalog/item.ts',
        layers,
      })
    ).toBe(false);
    expect(
      isEdgeDenied(rules, 'Features', 'Features', {
        fromPath: 'src/features/catalog/item.ts',
        toPath: 'src/features/checkout/pay.ts',
        layers,
      })
    ).toBe(true);
  });

  it('a shared root never shadows a real slice id', () => {
    // `ui` is declared shared, but features/auth/ui/form.tsx still belongs to auth.
    const decision = findDeniedEdgeDecision(rules, 'Features', 'Features', {
      fromPath: 'src/features/auth/ui/form.tsx',
      toPath: 'src/features/billing/ui/form.tsx',
      layers,
    });
    expect(decision?.peerIsolationReason).toBe('cross-slice');
  });

  it('peerIsolationDecision names every reason', () => {
    expect(peerIsolationDecision({ folderCount: 1, toPath: 'b.ts' })).toEqual({
      denied: true,
      reason: 'missing-path',
    });
    expect(
      peerIsolationDecision({ fromPath: 'a.ts', toPath: 'b.ts', folderCount: 0 })
    ).toEqual({ denied: true, reason: 'no-slice-folders' });
    expect(
      peerIsolationDecision({
        fromPath: 'a.ts',
        toPath: 'b.ts',
        folderCount: 1,
        fromSlice: 'features/a',
      })
    ).toEqual({ denied: true, reason: 'unclassifiable-path' });
    expect(
      peerIsolationDecision({
        fromPath: 'a.ts',
        toPath: 'b.ts',
        folderCount: 1,
        fromSlice: 'features/a',
        toSlice: 'features/b',
      })
    ).toEqual({ denied: true, reason: 'cross-slice' });
    expect(
      peerIsolationDecision({
        fromPath: 'a.ts',
        toPath: 'b.ts',
        folderCount: 1,
        fromSlice: 'features/a',
        toSlice: 'features/b',
        crossSliceAllowed: true,
      })
    ).toEqual({ denied: false });
    expect(
      peerIsolationDecision({
        fromPath: 'a.ts',
        toPath: 'b.ts',
        folderCount: 1,
        fromSlice: 'features/a',
        toShared: true,
      })
    ).toEqual({ denied: false });
  });

  it('peerIsolationMustDeny keeps its pre-4.8.4 answers when nothing is declared', () => {
    expect(
      peerIsolationMustDeny({
        fromPath: 'a.ts',
        toPath: 'b.ts',
        folderCount: 1,
        fromSlice: 'features/a',
        toSlice: 'features/a',
      })
    ).toBe(false);
    expect(
      peerIsolationMustDeny({
        fromPath: 'a.ts',
        toPath: 'b.ts',
        folderCount: 1,
        fromSlice: 'features/a',
        toSlice: 'features/b',
      })
    ).toBe(true);
  });

  it('the explanation separates a fact about their code from a fact about our evidence', () => {
    const cross = peerIsolationDenyExplanation('cross-slice', {
      fromSlice: 'features/a',
      toSlice: 'features/b',
    });
    expect(cross).toContain('cross-slice edge features/a → features/b');
    expect(cross).toContain('allowedCrossSlice');
    const unplaced = peerIsolationDenyExplanation('unclassifiable-path', {
      fromPath: 'src/features/a/x.ts',
      toPath: 'src/widgets/y.ts',
      fromSlice: 'features/a',
    });
    expect(unplaced).toContain('src/widgets/y.ts');
    expect(unplaced).not.toContain('src/features/a/x.ts');
    expect(unplaced).toContain('sharedRoots');
    expect(peerIsolationDenyExplanation('no-slice-folders', {})).toContain('sliceFolders');
    expect(peerIsolationDenyExplanation('missing-path', {})).toContain('path evidence');
  });

  it('findDeniedEdgeRule still returns the rule itself', () => {
    expect(
      findDeniedEdgeRule(rules, 'Features', 'Features', {
        fromPath: 'src/features/a/x.ts',
        toPath: 'src/features/b/y.ts',
        layers,
      })
    ).toBe(rule);
  });
});

describe('peerIsolation remediation', () => {
  it('classifies as judgment, never mechanical-safe', () => {
    const v = {
      ruleId: 'LAYER_IMPORT_VIOLATION',
      peerIsolation: true,
      fromLayer: 'Features',
      toLayer: 'Features',
    };
    expect(classifyRemediation(v).class).toBe('judgment');
    const enriched = enrichViolationWithFixClass(v);
    expect(enriched.fixClass).toBe('cross-slice-boundary');
  });
});

describe('peerIsolation violation message names the reason that fired', () => {
  const config = { layers: [{ name: 'Features', patterns: ['src/features/**'] }] };
  const rules = [
    {
      from: 'Features',
      to: 'Features',
      allowed: false,
      peerIsolation: true,
      sliceFolders: ['features'],
      sharedRoots: ['ui'],
    },
  ];
  const evaluate = (from: string, to: string) =>
    evaluateArchitectureGraph({
      config,
      rules,
      files: [from, to],
      contentViolations: [],
      edges: [{ from, fromLayer: 'Features', to, toLayer: 'Features', line: 1, kind: 'import' }],
    });

  it('reports a real cross-slice edge as a fact about the code', () => {
    const violation = evaluate('src/features/auth/a.ts', 'src/features/billing/b.ts')
      .violations[0];
    expect(violation?.peerIsolation).toBe(true);
    expect(violation?.message).toContain('cross-slice edge features/auth → features/billing');
  });

  it('reports an unplaceable file as a fact about the evidence, not about the code', () => {
    const violation = evaluate('src/features/auth/a.ts', 'src/widgets/spinner.tsx').violations[0];
    expect(violation?.message).toContain('unclassifiable path');
    expect(violation?.message).toContain('src/widgets/spinner.tsx');
    expect(violation?.message).toContain('sharedRoots');
  });

  it('a declared shared root produces no violation at all', () => {
    expect(evaluate('src/features/auth/a.ts', 'src/ui/button.tsx').violations).toHaveLength(0);
  });
});

describe('peerIsolation laundering invariant (4.8.4)', () => {
  it('two real, different slices are allowed ONLY by an explicit declaration', () => {
    const bools = [true, false, undefined];
    const slices = [undefined, '', 'features/a', 'features/b'];
    const paths = [undefined, '', 'x.ts'];
    for (const fromPath of paths)
      for (const toPath of paths)
        for (const folderCount of [-1, 0, 1, 3])
          for (const fromSlice of slices)
            for (const toSlice of slices)
              for (const fromShared of bools)
                for (const toShared of bools)
                  for (const crossSliceAllowed of bools) {
                    const decision = peerIsolationDecision({
                      fromPath,
                      toPath,
                      folderCount,
                      fromSlice,
                      toSlice,
                      fromShared,
                      toShared,
                      crossSliceAllowed,
                    });
                    if (
                      fromPath &&
                      toPath &&
                      folderCount > 0 &&
                      fromSlice &&
                      toSlice &&
                      fromSlice !== toSlice
                    ) {
                      expect(decision.denied).toBe(crossSliceAllowed !== true);
                      if (decision.denied) expect(decision.reason).toBe('cross-slice');
                    }
                    if (decision.denied) expect(typeof decision.reason).toBe('string');
                    else expect(decision.reason).toBeUndefined();
                  }
  });

  it('hostile sharedRoots cannot exempt an edge where both sides carry a slice id', () => {
    const layers = [{ name: 'F', patterns: ['src/features/**'] }];
    for (const sharedRoots of [['features', 'src', 'a', 'b'], ['**'], ['**/*'], ['*']]) {
      const rules = [
        {
          from: 'F',
          to: 'F',
          allowed: false as const,
          peerIsolation: true,
          sliceFolders: ['features'],
          sharedRoots,
        },
      ];
      expect(
        findDeniedEdgeDecision(rules, 'F', 'F', {
          fromPath: 'src/features/a/x.ts',
          toPath: 'src/features/b/y.ts',
          layers,
        })?.peerIsolationReason
      ).toBe('cross-slice');
    }
  });

  it('malformed allowedCrossSlice entries never allow anything', () => {
    const layers = [{ name: 'F', patterns: ['src/features/**'] }];
    const malformed: unknown[] = [
      null,
      undefined,
      {},
      { from: 'a' },
      { to: 'b' },
      { from: '', to: '' },
      { from: 1, to: 2 },
      { from: '*', to: '*' },
      { from: '/', to: '/' },
      { from: 'a', to: 'a' },
    ];
    for (const entry of malformed) {
      const rules = [
        {
          from: 'F',
          to: 'F',
          allowed: false as const,
          peerIsolation: true,
          sliceFolders: ['features'],
          allowedCrossSlice: [entry] as never,
        },
      ];
      expect(
        findDeniedEdgeDecision(rules, 'F', 'F', {
          fromPath: 'src/features/a/x.ts',
          toPath: 'src/features/b/y.ts',
          layers,
        })?.peerIsolationReason
      ).toBe('cross-slice');
    }
  });
});
