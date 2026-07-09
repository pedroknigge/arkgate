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
