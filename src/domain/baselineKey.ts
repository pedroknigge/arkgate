/**
 * Pure baseline identity key for structrail-check violation freeze / ratchet.
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
