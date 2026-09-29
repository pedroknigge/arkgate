/**
 * Portable identity/fingerprint primitives for pure Domain contracts.
 *
 * FNV-1a is intentional: no Node crypto dependency for CLI/MCP/browserless consumers.
 */

/** Stable FNV-1a hash. Identity/fingerprint only — not a security primitive. */
export function deterministicHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** Serialize JSON-like values with sorted object keys for reproducible hashes. */
export function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(object[key])}`)
    .join(',')}}`;
}

type HashState = { hash: number };

function feedText(text: string, state: HashState): void {
  let hash = state.hash;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  state.hash = hash;
}

function feedStable(value: object, state: HashState): void {
  if (Array.isArray(value)) {
    feedText('[', state);
    for (let index = 0; index < value.length; index += 1) {
      if (index > 0) feedText(',', state);
      // `map` skips holes and `join` renders an undefined element as ''.
      if (!(index in value)) continue;
      const item: unknown = value[index];
      if (item !== null && typeof item === 'object') feedStable(item, state);
      else {
        const text = JSON.stringify(item) as string | undefined;
        if (text !== undefined) feedText(text, state);
      }
    }
    feedText(']', state);
    return;
  }
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  feedText('{', state);
  for (let index = 0; index < keys.length; index += 1) {
    if (index > 0) feedText(',', state);
    const key = keys[index];
    feedText(`${JSON.stringify(key)}:`, state);
    const item = object[key];
    // A template literal renders an undefined serialization as 'undefined'.
    if (item !== null && typeof item === 'object') feedStable(item, state);
    else feedText(`${JSON.stringify(item) as string | undefined}`, state);
  }
  feedText('}', state);
}

/**
 * `deterministicHash(stableSerialize(value))`, byte for byte, without building
 * the serialized text. A large fact set hashes without first materializing a
 * multi-megabyte string and every intermediate join.
 */
export function stableHash(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return deterministicHash(stableSerialize(value));
  }
  const state: HashState = { hash: 0x811c9dc5 };
  feedStable(value, state);
  return `fnv1a-${(state.hash >>> 0).toString(16).padStart(8, '0')}`;
}
