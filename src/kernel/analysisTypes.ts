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
} from '../domain/analysis';
import type { ArkConfig, ArkConfigLoadResult } from '../domain/configTypes';
import type {
  PolicyDeltaAcknowledgement,
  PolicyDeltaClassification,
  PolicyDeltaFinding,
} from '../domain/policyDelta';
import type { ArchitectureChangeMapContract } from '../domain/changeMap';
import type { ArchitectureConvergenceResult } from '../domain/changeConvergence';

export type AnalysisContract = ArkConfigLoadResult & { policyHash: string };

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
  ir: AnalysisIr;
};

export type AnalyzePolicyDeltaInput = {
  baseConfig: unknown;
  candidateConfig: unknown;
  acknowledgement?: PolicyDeltaAcknowledgement;
  baseSource?: string;
  candidateSource?: string;
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
  fromLayer: string;
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
  valid: boolean;
  readOnly: true;
  policyHash: string;
  compilerOptionsHash: string;
  baseTreeHash: string;
  candidateTreeHash: string;
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
