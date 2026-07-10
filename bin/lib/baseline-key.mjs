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
