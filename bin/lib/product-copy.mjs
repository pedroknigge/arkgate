/** Human labels for doctor, HTML, and the compact router. JSON names stay stable. */
export const NORTH_STAR_ONE_LINE =
  'Contener · Guiar · Ordenar — contain the write, guide the next step, order leftover mess.';

export const ARKRULES_ONE_BREATH =
  'Layers stop a bad import. ArkRules is optional policies inside one folder.';

export const ARKRULES_FIRST_CONTACT_NEXT =
  'Next: ark-check --rules-inventory — then /ark-adopt to write one rule, or /ark-autopilot to promote.';

export const ARKRULES_EMPTY_CATALOG_NEXT =
  'Next: add 1–2 short phrases to invariants[] in the Domain rules file, then ark-check --doctor.';

export const LEFTOVER_DESIGN_LABEL = 'leftover design work';

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

/** Null when a layer rule can still fail. */
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

/** At >=80% a vacuous map is not "Governed: 100%". */
export function formatGovernedCoverageLine(cov, classifiedFiles, totalFiles) {
  const percent = Number(cov?.governed?.percent) || 0;
  const note = percent >= 80 ? vacuousContainmentNote(cov) : null;
  return note
    ? `${note} — not full governance (${classifiedFiles}/${totalFiles} files classified).`
    : `Governed: ${percent}% (${classifiedFiles}/${totalFiles} files).`;
}
