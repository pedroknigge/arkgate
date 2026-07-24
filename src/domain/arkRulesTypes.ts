/**
 * Type vocabulary for ArkRules files (ADR 0012).
 *
 * Pure declarations only — runtime validation and the published JSON Schema live in
 * ./arkRulesContract.ts so generate:cli-pure can emit a self-contained artifact.
 */

/** Closed sensor vocabulary (ADR 0013). Unknown sensors fail closed at load time. */
export const ARK_RULE_SENSOR_IDS = [
  'aggregate-private-state',
  'always-valid-factory',
  'domain-event-on-mutation',
  'orchestration-only',
  'thin-adapter',
  'no-anemic-model',
  'invariant-coverage',
] as const;

export type ArkRuleSensorId = (typeof ARK_RULE_SENSOR_IDS)[number];

/** Tier-2 sensors are advisory-only forever (never promotable to enforced). */
export const ARK_RULE_TIER2_SENSOR_IDS = ['no-anemic-model'] as const;

export type ArkRuleMode = 'advisory' | 'enforced';

export type ArkRuleStructureEntry = {
  id: string;
  sensor: ArkRuleSensorId;
  mode?: ArkRuleMode;
  appliesTo?: string[];
  description?: string;
};

export type ArkRuleInvariantCoverage = {
  test?: boolean;
  symbol?: string;
};

export type ArkRuleInvariantEntry = {
  id: string;
  description: string;
  aggregate?: string;
  coverage?: ArkRuleInvariantCoverage;
  mode?: ArkRuleMode;
  appliesTo?: string[];
};

export type ArkRulesFile = {
  $schema?: string;
  schemaVersion: '1.0';
  layer: string;
  structure?: ArkRuleStructureEntry[];
  invariants?: ArkRuleInvariantEntry[];
};

export type ArkRuleProvenance = {
  sourceFile: string;
  ruleId: string;
  layer: string;
};

export type EffectiveStructureRule = ArkRuleStructureEntry & {
  mode: ArkRuleMode;
  provenance: ArkRuleProvenance;
};

export type EffectiveInvariantRule = ArkRuleInvariantEntry & {
  mode: ArkRuleMode;
  provenance: ArkRuleProvenance;
};

export type EffectiveArkRules = {
  schemaVersion: '1.0';
  byLayer: Record<
    string,
    {
      sourceFile: string;
      structure: EffectiveStructureRule[];
      invariants: EffectiveInvariantRule[];
    }
  >;
  structure: EffectiveStructureRule[];
  invariants: EffectiveInvariantRule[];
};

export type ArkRulesIssue = {
  path: string;
  message: string;
};
