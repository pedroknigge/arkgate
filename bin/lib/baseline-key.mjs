/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/baselineKey.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/baseline-key.mjs). Zero Node I/O.
 */

/**
 * Stable key used by `--baseline` / `--update-baseline` to match frozen debt.
 * Field order and empty-string fallbacks are part of the CLI contract.
 *
 * Same string is the ACS06 finding `targetKey` (baseline-compatible).
 */
export function baselineKey(violation) {
    return [
        violation.ruleId,
        violation.file,
        violation.fromLayer ?? '',
        violation.toLayer ?? '',
        violation.target ?? '',
    ].join('|');
}
/**
 * Stable per-occurrence keys for a list of violations.
 *
 * The first occurrence keeps the historical v1 key so existing baselines remain
 * compatible. Repeated violations with the same identity gain a `#N` suffix;
 * adding a second identical violation is therefore new debt instead of being
 * silently suppressed by the first occurrence's key.
 *
 * ACS06 multi-turn adapters must use these keys as `targetKey` so occurrence
 * identity matches the freeze ratchet (never orphan baselines).
 */
export function baselineOccurrenceKeys(violations) {
    const counts = new Map();
    return violations.map((violation) => {
        const base = baselineKey(violation);
        const occurrence = (counts.get(base) ?? 0) + 1;
        counts.set(base, occurrence);
        return occurrence === 1 ? base : `${base}#${occurrence}`;
    });
}
/**
 * ACS06: baseline-compatible target key for one finding (alias of baselineKey).
 * Prefer baselineOccurrenceKeys when emitting a list so duplicates stay distinct.
 */
export function findingTargetKey(violation) {
    return baselineKey(violation);
}
/**
 * Compact stable finding ref derived from a baseline-compatible targetKey.
 * FNV-1a identity only (same family as package fingerprints) — not a security hash.
 * Format: `fnv1a-` + 8 zero-padded hex digits.
 */
export function findingRefFromTargetKey(targetKey) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < targetKey.length; index += 1) {
        hash ^= targetKey.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
/**
 * Finding ref for a single violation (first-occurrence / solo identity).
 * For lists, hash baselineOccurrenceKeys(entries)[i] instead so duplicates differ.
 */
export function findingRefForViolation(violation) {
    return findingRefFromTargetKey(baselineKey(violation));
}
