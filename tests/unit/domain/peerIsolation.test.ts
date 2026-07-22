/**
 * P0 — peerIsolation: same-layer cross-slice edges denied; same-slice allowed.
 */
import { describe, it, expect } from 'vitest';
import {
  isEdgeDenied,
  findDeniedEdgeRule,
  sliceIdForPath,
  inferSliceFoldersFromPatterns,
} from '../../../src/domain/layerMatch';
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

describe('peerIsolation edge rules', () => {
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
