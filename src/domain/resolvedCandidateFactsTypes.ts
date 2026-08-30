/**
 * Versioned type vocabulary for resolved candidate facts (schema 1.0).
 *
 * Pure declarations + schema version identity. Create/load live in
 * resolvedCandidateFacts.ts; JSON Schema lives in resolvedCandidateFactsSchema.ts.
 */

import type {
  ResolvedArkOrderGenericUpdateFact,
  ResolvedArkOrderPlaneCallFact,
  ResolvedArkOrderRootHitFact,
} from './arkOrderFacts';

/** 1.1 adds optional classShapes[] (ADR 0013). 1.2 adds optional ArkRun facts (ADR 0022). 1.0/1.1 remain loadable. */
export const RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION = '1.2' as const;
export const RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSIONS = ['1.0', '1.1', '1.2'] as const;

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

/** ADR 0022 kernel API call-site evidence. Sensors consume this in RN04. */
export type ResolvedArkRunKernelCallKind =
  | 'factory'
  | 'publisher'
  | 'publish'
  | 'raise'
  | 'send'
  | 'subscribe'
  | 'register-handler'
  | 'resolve'
  | 'resolve-singleton';

export type ResolvedArkRunKernelCallFact = {
  file: string;
  line: number;
  kind: ResolvedArkRunKernelCallKind;
  callee: string;
  viaImport: boolean;
  receiver?: string;
  nameLiteral?: string;
};

/** `new` of a class admitted for kernel creation (classShapes name or kernel import). */
export type ResolvedArkRunManagedNewFact = {
  file: string;
  line: number;
  typeName: string;
  importedFrom?: string;
};

/** Governed file that matched an `arkRun.compositionRoots` glob. */
export type ResolvedArkRunCompositionRootHitFact = {
  file: string;
  matchedRoot: string;
  hasKernelFactory: boolean;
};

/** File-scoped interaction declaration lists (ADR 0023). Sensors consume this in RN04. */
export type ResolvedArkRunDeclarationFact = {
  file: string;
  line: number;
  uses: string[];
  reactsTo: string[];
  raises: string[];
  sends: string[];
};

/** ADR 0013 class-shape evidence for ArkRules structure sensors. */
export type ResolvedClassShapeFact = {
  file: string;
  className: string;
  exported: boolean;
  hasPublicMutableFields: boolean;
  hasPublicSetters: boolean;
  hasPublicConstructor: boolean;
  hasStaticFactory: boolean;
  mutatingMethods: readonly {
    name: string;
    referencesGuardOrPublish: boolean;
  }[];
  dataOnly?: boolean;
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
  schemaVersion: '1.0' | '1.1' | typeof RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION;
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
  /** ADR 0013 — optional on 1.0; default [] on load. */
  classShapes?: readonly ResolvedClassShapeFact[];
  /** ADR 0022 / RN03 — optional on 1.0/1.1; default [] on load. */
  arkRunKernelCalls?: readonly ResolvedArkRunKernelCallFact[];
  arkRunManagedNews?: readonly ResolvedArkRunManagedNewFact[];
  arkRunCompositionRootHits?: readonly ResolvedArkRunCompositionRootHitFact[];
  arkRunDeclarations?: readonly ResolvedArkRunDeclarationFact[];
  arkOrderPlaneCalls?: readonly ResolvedArkOrderPlaneCallFact[];
  arkOrderGenericUpdates?: readonly ResolvedArkOrderGenericUpdateFact[];
  arkOrderRootHits?: readonly ResolvedArkOrderRootHitFact[];
};

export type ResolvedCandidateFacts = Omit<
  ResolvedCandidateFactsInput,
  | 'candidateTreeHash'
  | 'classShapes'
  | 'arkRunKernelCalls'
  | 'arkOrderPlaneCalls'
  | 'arkOrderGenericUpdates'
  | 'arkOrderRootHits'
  | 'arkRunManagedNews'
  | 'arkRunCompositionRootHits'
  | 'arkRunDeclarations'
> & {
  schemaVersion: typeof RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION;
  completenessReasons: ResolvedFactsReason[];
  candidateTreeHash: string;
  files: ResolvedFileFact[];
  dependencies: ResolvedDependencyFact[];
  capabilityUses: ResolvedCapabilityFact[];
  ambientUses: ResolvedAmbientFact[];
  publishCalls: ResolvedPublishFact[];
  intentReferences: ResolvedIntentReferenceFact[];
  safetyUses: ResolvedSafetyFact[];
  classShapes: ResolvedClassShapeFact[];
  arkRunKernelCalls: ResolvedArkRunKernelCallFact[];
  arkRunManagedNews: ResolvedArkRunManagedNewFact[];
  arkRunCompositionRootHits: ResolvedArkRunCompositionRootHitFact[];
  arkRunDeclarations: ResolvedArkRunDeclarationFact[];
  arkOrderPlaneCalls: ResolvedArkOrderPlaneCallFact[];
  arkOrderGenericUpdates: ResolvedArkOrderGenericUpdateFact[];
  arkOrderRootHits: ResolvedArkOrderRootHitFact[];
  factsHash: string;
};
