/** Public, evidence-backed enforcement state shared by doctor adapters. */

export const ARK_ENFORCEMENT_STATE_SCHEMA_VERSION = '1.0' as const;

export type EnforcementVerification = boolean | 'unverified';

export type EnforcementEvidenceField =
  | 'configured'
  | 'installed'
  | 'active'
  | 'bypassable'
  | 'required';

export type EnforcementEvidence =
  | {
      field: 'configured' | 'installed';
      source: string;
      value: boolean;
    }
  | {
      field: 'active' | 'bypassable' | 'required';
      source: string;
      value: EnforcementVerification;
    };

/**
 * State for one enforcement boundary.
 *
 * `configured` records valid wiring, while `installed` requires the referenced
 * package or executable to resolve. Runtime/provider facts remain
 * `unverified` until observed; local files never prove `required: true`.
 */
export type EnforcementBoundaryState = {
  supported: boolean;
  analyzed: boolean;
  configured: boolean;
  installed: boolean;
  active: EnforcementVerification;
  bypassable: EnforcementVerification;
  required: EnforcementVerification;
  evidence: readonly EnforcementEvidence[];
};

export type ArkEnforcementHost = 'claude' | 'grok' | 'cursor' | 'codex' | 'unknown';

export type ArkEnforcementState = {
  schemaVersion: typeof ARK_ENFORCEMENT_STATE_SCHEMA_VERSION;
  activeHost: ArkEnforcementHost;
  localWrite: EnforcementBoundaryState;
  advisoryMcp: EnforcementBoundaryState;
  ciMerge: EnforcementBoundaryState;
};
