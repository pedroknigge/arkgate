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

/** Null when a layer rule can still fail and the scope is the whole declared tree. */
export function vacuousContainmentNote(cov) {
  const layers = Array.isArray(cov?.layers) ? cov.layers : [];
  if (layers.length === 0) return null;
  const populated = layers.filter((row) => Number(row?.files) > 0).length;
  const governed = cov?.governed ?? {};
  const classified = Number(governed.classifiedFiles) || 0;
  const total = Number(governed.totalFiles ?? cov?.totalFiles) || 0;
  const dual = Number(cov?.dualMembership?.count) || 0;
  const catchAll = Number(cov?.catchAllOverlap?.count) || 0;
  const missing = Array.isArray(cov?.workspaceScope?.missing) ? cov.workspaceScope.missing : [];
  const parts = [];
  if (catchAll > 0 && total > 0) {
    parts.push(`${catchAll} of ${total} files match more than one layer`);
  } else if (classified > 0 && dual >= classified) {
    parts.push(`${dual} of ${classified} files match more than one layer`);
  }
  if (missing.length > 0) {
    parts.push(`${missing.join(', ')} declared workspace not in include`);
  }
  if (total > 0 && populated < 2 && layers.length - populated > 0) {
    parts.push(`${populated} of ${layers.length} layers populated, so no layer rule can fail yet`);
  }
  return parts.length > 0 ? parts.join('; ') : null;
}

export function classificationScopeSuffix(cov) {
  const parts = [];
  const excluded = Array.isArray(cov?.workspaceScope?.excluded) ? cov.workspaceScope.excluded : [];
  for (const row of excluded) {
    parts.push(
      `${row.root}/ (declared workspace) out of scope: ${row.reason}. Add it to include to govern it.`
    );
  }
  const tooling = Number(cov?.tooling?.count) || 0;
  if (tooling > 0) parts.push(`${tooling} tool configs are tooling, not source.`);
  return parts.join(' ');
}

/** At >=80%, or when a catch-all or a missing workspace makes 100% a lie. */
export function formatGovernedCoverageLine(cov, classifiedFiles, totalFiles) {
  const percent = Number(cov?.governed?.percent) || 0;
  const catchAll = Number(cov?.catchAllOverlap?.count) || 0;
  const missing = Array.isArray(cov?.workspaceScope?.missing) ? cov.workspaceScope.missing.length : 0;
  const note = percent >= 80 || catchAll > 0 || missing > 0 ? vacuousContainmentNote(cov) : null;
  const base = note
    ? `${note} — not full governance (${classifiedFiles}/${totalFiles} files classified).`
    : `Governed: ${percent}% (${classifiedFiles}/${totalFiles} files).`;
  const extra = classificationScopeSuffix(cov);
  return extra ? `${base} ${extra}` : base;
}
