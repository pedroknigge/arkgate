/**
 * Type vocabulary for the ark.config.json contract (U02 pilot 1).
 *
 * Pure declarations only — no runtime values. The loader/validator logic and the
 * published JSON Schema live in ./configContract.ts, whose generated CLI artifact
 * must stay self-contained: type-only imports/exports are erased on transpile, so
 * this split never reaches bin/lib/config-contract.mjs.
 */

export type ArkConfigSchemaVersion = '1.0' | '1.1' | '1.2';

export type ArkConfigCyclePolicy = 'strict' | 'soft' | 'framework-soft' | 'off';

export type ArkConfigLayerCapabilities = {
  deny?: string[];
};

export type ArkConfigLayer = {
  name: string;
  patterns: string[];
  exclude?: string[];
  intentPrefixes?: string[];
  description?: string;
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

export type ArkConfigRule = {
  from: string;
  to: string;
  allowed: boolean;
  message?: string;
  peerIsolation?: boolean;
  sliceFolders?: string[];
};

export type ArkConfigSafety = {
  maxTsSuppressions?: number;
  maxAnyCasts?: number;
  allowInMemory?: boolean;
  allowDisabledPeerIsolation?: boolean;
};

/**
 * ADR 0012 — optional map of layer name → project-relative ArkRules file path.
 * Absence changes no inter-layer verdict.
 */
export type ArkConfigArkRulesRefs = Record<string, string>;

/** ADR 0020 — advisory never adds merge teeth; enforced is the extra's merge plane. */
export type ArkConfigArkRunMode = 'advisory' | 'enforced';

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
  /** ADR 0012 — modular ArkRules references (schema 1.1+). */
  arkRules?: ArkConfigArkRulesRefs;
  /** ADR 0020 — optional ArkRun extra (schema 1.2+). Absence changes no Layers/ArkRules verdict. */
  arkRun?: ArkConfigArkRun;
  /**
   * Optional GitHub handles or emails who may loosen the contract or grow the baseline.
   * Metadata — excluded from policy hash. Absence means no steward lock (policy-ack still applies).
   */
  stewards?: string[];
};

export type ArkConfigIssue = {
  path: string;
  message: string;
};

/** Original input version when the loader rewrote schemaVersion toward current. */
export type ArkConfigMigratedFrom = 'unversioned' | '1.0' | '1.1' | null;

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
