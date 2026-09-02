/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/baselineKey.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/baseline-key.mjs). Zero Node I/O.
 */

/** Config diagnostics that are never code debt. Not a schema key. */
export const NON_FREEZABLE_BASELINE_RULE_IDS = ['ARKRULE_SCOPE_EMPTY'];
/**
 * STRUCTURE freeze `target`: sensor id, plus `:symbol` when a method/class is known.
 * V1 empty-target keys (`ARKRULE_STRUCTURE|file|layer||`) stay exact-match only —
 * they must not prefix-silence every later sensor on that file.
 */
export function structureFreezeTarget(input) {
    if (typeof input.target === 'string' && input.target.length > 0) {
        return input.target;
    }
    let sensor = String(input.sensor || input.code || '').trim();
    if (!sensor && typeof input.message === 'string') {
        const named = input.message.match(/\(sensor ([a-z0-9-]+)\)/i);
        if (named?.[1])
            sensor = named[1];
    }
    const symbol = String(input.symbol || '').trim();
    if (!sensor)
        return symbol;
    return symbol ? `${sensor}:${symbol}` : sensor;
}
/**
 * Config diagnostics (empty ArkRule scope) are not freezable even with `--force`.
 * There is no `allowEmptyScope` key — land the rule as advisory, then promote.
 */
export function isFreezableBaselineViolation(violation) {
    if (violation.freezable === false)
        return false;
    const ruleId = typeof violation.ruleId === 'string' ? violation.ruleId : '';
    return !NON_FREEZABLE_BASELINE_RULE_IDS.includes(ruleId);
}
/**
 * Stable key used by `--baseline` / `--update-baseline` to match frozen debt.
 * Field order and empty-string fallbacks are part of the CLI contract.
 *
 * Same string is the ACS06 finding `targetKey` (baseline-compatible).
 * New `ARKRULE_STRUCTURE` freezes put sensor (+ optional symbol) in `target`.
 */
export function baselineKey(violation) {
    const target = violation.ruleId === 'ARKRULE_STRUCTURE'
        ? structureFreezeTarget(violation)
        : (violation.target ?? '');
    return [
        violation.ruleId,
        violation.file,
        violation.fromLayer ?? '',
        violation.toLayer ?? '',
        target,
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
 * Non-freezable findings (`freezable: false` or `ARKRULE_SCOPE_EMPTY`) emit an
 * empty string so `baselineRecordsDocument` drops them on write and `--baseline`
 * never matches them (index-preserving for ratchet zip).
 *
 * ACS06 multi-turn adapters must use these keys as `targetKey` so occurrence
 * identity matches the freeze ratchet (never orphan baselines).
 */
export function baselineOccurrenceKeys(violations) {
    const counts = new Map();
    return violations.map((violation) => {
        // Empty freeze identity: write drops Boolean-falsy keys; match never suppresses.
        if (!isFreezableBaselineViolation(violation)) {
            return '';
        }
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
