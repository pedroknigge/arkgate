/**
 * Soft no-Domain / all-logic-in-frontend residual (P2 §3 / Guiar).
 * Tooling I/O. Never a gate fail.
 *
 * Projects facts doctor already has: empty Domain-role layer + presentation
 * file share, or the existing `domain-logic-in-ui` smell. No second tree walk.
 * Silent when there is no frontend, Domain already has files, or the bag is
 * too thin to call “all logic in the UI.”
 */

import { isDomainRoleLayerName } from './arkrules-sensors.mjs';

export const NO_DOMAIN_FRONTEND_ASK =
  'Business rules live in the UI, and Domain is still empty.';

export const NO_DOMAIN_FRONTEND_NEXT =
  'Put one pure rule in a Domain file (/ark-place), then one small refactor with /ark-autopilot. Do not pile more rules in pages.';

/** Presentation-role house by name. Align with design-smells presentation heuristic. */
export function isPresentationRoleLayerName(name) {
  return typeof name === 'string' && /presentation|ui|view|frontend/i.test(name);
}

function layerRows(input) {
  return Array.isArray(input.coverage?.layers) ? input.coverage.layers : [];
}

function configLayers(input) {
  return Array.isArray(input.config?.layers) ? input.config.layers : [];
}

function emptyLayerSet(input) {
  return new Set(Array.isArray(input.coverage?.emptyLayers) ? input.coverage.emptyLayers : []);
}

function totalGovernedFiles(input) {
  const governed = input.coverage?.governed?.totalFiles;
  if (Number.isFinite(governed) && governed >= 0) return governed;
  const total = input.coverage?.totalFiles;
  return Number.isFinite(total) && total >= 0 ? total : 0;
}

function hasDomainLogicInUiSmell(designSmells) {
  return (Array.isArray(designSmells) ? designSmells : []).some(
    (smell) => smell && smell.id === 'domain-logic-in-ui'
  );
}

/**
 * Soft residual when Domain is declared but empty and the UI holds the rules.
 * Never flips valid / goal.met.
 *
 * @param {{ config?: object, coverage?: object, designSmells?: object[] }} [input]
 * @returns {{ kind: 'ui-logic' | 'presentation-bag', ask: string, nextAction: string, domainLayers: string[], presentationFiles: number } | null}
 */
export function collectNoDomainFrontendResidual(input = {}) {
  const totalFiles = totalGovernedFiles(input);
  if (totalFiles <= 0) return null;

  const declared = configLayers(input);
  const domainLayers = declared.filter((layer) =>
    isDomainRoleLayerName(layer.name, layer.intentPrefixes ?? [])
  );
  if (domainLayers.length === 0) return null;

  const rows = layerRows(input);
  const empty = emptyLayerSet(input);
  const domainEmpty = domainLayers.every((layer) => {
    const row = rows.find((entry) => entry.name === layer.name);
    const files = Number(row?.files) || 0;
    return files === 0 || empty.has(layer.name);
  });
  if (!domainEmpty) return null;

  const presentationFiles = rows
    .filter((row) => isPresentationRoleLayerName(row.name))
    .reduce((sum, row) => sum + (Number(row.files) || 0), 0);
  if (presentationFiles <= 0) return null;

  const uiLogic = hasDomainLogicInUiSmell(input.designSmells);
  const presentationShare = presentationFiles / totalFiles;
  if (!uiLogic && (presentationShare < 0.5 || presentationFiles < 3)) return null;

  return {
    kind: uiLogic ? 'ui-logic' : 'presentation-bag',
    ask: NO_DOMAIN_FRONTEND_ASK,
    nextAction: NO_DOMAIN_FRONTEND_NEXT,
    domainLayers: domainLayers.map((layer) => layer.name),
    presentationFiles,
  };
}
