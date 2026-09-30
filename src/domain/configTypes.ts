/**
 * Type vocabulary for the ark.config.json contract (U02 pilot 1).
 *
 * Pure declarations only — no runtime values. The loader/validator logic and the
 * published JSON Schema live in ./configContract.ts. Extra defaulting lives in
 * ./configExtras.ts (generated sibling `config-extras.mjs`). Type-only imports
 * from this file are erased on transpile.
 */

export type ArkConfigSchemaVersion = '1.0' | '1.1' | '1.2' | '1.3';

type ArkConfigCyclePolicy = 'strict' | 'soft' | 'framework-soft' | 'off';

type ArkConfigLayerCapabilities = {
  deny?: string[];
};

/** Who this folder is for. Metadata — not import-rule teeth. Absence is silent. */
type ArkConfigLayerTrustBoundary = 'public' | 'auth' | 'admin' | 'internal';

export type ArkConfigLayer = {
  name: string;
  patterns: string[];
  exclude?: string[];
  intentPrefixes?: string[];
  /**
   * App-context caption for this layer.
   * Metadata — excluded from policy hash. Absence is silent.
   */
  description?: string;
  /**
   * Who this folder is for: public | auth | admin | internal.
   * Metadata — excluded from policy hash. Absence is silent. Not host/CI TLS.
   */
  trustBoundary?: ArkConfigLayerTrustBoundary;
  /**
   * Who owns this house: GitHub handles or emails (same identity as stewards).
   * Metadata — excluded from policy hash. Absence is silent unless
   * `requireLayerOwners` is true. Not import-rule teeth.
   */
  owners?: string[];
  forbiddenGlobals?: string[];
  /** ADR 0009 D2 — opt-in effect-capability walls; absence changes no verdict. */
  capabilities?: ArkConfigLayerCapabilities;
  /** Dual-depth sugar: `pure: true` denies all seven capabilities. */
  pure?: boolean;
  mayImportInfrastructure?: boolean;
  optional?: boolean;
  /**
   * Future house: empty globs are expected. `--strict-config` must not fail.
   * Typo warning (`CONFIG_LAYER_PATTERN_NO_MATCHES`) is skipped.
   */
  reserved?: boolean;
  /** Alias of reserved — empty pattern matches are allowed. */
  allowEmpty?: boolean;
};

/** How a starred `sliceFolders` prefix is named. Absent equals `path`. */
type ArkConfigSliceIdentity = 'path' | 'stars';

export type ArkConfigRule = {
  from: string;
  to: string;
  allowed: boolean;
  message?: string;
  peerIsolation?: boolean;
  sliceFolders?: string[];
  /**
   * How a starred `sliceFolders` prefix is named.
   * Absent and `path` keep today's ids. `stars` is the last literal plus every
   * star binding (a star before the last literal is kept too).
   */
  sliceIdentity?: ArkConfigSliceIdentity;
  /** Roots the repo declares shared on purpose — evidence, not unclassifiable. */
  sharedRoots?: string[];
  /** Directed slice→slice edges the repo declares on purpose. */
  allowedCrossSlice?: ArkConfigCrossSliceEdge[];
  /**
   * `"deny"` blocks a shared root from importing a slice.
   * `"deny-cross-parent"` leaves that hop allowed and asks the whole-graph
   * check to report a slice that reaches another universe through shared.
   * The object form carries `stopAt`: composition roots the walk never
   * passes through.
   */
  sharedImportsSlice?: ArkConfigSharedImportsSlice;
  /**
   * Optional inner wall. Absent keeps today's universe-wall output.
   * `siblings` defaults to deny. An object keeps that default and lists enforced subtrees.
   * `parentMayImportChild` defaults to false.
   */
  childSlices?: ArkConfigChildSlices;
};

type ArkConfigSharedImportsSlice =
  | 'deny'
  | 'deny-cross-parent'
  | { mode: 'deny-cross-parent'; stopAt: string[] };

