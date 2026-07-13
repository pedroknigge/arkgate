/**
 * Q01 — Single post-green product path (“clarify for AI” / Shape).
 *
 * When edges are clean but design residual remains, doctor + agent routing name
 * ONE door that chains map → dual-plan B. No skill shopping; no new skill basename.
 * Plan B stays never mechanical-safe.
 */

/** Stable product id for JSON / tests. */
export const POST_GREEN_PATH_ID = 'clarify-for-ai';

/** Primary skill entry (map + dual-plan seed). Apply is second step of the same path. */
export const POST_GREEN_PRIMARY_SKILL = '/ark-explore';

/**
 * Canonical human / agent next-action string (single door).
 * Chained: explore shape-focus then autopilot only to apply B with user OK.
 */
export const POST_GREEN_PRIMARY_ACTION =
  'Clarify for AI (Shape): /ark-explore shape-focus → dual-plan B, then /ark-autopilot only to apply B with your OK — never empty plan A = done; patternBets never mechanical-safe';

/** Short label for tables / metrics. */
export const POST_GREEN_PRIMARY_SHORT =
  '/ark-explore shape-focus → /ark-autopilot (apply B with OK)  # clarify for AI';

/**
 * @param {{ designWeak?: boolean } | null | undefined} designFitness
 * @returns {null | {
 *   id: string,
 *   primary: true,
 *   skill: string,
 *   applySkill: string,
 *   flow: string,
 *   action: string,
 *   short: string,
 *   neverMechanicalSafe: true,
 *   healthyFinishedForbidden: true,
 * }}
 */
export function buildPostGreenNextAction(designFitness) {
  if (!designFitness?.designWeak) return null;
  return {
    id: POST_GREEN_PATH_ID,
    primary: true,
    skill: POST_GREEN_PRIMARY_SKILL,
    applySkill: '/ark-autopilot',
    flow: 'shape-focus',
    action: POST_GREEN_PRIMARY_ACTION,
    short: POST_GREEN_PRIMARY_SHORT,
    neverMechanicalSafe: true,
    healthyFinishedForbidden: true,
  };
}

/**
 * Put the single post-green door first; drop competing Shape guidance strings.
 * @param {string[]} actions
 * @param {ReturnType<typeof buildPostGreenNextAction>} postGreen
 * @returns {string[]}
 */
export function mergePostGreenTopActions(actions, postGreen) {
  const list = [...(actions || [])].filter(Boolean);
  if (!postGreen?.action) return [...new Set(list)];

  const competing =
    /\/ark-explore|\/ark-autopilot|shape residual|dual-plan B|pattern bet|shape-focus|clarify for ai|design-weak/i;
  const filtered = list.filter((a) => !competing.test(a));
  return [postGreen.action, ...new Set(filtered)];
}

/**
 * Whether doctor may print “Healthy — nothing to do”.
 * @param {{ designWeak?: boolean } | null | undefined} designFitness
 * @param {string[]} topActions
 */
export function isDoctorHealthyNothingToDo(designFitness, topActions = []) {
  if (designFitness?.designWeak) return false;
  return !topActions.some(Boolean);
}
