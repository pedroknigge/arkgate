/**
 * Pure baseline identity key for ark-check violation freeze / ratchet.
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
