/**
 * Version-matched agent contract projection (ACS04) — public facade.
 *
 * Compact agent-facing markdown (plus meta) derived from the installed package
 * version and an effective project contract summary. Explicitly **non-authoritative**:
 * enforcement is ark-check / hooks / CI — never this projection, AGENTS.md, or skills.
 *
 * **Canonical** for `ark agents-md`, install/upgrade AGENTS embedding, and drift tests.
 * Tooling gathers filesystem facts; Domain only formats pure inputs.
 *
 * Shape split: types/markers → `agentProjectionTypes.ts`; body/meta formatters →
 * `agentProjectionFormatters.ts`; merge/stamp → `agentProjectionMerge.ts`.
 * Callers keep importing this module.
 *
 * Zero Node I/O. Optional CLI surface: generated `bin/lib/agent-projection.mjs`.
 *
 * @see docs/plans/agent-contract-surface-4.3/README.md
 */

export {
  AGENT_PROJECTION_BEGIN_MARKER,
  AGENT_PROJECTION_END_MARKER,
  AGENT_PROJECTION_ENFORCEMENT_SURFACES,
  AGENT_PROJECTION_NON_ENFORCEMENT_LABEL,
  ARK_AGENT_PROJECTION_SCHEMA_VERSION,
  DEFAULT_AGENT_PROJECTION_RULE_IDS,
  type AgentProjectionCatalogEntry,
  type AgentProjectionFacts,
  type AgentProjectionLayerSummary,
  type AgentProjectionMergeAction,
  type AgentProjectionMergeResult,
  type AgentProjectionMeta,
  type AgentProjectionProfile,
} from './agentProjectionTypes';

export {
  agentProjectionContentIdentity,
  buildAgentProjectionBeginMarker,
  buildAgentProjectionBlock,
  buildAgentProjectionBody,
  buildAgentProjectionMeta,
  formatAgentProjectionCatalogShortList,
  formatAgentProjectionLayers,
} from './agentProjectionFormatters';

export {
  extractAgentProjectionBlock,
  mergeAgentProjectionDocument,
  parseAgentProjectionStamp,
  projectionHasNonEnforcementLabel,
  projectionMatchesPackageVersion,
} from './agentProjectionMerge';
