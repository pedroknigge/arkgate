/**
 * Human-facing product copy (4.6). JSON field names stay stable; this module
 * owns labels people read in doctor, HTML, and compact router.
 *
 * Brands kept: ArkGate, ArkRules. Dialect (design-weak, hard write, …) maps to
 * common software words. See docs/product-voice.md.
 */

/** First-contact north star. Ordinary English. Spanish names once. */
export const NORTH_STAR_ONE_LINE =
  'Contener · Guiar · Ordenar — contain the write, guide the next step, order leftover mess.';

/**
 * Compact doctor / details — only when `arkRules` is on.
 * Absence stays silent (unlike ArkOrder, which speaks when off).
 */
export const ARKRULES_ONE_BREATH =
  'Layers stop a bad import. ArkRules is optional policies inside one folder.';

/** Next step when the map is on and something still needs a human. */
export const ARKRULES_FIRST_CONTACT_NEXT =
  'Next: ark-check --rules-inventory — then /ark-adopt to write one rule, or /ark-autopilot to promote.';

/** Next step when Domain has code but invariants[] is empty. */
export const ARKRULES_EMPTY_CATALOG_NEXT =
  'Next: add 1–2 short phrases to invariants[] in the Domain rules file, then ark-check --doctor.';

/** Status-light leftover-design qualifier (was “design-weak”); also the HTML/doctor badge text. */
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

export const POST_GREEN_HUMAN =
  'Imports check out, but the design is still messy. Next: /ark-explore, then one small refactor with /ark-autopilot and your OK.';

export const POST_GREEN_LEDE =
  'Import rules are clean, but leftover design work remains. That does not fail the check — it only means “done” is still wrong until you tidy shape.';

/** Null when a layer rule can still fail. A high classification percent is not containment. */
export function vacuousContainmentNote(cov) {
  const layers = Array.isArray(cov?.layers) ? cov.layers : [];
  if (layers.length === 0) return null;
  const populated = layers.filter((row) => Number(row?.files) > 0).length;
  const governed = cov?.governed ?? {};
  const classified = Number(governed.classifiedFiles) || 0;
  const total = Number(governed.totalFiles ?? cov?.totalFiles) || 0;
  const dual = Number(cov?.dualMembership?.count) || 0;
  const parts = [];
  if (classified > 0 && dual >= classified) {
    parts.push(`${dual} of ${classified} files match more than one layer`);
  }
  if (total > 0 && populated < 2 && layers.length - populated > 0) {
    parts.push(`${populated} of ${layers.length} layers populated, so no layer rule can fail yet`);
  }
  return parts.length > 0 ? parts.join('; ') : null;
}

/** Human --coverage line. At >=80% a vacuous map is not "Governed: 100%". */
export function formatGovernedCoverageLine(cov, classifiedFiles, totalFiles) {
  const percent = Number(cov?.governed?.percent) || 0;
  const note = percent >= 80 ? vacuousContainmentNote(cov) : null;
  return note
    ? `${note} — not full governance (${classifiedFiles}/${totalFiles} files classified).`
    : `Governed: ${percent}% (${classifiedFiles}/${totalFiles} files).`;
}
