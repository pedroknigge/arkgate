/**
 * One next line for a fresh tree and for commands that would otherwise
 * point back at themselves. Callers print `lead`. Null means the caller
 * keeps its own step.
 *
 * Canonical for status, doctor, check, start preview, and recommend.
 * Generated to `bin/lib/first-step.mjs`.
 */

export const ABSENT_CONFIG_FIRST_STEP =
  'No ark.config.json found — run arkgate start (preview) then arkgate start --apply.';

export const APPLY_WILL_REFUSE_FIRST_STEP =
  'Apply will refuse. Next: arkgate start --archetype <id> or --preset <name>, or arkgate-check --recommend.';

export const PLAN_WRITTEN_FIRST_STEP = '/ark-adopt';

const SELF_POINT_FALLBACKS = [
  APPLY_WILL_REFUSE_FIRST_STEP,
  PLAN_WRITTEN_FIRST_STEP,
  ABSENT_CONFIG_FIRST_STEP,
] as const;

/** A next line names the command that just finished when `justRan` is the full command. */
export function nextStepPointsAtItself(
  lead: string | null | undefined,
  justRan: string | null | undefined
): boolean {
  return (
    typeof lead === 'string' &&
    typeof justRan === 'string' &&
    justRan.length >= 8 &&
    lead.includes(justRan)
  );
}

export type FirstStepFacts = {
  /** False only when this tree has no ark.config.json. */
  configPresent?: boolean;
  /** Start preview already knows `--apply` will refuse on coverage or shape. */
  applyWillRefuse?: boolean;
  /** `--recommend --write-plan` just wrote the plan file. */
  planJustWritten?: boolean;
  /**
   * Full command that just finished. A prefix such as `arkgate start` matches
   * both the absent-config sentence and the unlock sentence, so callers pass
   * the whole command (`arkgate start --apply`, `ark-check --recommend --write-plan`).
   */
  justRan?: string | null;
};

function chooseFirstStep(facts: FirstStepFacts): string | null {
  if (facts.configPresent === false) return ABSENT_CONFIG_FIRST_STEP;
  if (facts.planJustWritten === true) return PLAN_WRITTEN_FIRST_STEP;
  if (facts.applyWillRefuse === true) return APPLY_WILL_REFUSE_FIRST_STEP;
  return null;
}

export function resolveFirstStep(facts: FirstStepFacts = {}): string | null {
  const chosen = chooseFirstStep(facts);
  if (chosen == null) return null;
  if (!nextStepPointsAtItself(chosen, facts.justRan)) return chosen;
  for (const fallback of SELF_POINT_FALLBACKS) {
    if (!nextStepPointsAtItself(fallback, facts.justRan)) return fallback;
  }
  return chosen;
}

const ARK_ORDER_CANDIDATE = /\b(billing|pricing|subscription)\b/i;

/** True when source text names a billing, pricing, or subscription candidate. */
export function textHasArkOrderCandidate(text: string | null | undefined): boolean {
  return ARK_ORDER_CANDIDATE.test(String(text ?? ''));
}
