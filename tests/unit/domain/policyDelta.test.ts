import { describe, expect, it } from 'vitest';
import {
  analyzePolicyDelta,
  POLICY_DELTA_SCHEMA_VERSION,
  policyDeltaAcknowledgementMatches,
} from '../../../src/index';

const BASE_CONFIG = {
  include: ['src', 'packages'],
  exclude: ['src/vendor/**'],
  cyclePolicy: 'strict' as const,
  dynamicImportAllowlist: ['src/tooling/loader.ts'],
  layers: [
    {
      name: 'DomainModel',
      patterns: ['src/domain/**'],
      forbiddenGlobals: ['fetch'],
      optional: false,
    },
  ],
  rules: [
    {
      from: 'DomainModel',
      to: 'DomainModel',
      allowed: false,
      peerIsolation: true,
      sliceFolders: ['features'],
    },
  ],
  safety: {
    maxTsSuppressions: 0,
    maxAnyCasts: 0,
    allowInMemory: false,
    allowDisabledPeerIsolation: false,
  },
};

describe('T01 semantic policy delta', () => {
  it('classifies supported weakening mutations and fails closed without acknowledgement', () => {
    const candidate = structuredClone(BASE_CONFIG);
    candidate.include = ['src'];
    candidate.exclude.push('src/domain/legacy/**');
    candidate.dynamicImportAllowlist.push('src/domain/dynamic.ts');
    candidate.rules[0].peerIsolation = false;
    candidate.safety.maxAnyCasts = 2;
    candidate.safety.allowInMemory = true;

    const result = analyzePolicyDelta({ baseConfig: BASE_CONFIG, candidateConfig: candidate });

    expect(result.classification).toBe('weakening');
    expect(result.valid).toBe(false);
    expect(result.requiresAcknowledgement).toBe(true);
    expect(result.findings.map((finding) => finding.path)).toEqual(
      expect.arrayContaining([
        '$.include',
        '$.exclude',
        '$.dynamicImportAllowlist',
        '$.rules[DomainModel->DomainModel].peerIsolation',
        '$.safety.maxAnyCasts',
        '$.safety.allowInMemory',
      ])
    );
  });

  it('accepts only an exact acknowledgement bound to both policy hashes and finding ids', () => {
    const candidate = {
      ...structuredClone(BASE_CONFIG),
      dynamicImportAllowlist: [...BASE_CONFIG.dynamicImportAllowlist, 'src/domain/dynamic.ts'],
    };
    const first = analyzePolicyDelta({ baseConfig: BASE_CONFIG, candidateConfig: candidate });
    const acknowledgement = {
      schemaVersion: '1.0' as const,
      basePolicyHash: first.basePolicyHash,
      candidatePolicyHash: first.candidatePolicyHash,
      findingIds: first.blockingFindingIds,
      reason: 'Temporary dynamic loader while the static registry is migrated.',
    };

    expect(
      analyzePolicyDelta({
        baseConfig: BASE_CONFIG,
        candidateConfig: candidate,
        acknowledgement,
      })
    ).toMatchObject({ valid: true, acknowledged: true });

    expect(
      analyzePolicyDelta({
        baseConfig: BASE_CONFIG,
        candidateConfig: {
          ...candidate,
          dynamicImportAllowlist: [...candidate.dynamicImportAllowlist, 'src/other.ts'],
        },
        acknowledgement,
      })
    ).toMatchObject({ valid: false, acknowledged: false });
  });

  it('distinguishes strengthening, neutral metadata/reordering, and judgment-required changes', () => {
    const strengthening = structuredClone(BASE_CONFIG);
    strengthening.dynamicImportAllowlist = [];
    strengthening.layers[0].forbiddenGlobals.push('process');

    expect(
      analyzePolicyDelta({ baseConfig: BASE_CONFIG, candidateConfig: strengthening })
    ).toMatchObject({ classification: 'strengthening', valid: true });

    const neutral = {
      ...structuredClone(BASE_CONFIG),
      name: 'Renamed contract',
      layers: [
        { ...structuredClone(BASE_CONFIG.layers[0]), description: 'Pure business rules.' },
      ],
      rules: [{ ...structuredClone(BASE_CONFIG.rules[0]), message: 'Keep slices isolated.' }],
    };
    expect(analyzePolicyDelta({ baseConfig: BASE_CONFIG, candidateConfig: neutral })).toMatchObject({
      classification: 'neutral',
      valid: true,
      findings: [],
    });

    const judgment = structuredClone(BASE_CONFIG);
    judgment.layers[0].intentPrefixes = ['Domain.', 'Shared.'];
    expect(analyzePolicyDelta({ baseConfig: BASE_CONFIG, candidateConfig: judgment })).toMatchObject({
      classification: 'judgment-required',
      valid: false,
      requiresAcknowledgement: true,
    });
  });

  it('classifies a new allow edge as judgment-required and keeps hash-only ack valid', () => {
    const candidate = {
      ...structuredClone(BASE_CONFIG),
      rules: [
        ...structuredClone(BASE_CONFIG.rules),
        { from: 'DomainModel', to: 'Kernel', allowed: true },
      ],
    };
    const first = analyzePolicyDelta({ baseConfig: BASE_CONFIG, candidateConfig: candidate });
    expect(first).toMatchObject({
      classification: 'judgment-required',
      valid: false,
      requiresAcknowledgement: true,
    });
    expect(first.findings).toContainEqual(
      expect.objectContaining({
        id: 'judgment-required:$.rules[DomainModel->Kernel]:allow-added',
        path: '$.rules[DomainModel->Kernel]',
      })
    );

    expect(
      analyzePolicyDelta({
        baseConfig: BASE_CONFIG,
        candidateConfig: candidate,
        acknowledgement: {
          schemaVersion: '1.0',
          basePolicyHash: first.basePolicyHash,
          candidatePolicyHash: first.candidatePolicyHash,
          findingIds: first.blockingFindingIds,
          reason: 'Kernel may read DomainModel after the extract.',
        },
      })
    ).toMatchObject({ valid: true, acknowledged: true });
  });

  it('treats removed deny rules as weakening and invalid/unknown fields as fail-closed input', () => {
    expect(
      analyzePolicyDelta({
        baseConfig: BASE_CONFIG,
        candidateConfig: { ...structuredClone(BASE_CONFIG), rules: [] },
      })
    ).toMatchObject({
      classification: 'weakening',
      valid: false,
      findings: [expect.objectContaining({ path: '$.rules[DomainModel->DomainModel]' })],
    });

    expect(() =>
      analyzePolicyDelta({
        baseConfig: BASE_CONFIG,
        candidateConfig: { ...structuredClone(BASE_CONFIG), unknownPolicy: true },
      })
    ).toThrow(/unknown field/);
  });

  it.each([
    {
      name: 'governs an additional include root',
      candidate: { ...structuredClone(BASE_CONFIG), include: ['src', 'packages', 'apps'] },
      classification: 'strengthening',
      path: '$.include',
    },
    {
      name: 'removes a project exclusion',
      candidate: { ...structuredClone(BASE_CONFIG), exclude: [] },
      classification: 'strengthening',
      path: '$.exclude',
    },
    {
      name: 'governs generated source',
      candidate: { ...structuredClone(BASE_CONFIG), excludeGenerated: false },
      classification: 'strengthening',
      path: '$.excludeGenerated',
    },
    {
      name: 'changes the framework overlay',
      candidate: { ...structuredClone(BASE_CONFIG), frameworkOverlay: 'nestjs' },
      classification: 'judgment-required',
      path: '$.frameworkOverlay',
    },
    {
      name: 'weakens cycle enforcement',
      candidate: { ...structuredClone(BASE_CONFIG), cyclePolicy: 'soft' },
      classification: 'weakening',
      path: '$.cyclePolicy',
    },
    {
      name: 'adds a layer',
      candidate: {
        ...structuredClone(BASE_CONFIG),
        layers: [
          ...structuredClone(BASE_CONFIG.layers),
          { name: 'Kernel', patterns: ['src/kernel/**'] },
        ],
      },
      classification: 'judgment-required',
      path: '$.layers[Kernel]',
    },
    {
      name: 'removes a layer',
      candidate: { ...structuredClone(BASE_CONFIG), layers: [] },
      classification: 'weakening',
      path: '$.layers[DomainModel]',
    },
    {
      name: 'removes governed layer patterns',
      candidate: {
        ...structuredClone(BASE_CONFIG),
        layers: [{ ...structuredClone(BASE_CONFIG.layers[0]), patterns: ['src/domain/core/**'] }],
      },
      classification: 'weakening',
      path: '$.layers[DomainModel].patterns',
    },
    {
      name: 'adds a layer exclusion',
      candidate: {
        ...structuredClone(BASE_CONFIG),
        layers: [{ ...structuredClone(BASE_CONFIG.layers[0]), exclude: ['src/domain/legacy/**'] }],
      },
      classification: 'weakening',
      path: '$.layers[DomainModel].exclude',
    },
    {
      name: 'changes intent ownership',
      candidate: {
        ...structuredClone(BASE_CONFIG),
        layers: [{ ...structuredClone(BASE_CONFIG.layers[0]), intentPrefixes: ['Domain.'] }],
      },
      classification: 'judgment-required',
      path: '$.layers[DomainModel].intentPrefixes',
    },
    {
      // ADR 0009 D6: removing a LOWERABLE global ('fetch' → network) is classified
      // on the lowered capability space, so the finding lands on .capabilities.
      name: 'removes a forbidden global',
      candidate: {
        ...structuredClone(BASE_CONFIG),
        layers: [{ ...structuredClone(BASE_CONFIG.layers[0]), forbiddenGlobals: [] }],
      },
      classification: 'weakening',
      path: '$.layers[DomainModel].capabilities',
    },
    {
      name: 'allows direct infrastructure imports',
      candidate: {
        ...structuredClone(BASE_CONFIG),
        layers: [{ ...structuredClone(BASE_CONFIG.layers[0]), mayImportInfrastructure: true }],
      },
      classification: 'weakening',
      path: '$.layers[DomainModel].mayImportInfrastructure',
    },
    {
      name: 'makes a layer optional',
      candidate: {
        ...structuredClone(BASE_CONFIG),
        layers: [{ ...structuredClone(BASE_CONFIG.layers[0]), optional: true }],
      },
      classification: 'weakening',
      path: '$.layers[DomainModel].optional',
    },
    {
      name: 'changes slice identity to stars',
      candidate: {
        ...structuredClone(BASE_CONFIG),
        rules: [{ ...structuredClone(BASE_CONFIG.rules[0]), sliceIdentity: 'stars' as const }],
      },
      classification: 'judgment-required',
      path: '$.rules[DomainModel->DomainModel].sliceIdentity',
    },
    {
      name: 'changes slice ownership folders',
      candidate: {
        ...structuredClone(BASE_CONFIG),
        rules: [{ ...structuredClone(BASE_CONFIG.rules[0]), sliceFolders: ['modules'] }],
      },
      classification: 'judgment-required',
      path: '$.rules[DomainModel->DomainModel].sliceFolders',
    },
    {
      name: 'declares shared roots exempt from the peerIsolation unclassifiable denial',
      candidate: {
        ...structuredClone(BASE_CONFIG),
        rules: [{ ...structuredClone(BASE_CONFIG.rules[0]), sharedRoots: ['ui'] }],
      },
      classification: 'weakening',
      path: '$.rules[DomainModel->DomainModel].sharedRoots',
    },
    {
      name: 'declares a directed cross-slice edge',
      candidate: {
        ...structuredClone(BASE_CONFIG),
        rules: [
          {
            ...structuredClone(BASE_CONFIG.rules[0]),
            allowedCrossSlice: [{ from: 'checkout', to: 'catalog' }],
          },
        ],
      },
      classification: 'weakening',
      path: '$.rules[DomainModel->DomainModel].allowedCrossSlice',
    },
    {
      name: 'denies a shared root importing a slice',
      candidate: {
        ...structuredClone(BASE_CONFIG),
        rules: [{ ...structuredClone(BASE_CONFIG.rules[0]), sharedImportsSlice: 'deny' as const }],
      },
      classification: 'strengthening',
      path: '$.rules[DomainModel->DomainModel].sharedImportsSlice',
    },
    {
      name: 'raises the TypeScript suppression threshold',
      candidate: {
        ...structuredClone(BASE_CONFIG),
        safety: { ...structuredClone(BASE_CONFIG.safety), maxTsSuppressions: 1 },
      },
      classification: 'weakening',
      path: '$.safety.maxTsSuppressions',
    },
    {
      name: 'permits disabled peer isolation',
      candidate: {
        ...structuredClone(BASE_CONFIG),
        safety: { ...structuredClone(BASE_CONFIG.safety), allowDisabledPeerIsolation: true },
      },
      classification: 'weakening',
      path: '$.safety.allowDisabledPeerIsolation',
    },
  ])('$name', ({ candidate, classification, path }) => {
    const result = analyzePolicyDelta({ baseConfig: BASE_CONFIG, candidateConfig: candidate });

    expect(result.classification).toBe(classification);
    expect(result.findings).toContainEqual(expect.objectContaining({ path }));
    expect(result.valid).toBe(classification === 'strengthening');
  });

  it('treats omitted sliceIdentity and path as the same ids', () => {
    const candidate = {
      ...structuredClone(BASE_CONFIG),
      rules: [{ ...structuredClone(BASE_CONFIG.rules[0]), sliceIdentity: 'path' as const }],
    };
    const result = analyzePolicyDelta({ baseConfig: BASE_CONFIG, candidateConfig: candidate });
    expect(result.classification).toBe('neutral');
    expect(result.findings).toEqual([]);
  });

  it('deny-cross-parent is stronger than absent and weaker than deny', () => {
    const withMode = (mode: 'deny' | 'deny-cross-parent') => ({
      ...structuredClone(BASE_CONFIG),
      rules: [{ ...structuredClone(BASE_CONFIG.rules[0]), sharedImportsSlice: mode }],
    });
    const added = analyzePolicyDelta({
      baseConfig: BASE_CONFIG,
      candidateConfig: withMode('deny-cross-parent'),
    });
    expect(added.classification).toBe('strengthening');
    const loosened = analyzePolicyDelta({
      baseConfig: withMode('deny'),
      candidateConfig: withMode('deny-cross-parent'),
    });
    expect(loosened.classification).toBe('weakening');
    expect(loosened.findings[0]?.message).toContain('another universe');
    const removed = analyzePolicyDelta({
      baseConfig: withMode('deny-cross-parent'),
      candidateConfig: BASE_CONFIG,
    });
    expect(removed.classification).toBe('weakening');
    expect(removed.findings[0]?.message).toContain('through a shared root again');
  });

  it('removing sharedImportsSlice deny is a weakening', () => {
    const base = {
      ...structuredClone(BASE_CONFIG),
      rules: [{ ...structuredClone(BASE_CONFIG.rules[0]), sharedImportsSlice: 'deny' as const }],
    };
    const result = analyzePolicyDelta({ baseConfig: base, candidateConfig: BASE_CONFIG });
    expect(result.classification).toBe('weakening');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        path: '$.rules[DomainModel->DomainModel].sharedImportsSlice',
        classification: 'weakening',
      })
    );
  });

  it('preserves both directions of a replaced set and prioritizes the weakening', () => {
    const candidate = {
      ...structuredClone(BASE_CONFIG),
      dynamicImportAllowlist: ['src/tooling/other-loader.ts'],
    };

    const result = analyzePolicyDelta({ baseConfig: BASE_CONFIG, candidateConfig: candidate });

    expect(result.classification).toBe('weakening');
    expect(result.findings.filter(({ path }) => path === '$.dynamicImportAllowlist')).toHaveLength(2);
    expect(result.findings.map(({ classification }) => classification)).toEqual(
      expect.arrayContaining(['strengthening', 'weakening'])
    );
  });
});