type ArkConfigChildSlices = {
  sliceFolders: string[];
  sliceIdentity?: ArkConfigSliceIdentity;
  commonFolders?: string[];
  /**
   * `ratchet` on the object form: absent turns the anti-growth ratchet on only
   * when the baseline already records an advisory crossing of this rule;
   * `true` always; `false` measures only.
   */
  siblings?:
    | 'deny'
    | 'advisory'
    | { default: 'deny' | 'advisory'; enforce?: string[]; ratchet?: boolean };
  parentMayImportChild?: boolean;
  /** Text for inner-wall findings (sibling, common → child). Absent: ArkGate default, never the rule message. */
  message?: string;
  /**
   * Directed child-slice allowances. `*` is one whole path segment.
   * Clears a sibling crossing only. The universe `allowedCrossSlice` does not read this list.
   */
  allowedCrossSlice?: ArkConfigCrossSliceEdge[];
  /**
   * Files outside the slice trees, borrowed onto a child id until they move.
   * `to` is the universe id plus one child segment.
   */
  sliceAliases?: ArkConfigSliceAlias[];
  /**
   * Filename at each child slice root. `<Layer>` is the only token.
   * Example: `arkrules.<Layer>.json`.
   */
  arkRulesFile?: string;
};

type ArkConfigSliceAlias = {
  from: string;
  to: string;
  /** True: the path stays. It is not an owed move and does not clear other honesty debt. */
  pinned?: boolean;
  /** Doctor label, such as `framework-route`. A label alone does not pin. */
  reason?: string;
};

type ArkConfigCrossSliceEdge = {
  from: string;
  to: string;
};

type ArkConfigSafety = {
  maxTsSuppressions?: number;
  maxAnyCasts?: number;
  allowInMemory?: boolean;
  allowDisabledPeerIsolation?: boolean;
};

/**
 * Optional invariant-coverage scan controls. Absence keeps the built-in
 * defaults (test-name heuristic, 400-file budget) and changes no verdict.
 */
type ArkConfigCoverage = {
  /** Globs that decide which files count as tests (replaces the name heuristic). */
  testGlobs?: string[];
  /** Max files loaded as coverage evidence before the budget is exhausted. */
  maxFiles?: number;
  /**
   * Path prefixes where this project declares its test runner actually executes
   * tests. ArkGate never runs anything: this is a second declaration to compare
   * the coverage scan against, so a covering test found outside them is reported
   * (INVARIANT_COVERAGE_OUTSIDE_ROOTS) instead of silently certifying the
   * invariant. Absence is silent unless any catalogued invariant is enforced —
   * then missing roots fail closed (INVARIANT_COVERAGE_ROOTS_MISSING).
   */
  coverageRoots?: string[];
};

/**
 * ADR 0012 — optional map of layer name → project-relative ArkRules file path.
 * Absence changes no inter-layer verdict.
 */
/** One path, or several paths merged into that layer's catalog. */
type ArkConfigArkRulesRef = string | string[];

type ArkConfigArkRulesRefs = Record<string, ArkConfigArkRulesRef>;

/** ADR 0020 — advisory never adds merge teeth; enforced is the extra's merge plane. */
type ArkConfigArkRunMode = 'advisory' | 'enforced';

/**
 * ADR 0020 — optional inline ArkRun extra (schema 1.2+). Absence is silent.
 * Present objects are fully defaulted by the loader.
 */
export type ArkConfigArkRun = {
  mode: ArkConfigArkRunMode;
  compositionRoots: string[];
  kernelRoots?: string[];
  managedLayers: string[];
  requireDeclarations: boolean;
  ignoreDirectNewForErrors?: boolean;
};

/** ADR 0027 — advisory never adds merge teeth; enforced is the extra's merge plane. */
type ArkConfigArkOrderMode = 'advisory' | 'enforced';

