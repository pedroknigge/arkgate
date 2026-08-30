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
});
