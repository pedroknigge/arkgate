/**
 * Stable, pure vocabulary for ArkGate's importable analysis engine.
 *
 * This module owns the Analysis IR types and re-exports the resolved-candidate-facts
 * pilot cluster (plan-B / pattern-b:god-module). Parsing and filesystem discovery
 * belong to adapters.
 *
 * Cluster:
 * - `stableHash` — identity/fingerprint primitives
 * - `resolvedCandidateFactsTypes` — versioned fact types
 * - `resolvedCandidateFacts` — create/load/canonicalize
 * - `resolvedCandidateFactsSchema` — published JSON Schema
 *
 * Consumer import paths through this facade remain stable (same pattern as Kernel
 * `analysis.ts` after U02).
 */

export { deterministicHash, stableSerialize } from './stableHash';

export {
  RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION,
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
} from './resolvedCandidateFactsTypes';

export {
  createResolvedCandidateFacts,
  loadResolvedCandidateFacts,
  resolvedFactsEvidenceRequirementsHash,
} from './resolvedCandidateFacts';

export { RESOLVED_CANDIDATE_FACTS_SCHEMA } from './resolvedCandidateFactsSchema';

export const ANALYSIS_IR_SCHEMA_VERSION = '1.0' as const;

export type AnalysisFileInput = {
  path: string;
  content: string;
};

export type AnalysisFileChange =
  | { path: string; content: string }
  | { path: string; delete: true };

export type AnalysisCompilerOptions = Readonly<Record<string, unknown>>;

export type AnalysisFile = AnalysisFileInput & {
  contentHash: string;
  layer: string | null;
};

export type AnalysisImportEdge = {
  from: string;
  specifier: string;
  to: string | null;
  resolution: 'resolved' | 'unresolved';
  fromLayer: string | null;
  toLayer: string | null;
  evidence: AnalysisEvidence;
};

/** A capability use is reserved for C04's symbol-aware implementation. */
export type AnalysisCapabilityUse = {
  file: string;
  symbol: string;
  capability: string;
  evidence: AnalysisEvidence;
};

export type AnalysisEvidence = {
  kind: 'import' | 'policy';
  file: string;
  line: number;
  excerpt: string;
};

export type AnalysisViolation = {
  ruleId: string;
  message: string;
  edge?: AnalysisImportEdge;
  /** U04 (additive): present on CAPABILITY_VIOLATION — the denied capability id. */
  capability?: string;
  /** U04 (additive): the matched module specifier or ambient path. */
  symbol?: string;
  evidence: AnalysisEvidence;
};

export type AnalysisIr = {
  schemaVersion: typeof ANALYSIS_IR_SCHEMA_VERSION;
  policyHash: string;
  compilerOptionsHash: string;
  files: AnalysisFile[];
  layers: string[];
  edges: AnalysisImportEdge[];
  capabilityUses: AnalysisCapabilityUse[];
  violations: AnalysisViolation[];
};
