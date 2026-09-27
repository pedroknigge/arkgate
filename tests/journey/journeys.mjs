/**
 * Fixture name → CLI steps. Data only.
 *
 * `--json` reads coverage from `bin/lib/analysis-engine.mjs`.
 * `--doctor` reads it from `bin/lib/invariant-coverage.mjs`.
 * One step per generated copy, so a half-regenerated fix stays red.
 *
 * atlasgrid cases: `expect: 'pass'` is the compat regression (today's universe
 * wall). `expect: 'fail'` records a claim that is still red, the same way
 * INV-REFUND-WINDOW stays visible in the ledgerline golden. The journey stays
 * green while the claim is unmet. When the claim starts holding, status becomes
 * `unexpected-pass` and the journey fails until that PR flips `expect` to `pass`.
 *
 * Planned, not cases yet (#326):
 * PR4 wildcards — features/projects star to features/projects/d2d-item clears those siblings;
 *   features star-star to features/management/eos stays cross-parent, plus a config warning.
 * PR5 aliases — `lib/compliance/**` → `features/projects/compliance`; its import into
 *   management reports cross-parent.
 * PR6 doctor — a move card for `rfi-repository.ts` (one importer); none for
 *   `catalog-repository.ts` (two importers).
 */
const crossParentEdges = Object.freeze([
  Object.freeze({
    from: 'management',
    to: 'external',
    file: 'src/components/features/management/eos/eos-screen.tsx',
    target: 'src/lib/features/external/portal/portal-client.ts',
  }),
  Object.freeze({
    from: 'external',
    to: 'operations',
    file: 'src/lib/features/external/vendors/vendor-sync.ts',
    target: 'src/lib/repositories/features/operations/fleet/fleet-repository.ts',
  }),
  Object.freeze({
    from: 'management',
    to: 'projects',
    file: 'src/lib/features/management/budget/budget-lines.ts',
    target: 'src/lib/features/projects/d2d-item/d2d-item.ts',
  }),
  Object.freeze({
    from: 'projects',
    to: 'management',
    file: 'src/lib/features/projects/rfi/load-rfi.ts',
    target: 'src/lib/features/management/eos/eos-summary.ts',
  }),
  Object.freeze({
    from: 'operations',
    to: 'projects',
    file: 'src/lib/repositories/features/operations/dispatch/dispatch-repository.ts',
    target: 'src/lib/features/projects/scm/scm-board.ts',
  }),
]);

const crossSiblingEdges = Object.freeze([
  Object.freeze({
    file: 'src/lib/features/projects/rfi/load-rfi.ts',
    target: 'src/lib/features/projects/scm/scm-board.ts',
  }),
  Object.freeze({
    file: 'src/components/features/operations/dispatch/dispatch-screen.tsx',
    target: 'src/components/features/operations/fleet/fleet-screen.tsx',
  }),
  Object.freeze({
    file: 'src/lib/repositories/features/management/eos/eos-repository.ts',
    target: 'src/lib/repositories/features/management/people/people-repository.ts',
  }),
]);

const sharedImportGroups = Object.freeze([
  Object.freeze({
    fromLayer: 'Application',
    toLayer: 'Application',
    edges: Object.freeze([
      Object.freeze({
        file: 'src/lib/shared/format.ts',
        target: 'src/lib/features/operations/dispatch/dispatch-board.ts',
        toSlice: 'features/operations',
      }),
      Object.freeze({
        file: 'src/lib/shared/ids.ts',
        target: 'src/lib/features/external/portal/portal-client.ts',
        toSlice: 'features/external',
      }),
      Object.freeze({
        file: 'src/lib/shared/labels.ts',
        target: 'src/lib/features/projects/scm/scm-board.ts',
        toSlice: 'features/projects',
      }),
    ]),
  }),
  Object.freeze({
    fromLayer: 'Application',
    toLayer: 'Persistence',
    edges: Object.freeze([
      Object.freeze({
        file: 'src/lib/shared/clock.ts',
        target: 'src/lib/repositories/features/management/people/people-repository.ts',
        toSlice: 'features/management',
      }),
    ]),
  }),
  Object.freeze({
    fromLayer: 'Presentation',
    toLayer: 'Presentation',
    edges: Object.freeze([
      Object.freeze({
        file: 'src/components/ui/button.tsx',
        target: 'src/components/features/projects/rfi/rfi-status.tsx',
        toSlice: 'features/projects',
      }),
      Object.freeze({
        file: 'src/components/ui/dialog.tsx',
        target: 'src/components/features/management/eos/eos-screen.tsx',
        toSlice: 'features/management',
      }),
    ]),
  }),
]);

const doctorPairs = Object.freeze([
  Object.freeze({ from: 'external', to: 'operations', count: 1 }),
  Object.freeze({ from: 'management', to: 'external', count: 1 }),
  Object.freeze({ from: 'management', to: 'projects', count: 1 }),
  Object.freeze({ from: 'operations', to: 'projects', count: 1 }),
  Object.freeze({ from: 'projects', to: 'management', count: 1 }),
]);

export const JOURNEYS = Object.freeze({
  ledgerline: Object.freeze([
    Object.freeze(['ark-check', '--json', '--no-cache']),
    Object.freeze(['ark-check', '--doctor', '--json', '--no-cache']),
  ]),
  atlasgrid: Object.freeze([
    Object.freeze(['ark-check', '--json', '--no-cache']),
    Object.freeze(['ark-check', '--doctor', '--json', '--no-cache']),
    Object.freeze(['ark-check', '--json', '--no-cache', '--config', 'ark.config.child-slices.json']),
    Object.freeze(['ark-check', '--doctor', '--json', '--no-cache', '--config', 'ark.config.child-slices.json']),
    Object.freeze(['ark-check', '--json', '--no-cache', '--config', 'ark.config.deny-cross-parent.json']),
    Object.freeze(['ark-check', '--json', '--no-cache', '--config', 'ark.config.subtree.json']),
  ]),
});

