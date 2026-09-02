/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/agentProjectionTypes.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/agent-projection-types.mjs). Zero Node I/O.
 */

export const ARK_AGENT_PROJECTION_SCHEMA_VERSION = '1.0';
/** Begin marker for the managed projection region inside AGENTS.md (or equivalent). */
export const AGENT_PROJECTION_BEGIN_MARKER = '<!-- arkgate:agent-projection:begin';
/** End marker for the managed projection region. */
export const AGENT_PROJECTION_END_MARKER = '<!-- arkgate:agent-projection:end -->';
/**
 * Non-enforcement label — must appear in every generated projection body.
 * Agents and humans must not treat the projection as a pass/fail authority.
 */
export const AGENT_PROJECTION_NON_ENFORCEMENT_LABEL = 'This projection is **non-authoritative**. Enforcement is `ark-check` / host write hooks / required CI (`--strict-merge`), not AGENTS.md, skills, or this block.';
/** Surfaces that actually enforce (closed vocabulary for meta + docs). */
export const AGENT_PROJECTION_ENFORCEMENT_SURFACES = Object.freeze([
    'ark-check',
    'host-write-hooks',
    'ci-strict-merge',
]);
/**
 * High-signal public ruleIds for the compact catalog short list in the projection.
 * Full catalog remains `docs/diagnostics.md` / `DIAGNOSTIC_CATALOG` (ACS02).
 * Titles are supplied by Tooling from the catalog when available.
 */
export const DEFAULT_AGENT_PROJECTION_RULE_IDS = Object.freeze([
    'LAYER_IMPORT_VIOLATION',
    'LAYER_INTENT_REFERENCE_VIOLATION',
    'CIRCULAR_DEPENDENCY',
    'CAPABILITY_VIOLATION',
    'RAW_EVENT_PUBLISH',
    'ARKRULE_STRUCTURE',
    'ATOMIC_PREFLIGHT_UNAVAILABLE',
    'ANALYSIS_PARSE_INCOMPLETE',
    'ARK_UNKNOWN',
]);
