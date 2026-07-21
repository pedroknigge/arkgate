import {
  ARK_ENFORCEMENT_STATE_SCHEMA_VERSION,
  ARK_DESIGN_DELTA_SCHEMA_VERSION,
  type ArkDesignDeltaResult,
  type ArkEnforcementState,
  type EnforcementBoundaryState,
  type EnforcementEvidence,
} from '../../../src/gate';
import type { ArkEnforcementState as RuntimeArkEnforcementState } from '../../../src/index';

const boundary: EnforcementBoundaryState = {
  supported: true,
  analyzed: true,
  configured: true,
  installed: true,
  active: 'unverified',
  runtimeObserved: false,
  operation: null,
  operationCoverage: 'unverified',
  bypassable: true,
  required: 'unverified',
  hard: false,
  evidence: [
    { field: 'installed', source: 'node_modules/arkgate/package.json', value: true },
  ],
};

const state: ArkEnforcementState = {
  schemaVersion: ARK_ENFORCEMENT_STATE_SCHEMA_VERSION,
  activeHost: 'claude',
  localWrite: boundary,
  advisoryMcp: boundary,
  ciMerge: boundary,
};

const runtimeState: RuntimeArkEnforcementState = state;

const designDelta: ArkDesignDeltaResult = {
  schemaVersion: ARK_DESIGN_DELTA_SCHEMA_VERSION,
  mode: 'write-candidate',
  complete: true,
  valid: true,
  base: { kind: 'candidate-tree', value: 'sha256:base' },
  candidate: { kind: 'candidate-tree', value: 'sha256:candidate' },
  supportedSmellIds: ['domain-logic-in-ui'],
  touchedPaths: ['src/ui/page.tsx'],
  changes: [],
  baseFindingCount: 0,
  candidateFindingCount: 0,
  historicalResidualCount: 0,
};

const invalidConfigured: EnforcementBoundaryState = {
  ...boundary,
  // @ts-expect-error Local configuration is directly observable, not externally unverified.
  configured: 'unverified',
};

const invalidInstalledEvidence: EnforcementEvidence = {
  field: 'installed',
  source: 'package.json',
  // @ts-expect-error Local installation evidence cannot carry an external unknown.
  value: 'unverified',
};

const legacyAlias: ArkEnforcementState = {
  ...state,
  // @ts-expect-error requiredStatus is an adapter-only compatibility alias.
  requiredStatus: 'unverified',
};

void runtimeState;
void designDelta;
void invalidConfigured;
void invalidInstalledEvidence;
void legacyAlias;
