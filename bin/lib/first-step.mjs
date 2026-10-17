/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/firstStep.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/first-step.mjs). Zero Node I/O.
 */

export const ABSENT_CONFIG_FIRST_STEP = 'No ark.config.json found — run arkgate start (preview) then arkgate start --apply.';
export const APPLY_WILL_REFUSE_FIRST_STEP = 'Apply will refuse. Next: arkgate start --archetype <id> or --preset <name>, or arkgate-check --recommend.';
export const PLAN_WRITTEN_FIRST_STEP = '/ark-adopt';
const SELF_POINT_FALLBACKS = [
    APPLY_WILL_REFUSE_FIRST_STEP,
    PLAN_WRITTEN_FIRST_STEP,
    ABSENT_CONFIG_FIRST_STEP,
];
/** A next line names the command that just finished when `justRan` is the full command. */
export function nextStepPointsAtItself(lead, justRan) {
    return (typeof lead === 'string' &&
        typeof justRan === 'string' &&
        justRan.length >= 8 &&
        lead.includes(justRan));
}
function chooseFirstStep(facts) {
    if (facts.configPresent === false)
        return ABSENT_CONFIG_FIRST_STEP;
    if (facts.planJustWritten === true)
        return PLAN_WRITTEN_FIRST_STEP;
    if (facts.applyWillRefuse === true)
        return APPLY_WILL_REFUSE_FIRST_STEP;
    return null;
}
export function resolveFirstStep(facts = {}) {
    const chosen = chooseFirstStep(facts);
    if (chosen == null)
        return null;
    if (!nextStepPointsAtItself(chosen, facts.justRan))
        return chosen;
    for (const fallback of SELF_POINT_FALLBACKS) {
        if (!nextStepPointsAtItself(fallback, facts.justRan))
            return fallback;
    }
    return chosen;
}
const ARK_ORDER_CANDIDATE = /\b(billing|pricing|subscription)\b/i;
/** True when source text names a billing, pricing, or subscription candidate. */
export function textHasArkOrderCandidate(text) {
    return ARK_ORDER_CANDIDATE.test(String(text ?? ''));
}
