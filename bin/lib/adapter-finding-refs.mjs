/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/adapterFindingRefs.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/adapter-finding-refs.mjs). Zero Node I/O.
 */

import { ADAPTER_DIAGNOSTIC_DOCS_RELATIVE_PATH, } from './adapter-contract-types.mjs';
/**
 * Baseline-compatible target key for a violation input.
 * Field order and empty-string fallbacks **must** match `baselineKey` in
 * `baselineKey.ts` — parity tests guard this so finding refs never orphan freezes.
 *
 * Note: uses raw ruleId/file strings (including empty) the same way baseline does;
 * display `ruleId` / `location.file` may still normalize to ARK_UNKNOWN / `<unknown>`.
 */
export function adapterFindingTargetKey(violation) {
    const ruleId = typeof violation.ruleId === 'string'
        ? violation.ruleId
        : typeof violation.code === 'string'
            ? violation.code
            : undefined;
    const file = typeof violation.file === 'string' ? violation.file : undefined;
    const fromLayer = typeof violation.fromLayer === 'string' ? violation.fromLayer : undefined;
    const toLayer = typeof violation.toLayer === 'string' ? violation.toLayer : undefined;
    const target = typeof violation.target === 'string' ? violation.target : undefined;
    return [
        ruleId,
        file,
        fromLayer ?? '',
        toLayer ?? '',
        target ?? '',
    ].join('|');
}
/**
 * Occurrence-aware target keys for a violation list (parity with baselineOccurrenceKeys).
 * First occurrence keeps the historical base key; duplicates get `#N`.
 */
export function adapterFindingOccurrenceTargetKeys(violations) {
    const counts = new Map();
    return violations.map((violation) => {
        const base = adapterFindingTargetKey(violation);
        const occurrence = (counts.get(base) ?? 0) + 1;
        counts.set(base, occurrence);
        return occurrence === 1 ? base : `${base}#${occurrence}`;
    });
}
/** FNV-1a finding ref from a baseline-compatible targetKey (not a security hash). */
export function adapterFindingRefFromTargetKey(targetKey) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < targetKey.length; index += 1) {
        hash ^= targetKey.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
/** Package-relative docs path with fragment for a public ruleId. */
export function adapterDocsCodePath(ruleId) {
    return `${ADAPTER_DIAGNOSTIC_DOCS_RELATIVE_PATH}#${ruleId}`;
}
