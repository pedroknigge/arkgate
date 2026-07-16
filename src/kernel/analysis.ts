/**
 * Canonical analysis API (C02) — the single public seam over the Kernel engine.
 *
 * Facade only since U02 pilot 2: implementation lives in cohesive sibling
 * modules (analysisCore, moduleGraph, graphEvaluate, changePreflight,
 * configWarnings, analysisTypes). Every consumer import path — library, CLI
 * bundle, MCP, ESLint, hooks — continues to resolve here unchanged.
 */

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
  classifyPublishFacts,
  looksLikeArkIntent,
  type PublishSyntaxFacts,
  type SourcePolicyFinding,
} from '../domain/sourcePolicy';

export type {
  AnalysisContract,
  AnalysisResult,
  AnalyzeChangeInput,
  AnalyzePolicyDeltaInput,
  AnalyzeProjectInput,
  ArchitectureEngineEdge,
  ArchitectureEngineResult,
  ArchitectureEngineViolation,
  ChangePreflightResult,
  CollectAnalysisConfigWarningsInput,
  EvaluateArchitectureGraphInput,
  PolicyDeltaAnalysis,
  PreparedChangeFile,
} from './analysisTypes';

export {
  analyzeChange,
  analyzePolicyDelta,
  analyzeProject,
  explainViolation,
  loadContract,
} from './analysisCore';

export { detectArchitectureCycles, evaluateArchitectureGraph } from './graphEvaluate';

export { preflightChange } from './changePreflight';

export { collectAnalysisConfigWarnings } from './configWarnings';
