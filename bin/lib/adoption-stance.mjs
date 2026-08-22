/**
 * D0 adoption stance — required merge status or explicit advisory-only ack.
 * Tooling I/O. Never invents GitHub required from workflow YAML presence.
 */
import fs from 'node:fs';
import path from 'node:path';

export const ADOPTION_STANCE_REL = '.ark/adoption-stance.json';
export const ADOPTION_STANCE_VALUE = 'advisory-only';
export const ADOPTED_REQUIRED_MERGE = 'required-merge';
export const ADOPTED_ADVISORY_ACKED = 'advisory-only-acked';
export const ADOPTED_NOT = 'not-adopted';

export const NOT_ADOPTED_NEXT_ACTION =
  'Make arkgate-check --strict-merge a required GitHub status, or write .ark/adoption-stance.json with stance: "advisory-only"';

export const MERGE_BOUNDARY_NOT_REQUIRED = 'merge-boundary-not-required';

/**
 * @param {string} root
 * @returns {{ schemaVersion?: string, stance?: string, ackedAt?: string, reason?: string } | null}
 */
export function readAdoptionStance(root) {
  const file = path.join(root, ADOPTION_STANCE_REL);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function stanceValue(stance) {
  if (typeof stance === 'string') return stance;
  if (stance && typeof stance === 'object' && typeof stance.stance === 'string') {
    return stance.stance;
  }
  return null;
}

/**
 * Closed enum: required-merge | advisory-only-acked | not-adopted.
 * Workflow presence is never enough.
 *
 * @param {{
 *   stance?: { stance?: string } | string | null,
 *   github?: { arkCheckRequired?: unknown, requiredStatusConfigured?: unknown },
 *   ci?: { state?: string, requiredStatusConfigured?: unknown },
 * }} [input]
 */
export function classifyAdopted(input = {}) {
  const github = input.github && typeof input.github === 'object' ? input.github : {};
  const ci = input.ci && typeof input.ci === 'object' ? input.ci : {};
  const required =
    github.arkCheckRequired === true ||
    github.requiredStatusConfigured === true ||
    ci.requiredStatusConfigured === true ||
    ci.state === 'required';
  if (required) return ADOPTED_REQUIRED_MERGE;
  if (stanceValue(input.stance) === ADOPTION_STANCE_VALUE) return ADOPTED_ADVISORY_ACKED;
  return ADOPTED_NOT;
}

export function isAdopted(kind) {
  return kind === ADOPTED_REQUIRED_MERGE || kind === ADOPTED_ADVISORY_ACKED;
}

/**
 * Map doctor adoption + writePath into the ci-merge-boundary github input.
 * Never sets requiredStatusConfigured false from a missing GitHub query.
 *
 * @param {object} [adoption]
 * @param {object} [writePath]
 */
export function githubEvidenceForCiMergeBoundary(adoption, writePath) {
  const github =
    adoption?.enforcement?.github && typeof adoption.enforcement.github === 'object'
      ? adoption.enforcement.github
      : {};
  const ci =
    adoption?.enforcement?.ci && typeof adoption.enforcement.ci === 'object'
      ? adoption.enforcement.ci
      : {};
  const ciMerge =
    writePath?.enforcementState?.ciMerge && typeof writePath.enforcementState.ciMerge === 'object'
      ? writePath.enforcementState.ciMerge
      : {};
  const required =
    github.arkCheckRequired === true ||
    github.requiredStatusConfigured === true ||
    ciMerge.required === true;
  return {
    ...github,
    ...(required ? { arkCheckRequired: true, requiredStatusConfigured: true } : {}),
    workflowPresent:
      github.workflowPresent === true ||
      ci.hasArkCheckWorkflow === true ||
      writePath?.capabilities?.['merge-gate'] === true ||
      writePath?.inventory?.capabilities?.['merge-gate'] === true,
    plan: github.plan,
    canRequire: github.canRequire,
  };
}
