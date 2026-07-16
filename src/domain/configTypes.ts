/**
 * Type vocabulary for the ark.config.json contract (U02 pilot 1).
 *
 * Pure declarations only — no runtime values. The loader/validator logic and the
 * published JSON Schema live in ./configContract.ts, whose generated CLI artifact
 * must stay self-contained: type-only imports/exports are erased on transpile, so
 * this split never reaches bin/lib/config-contract.mjs.
 */

export type ArkConfigSchemaVersion = '1.0';

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
};

export type ArkConfigIssue = {
  path: string;
  message: string;
};

export type ArkConfigLoadResult = {
  config: ArkConfig;
  migratedFrom: 'unversioned' | null;
};

export type ArkConfigMigrationResult = {
  candidate: Record<string, unknown>;
  migratedFrom: 'unversioned' | null;
};

/** Restricted JSON-Schema subset the contract validator walks (internal shape). */
export type SchemaNode = {
  $ref?: string;
  type?: 'object' | 'array' | 'string' | 'boolean' | 'integer';
  const?: unknown;
  enum?: readonly unknown[];
  required?: readonly string[];
  properties?: Readonly<Record<string, SchemaNode>>;
  additionalProperties?: boolean;
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
