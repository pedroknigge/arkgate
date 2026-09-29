/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/arkOrderTypes.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/ark-order-types.mjs). Zero Node I/O.
 */

export const DEFAULT_MAX_XI_KEYS = 7;
/** ξ keys that name freshness. Freshness is σ, never ξ (runtime and static sensor share this). */
export const XI_TTL_KEY_RE = /^(ttl|freshUntil|fresh_until|maxAge|max_age)$/i;
export const INGEST_RESIDUAL_KINDS = ['absorb', 'escalate_up', 'hold'];
export const INGEST_REASON_CODES = ['not-in-pattern', 'stale-sigma', 'pack', 'capacity'];
export const CAPACITY_OPS = ['lte', 'lt', 'gte', 'gt'];
