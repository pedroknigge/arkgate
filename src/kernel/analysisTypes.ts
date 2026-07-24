/**
 * Public type vocabulary of the canonical analysis API (U02 pilot 2).
 *
 * Declarations only — the C02 entry point src/kernel/analysis.ts re-exports
 * everything here, so consumer import paths never change.
 */
import type {
  AnalysisCompilerOptions,
  AnalysisFileChange,
  AnalysisFileInput,
  AnalysisIr,
  ResolvedCandidateFacts,
  ResolvedCapabilityFact,
  ResolvedFactsCompleteness,
  ResolvedFactsReason,
  ResolvedFileFact,
} from '../domain/analysis';
import type { ArkConfig, ArkConfigLoadResult } from '../domain/configTypes';
import type { EffectiveArkRules } from '../domain/arkRulesTypes';
import type {
  PolicyDeltaAcknowledgement,
  PolicyDeltaClassification,
  PolicyDeltaFinding,
} from '../domain/policyDelta';
import type { ArchitectureChangeMapContract } from '../domain/changeMap';
import type { ArchitectureConvergenceResult } from '../domain/changeConvergence';

export type AnalysisContract = ArkConfigLoadResult & {
  policyHash: string;
  /**
   * ADR 0012 Effective ArkRules (empty when arkRules is absent).
   * Included in policyHash when non-empty so arkrules edits invalidate identity.
   */
  arkRules?: EffectiveArkRules;
  /**
   * ADR 0013 class-shape facts for ArkRules sensors (Tooling-supplied).
   * Empty / absent when ArkRules are not active.
   */
  classShapes?: import('../domain/arkRuleSensors').ClassShapeFact[];
};

export type AnalyzeProjectInput = {
  contract: AnalysisContract;
  files: readonly AnalysisFileInput[];
  compilerOptions?: AnalysisCompilerOptions;
};

export type AnalyzeChangeInput = AnalyzeProjectInput & {
  changes: readonly AnalysisFileChange[];
  changeMap?: ArchitectureChangeMapContract;
};

export type AnalysisResult = {
  mode: 'lexical-compatibility';
  completeness: ResolvedFactsCompleteness;
  completenessReasons: ResolvedFactsReason[];
  valid: boolean;
  ir: AnalysisIr;
};

export type AnalyzeResolvedProjectInput = {
  contract: AnalysisContract;
  facts: unknown;
};

export type PreflightResolvedChangeInput = {
  contract: AnalysisContract;
  baseFacts: unknown;
  candidateFacts: unknown;
  changes: readonly AnalysisFileChange[];
  changeMap?: ArchitectureChangeMapContract;
};

export type ResolvedAnalysisFile = ResolvedFileFact & {
  layer: string | null;
};

export type ResolvedAnalysisIr = {
  schemaVersion: '1.0';
  policyHash: string;
  compilerOptionsHash: string;
  files: ResolvedAnalysisFile[];
  layers: string[];
  edges: ArchitectureEngineEdge[];
  capabilityUses: ResolvedCapabilityFact[];
  violations: ArchitectureEngineViolation[];
  warnings: ArchitectureEngineViolation[];
};

export type ResolvedSafetyReport = {
  tsSuppressions: { file: string; line: number }[];
  anyCasts: { file: string; line: number }[];
  nonLiteralDynamicImports: { file: string; line: number; kind: 'import' | 'require' }[];
  inMemoryProductionStores: { file: string; line: number; store: string }[];
  disabledPeerIsolationRules: { from: string; to: string }[];
  thresholds: { maxTsSuppressions: number; maxAnyCasts: number };
};

export type ResolvedAnalysisResult = {
  mode: 'resolved-candidate-facts';
  completeness: ResolvedFactsCompleteness;
  completenessReasons: ResolvedFactsReason[];
  valid: boolean;
  strictValid: boolean;
  policyHash: string;
  factsHash: ResolvedCandidateFacts['factsHash'];
  resolverIdentity: ResolvedCandidateFacts['resolverIdentity'];
  candidateTreeHash: ResolvedCandidateFacts['candidateTreeHash'];
  safety: ResolvedSafetyReport;
  ir: ResolvedAnalysisIr;
};

