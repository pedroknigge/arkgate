/**
 * Stable, pure vocabulary for ArkGate's importable analysis engine.
 *
 * Parsing and filesystem discovery belong to adapters. This module intentionally
 * contains only the versioned data contract and deterministic hash primitives.
 */

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

/**
 * Stable FNV-1a hash. It is an identity/fingerprint, not a security primitive.
 * The output is deliberately portable across the CLI, MCP, hooks, and browserless
 * consumers without Node's crypto runtime.
 */
export function deterministicHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** Serialize JSON-like values with sorted object keys for reproducible hashes. */
export function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(object[key])}`)
    .join(',')}}`;
}
