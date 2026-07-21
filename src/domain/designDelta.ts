/** Public neutral contract for the opt-in new-code design-fitness ratchet. */

export const ARK_DESIGN_DELTA_SCHEMA_VERSION = '1.0' as const;

export type DesignSmellId =
  | 'io-under-application'
  | 'handler-in-persistence'
  | 'god-module'
  | 'domain-logic-in-ui'
  | 'facade-sql-in-routes'
  | 'mixed-pattern-cluster'
  | 'soft-contract';

export type DesignDeltaIdentity = {
  kind: 'git-tree' | 'candidate-tree';
  value: string;
  commit?: string;
};

export type DesignSmellEvidence = {
  kind: string;
  path: string;
  line?: number;
  symbol?: string;
  detail?: string;
  magnitude: number;
};

export type DesignSmellFinding = {
  smellId: DesignSmellId;
  fingerprint: string;
  identity: string;
  evidence: DesignSmellEvidence;
  repairHint: string;
};

export type DesignDeltaChange = DesignSmellFinding & {
  classification: 'new' | 'worsened';
  baseMagnitude: number;
  candidateMagnitude: number;
};

export type ArkDesignDeltaResult = {
  schemaVersion: typeof ARK_DESIGN_DELTA_SCHEMA_VERSION;
  mode: 'git-base' | 'write-candidate';
  complete: boolean;
  valid: boolean;
  base: DesignDeltaIdentity;
  candidate: DesignDeltaIdentity;
  supportedSmellIds: readonly DesignSmellId[];
  touchedPaths: readonly string[];
  changes: readonly DesignDeltaChange[];
  baseFindingCount: number;
  candidateFindingCount: number;
  historicalResidualCount: number;
  error?: string;
};
