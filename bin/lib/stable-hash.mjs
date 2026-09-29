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
function feedText(text, state) {
    let hash = state.hash;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    state.hash = hash;
}
function feedStable(value, state) {
    if (Array.isArray(value)) {
        feedText('[', state);
        for (let index = 0; index < value.length; index += 1) {
            if (index > 0)
                feedText(',', state);
            // `map` skips holes and `join` renders an undefined element as ''.
            if (!(index in value))
                continue;
            const item = value[index];
            if (item !== null && typeof item === 'object')
                feedStable(item, state);
            else {
                const text = JSON.stringify(item);
                if (text !== undefined)
                    feedText(text, state);
            }
        }
        feedText(']', state);
        return;
    }
    const object = value;
    const keys = Object.keys(object).sort();
    feedText('{', state);
    for (let index = 0; index < keys.length; index += 1) {
        if (index > 0)
            feedText(',', state);
        const key = keys[index];
        feedText(`${JSON.stringify(key)}:`, state);
        const item = object[key];
        // A template literal renders an undefined serialization as 'undefined'.
        if (item !== null && typeof item === 'object')
            feedStable(item, state);
        else
            feedText(`${JSON.stringify(item)}`, state);
    }
    feedText('}', state);
}
/**
 * `deterministicHash(stableSerialize(value))`, byte for byte, without building
 * the serialized text. A large fact set hashes without first materializing a
 * multi-megabyte string and every intermediate join.
 */
export function stableHash(value) {
    if (value === null || typeof value !== 'object') {
        return deterministicHash(stableSerialize(value));
    }
    const state = { hash: 0x811c9dc5 };
    feedStable(value, state);
    return `fnv1a-${(state.hash >>> 0).toString(16).padStart(8, '0')}`;
}
