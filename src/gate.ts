/** Stable importable surface for the ArkGate architecture product. */
export { version } from './version';

export {
  ARK_ANALYSIS_RESULT_SCHEMA_VERSION,
  ARK_ANALYSIS_RESULT_SCHEMA,
  createAdapterResult,
  toAdapterDiagnostic,
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
  analyzeChange,
  explainViolation,
  evaluateArchitectureGraph,
  collectAnalysisConfigWarnings,
  detectArchitectureCycles,
  collectForbiddenCapabilityUses,
  extractSemanticDependencies,
  type AnalysisContract,
  type AnalyzeProjectInput,
  type AnalyzeChangeInput,
  type AnalysisResult,
  type ArchitectureEngineViolation,
  type ArchitectureEngineEdge,
  type EvaluateArchitectureGraphInput,
  type ArchitectureEngineResult,
  type CollectAnalysisConfigWarningsInput,
  type ForbiddenCapabilityUse,
  type SemanticDependency,
  type SemanticDependencyKind,
} from './kernel/analysis';

export {
  ANALYSIS_IR_SCHEMA_VERSION,
  deterministicHash,
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
} from './domain/analysis';

export {
  ARK_CONFIG_SCHEMA,
  ARK_CONFIG_SCHEMA_VERSION,
  loadArkConfigContract,
  parseArkConfigJson,
  type ArkConfig,
  type ArkConfigLoadResult,
} from './domain/configContract';
