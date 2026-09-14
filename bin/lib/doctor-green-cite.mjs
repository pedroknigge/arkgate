/**
 * Golden rule: a doctor green / healthy claim must cite a file, config key,
 * or test. Uncited greens are dishonest — demote or omit.
 *
 * Tooling only. Reuses existing doctor view fields (IT01 / ADR / CI
 * residual shape). No new schema, RPC, or skill name.
 */
import { REQUIRED_GATE_WORKFLOW } from './gate-files.mjs';
import { CI_MERGE_BOUNDARY_REL } from './ci-merge-boundary.mjs';

export const HEALTHY_CLAIM = 'Healthy — nothing to do.';
export const HEALTHY_KEEP = '  Keep write path + CI.';
export const UNCITE_SUFFIX =
  'not green until a file, config key, or test is named';

const CONFIG_KEY_DOT = /^[A-Za-z_][\w]*\.[A-Za-z_][\w.]*$/;
const CONFIG_KEY_BARE = new Set([
  'include',
  'exclude',
  'layers',
  'rules',
  'arkRules',
  'arkRun',
  'arkOrder',
  'coverage',
  'stewards',
  'schemaVersion',
]);
const FILE_LIKE =
  /(?:^|\/)(?:\.[A-Za-z][\w.-]*|[A-Za-z][\w.-]*\.(?:json|ya?ml|md|ts|mjs|js|cjs))$|\/|[.](?:json|ya?ml|md|ts|mjs|js|cjs)$/;
const TEST_LIKE = /(?:^|\/)tests?\/|(?:\.|\b)test\.(?:ts|mjs|js)\b/i;

/**
 * True when a stranger can open this in about a minute.
 * Generic words ("CI", "gates") are not cites.
 */
export function isConcreteCite(value) {
  if (typeof value !== 'string') return false;
  const cite = value.trim();
  if (cite.length < 3 || cite.length > 240) return false;
  if (/\s/.test(cite)) return false;
  if (cite === REQUIRED_GATE_WORKFLOW) return false;
  return (
    FILE_LIKE.test(cite) ||
    TEST_LIKE.test(cite) ||
    CONFIG_KEY_DOT.test(cite) ||
    CONFIG_KEY_BARE.has(cite)
  );
}

export function uniqueConcreteCites(cites) {
  const out = [];
  for (const raw of Array.isArray(cites) ? cites : [cites]) {
    if (!isConcreteCite(raw)) continue;
    const cite = String(raw).trim();
    if (!out.includes(cite)) out.push(cite);
  }
  return out;
}

/**
 * @returns {{ mark: 'ok', text: string } | { mark: 'warn', text: string }}
 */
export function citeOrDemoteGreen(claim, cites) {
  const named = typeof claim === 'string' && claim.trim() ? claim.trim() : 'This claim';
  const list = uniqueConcreteCites(cites);
  if (list.length > 0) {
    return { mark: 'ok', text: `${named} (${list.join(' · ')})` };
  }
  return { mark: 'warn', text: `${named} — ${UNCITE_SUFFIX}` };
}

export function citedGreen(line, marks, claim, cites) {
  const row = citeOrDemoteGreen(claim, cites);
  line(row.mark === 'ok' ? marks.ok : marks.warn, row.text);
  return row;
}

/** Backing artifacts already on the doctor view — no second scan. */
export function healthyCitesFromView(view) {
  const cites = ['ark.config.json'];
  if (view?.ciMergeBoundary) cites.push(CI_MERGE_BOUNDARY_REL);
  const workflow =
    view?.ciMergeBoundary?.ci?.workflowFile || view?.ciNotFailClosed?.workflowFile;
  if (workflow) cites.push(workflow);
  return uniqueConcreteCites(cites);
}

export function printHealthyHeadline(view, color) {
  const row = citeOrDemoteGreen(HEALTHY_CLAIM, healthyCitesFromView(view));
  if (row.mark === 'ok') {
    console.log(color.green(`✔ ${row.text}`));
    console.log(color.dim(HEALTHY_KEEP));
    return row;
  }
  console.log(color.yellow(`! ${row.text}`));
  return row;
}

export function displayedMissingGates(gatesMissing, view) {
  const list = Array.isArray(gatesMissing) ? gatesMissing : [];
  const hideGlob = Boolean(
    view?.ciNotFailClosed?.workflowFile ||
      view?.ciNotFailClosed?.error === 'ci-not-fail-closed' ||
      view?.ciMergeBoundary?.ci?.workflowPresent
  );
  return hideGlob ? list.filter((item) => item !== REQUIRED_GATE_WORKFLOW) : list;
}

export function ciNotFailClosedNotice(view) {
  const file = view?.ciNotFailClosed?.workflowFile;
  if (!file) return null;
  return `CI not fail-closed: ${file} — remove the skippable if:, or write .ark/adoption-stance.json with stance: advisory-only`;
}

export function ciMergeGreenCites(view) {
  const cites = [];
  if (view?.ciMergeBoundary) cites.push(CI_MERGE_BOUNDARY_REL);
  const workflow = view?.ciMergeBoundary?.ci?.workflowFile || view?.ciNotFailClosed?.workflowFile;
  if (workflow) cites.push(workflow);
  return uniqueConcreteCites(cites);
}

export function foundGateCites(view) {
  const cites = ['AGENTS.md'];
  if (view?.ciMergeBoundary) cites.push(CI_MERGE_BOUNDARY_REL);
  const workflow = view?.ciMergeBoundary?.ci?.workflowFile;
  if (workflow) cites.push(workflow);
  return uniqueConcreteCites(cites);
}

export function writePathGreenCites(writePath) {
  return uniqueConcreteCites([
    ...(Array.isArray(writePath?.capabilityEvidence?.['hard-write'])
      ? writePath.capabilityEvidence['hard-write']
      : []),
    ...(Array.isArray(writePath?.evidence) ? writePath.evidence : []),
  ]);
}
