/**
 * Version-matched agent contract projection types and markers (ACS04).
 *
 * Split from agentProjection.ts: constants, markers, and fact/meta types.
 * Tooling gathers filesystem facts; this module only names the contract.
 *
 * Zero Node I/O. Optional CLI surface: generated `bin/lib/agent-projection-types.mjs`.
 *
 * @see docs/plans/agent-contract-surface-4.3/README.md
 */

export const ARK_AGENT_PROJECTION_SCHEMA_VERSION = '1.0' as const;

/** Begin marker for the managed projection region inside AGENTS.md (or equivalent). */
export const AGENT_PROJECTION_BEGIN_MARKER = '<!-- arkgate:agent-projection:begin' as const;

/** End marker for the managed projection region. */
export const AGENT_PROJECTION_END_MARKER = '<!-- arkgate:agent-projection:end -->' as const;

/**
 * Non-enforcement label — must appear in every generated projection body.
 * Agents and humans must not treat the projection as a pass/fail authority.
 */
export const AGENT_PROJECTION_NON_ENFORCEMENT_LABEL =
  'This projection is **non-authoritative**. Enforcement is `ark-check` / host write hooks / required CI (`--strict-merge`), not AGENTS.md, skills, or this block.' as const;

/** Surfaces that actually enforce (closed vocabulary for meta + docs). */
export const AGENT_PROJECTION_ENFORCEMENT_SURFACES = Object.freeze([
  'ark-check',
  'host-write-hooks',
  'ci-strict-merge',
] as const);

/**
 * High-signal public ruleIds for the compact catalog short list in the projection.
 * Full catalog remains `docs/diagnostics.md` / `DIAGNOSTIC_CATALOG` (ACS02).
 * Titles are supplied by Tooling from the catalog when available.
 */
export const DEFAULT_AGENT_PROJECTION_RULE_IDS: readonly string[] = Object.freeze([
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

export type AgentProjectionLayerSummary = {
  name: string;
  patterns?: readonly string[];
  intentPrefixes?: readonly string[];
};

export type AgentProjectionCatalogEntry = {
  ruleId: string;
  title: string;
};

export type AgentProjectionProfile = 'compact' | 'full';

/**
 * Pure facts supplied by Tooling after reading package version + ark.config.
 * Domain never opens files or prompts.
 */
export type AgentProjectionFacts = {
  /** Installed / shipping arkgate package version (stamped into the projection). */
  arkgateVersion: string;
  /** Project check command hint (e.g. `npm run check:architecture`). */
  checkCommand?: string | null;
  /** Effective layers from ark.config.json (null/empty → stock note). */
  layers?: readonly AgentProjectionLayerSummary[] | null;
  /** Short diagnostic catalog lines (ruleId + title). */
  catalogShortList?: readonly AgentProjectionCatalogEntry[] | null;
  /** Active host id when known (compact router context). */
  host?: string | null;
  /** full = placement + catalog short list; compact = thinner primary path. */
  profile?: AgentProjectionProfile | null;
  /** Docs path for the full diagnostic catalog (relative). */
  diagnosticsDocsPath?: string | null;
};

export type AgentProjectionMeta = {
  schemaVersion: typeof ARK_AGENT_PROJECTION_SCHEMA_VERSION;
  arkgateVersion: string;
  /** Always true — projection is never a gate input. */
  nonAuthoritative: true;
  enforcementSurfaces: readonly string[];
  /** Content identity of the projection body (markers excluded). */
  contentIdentity: string;
  layerCount: number;
  catalogCodeCount: number;
  profile: AgentProjectionProfile;
};

export type AgentProjectionMergeAction =
  | 'created'
  | 'block-replaced'
  | 'block-inserted'
  | 'unchanged';

export type AgentProjectionMergeResult = {
  content: string;
  action: AgentProjectionMergeAction;
  previousBlock: string | null;
  contentIdentity: string;
  /** True when customized text outside the managed block was preserved. */
  preservedOutsideBlock: boolean;
};
