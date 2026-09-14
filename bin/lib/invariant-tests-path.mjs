/**
 * Adopted-mode domain-invariant tests path (P2 §10 / Contener).
 * Tooling I/O over Domain collectMissingInvariantTestsPathFindings.
 * Fail-closed when adopted. Silent when not adopted or the catalog is empty.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  classifyAdopted,
  isAdopted,
  readAdoptionStance,
} from './adoption-stance.mjs';
import {
  configuredInvariantTestsPaths,
  collectMissingInvariantTestsPathFindings,
  hasConfiguredInvariantTestsPath,
  INVARIANT_TESTS_PATH_MESSAGE,
} from './invariant-coverage.mjs';

export const INVARIANT_TESTS_PATH_ASK = INVARIANT_TESTS_PATH_MESSAGE;

export const INVARIANT_TESTS_PATH_NEXT =
  'Add coverage.testGlobs or coverage.coverageRoots in ark.config.json pointing at a real tests folder, then re-run.';

/**
 * --require-gates / --strict-merge, or an explicit advisory-only ack.
 * GitHub required-merge is known later in doctor; the scan uses this cheap side.
 *
 * @param {string} root
 * @param {{ requireGates?: boolean }} [args]
 */
export function scanDemandsInvariantTestsPath(root, args = {}) {
  if (args.requireGates === true) return true;
  return isAdopted(classifyAdopted({ stance: readAdoptionStance(root) }));
}

/**
 * First concrete path segment exists, or every declared glob is wildcard-only.
 *
 * @param {string} root
 * @param {{ testGlobs?: unknown, coverageRoots?: unknown } | null | undefined} coverage
 */
export function declaredInvariantTestsPathPresent(root, coverage) {
  const declared = configuredInvariantTestsPaths(coverage);
  if (declared.length === 0) return false;
  if (typeof root !== 'string' || root.length === 0) return true;
  let sawConcrete = false;
  for (const entry of declared) {
    const prefix = entry.split(/[*?]/)[0].replace(/\/$/, '');
    if (!prefix) continue;
    sawConcrete = true;
    const abs = path.resolve(root, prefix);
    const rel = path.relative(path.resolve(root), abs).replace(/\\/g, '/');
    if (!rel || rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) continue;
    try {
      if (fs.existsSync(abs)) return true;
    } catch {
      continue;
    }
  }
  return !sawConcrete;
}

/**
 * Doctor residual when adopted + invariants + missing/empty tests path.
 *
 * @param {{
 *   adopted?: boolean,
 *   coverage?: { testGlobs?: unknown, coverageRoots?: unknown } | null,
 *   hasDomainInvariants?: boolean,
 *   root?: string,
 * }} [input]
 * @returns {{ missing: true, ask: string, nextAction: string } | null}
 */
export function collectInvariantTestsPathResidual(input = {}) {
  if (input.adopted !== true) return null;
  const coverage = input.coverage;
  const present =
    typeof input.root === 'string' && input.root.length > 0
      ? declaredInvariantTestsPathPresent(input.root, coverage)
      : hasConfiguredInvariantTestsPath(coverage);
  const findings = collectMissingInvariantTestsPathFindings({
    adopted: true,
    hasDomainInvariants: input.hasDomainInvariants === true,
    coverage,
    declaredPathPresent: present,
  });
  if (findings.length === 0) return null;
  return {
    missing: true,
    ask: findings[0]?.message ?? INVARIANT_TESTS_PATH_ASK,
    nextAction: INVARIANT_TESTS_PATH_NEXT,
  };
}
