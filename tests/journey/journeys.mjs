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
 * #326 PR6 is `pr6-doctor`: a move card for `rfi-repository.ts` (one importer);
 * none for `catalog-repository.ts` (two importers). The destination check must
 * agree with the walls under `sliceIdentity: "stars"`.
 *
 * 4.8.23 follow-ups: `335-stop-at` (a composition root under sharedRoots stops the
 * deny-cross-parent walk), `336-legacy-baseline` (a baseline frozen before the
 * child wall keeps advisory siblings advisory), `337-wall-messages` (inner-wall
 * findings never reuse the universe rule message), `338-version-silent` (no
 * CONFIG_CHILD_SLICES_VERSION without a stale pin).
 *
 * #341 is `slicelaw`: co-located feature rules and a framework route.
 * `expect: 'pass'` is today's string catalog, and the unpinned app route still
 * counting as an owed move. The seven #341 claims expect pass.
 * The journey stays green while a claim is unmet. When it starts holding,
 * status becomes `unexpected-pass` until that PR flips `expect` to `pass`.
 *
 * #343 is `orderdesk`: enforced `writes-via-aggregate` on tagged SQL in use cases.
 * Probe A is caught today (`expect: 'pass'`). Probes B–G are still invisible
 * (`expect: 'fail'` — the claim "this file is flagged" is unmet). The four
 * negative shapes stay unflagged (`expect: 'pass'`).
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
    Object.freeze(['ark-check', '--json', '--no-cache', '--config', 'ark.config.wildcards.json']),
    Object.freeze(['ark-check', '--json', '--no-cache', '--config', 'ark.config.wildcards-bare.json']),
    Object.freeze(['ark-check', '--json', '--no-cache', '--config', 'ark.config.aliases.json']),
    Object.freeze(['ark-check', '--doctor', '--json', '--no-cache', '--config', 'ark.config.aliases.json']),
    Object.freeze(['ark-check', '--json', '--no-cache', '--config', 'ark.config.aliases-target.json']),
    Object.freeze(['ark-check', '--json', '--no-cache', '--config', 'ark.config.aliases-overlap.json']),
    Object.freeze(['ark-check', '--json', '--no-cache', '--config', 'ark.config.doctor-pilot.json']),
    Object.freeze(['ark-check', '--doctor', '--json', '--no-cache', '--config', 'ark.config.doctor-pilot.json']),
    Object.freeze(['ark-check', '--json', '--no-cache', '--config', 'ark.config.stop-at.json']),
    Object.freeze([
      'ark-check',
      '--json',
      '--no-cache',
      '--config',
      'ark.config.subtree.json',
      '--baseline',
      'baseline.legacy.json',
    ]),
    Object.freeze(['ark-check', '--json', '--no-cache', '--config', 'ark.config.wall-messages.json']),
  ]),
  slicelaw: Object.freeze([
    Object.freeze(['ark-check', '--json', '--no-cache']),
    Object.freeze(['ark-check', '--doctor', '--json', '--no-cache']),
    Object.freeze(['ark-check', '--json', '--no-cache', '--config', 'ark.config.array.json']),
    Object.freeze(['ark-check', '--doctor', '--json', '--no-cache', '--config', 'ark.config.array.json']),
    Object.freeze(['ark-check', '--json', '--no-cache', '--config', 'ark.config.duplicate.json']),
    Object.freeze(['ark-check', '--json', '--no-cache', '--config', 'ark.config.discovery.json']),
    Object.freeze(['ark-check', '--doctor', '--json', '--no-cache', '--config', 'ark.config.discovery.json']),
    Object.freeze(['ark-check', '--json', '--no-cache', '--config', 'ark.config.escape.json']),
    Object.freeze(['ark-check', '--json', '--no-cache', '--config', 'ark.config.pinned-only.json']),
    Object.freeze(['ark-check', '--doctor', '--json', '--no-cache', '--config', 'ark.config.pinned-only.json']),
    Object.freeze(['ark-check', '--json', '--no-cache', '--config', 'ark.config.pinned.json']),
    Object.freeze(['ark-check', '--doctor', '--json', '--no-cache', '--config', 'ark.config.pinned.json']),
  ]),
  orderdesk: Object.freeze([Object.freeze(['ark-check', '--json', '--no-cache'])]),
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
      expect: 'pass',
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
    Object.freeze({
      id: 'pr4-wildcards',
      owner: '#326 PR4',
      expect: 'pass',
      kind: 'pr4-wildcards',
      note: 'Owned by #326 PR4. features/projects/* to features/projects/d2d-item clears those sibling crossings. features/*/* to features/management/eos stays CROSS_PARENT_SLICE, and the config warns that the entry cannot cross the universe wall. A literal * on the universe allowedCrossSlice stays inert. A bare name is rejected at config load.',
      cleared: Object.freeze([
        Object.freeze({
          file: 'src/lib/features/projects/scm/scm-uses-d2d.ts',
          target: 'src/lib/features/projects/d2d-item/d2d-item.ts',
        }),
        Object.freeze({
          file: 'src/components/features/projects/rfi/rfi-uses-d2d.tsx',
          target: 'src/lib/features/projects/d2d-item/d2d-item.ts',
        }),
      ]),
      keptSiblings: crossSiblingEdges,
      crossParent: Object.freeze({
        file: 'src/lib/features/projects/rfi/load-rfi.ts',
        target: 'src/lib/features/management/eos/eos-summary.ts',
      }),
      want: Object.freeze({
        clearedErrors: 0,
        keptSiblingErrors: 3,
        siblingCount: 3,
        crossParentCount: 5,
        crossParentReason: 'CROSS_PARENT_SLICE',
        severity: 'error',
        spanWarnings: 1,
        spanRuleId: 'CONFIG_CHILD_SLICE_CROSS_UNIVERSE',
        bareSnippet: 'ambiguous across universes',
      }),
    }),
    Object.freeze({
      id: 'pr5-aliases',
      owner: '#326 PR5',
      expect: 'pass',
      kind: 'pr5-aliases',
      note: 'Owned by #326 PR5. lib/compliance/** aliased to features/projects/compliance reports CROSS_PARENT_SLICE into management. The same file may import its own child and its universe common. Doctor lists the alias as an owed move. A target that is not a child of an existing universe is rejected. An alias that overlaps a slice folder is rejected. A config without sliceAliases stays the child-slices wall.',
      crossParent: Object.freeze({
        file: 'src/lib/compliance/uses-management.ts',
        target: 'src/lib/features/management/eos/eos-summary.ts',
      }),
      sameChild: Object.freeze({
        file: 'src/lib/compliance/uses-management.ts',
        target: 'src/lib/compliance/retention.ts',
      }),
      common: Object.freeze({
        file: 'src/lib/compliance/uses-management.ts',
        target: 'src/lib/features/projects/domain/project-codes.ts',
      }),
      want: Object.freeze({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        crossParentReason: 'CROSS_PARENT_SLICE',
        severity: 'error',
        crossParentCount: 6,
        siblingCount: 3,
        sameChildFindings: 0,
        commonFindings: 0,
        target: 'features/projects/compliance',
        destination: 'src/lib/features/projects/compliance',
        debtSnippet: 'owed move',
        notFinishedSnippet: 'not finished',
        files: Object.freeze([
          'src/lib/compliance/audit-note.ts',
          'src/lib/compliance/hold.ts',
          'src/lib/compliance/policy.ts',
          'src/lib/compliance/retention.ts',
          'src/lib/compliance/uses-management.ts',
        ]),
        badTargetSnippet: 'child of a universe shape',
        overlapSnippet: 'overlaps a slice folder',
        plainCrossParent: 5,
        plainSibling: 3,
      }),
    }),
    Object.freeze({
      id: 'pr6-doctor',
      owner: '#326 PR6',
      expect: 'pass',
      kind: 'pr6-doctor',
      note: 'Owned by #326 PR6. Doctor shows a move card for rfi-repository.ts: one importer, features/projects/rfi, destination inside that child, Persistence layer unchanged. catalog-repository.ts has two importers and has no card. The destination check uses the same slice identity as the walls, so this move does not keep the slice and the check agrees with the wall. ark-check findings stay the child-slices wall.',
      want: Object.freeze({
        moveCount: 1,
        catalogCards: 0,
        file: 'src/lib/repositories/features/projects/rfi-repository.ts',
        importer: 'features/projects/rfi',
        destination: 'src/lib/repositories/features/projects/rfi',
        layer: 'Persistence',
        keepsLayer: true,
        keepsSlice: false,
        agreesWithWall: true,
        crossParent: 5,
        crossSibling: 3,
        pilotSource: 'flat-parent',
        evidenceSnippet: 'suggestion',
      }),
    }),
    Object.freeze({
      id: '335-stop-at',
      owner: '#335',
      expect: 'pass',
      kind: 'stop-at',
      note: 'Owned by #335. rfi-deps.ts reaches management and operations only through the composition root lib/shared/composition/register-all.ts. With sharedImportsSlice { mode: "deny-cross-parent", stopAt } that path is not a crossing. The two laundering paths of pr2 stay, each with its shared hop in via. The direct shared-root hop from the composition root stays a SHARED_IMPORTS_SLICE warning.',
      stopFile: 'src/lib/features/projects/rfi/rfi-deps.ts',
      compositionRoot: 'src/lib/shared/composition/register-all.ts',
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
      want: Object.freeze({
        reasonId: 'CROSS_PARENT_VIA_SHARED',
        count: 2,
        fromStopFile: 0,
        rootWarnings: 2,
      }),
    }),
    Object.freeze({
      id: '336-legacy-baseline',
      owner: '#336',
      expect: 'pass',
      kind: 'legacy-baseline',
      note: 'Owned by #336. baseline.legacy.json freezes every non-sibling finding of the subtree wall and no advisory sibling. Advisory is advisory on day 1: the two advisory crossings stay warnings and the check passes.',
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
      want: Object.freeze({ ok: true, advisoryWarnings: 2, errors: 0 }),
    }),
    Object.freeze({
      id: '337-wall-messages',
      owner: '#337',
      expect: 'pass',
      kind: 'wall-messages',
      note: 'Owned by #337. Every rule sets a universe message; Presentation and Application also set childSlices.message. CROSS_PARENT_SLICE rows start with the universe text. Sibling and common-to-child rows never contain it: they use the inner text, or the ArkGate default where the rule has no inner text (Persistence).',
      universeText: 'Universe wall (atlasgrid): do not import another universe.',
      innerText: 'Inner wall (atlasgrid): import universe common, not a sibling feature.',
      commonEdge: Object.freeze({
        file: 'src/lib/features/projects/domain/project-codes.ts',
        target: 'src/lib/features/projects/rfi/rfi-intake.ts',
      }),
      defaultRow: Object.freeze({
        file: 'src/lib/repositories/features/management/eos/eos-repository.ts',
        prefix: 'Persistence must not import another slice of Persistence',
      }),
      want: Object.freeze({ crossParent: 5, crossParentWithUniverseText: 5, innerRows: 4, innerWithUniverseText: 0 }),
    }),
    Object.freeze({
      id: '338-version-silent',
      owner: '#338',
      expect: 'pass',
      kind: 'version-silent',
      note: 'Owned by #338. The fixture pins no older arkgate (the installed copy is the candidate), so no childSlices step warns CONFIG_CHILD_SLICES_VERSION.',
      want: Object.freeze({ versionWarnings: 0 }),
    }),
  ]),
  slicelaw: Object.freeze([
    Object.freeze({
      id: 'compat-string-catalog',
      owner: '#341',
      expect: 'pass',
      kind: 'slicelaw-compat',
      note: 'Today\'s string arkRules path still loads INV-UNIVERSE-CODES only. The second central file and the slice file are not in the catalog. arkrules/orphan.json stays an unreferenced top-level file.',
      want: Object.freeze({
        universeId: 'INV-UNIVERSE-CODES',
        sharedId: 'INV-SHARED-CODES',
        sliceId: 'features/projects/rfi#rfi-intake',
        orphan: 'arkrules/orphan.json',
      }),
    }),
    Object.freeze({
      id: 'unpinned-route-is-debt',
      owner: '#341',
      expect: 'pass',
      kind: 'slicelaw-unpinned-debt',
      note: 'Without pinned, the app route is an owed move and slice-alias-debt stays set. compliance/hold.ts is an owed move to features/projects/compliance.',
      want: Object.freeze({
        debt: true,
        route: 'src/app/projects/rfi/page.tsx',
        routeDestination: 'src/features/projects/rfi',
        compliance: 'src/lib/compliance/hold.ts',
        complianceDestination: 'src/features/projects/compliance',
      }),
    }),
    Object.freeze({
      id: '341-array-merge',
      owner: '#341',
      expect: 'pass',
      kind: 'slicelaw-array',
      note: 'Owned by #341. arkRules.DomainModel as two paths merges both ids. The DomainModel layer lists both source files. Last-file-wins on byLayer is not a merge.',
      want: Object.freeze({
        ids: Object.freeze(['INV-SHARED-CODES', 'INV-UNIVERSE-CODES']),
        layer: 'DomainModel',
        sourceFiles: Object.freeze(['arkrules/DomainModel.json', 'arkrules/DomainModel.shared.json']),
      }),
    }),
    Object.freeze({
      id: '341-duplicate-id',
      owner: '#341',
      expect: 'pass',
      kind: 'slicelaw-duplicate',
      note: 'Owned by #341. Two central files that share INV-DUP fail config load with ARKRULE_DUPLICATE_ID. The id is named in the message.',
      want: Object.freeze({
        code: 'ARKRULE_DUPLICATE_ID',
        id: 'INV-DUP',
      }),
    }),
    Object.freeze({
      id: '341-discovery',
      owner: '#341',
      expect: 'pass',
      kind: 'slicelaw-discovery',
      note: 'Owned by #341. A governed child root contributes arkrules.<Layer>.json. The id is features/projects/rfi#rfi-intake. Default appliesTo is the slice directory. The central id stays. scm is outside include, so its escaping file is not a child root. policyHash differs from the string-only config. The referenced slice file is not ARKRULE_FILE_UNREFERENCED. Doctor lists the rule on the slice.',
      want: Object.freeze({
        universeId: 'INV-UNIVERSE-CODES',
        sliceId: 'features/projects/rfi#rfi-intake',
        bareId: 'rfi-intake',
        escapedId: 'scm-board',
        referenced: 'src/features/projects/rfi/arkrules.DomainModel.json',
        bySlice: Object.freeze([
          Object.freeze({
            slice: 'features/projects/rfi',
            sourceFile: 'src/features/projects/rfi/arkrules.DomainModel.json',
            ids: Object.freeze(['features/projects/rfi#rfi-intake']),
            appliesTo: Object.freeze(['src/features/projects/rfi/**']),
          }),
        ]),
      }),
    }),
    Object.freeze({
      id: '341-scope-escapes',
      owner: '#341',
      expect: 'pass',
      kind: 'slicelaw-escape',
      note: 'Owned by #341. scm/arkrules.DomainModel.json sets appliesTo on the RFI slice. Config load fails closed with ARKRULE_SCOPE_ESCAPES_SLICE and names that file. The escaping id is not enforced.',
      want: Object.freeze({
        code: 'ARKRULE_SCOPE_ESCAPES_SLICE',
        file: 'src/features/projects/scm/arkrules.DomainModel.json',
        escapedId: 'scm-board',
      }),
    }),
    Object.freeze({
      id: '341-unreferenced-slice',
      owner: '#341',
      expect: 'pass',
      kind: 'slicelaw-unreferenced',
      note: 'Owned by #341. With discovery off, ARKRULE_FILE_UNREFERENCED covers the slice files and the universe-level lookalike, not only top-level arkrules/*.json.',
      want: Object.freeze({
        files: Object.freeze([
          'arkrules/orphan.json',
          'src/features/projects/arkrules.DomainModel.json',
          'src/features/projects/rfi/arkrules.DomainModel.json',
          'src/features/projects/scm/arkrules.DomainModel.json',
        ]),
      }),
    }),
    Object.freeze({
      id: '341-pinned-route',
      owner: '#341',
      expect: 'pass',
      kind: 'slicelaw-pinned-only',
      note: 'Owned by #341. A pinned framework route is not an owed move and does not set slice-alias-debt. Doctor lists it under pinned, with reason framework-route. Other honesty reasons may remain.',
      want: Object.freeze({
        debt: false,
        from: 'src/app/**',
        to: 'features/projects/rfi',
        reason: 'framework-route',
        file: 'src/app/projects/rfi/page.tsx',
      }),
    }),
    Object.freeze({
      id: '341-pinned-keeps-real-debt',
      owner: '#341',
      expect: 'pass',
      kind: 'slicelaw-pinned-mixed',
      note: 'Owned by #341. Pinning the route does not clear the compliance alias. The route is listed under pinned and is absent from owed moves. slice-alias-debt stays because compliance is still an owed move.',
      want: Object.freeze({
        debt: true,
        route: 'src/app/projects/rfi/page.tsx',
        compliance: 'src/lib/compliance/hold.ts',
        complianceDestination: 'src/features/projects/compliance',
        pinnedFrom: 'src/app/**',
      }),
    }),
  ]),
  orderdesk: Object.freeze([
    Object.freeze({
      id: '343-probe-a',
      owner: '#343',
      expect: 'pass',
      kind: 'orderdesk-probe',
      file: 'src/lib/features/a/zz-probe-a-control.ts',
      note: 'Probe A. Driver import plus `UPDATE orders SET` inside a tagged template. Caught on 4.8.24.',
    }),
    Object.freeze({
      id: '343-probe-b',
      owner: '#343',
      expect: 'fail',
      kind: 'orderdesk-probe',
      file: 'src/lib/features/a/zz-probe-b-repo-tx.ts',
      note: 'Probe B. The transaction type is imported from a PersistenceAdapters module (`a-db-executor`), not from the driver. Same `UPDATE orders SET`. Still invisible.',
    }),
    Object.freeze({
      id: '343-probe-c',
      owner: '#343',
      expect: 'fail',
      kind: 'orderdesk-probe',
      file: 'src/lib/features/a/zz-probe-c-only.ts',
      note: 'Probe C. Driver import plus `UPDATE ONLY orders SET`. Still invisible.',
    }),
    Object.freeze({
      id: '343-probe-d',
      owner: '#343',
      expect: 'fail',
      kind: 'orderdesk-probe',
      file: 'src/lib/features/a/zz-probe-d-quoted.ts',
      note: 'Probe D. Driver import plus `UPDATE "public"."orders" SET`. Still invisible.',
    }),
    Object.freeze({
      id: '343-probe-e',
      owner: '#343',
      expect: 'fail',
      kind: 'orderdesk-probe',
      file: 'src/lib/features/a/zz-probe-e-merge.ts',
      note: 'Probe E. Driver import plus `MERGE INTO` and `TRUNCATE`. Still invisible.',
    }),
    Object.freeze({
      id: '343-probe-f',
      owner: '#343',
      expect: 'fail',
      kind: 'orderdesk-probe',
      file: 'src/lib/features/b/zz-probe-f-interp.ts',
      note: 'Probe F. `sql` from drizzle-orm and `UPDATE ${ordersTable} SET`. Still invisible.',
    }),
    Object.freeze({
      id: '343-probe-g',
      owner: '#343',
      expect: 'fail',
      kind: 'orderdesk-probe',
      file: 'src/lib/features/c/zz-probe-g-alias.ts',
      note: 'Probe G. Driver import plus `UPDATE public.line_items li SET` (table alias). Still invisible.',
    }),
    Object.freeze({
      id: '343-neg-for-update',
      owner: '#343',
      expect: 'pass',
      kind: 'orderdesk-clear',
      file: 'src/lib/features/a/zz-neg-for-update.ts',
      note: 'Negative. `SELECT … FOR UPDATE OF r` is a row lock, not a write. Stays unflagged.',
    }),
    Object.freeze({
      id: '343-neg-upsert',
      owner: '#343',
      expect: 'pass',
      kind: 'orderdesk-clear',
      file: 'src/lib/features/a/zz-neg-upsert.ts',
      note: 'Negative. `INSERT … ON CONFLICT … DO UPDATE SET` stays unflagged.',
    }),
    Object.freeze({
      id: '343-neg-js-comment',
      owner: '#343',
      expect: 'pass',
      kind: 'orderdesk-clear',
      file: 'src/lib/features/a/zz-neg-js-comment.ts',
      note: 'Negative. A `// UPDATE orders SET x` comment stays unflagged.',
    }),
    Object.freeze({
      id: '343-neg-sql-comment',
      owner: '#343',
      expect: 'pass',
      kind: 'orderdesk-clear',
      file: 'src/lib/features/a/zz-neg-sql-comment.ts',
      note: 'Negative. A `-- UPDATE orders SET x` comment inside a tagged template stays unflagged.',
    }),
  ]),
});
