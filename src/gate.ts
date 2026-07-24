/** Stable importable surface for the ArkGate architecture product. */
export { version } from './version';

export {
  ARK_ANALYSIS_RESULT_SCHEMA_VERSION,
  ARK_ANALYSIS_RESULT_SCHEMA,
  createAdapterResult,
  toAdapterDiagnostic,
  type AnalysisCompleteness,
  type AnalysisMode,
  type AdapterCompletenessReason,
  type AdapterDiagnostic,
  type AdapterResult,
  type AdapterSeverity,
  type AdapterViolationInput,
} from './domain/adapterContract';

export {
  createAICodeGate,
  type AICodeGate,
  type AICodeGateResult,
  type AICodeGateViolation,
  type AICodeGateContext,
  type AICodeGateOptions,
  type AIGateExtension,
} from './kernel/ai-gate';

export {
  createArchitectureProfile,
  createArchitectureProfileFromArkConfig,
  createElevenLayerArkConfig,
  elevenLayerProfile,
  type ArchitectureLayer,
  type ArchitectureLayerConfig,
  type ArchitectureProfile,
  type ArchitectureRule,
  type ArkCheckConfig,
  type CreateArchitectureProfileFromArkConfigOptions,
  type CreateArchitectureProfileOptions,
  type CreateElevenLayerArkConfigOptions,
} from './kernel/layers';

export {
  loadContract,
  analyzeProject,
  analyzeResolvedProject,
  analyzeChange,
  preflightChange,
  preflightResolvedChange,
  analyzePolicyDelta,
  analyzeArchitectureConvergence,
  explainViolation,
  evaluateArchitectureGraph,
  collectAnalysisConfigWarnings,
  detectArchitectureCycles,
  collectForbiddenCapabilityUses,
  extractSemanticDependencies,
  type AnalysisContract,
  type ArchitectureChangeMap,
  type ArchitectureChangeMapContract,
  type ArchitectureChangeMapDependency,
  type ArchitectureChangeMapFile,
  type ArchitectureChangeOperation,
  type AnalyzeArchitectureConvergenceInput,
  type ArchitectureActualChange,
  type ArchitectureConvergenceClassification,
  type ArchitectureConvergenceFinding,
  type ArchitectureConvergenceResult,
  type ArchitectureDependency,
  type AnalyzeProjectInput,
  type AnalyzeResolvedProjectInput,
  type PreflightResolvedChangeInput,
  type AnalyzeChangeInput,
  type AnalysisResult,
  type PreparedChangeFile,
  type ChangePreflightResult,
  type AnalyzePolicyDeltaInput,
  type PolicyDeltaAnalysis,
  type ArchitectureEngineViolation,
  type ArchitectureEngineEdge,
  type EvaluateArchitectureGraphInput,
  type ArchitectureEngineResult,
  type CollectAnalysisConfigWarningsInput,
  type ForbiddenCapabilityUse,
  type SemanticDependency,
  type SemanticDependencyKind,
  type ResolvedAnalysisFile,
  type ResolvedAnalysisIr,
  type ResolvedAnalysisResult,
  type ResolvedChangePreflightResult,
  type ResolvedSafetyReport,
} from './kernel/analysis';

export {
  POLICY_DELTA_SCHEMA_VERSION,
  classifyArkPolicyDelta,
  policyDeltaAcknowledgementMatches,
  type PolicyDelta,
  type PolicyDeltaAcknowledgement,
  type PolicyDeltaClassification,
  type PolicyDeltaFinding,
} from './domain/policyDelta';

export {
  ANALYSIS_IR_SCHEMA_VERSION,
  RESOLVED_CANDIDATE_FACTS_SCHEMA,
  RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION,
  createResolvedCandidateFacts,
  deterministicHash,
  loadResolvedCandidateFacts,
  resolvedFactsEvidenceRequirementsHash,
  stableSerialize,
  type AnalysisFileInput,
  type AnalysisFileChange,
  type AnalysisCompilerOptions,
  type AnalysisFile,
  type AnalysisImportEdge,
  type AnalysisCapabilityUse,
  type AnalysisEvidence,
  type AnalysisViolation,
  type AnalysisIr,
  type ResolvedAmbientFact,
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
} from './domain/analysis';

export {
  ARK_CONFIG_SCHEMA,
  ARK_CONFIG_SCHEMA_VERSION,
  loadArkConfigContract,
  parseArkConfigJson,
  type ArkConfig,
  type ArkConfigLoadResult,
} from './domain/configContract';

export {
  ARK_RULES_SCHEMA,
  ARK_RULES_SCHEMA_VERSION,
  ARK_RULE_SENSORS,
  buildEffectiveArkRules,
  emptyEffectiveArkRules,
  loadArkRulesContract,
  parseArkRulesJson,
  type ArkRulesFile,
  type EffectiveArkRules,
} from './domain/arkRulesContract';

export {
  EffectiveContractError,
  effectiveContractPolicyPayload,
  resolveEffectiveContract,
  type EffectiveContract,
  type EffectiveContractWarning,
} from './domain/effectiveContract';

export {
  evaluateArkRuleSensors,
  extractClassShapesFromSource,
  type ClassShapeFact,
  type ArkRuleSensorViolation,
} from './domain/arkRuleSensors';

export {
  canPromoteInvariant,
  evaluateInvariantCoverage,
  type InvariantCoverageEvidence,
} from './domain/invariantCoverage';

export {
  buildRulesInventory,
  inventoryToExtractionCard,
  type RulesInventoryCandidate,
  type RulesInventoryResult,
} from './domain/rulesInventory';

export {
  ARK_ENFORCEMENT_STATE_SCHEMA_VERSION,
  type ArkEnforcementHost,
  type ArkEnforcementState,
  type EnforcementBoundaryState,
  type EnforcementEvidence,
  type EnforcementEvidenceField,
  type EnforcementVerification,
} from './domain/enforcementState';

export {
  ARK_DESIGN_DELTA_SCHEMA_VERSION,
  type ArkDesignDeltaResult,
  type DesignDeltaChange,
  type DesignDeltaIdentity,
  type DesignSmellEvidence,
  type DesignSmellFinding,
  type DesignSmellId,
} from './domain/designDelta';
