/**
 * Canonical analysis API (C02) — the single public seam over the Kernel engine.
 *
 * Facade only since U02 pilot 2: implementation lives in cohesive sibling
 * modules (analysisCore, moduleGraph, graphEvaluate, changePreflight,
 * configWarnings, analysisTypes). Every consumer import path — library, CLI
 * bundle, MCP, ESLint, hooks — continues to resolve here unchanged.
 */

export {
  RESOLVED_CANDIDATE_FACTS_SCHEMA,
  RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION,
  createResolvedCandidateFacts,
  deterministicHash,
  loadResolvedCandidateFacts,
  resolvedFactsEvidenceRequirementsHash,
  stableSerialize,
  type ResolvedAmbientFact,
  type ResolvedArkRunCompositionRootHitFact,
  type ResolvedArkRunDeclarationFact,
  type ResolvedArkRunKernelCallFact,
  type ResolvedArkRunKernelCallKind,
  type ResolvedArkRunManagedNewFact,
  type ResolvedCandidateFacts,
  type ResolvedCandidateFactsInput,
  type ResolvedCapability,
  type ResolvedCapabilityFact,
  type ResolvedDependencyFact,
  type ResolvedDependencyKind,
  type ResolvedDependencyState,
  type ResolvedFactsCompleteness,
  type ResolvedFactsReason,
  type ResolvedFileFact,
  type ResolvedIntentReferenceFact,
  type ResolvedPublishFact,
  type ResolvedSafetyFact,
  type ResolvedSafetyKind,
} from '../domain/analysis';

export {
  loadArchitectureChangeMap,
  type ArchitectureChangeMap,
  type ArchitectureChangeMapContract,
  type ArchitectureChangeMapDependency,
  type ArchitectureChangeMapFile,
  type ArchitectureChangeOperation,
} from '../domain/changeMap';

export {
  analyzeArchitectureConvergence,
  type AnalyzeArchitectureConvergenceInput,
  type ArchitectureActualChange,
  type ArchitectureConvergenceClassification,
  type ArchitectureConvergenceFinding,
  type ArchitectureConvergenceResult,
  type ArchitectureDependency,
} from '../domain/changeConvergence';

export {
  collectForbiddenCapabilityUses,
  extractSemanticDependencies,
  type ForbiddenCapabilityUse,
  type SemanticDependency,
  type SemanticDependencyKind,
} from './semanticAnalysis';

export {
  SOURCE_POLICY_MESSAGES,
  DEFAULT_INTENT_PREFIXES,
  classifyPublishFacts,
  looksLikeArkIntent,
  resolveIntentLayer,
  type PublishSyntaxFacts,
  type SourcePolicyFinding,
  type IntentLayerPrefixes,
} from '../domain/sourcePolicy';

export {
  AMBIENT_CAPABILITY_ENTRIES,
  CAPABILITY_IDS,
  ambientCoveredByForbiddenGlobals,
  capabilityForAmbientName,
  capabilityForModuleSpecifier,
  effectiveCapabilityDeny,
  forbiddenGlobalForModuleSpecifier,
  loweredLayerCoverage,
  lowerForbiddenGlobal,
  type CapabilityId,
  type CapabilityLayerPolicy,
} from '../domain/capabilities';

export { collectCapabilityUses, type CapabilityUse } from './capabilityAnalysis';

export type {
  AnalysisContract,
  AnalysisResult,
  AnalyzeChangeInput,
  AnalyzePolicyDeltaInput,
  AnalyzeProjectInput,
  AnalyzeResolvedProjectInput,
  ArchitectureEngineEdge,
  ArchitectureEngineResult,
  ArchitectureEngineViolation,
  ChangePreflightResult,
  CollectAnalysisConfigWarningsInput,
  EvaluateArchitectureGraphInput,
  PolicyDeltaAnalysis,
  PreflightResolvedChangeInput,
  PreparedChangeFile,
  ResolvedAnalysisFile,
  ResolvedAnalysisIr,
  ResolvedAnalysisResult,
  ResolvedChangePreflightResult,
  ResolvedSafetyReport,
} from './analysisTypes';

export {
  analyzeChange,
  analyzePolicyDelta,
  analyzeProject,
  explainViolation,
  loadContract,
} from './analysisCore';

export { detectArchitectureCycles, evaluateArchitectureGraph } from './graphEvaluate';

export { analyzeResolvedProject } from './resolvedAnalysis';

export { preflightChange } from './changePreflight';

export { preflightResolvedChange } from './resolvedChangePreflight';

export { collectAnalysisConfigWarnings } from './configWarnings';
