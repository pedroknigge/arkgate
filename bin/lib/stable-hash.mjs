/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/stableHash.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/stable-hash.mjs). Zero Node I/O.
 */

/** Stable FNV-1a hash. Identity/fingerprint only — not a security primitive. */
export function deterministicHash(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
/** Serialize JSON-like values with sorted object keys for reproducible hashes. */
export function stableSerialize(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(stableSerialize).join(',')}]`;
    const object = value;
    return `{${Object.keys(object)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableSerialize(object[key])}`)
        .join(',')}}`;
}