export const JOURNEY_CASES = Object.freeze({
  atlasgrid: Object.freeze([
    Object.freeze({
      id: 'compat-universe-wall',
      owner: '#326 PR0',
      expect: 'pass',
      kind: 'compat-universe-wall',
      note: "Today's universe wall: 5 cross-slice LAYER_IMPORT_VIOLATION findings and grouped SHARED_IMPORTS_SLICE warnings.",
      edges: crossParentEdges,
      warningGroups: sharedImportGroups,
    }),
    Object.freeze({
      id: 'pr1-cross-parent-slice',
      owner: '#326 PR1',
      expect: 'pass',
      kind: 'pr1-cross-parent-slice',
      note: 'Owned by #326 PR1. childSlices reports CROSS_PARENT_SLICE on these five directed pairs.',
      edges: crossParentEdges,
      want: Object.freeze({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        reasonId: 'CROSS_PARENT_SLICE',
        severity: 'error',
        count: 5,
      }),
    }),
    Object.freeze({
      id: 'pr1-cross-sibling-slice',
      owner: '#326 PR1',
      expect: 'pass',
      kind: 'pr1-cross-sibling-slice',
      note: 'Owned by #326 PR1. The child wall denies these three sibling crossings (error when siblings is deny).',
      edges: crossSiblingEdges,
      want: Object.freeze({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        reasonId: 'CROSS_SIBLING_SLICE',
        severity: 'error',
        count: 3,
      }),
    }),
    Object.freeze({
      id: 'pr1-child-imports-own-common',
      owner: '#326 PR1',
      expect: 'pass',
      kind: 'pr1-child-imports-own-common',
      note: 'Owned by #326 PR1. A feature may import its own flat repository and its universe domain/. The child wall leaves those edges clean.',
      flatRepo: Object.freeze({
        file: 'src/lib/features/projects/rfi/load-rfi.ts',
        target: 'src/lib/repositories/features/projects/rfi-repository.ts',
      }),
      domain: Object.freeze({
        file: 'src/lib/features/projects/rfi/load-rfi.ts',
        target: 'src/lib/features/projects/domain/project-codes.ts',
      }),
      want: Object.freeze({
        flatRepoFindings: 0,
        domainFindings: 0,
        crossParent: 5,
      }),
    }),
    Object.freeze({
      id: 'pr1-common-imports-child',
      owner: '#326 PR1',
      expect: 'pass',
      kind: 'pr1-common-imports-child',
      note: 'Owned by #326 PR1. Universe common must not import a child feature. That edge is denied.',
      edge: Object.freeze({
        file: 'src/lib/features/projects/domain/project-codes.ts',
        target: 'src/lib/features/projects/rfi/rfi-intake.ts',
      }),
      want: Object.freeze({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        severity: 'error',
        findings: 1,
      }),
    }),
    Object.freeze({
      id: 'pr1-doctor-slice-counts',
      owner: '#326 PR1',
      expect: 'pass',
      kind: 'pr1-doctor-slice-counts',
      note: 'Owned by #326 PR1. Doctor slices counts per level, and per directed universe pair only for pairs that occur.',
      want: Object.freeze({
        crossParent: 5,
        crossSibling: 3,
        pairs: doctorPairs,
      }),
    }),
    Object.freeze({
      id: 'pr2-laundering',
      owner: '#326 PR2',
      expect: 'pass',
      kind: 'pr2-laundering',
      note: 'Owned by #326 PR2. deny-cross-parent reports two cross-universe paths through a shared root and leaves the same-universe path through labels.ts clean.',
      edges: Object.freeze([
        Object.freeze({
          file: 'src/lib/features/management/eos/eos-summary.ts',
          target: 'src/lib/features/operations/dispatch/dispatch-board.ts',
        }),
        Object.freeze({
          file: 'src/components/features/projects/rfi/rfi-screen.tsx',
          target: 'src/components/features/management/eos/eos-screen.tsx',
        }),
      ]),
      sameUniverse: Object.freeze({
        file: 'src/lib/features/projects/rfi/load-rfi.ts',
        target: 'src/lib/features/projects/scm/scm-board.ts',
      }),
      want: Object.freeze({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        reasonId: 'CROSS_PARENT_VIA_SHARED',
        severity: 'error',
        count: 2,
        sameUniverse: 0,
      }),
    }),
    Object.freeze({
      id: 'pr3-subtree',
      owner: '#326 PR3',
      expect: 'fail',
      kind: 'pr3-subtree',
      note: 'Owned by #326 PR3. A sibling crossing from an enforced feature is an error. Crossings from features outside the enforce list stay warnings.',
      enforced: Object.freeze([
        Object.freeze({
          file: 'src/lib/features/projects/rfi/load-rfi.ts',
          target: 'src/lib/features/projects/scm/scm-board.ts',
        }),
      ]),
      advisory: Object.freeze([
        Object.freeze({
          file: 'src/components/features/operations/dispatch/dispatch-screen.tsx',
          target: 'src/components/features/operations/fleet/fleet-screen.tsx',
        }),
        Object.freeze({
          file: 'src/lib/repositories/features/management/eos/eos-repository.ts',
          target: 'src/lib/repositories/features/management/people/people-repository.ts',
        }),
      ]),
      want: Object.freeze({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        reasonId: 'CROSS_SIBLING_SLICE',
        enforcedErrors: 1,
        advisoryWarnings: 2,
        crossParent: 5,
      }),
    }),
  ]),
});
