import {
  ARK_ENFORCEMENT_STATE_SCHEMA_VERSION,
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
  bypassable: true,
  required: 'unverified',
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
void invalidConfigured;
void invalidInstalledEvidence;
void legacyAlias;