describe('policyDeltaAcknowledgementMatches (DF04 pure helper)', () => {
  const expected = {
    basePolicyHash: 'base-aaa',
    candidatePolicyHash: 'cand-bbb',
    findingIds: ['weakening:$.include:removed', 'weakening:$.safety.maxAnyCasts:raised'],
  };

  it('accepts exact hashes with order-insensitive finding ids and non-empty reason', () => {
    expect(
      policyDeltaAcknowledgementMatches(
        {
          schemaVersion: POLICY_DELTA_SCHEMA_VERSION,
          basePolicyHash: expected.basePolicyHash,
          candidatePolicyHash: expected.candidatePolicyHash,
          findingIds: [...expected.findingIds].reverse(),
          reason: 'Temporary widen while loaders migrate.',
        },
        expected
      )
    ).toBe(true);
  });

  it('dedupes finding ids on both sides before compare', () => {
    expect(
      policyDeltaAcknowledgementMatches(
        {
          schemaVersion: POLICY_DELTA_SCHEMA_VERSION,
          basePolicyHash: expected.basePolicyHash,
          candidatePolicyHash: expected.candidatePolicyHash,
          findingIds: [
            expected.findingIds[0]!,
            expected.findingIds[1]!,
            expected.findingIds[0]!,
          ],
          reason: 'Duplicate ids in ack payload still bind the same set.',
        },
        {
          ...expected,
          findingIds: [...expected.findingIds, expected.findingIds[1]!],
        }
      )
    ).toBe(true);
  });

  it.each([
    ['undefined acknowledgement', undefined],
    [
      'wrong schema',
      {
        schemaVersion: '0.9' as typeof POLICY_DELTA_SCHEMA_VERSION,
        basePolicyHash: expected.basePolicyHash,
        candidatePolicyHash: expected.candidatePolicyHash,
        findingIds: expected.findingIds,
        reason: 'ok',
      },
    ],
    [
      'empty reason',
      {
        schemaVersion: POLICY_DELTA_SCHEMA_VERSION,
        basePolicyHash: expected.basePolicyHash,
        candidatePolicyHash: expected.candidatePolicyHash,
        findingIds: expected.findingIds,
        reason: '  \t  ',
      },
    ],
    [
      'base hash mismatch',
      {
        schemaVersion: POLICY_DELTA_SCHEMA_VERSION,
        basePolicyHash: 'other-base',
        candidatePolicyHash: expected.candidatePolicyHash,
        findingIds: expected.findingIds,
        reason: 'ok',
      },
    ],
    [
      'candidate hash mismatch',
      {
        schemaVersion: POLICY_DELTA_SCHEMA_VERSION,
        basePolicyHash: expected.basePolicyHash,
        candidatePolicyHash: 'other-cand',
        findingIds: expected.findingIds,
        reason: 'ok',
      },
    ],
    [
      'missing finding id',
      {
        schemaVersion: POLICY_DELTA_SCHEMA_VERSION,
        basePolicyHash: expected.basePolicyHash,
        candidatePolicyHash: expected.candidatePolicyHash,
        findingIds: [expected.findingIds[0]!],
        reason: 'ok',
      },
    ],
    [
      'extra finding id',
      {
        schemaVersion: POLICY_DELTA_SCHEMA_VERSION,
        basePolicyHash: expected.basePolicyHash,
        candidatePolicyHash: expected.candidatePolicyHash,
        findingIds: [...expected.findingIds, 'extra:id'],
        reason: 'ok',
      },
    ],
    [
      'same-length different finding ids',
      {
        schemaVersion: POLICY_DELTA_SCHEMA_VERSION,
        basePolicyHash: expected.basePolicyHash,
        candidatePolicyHash: expected.candidatePolicyHash,
        findingIds: [expected.findingIds[0]!, 'weakening:$.other:changed'],
        reason: 'ok',
      },
    ],
  ] as const)('fail-closes on %s', (_label, acknowledgement) => {
    expect(policyDeltaAcknowledgementMatches(acknowledgement, expected)).toBe(false);
  });

  it('fail-closes when hash/reason/findingIds types are not strings/array-of-strings', () => {
    const base = {
      schemaVersion: POLICY_DELTA_SCHEMA_VERSION,
      basePolicyHash: expected.basePolicyHash,
      candidatePolicyHash: expected.candidatePolicyHash,
      findingIds: expected.findingIds,
      reason: 'ok',
    };
    expect(
      policyDeltaAcknowledgementMatches(
        { ...base, basePolicyHash: 1 as unknown as string },
        expected
      )
    ).toBe(false);
    expect(
      policyDeltaAcknowledgementMatches(
        { ...base, candidatePolicyHash: null as unknown as string },
        expected
      )
    ).toBe(false);
    expect(
      policyDeltaAcknowledgementMatches(
        { ...base, reason: 0 as unknown as string },
        expected
      )
    ).toBe(false);
    expect(
      policyDeltaAcknowledgementMatches(
        { ...base, findingIds: 'not-array' as unknown as string[] },
        expected
      )
    ).toBe(false);
    expect(
      policyDeltaAcknowledgementMatches(
        { ...base, findingIds: ['ok', 2 as unknown as string] },
        expected
      )
    ).toBe(false);
  });

  it('classifies a child wall as strengthening, advisory as judgment, and removal as weakening', () => {
    const child = {
      sliceFolders: ['lib/features/*/*'],
      sliceIdentity: 'stars' as const,
      commonFolders: ['domain'],
      siblings: 'deny' as const,
      parentMayImportChild: false,
    };
    const withChild = {
      ...structuredClone(BASE_CONFIG),
      rules: [{ ...structuredClone(BASE_CONFIG.rules[0]), childSlices: child }],
    };
    const added = analyzePolicyDelta({ baseConfig: BASE_CONFIG, candidateConfig: withChild });
    expect(added.findings).toContainEqual(
      expect.objectContaining({
        path: '$.rules[DomainModel->DomainModel].childSlices',
        classification: 'strengthening',
      })
    );
    const advisory = analyzePolicyDelta({
      baseConfig: BASE_CONFIG,
      candidateConfig: {
        ...structuredClone(BASE_CONFIG),
        rules: [
          {
            ...structuredClone(BASE_CONFIG.rules[0]),
            childSlices: { ...child, siblings: 'advisory' as const },
          },
        ],
      },
    });
    expect(advisory.findings).toContainEqual(
      expect.objectContaining({
        path: '$.rules[DomainModel->DomainModel].childSlices',
        classification: 'judgment-required',
      })
    );
    const removed = analyzePolicyDelta({ baseConfig: withChild, candidateConfig: BASE_CONFIG });
    expect(removed.findings).toContainEqual(
      expect.objectContaining({
        path: '$.rules[DomainModel->DomainModel].childSlices',
        classification: 'weakening',
      })
    );
  });

  it('classifies child slice allowances, including a wildcard that widens a literal', () => {
    const child = { sliceFolders: ['lib/features/*/*'] };
    const withEdges = (edges: { from: string; to: string }[] | undefined) => ({
      ...structuredClone(BASE_CONFIG),
      rules: [
        {
          ...structuredClone(BASE_CONFIG.rules[0]),
          childSlices: { ...child, ...(edges ? { allowedCrossSlice: edges } : {}) },
        },
      ],
    });
    const literal = [{ from: 'features/projects/rfi', to: 'features/projects/d2d-item' }];
    const widened = [{ from: 'features/projects/*', to: 'features/projects/d2d-item' }];
    const other = [{ from: 'features/operations/dispatch', to: 'features/operations/fleet' }];
    const none = withEdges(undefined);
    const exact = withEdges(literal);
    const star = withEdges(widened);
    const added = analyzePolicyDelta({ baseConfig: none, candidateConfig: exact });
    expect(added.findings).toContainEqual(
      expect.objectContaining({
        classification: 'weakening',
        message: 'Sibling crossings inside a universe are now allowed by declaration.',
        path: '$.rules[DomainModel->DomainModel].childSlices.allowedCrossSlice',
      })
    );
    const removed = analyzePolicyDelta({ baseConfig: exact, candidateConfig: none });
    expect(removed.findings).toContainEqual(
      expect.objectContaining({
        classification: 'strengthening',
        message: 'Declared sibling crossings inside a universe deny again.',
      })
    );
    const widen = analyzePolicyDelta({ baseConfig: exact, candidateConfig: star });
    expect(widen.findings).toContainEqual(
      expect.objectContaining({
        classification: 'weakening',
        message: 'A wildcard widened a declared sibling allowance.',
      })
    );
    const both = analyzePolicyDelta({ baseConfig: exact, candidateConfig: withEdges(other) });
    expect(both.findings).toContainEqual(
      expect.objectContaining({
        classification: 'judgment-required',
        path: '$.rules[DomainModel->DomainModel].childSlices.allowedCrossSlice',
      })
    );
    const narrowed = analyzePolicyDelta({ baseConfig: star, candidateConfig: exact });
    expect(narrowed.findings).toContainEqual(
      expect.objectContaining({ classification: 'judgment-required' })
    );
  });

  it('tightens an enforce-list addition and loosens a removal while default stays advisory', () => {
    const child = {
      sliceFolders: ['lib/features/*/*'],
      siblings: { default: 'advisory' as const, enforce: ['features/projects/rfi'] },
    };
    const base = {
      ...structuredClone(BASE_CONFIG),
      rules: [{ ...structuredClone(BASE_CONFIG.rules[0]), childSlices: { ...child, siblings: 'advisory' as const } }],
    };
    const enforced = {
      ...structuredClone(BASE_CONFIG),
      rules: [{ ...structuredClone(BASE_CONFIG.rules[0]), childSlices: child }],
    };
    const added = analyzePolicyDelta({ baseConfig: base, candidateConfig: enforced });
    expect(added.findings).toContainEqual(
      expect.objectContaining({
        classification: 'strengthening',
        message: 'Sibling crossings from these subtrees are now errors.',
        path: '$.rules[DomainModel->DomainModel].childSlices.siblings.enforce',
      })
    );
    const slashOnly = analyzePolicyDelta({
      baseConfig: enforced,
      candidateConfig: {
        ...structuredClone(BASE_CONFIG),
        rules: [
          {
            ...structuredClone(BASE_CONFIG.rules[0]),
            childSlices: {
              ...child,
              siblings: { default: 'advisory' as const, enforce: ['features/projects/rfi/'] },
            },
          },
        ],
      },
    });
    expect(slashOnly.findings.filter((finding) => finding.path.includes('siblings'))).toEqual([]);
    const removed = analyzePolicyDelta({ baseConfig: enforced, candidateConfig: base });
    expect(removed.findings).toContainEqual(
      expect.objectContaining({
        classification: 'weakening',
        message: 'Sibling crossings from these subtrees are advisory again.',
      })
    );
    const both = analyzePolicyDelta({
      baseConfig: enforced,
      candidateConfig: {
        ...structuredClone(BASE_CONFIG),
        rules: [
          {
            ...structuredClone(BASE_CONFIG.rules[0]),
            childSlices: {
              ...child,
              siblings: { default: 'advisory' as const, enforce: ['features/management/eos'] },
            },
          },
        ],
      },
    });
    expect(both.findings).toContainEqual(
      expect.objectContaining({
        classification: 'judgment-required',
        message: 'Enforced sibling subtrees were added and removed in the same change.',
      })
    );
    const toDeny = analyzePolicyDelta({
      baseConfig: enforced,
      candidateConfig: {
        ...structuredClone(BASE_CONFIG),
        rules: [
          {
            ...structuredClone(BASE_CONFIG.rules[0]),
            childSlices: { ...child, siblings: { default: 'deny' as const } },
          },
        ],
      },
    });
    expect(toDeny.findings).toContainEqual(
      expect.objectContaining({
        classification: 'strengthening',
        message: 'Sibling crossings inside a universe are now denied.',
      })
    );
    expect(
      toDeny.findings.some((finding) => finding.id.includes('child-slices-siblings-enforce'))
    ).toBe(false);
    const partial = analyzePolicyDelta({
      baseConfig: {
        ...structuredClone(BASE_CONFIG),
        rules: [
          {
            ...structuredClone(BASE_CONFIG.rules[0]),
            childSlices: { ...child, siblings: 'deny' as const },
          },
        ],
      },
      candidateConfig: enforced,
    });
    expect(partial.findings).toContainEqual(
      expect.objectContaining({
        classification: 'weakening',
        message: 'Sibling crossings outside the enforce list are now advisory.',
      })
    );
    const inert = analyzePolicyDelta({
      baseConfig: {
        ...structuredClone(BASE_CONFIG),
        rules: [
          {
            ...structuredClone(BASE_CONFIG.rules[0]),
            childSlices: { sliceFolders: ['lib/features/*/*'], siblings: 'deny' as const },
          },
        ],
      },
      candidateConfig: {
        ...structuredClone(BASE_CONFIG),
        rules: [
          {
            ...structuredClone(BASE_CONFIG.rules[0]),
            childSlices: {
              sliceFolders: ['lib/features/*/*'],
              siblings: { default: 'deny' as const, enforce: ['features/projects/rfi'] },
            },
          },
        ],
      },
    });
    expect(inert.findings.filter((finding) => finding.path.includes('siblings'))).toEqual([]);
  });
});