/**
 * ADR 0027 — optional inline ArkOrder extra (schema 1.3+). Absence is silent.
 * Present objects are fully defaulted by the loader.
 */
export type ArkConfigArkOrder = {
  mode: ArkConfigArkOrderMode;
  planeRoots: string[];
  managedLayers: string[];
  /**
   * Haken cap on one `release()` / `assertXiKeyCap` (default 7).
   * Not a cap on the `xiKeys` watchlist length.
   */
  maxXiKeys: number;
  /**
   * Slow product keys the team can already name (plan, cost code, protocol).
   * Optional. Empty → `ARKORDER_XI_FIELD_WRITE` stays silent.
   * Repo-wide watchlist — not compared to `maxXiKeys`.
   */
  xiKeys: string[];
  /**
   * Optional globs that narrow ξ field-write observation inside `managedLayers`.
   * Same glob engine as `layers[].patterns`. Absence or empty → every file in
   * those layers. Non-empty → emit only when the layer is managed AND the file
   * matches at least one glob.
   */
  appliesTo?: string[];
};

export type ArkConfig = {
  $schema: string;
  schemaVersion: ArkConfigSchemaVersion;
  name?: string;
  include: string[];
  exclude?: string[];
  excludeGenerated?: boolean;
  frameworkOverlay?: string;
  layers: ArkConfigLayer[];
  rules: ArkConfigRule[];
  cyclePolicy?: ArkConfigCyclePolicy;
  dynamicImportAllowlist?: string[];
  safety?: ArkConfigSafety;
  /**
   * Invariant-coverage scan controls (test globs + file budget).
   * Absence keeps the defaults; it never turns coverage on by itself.
   */
  coverage?: ArkConfigCoverage;
  /** ADR 0012 — modular ArkRules references (schema 1.1+). */
  arkRules?: ArkConfigArkRulesRefs;
  /** ADR 0020 — optional ArkRun extra (schema 1.2+). Absence changes no Layers/ArkRules verdict. */
  arkRun?: ArkConfigArkRun;
  /** ADR 0027 — optional ArkOrder extra (schema 1.3+). Absence changes no Layers/ArkRules/ArkRun verdict. */
  arkOrder?: ArkConfigArkOrder;
  /**
   * Optional GitHub handles or emails who may loosen the contract or grow the baseline.
   * Metadata — excluded from policy hash. Absence means no steward lock (policy-ack still applies).
   */
  stewards?: string[];
  /**
   * When true, every non-reserved layer must name `owners`. Absence/false is
   * silent. This flag is policy teeth (stays in policyHash). Owners themselves
   * stay metadata.
   */
  requireLayerOwners?: boolean;
};

export type ArkConfigIssue = {
  path: string;
  message: string;
};

/** Original input version when the loader rewrote schemaVersion toward current. */
export type ArkConfigMigratedFrom = 'unversioned' | '1.0' | '1.1' | '1.2' | null;

export type ArkConfigLoadResult = {
  config: ArkConfig;
  migratedFrom: ArkConfigMigratedFrom;
};

export type ArkConfigMigrationResult = {
  candidate: Record<string, unknown>;
  migratedFrom: ArkConfigMigratedFrom;
};

/** Restricted JSON-Schema subset the contract validator walks (internal shape). */
export type SchemaNode = {
  $ref?: string;
  type?: 'object' | 'array' | 'string' | 'boolean' | 'integer';
  const?: unknown;
  enum?: readonly unknown[];
  required?: readonly string[];
  properties?: Readonly<Record<string, SchemaNode>>;
  /** `false` forbids extras; a nested SchemaNode validates each additional property. */
  additionalProperties?: boolean | SchemaNode;
  items?: SchemaNode;
  minItems?: number;
  uniqueItems?: boolean;
  minLength?: number;
  minimum?: number;
  default?: unknown;
};

export type SchemaRoot = SchemaNode & {
  $defs: Readonly<Record<string, SchemaNode>>;
};
