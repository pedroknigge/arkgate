/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/agentProjection.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/agent-projection.mjs). Zero Node I/O.
 */

export { AGENT_PROJECTION_BEGIN_MARKER, AGENT_PROJECTION_END_MARKER, AGENT_PROJECTION_ENFORCEMENT_SURFACES, AGENT_PROJECTION_NON_ENFORCEMENT_LABEL, ARK_AGENT_PROJECTION_SCHEMA_VERSION, DEFAULT_AGENT_PROJECTION_RULE_IDS, } from './agent-projection-types.mjs';
export { agentProjectionContentIdentity, buildAgentProjectionBeginMarker, buildAgentProjectionBlock, buildAgentProjectionBody, buildAgentProjectionMeta, formatAgentProjectionCatalogShortList, formatAgentProjectionLayers, } from './agent-projection-formatters.mjs';
export { extractAgentProjectionBlock, mergeAgentProjectionDocument, parseAgentProjectionStamp, projectionHasNonEnforcementLabel, projectionMatchesPackageVersion, } from './agent-projection-merge.mjs';