export type ResolvedChangePreflightResult = {
  schemaVersion: '1.0';
  mode: 'resolved-candidate-facts';
  valid: boolean;
  readOnly: true;
  policyHash: string;
  resolverIdentity: string;
  compilerIdentity: string;
  compilerOptionsHash: string;
  tsconfigHash: string;
  baseCompilerOptionsHash: string;
  candidateCompilerOptionsHash: string;
  baseTsconfigHash: string;
  candidateTsconfigHash: string;
  evidenceRequirementsHash: string;
  baseFactsHash: string;
  candidateFactsHash: string;
  baseTreeHash: string;
  candidateTreeHash: string;
  baseCompleteness: ResolvedFactsCompleteness;
  candidateCompleteness: ResolvedFactsCompleteness;
  baseCompletenessReasons: ResolvedFactsReason[];
  candidateCompletenessReasons: ResolvedFactsReason[];
  changeMapHash?: string;
  convergence?: ArchitectureConvergenceResult;
  changes: PreparedChangeFile[];
  violations: ArchitectureEngineViolation[];
  warnings: ArchitectureEngineViolation[];
};

export type AnalyzePolicyDeltaInput = {
  baseConfig: unknown;
  candidateConfig: unknown;
  acknowledgement?: PolicyDeltaAcknowledgement;
  baseSource?: string;
  candidateSource?: string;
  /** Optional pre-resolved Effective ArkRules for each side (ADR 0012 / AR02). */
  baseArkRules?: EffectiveArkRules;
  candidateArkRules?: EffectiveArkRules;
};

export type PolicyDeltaAnalysis = {
  schemaVersion: '1.0';
  basePolicyHash: string;
  candidatePolicyHash: string;
  classification: PolicyDeltaClassification;
  findings: PolicyDeltaFinding[];
  blockingFindingIds: string[];
  requiresAcknowledgement: boolean;
  acknowledged: boolean;
  valid: boolean;
};

export type ArchitectureEngineViolation = {
  ruleId: string;
  message: string;
  file?: string;
  line?: number;
  target?: string;
  fromLayer?: string;
  toLayer?: string;
  nextAction?: string;
  [key: string]: unknown;
};

export type ArchitectureEngineEdge = {
  from: string;
  fromLayer: string | null;
  to?: string;
  toLayer?: string;
  line: number;
  kind: string;
  typeOnly?: boolean;
  targetTypeOnlyExports?: boolean;
  sourcePureTypeModule?: boolean;
  namedBindingsTypeOnly?: boolean;
  portProofEligible?: boolean;
};

export type EvaluateArchitectureGraphInput = {
  config: ArkConfig;
  rules: ArkConfig['rules'];
  files: readonly string[];
  contentViolations: readonly ArchitectureEngineViolation[];
  edges: readonly ArchitectureEngineEdge[];
  warnings?: readonly ArchitectureEngineViolation[];
  safety?: unknown;
};

export type ArchitectureEngineResult = {
  violations: ArchitectureEngineViolation[];
  warnings: ArchitectureEngineViolation[];
  safety?: unknown;
};

export type PreparedChangeFile = {
  path: string;
  operation: 'create' | 'update' | 'delete';
  beforeContentHash?: string;
  candidateContentHash?: string;
};

export type ChangePreflightResult = {
  schemaVersion: '1.0';
  mode: 'lexical-compatibility';
  valid: boolean;
  readOnly: true;
  policyHash: string;
  compilerOptionsHash: string;
  baseTreeHash: string;
  candidateTreeHash: string;
  baseCompleteness: ResolvedFactsCompleteness;
  candidateCompleteness: ResolvedFactsCompleteness;
  baseCompletenessReasons: ResolvedFactsReason[];
  candidateCompletenessReasons: ResolvedFactsReason[];
  changeMapHash?: string;
  convergence?: ArchitectureConvergenceResult;
  changes: PreparedChangeFile[];
  violations: ArchitectureEngineViolation[];
  warnings: ArchitectureEngineViolation[];
};

export type CollectAnalysisConfigWarningsInput = {
  config: ArkConfig;
  rules: ArkConfig['rules'];
  files: readonly string[];
  manifest?: {
    architecture?: { layers?: readonly { name?: string; prefixes?: readonly string[] }[] };
  };
};
