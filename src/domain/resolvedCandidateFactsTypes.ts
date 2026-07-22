/**
 * Versioned type vocabulary for resolved candidate facts (schema 1.0).
 *
 * Pure declarations + schema version identity. Create/load live in
 * resolvedCandidateFacts.ts; JSON Schema lives in resolvedCandidateFactsSchema.ts.
 */

export const RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION = '1.0' as const;

export type ResolvedFactsCompleteness = 'complete' | 'partial' | 'unavailable';
export type ResolvedDependencyKind = 'import' | 'export' | 'dynamic-import' | 'require';
export type ResolvedDependencyState =
  | 'resolved-project'
  | 'resolved-external'
  | 'unresolved'
  | 'dynamic';
export type ResolvedCapability =
  | 'network'
  | 'filesystem'
  | 'clock'
  | 'randomness'
  | 'environment'
  | 'process'
  | 'persistence';

export const RESOLVED_CAPABILITY_IDS = [
  'network',
  'filesystem',
  'clock',
  'randomness',
  'environment',
  'process',
  'persistence',
] as const;

export type ResolvedFactsReason = {
  code: string;
  message: string;
  file?: string;
};

export type ResolvedFileFact = {
  path: string;
  contentHash: string;
  parseStatus: 'parsed' | 'invalid';
  parseDiagnosticCount: number;
  exportsOnlyTypes: boolean;
  typeOnlyExportNames: string[];
  hasTopLevelSideEffects: boolean;
};

export type ResolvedDependencyFact = {
  from: string;
  specifier?: string;
  kind: ResolvedDependencyKind;
  typeOnly: boolean;
  line: number;
  resolution: ResolvedDependencyState;
  target?: string;
  namedBindings?: string[];
  targetTypeOnlyExports?: boolean;
  sourcePureTypeModule?: boolean;
  namedBindingsTypeOnly?: boolean;
  portProofEligible?: boolean;
};

export type ResolvedCapabilityFact = {
  file: string;
  line: number;
  symbol: string;
  capability: ResolvedCapability;
  source: 'ambient-global' | 'import-based';
};

export type ResolvedAmbientFact = {
  file: string;
  line: number;
  symbol: string;
};

export type ResolvedPublishFact = {
  file: string;
  line: number;
  rawIntentName?: string;
  objectHasIntent: boolean;
  arkPublishCandidate: boolean;
  hasSource: boolean;
  sourceIntent?: string;
};

export type ResolvedIntentReferenceFact = {
  file: string;
  line: number;
  intent: string;
};

export type ResolvedSafetyKind =
  | 'ts-suppression'
  | 'any-cast'
  | 'dynamic-import'
  | 'dynamic-require'
  | 'in-memory-store';

/** Neutral syntax evidence for policy-controlled safety diagnostics. */
export type ResolvedSafetyFact = {
  file: string;
  line: number;
  kind: ResolvedSafetyKind;
  symbol?: string;
};

export type ResolvedCandidateFactsInput = {
  schemaVersion: typeof RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION;
  completeness: ResolvedFactsCompleteness;
  completenessReasons: readonly ResolvedFactsReason[];
  resolverIdentity: string;
  compilerIdentity: string;
  compilerOptionsHash: string;
  tsconfigHash: string;
  evidenceRequirementsHash: string;
  projectPackageName?: string;
  files: readonly ResolvedFileFact[];
  dependencies: readonly ResolvedDependencyFact[];
  capabilityUses: readonly ResolvedCapabilityFact[];
  ambientUses: readonly ResolvedAmbientFact[];
  publishCalls: readonly ResolvedPublishFact[];
  intentReferences: readonly ResolvedIntentReferenceFact[];
  safetyUses: readonly ResolvedSafetyFact[];
};

export type ResolvedCandidateFacts = Omit<ResolvedCandidateFactsInput, 'candidateTreeHash'> & {
  completenessReasons: ResolvedFactsReason[];
  candidateTreeHash: string;
  files: ResolvedFileFact[];
  dependencies: ResolvedDependencyFact[];
  capabilityUses: ResolvedCapabilityFact[];
  ambientUses: ResolvedAmbientFact[];
  publishCalls: ResolvedPublishFact[];
  intentReferences: ResolvedIntentReferenceFact[];
  safetyUses: ResolvedSafetyFact[];
  factsHash: string;
};
