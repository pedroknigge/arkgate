/**
 * Human-facing product copy (4.6). JSON field names stay stable; this module
 * owns labels people read in doctor, HTML, and compact router.
 *
 * Brands kept: ArkGate, ArkRules. Dialect (design-weak, hard write, …) maps to
 * common software words. See docs/product-voice.md.
 */

/** Status-light leftover-design qualifier (was “design-weak”). */
export const LEFTOVER_DESIGN_LABEL = 'leftover design work';

/**
 * Operating-mode title for humans (and doctor JSON `designFitness.label` prefix).
 * @param {string|null|undefined} mode suggest|adapt|enforce
 * @param {boolean} leftoverDesign
 * @param {boolean} [stewardsUnset]
 */
export function operatingModeTitle(mode, leftoverDesign, stewardsUnset) {
  const light = String(mode || 'enforce').toUpperCase();
  if (leftoverDesign) return `${light} · ${LEFTOVER_DESIGN_LABEL}`;
  if (stewardsUnset) return `${light} · stewards unset`;
  return light;
}

/** Short HTML/doctor badge text. */
export const LEFTOVER_DESIGN_BADGE = LEFTOVER_DESIGN_LABEL;

export const POST_GREEN_HUMAN =
  'Imports check out, but the design is still messy. Next: /ark-explore, then one small refactor with /ark-autopilot and your OK.';

export const POST_GREEN_LEDE =
  'Import rules are clean, but leftover design work remains. That does not fail the check — it only means “done” is still wrong until you tidy shape.';

export const HARD_WRITE_HUMAN = 'pre-write block';
export const ADVISORY_WRITE_HUMAN = 'warning only (not blocked)';
