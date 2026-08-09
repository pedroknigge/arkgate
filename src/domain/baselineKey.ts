/**
 * Pure baseline identity key for ark-check violation freeze / ratchet.
 *
 * Also the **targetKey** plane for stable finding refs (ACS06): adapter
 * diagnostics bind `findingRef` → hash(`targetKey`) where `targetKey` is
 * exactly a baseline (occurrence) key. Refs must never invent a parallel
 * freeze identity — baselined debt stays addressable by the same key.
 *
 * **Canonical algorithm** — CLI loads generated `bin/lib/baseline-key.mjs`.
 * Zero Node I/O.
 */

export type BaselineKeyViolation = {
  ruleId?: string;
  file?: string;
  fromLayer?: string;
  toLayer?: string;
  target?: string;
};

/**
 * Stable key used by `--baseline` / `--update-baseline` to match frozen debt.
 * Field order and empty-string fallbacks are part of the CLI contract.
 *
 * Same string is the ACS06 finding `targetKey` (baseline-compatible).
 */
export function baselineKey(violation: BaselineKeyViolation): string {
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
export function baselineOccurrenceKeys(
  violations: BaselineKeyViolation[]
): string[] {
  const counts = new Map<string, number>();
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
export function findingTargetKey(violation: BaselineKeyViolation): string {
  return baselineKey(violation);
}

/**
 * Compact stable finding ref derived from a baseline-compatible targetKey.
 * FNV-1a identity only (same family as package fingerprints) — not a security hash.
 * Format: `fnv1a-` + 8 zero-padded hex digits.
 */
export function findingRefFromTargetKey(targetKey: string): string {
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
export function findingRefForViolation(violation: BaselineKeyViolation): string {
  return findingRefFromTargetKey(baselineKey(violation));
}
