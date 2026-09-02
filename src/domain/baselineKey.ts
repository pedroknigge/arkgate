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
  /** STRUCTURE sensor id (Kernel copies this into `target` for new freezes). */
  sensor?: string;
  /** Optional class/method symbol folded into STRUCTURE `target` as `sensor:symbol`. */
  symbol?: string;
  /** Sensor messages include `(sensor <id>)`; used when Kernel has not copied `target` yet. */
  message?: string;
  /**
   * When false, freeze occurrence keys are empty: `--update-baseline` (including
   * `--force`) does not write them, and `--baseline` does not suppress them.
   */
  freezable?: boolean;
};

/** Config diagnostics that are never code debt. Not a schema key. */
export const NON_FREEZABLE_BASELINE_RULE_IDS = ['ARKRULE_SCOPE_EMPTY'] as const;

/**
 * STRUCTURE freeze `target`: sensor id, plus `:symbol` when a method/class is known.
 * V1 empty-target keys (`ARKRULE_STRUCTURE|file|layer||`) stay exact-match only —
 * they must not prefix-silence every later sensor on that file.
 */
export function structureFreezeTarget(input: {
  sensor?: string;
  code?: string;
  symbol?: string;
  target?: string;
  message?: string;
}): string {
  if (typeof input.target === 'string' && input.target.length > 0) {
    return input.target;
  }
  let sensor = String(input.sensor || input.code || '').trim();
  if (!sensor && typeof input.message === 'string') {
    const named = input.message.match(/\(sensor ([a-z0-9-]+)\)/i);
    if (named?.[1]) sensor = named[1];
  }
  const symbol = String(input.symbol || '').trim();
  if (!sensor) return symbol;
  return symbol ? `${sensor}:${symbol}` : sensor;
}

/**
 * Config diagnostics (empty ArkRule scope) are not freezable even with `--force`.
 * There is no `allowEmptyScope` key — land the rule as advisory, then promote.
 */
export function isFreezableBaselineViolation(violation: BaselineKeyViolation): boolean {
  if (violation.freezable === false) return false;
  const ruleId = typeof violation.ruleId === 'string' ? violation.ruleId : '';
  return !(NON_FREEZABLE_BASELINE_RULE_IDS as readonly string[]).includes(ruleId);
}

/**
 * Stable key used by `--baseline` / `--update-baseline` to match frozen debt.
 * Field order and empty-string fallbacks are part of the CLI contract.
 *
 * Same string is the ACS06 finding `targetKey` (baseline-compatible).
 * New `ARKRULE_STRUCTURE` freezes put sensor (+ optional symbol) in `target`.
 */
export function baselineKey(violation: BaselineKeyViolation): string {
  const target =
    violation.ruleId === 'ARKRULE_STRUCTURE'
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
export function baselineOccurrenceKeys(
  violations: BaselineKeyViolation[]
): string[] {
  const counts = new Map<string, number>();
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
