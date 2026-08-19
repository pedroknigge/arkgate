/**
 * First-class writePath / CI honesty file (`.ark/ci-merge-boundary.json`).
 * Agents must read this instead of grepping node_modules dist.
 */
import fs from 'node:fs';
import path from 'node:path';

export const CI_MERGE_BOUNDARY_REL = '.ark/ci-merge-boundary.json';
export const CI_MERGE_BOUNDARY_SCHEMA = '1.0';

/**
 * @param {{
 *   writePath?: object,
 *   github?: { requiredStatusConfigured?: boolean, plan?: string, canRequire?: boolean, error?: string },
 * }} input
 */
export function buildCiMergeBoundary(input = {}) {
  const writePath = input.writePath && typeof input.writePath === 'object' ? input.writePath : {};
  const inventory = writePath.inventory?.hosts && typeof writePath.inventory.hosts === 'object'
    ? writePath.inventory.hosts
    : {};
  const perHost = {};
  for (const [host, record] of Object.entries(inventory)) {
    const caps = record?.capabilities && typeof record.capabilities === 'object' ? record.capabilities : {};
    const configured = Boolean(record?.configured || caps['hard-write'] || caps['advisory-write']);
    const fired = Boolean(writePath.enforcementState?.localWrite?.runtimeObserved);
    const hard = caps['hard-write'] === true;
    perHost[host] = {
      configured,
      fired,
      state: configured && !fired ? 'configured-not-fired' : fired ? 'observed' : 'absent',
      writePath: hard ? 'hard' : caps['advisory-write'] ? 'soft' : 'none',
    };
  }

  const hookConfigured = Object.values(perHost).some((h) => h.configured);
  const hookFired = Object.values(perHost).some((h) => h.fired);
  const github = input.github && typeof input.github === 'object' ? input.github : {};
  const workflowPresent = Boolean(
    writePath.capabilities?.['merge-gate'] || writePath.inventory?.capabilities?.['merge-gate']
  );
  const required = github.requiredStatusConfigured === true;
  const canRequire = github.canRequire !== false && github.plan !== 'free';
  let ciState = 'absent';
  if (workflowPresent && required) ciState = 'required';
  else if (workflowPresent && !canRequire) ciState = 'present-but-github-free-cannot-require';
  else if (workflowPresent) ciState = 'present-but-not-required';

  return {
    schemaVersion: CI_MERGE_BOUNDARY_SCHEMA,
    notAScore: true,
    path: CI_MERGE_BOUNDARY_REL,
    hook: {
      configured: hookConfigured,
      fired: hookFired,
      state: hookConfigured && !hookFired ? 'configured-not-fired' : hookFired ? 'observed' : 'absent',
    },
    writePath: perHost,
    ci: {
      workflowPresent,
      requiredStatusConfigured: required,
      state: ciState,
    },
    githubPlan: {
      plan: github.plan ?? (canRequire ? 'unknown' : 'free'),
      canRequire,
      reason: canRequire ? null : 'github-free-cannot-require',
    },
    hookGreenIsNotTreeGreen: true,
    scriptedEditsBypassPreToolUse: true,
    note:
      'Do not reverse-engineer node_modules/arkgate/dist. This file is the honesty surface for writePath and CI.',
  };
}

export function writeCiMergeBoundary(root, input = {}) {
  const payload = buildCiMergeBoundary(input);
  const dir = path.join(root, '.ark');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, 'ci-merge-boundary.json');
  const next = `${JSON.stringify(payload, null, 2)}\n`;
  try {
    if (fs.existsSync(dest) && fs.readFileSync(dest, 'utf8') === next) return payload;
  } catch {
    /* rewrite */
  }
  fs.writeFileSync(dest, next);
  return payload;
}
