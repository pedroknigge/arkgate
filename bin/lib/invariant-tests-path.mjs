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
  catalogDemandsInvariantTestsPath,
  catalogHasEnforcedInvariant,
  configuredCoverageRoots,
  configuredInvariantTestsPaths,
  collectMissingCoverageRootsFindings,
  collectMissingInvariantTestsPathFindings,
  hasConfiguredCoverageRoots,
  hasConfiguredInvariantTestsPath,
  INVARIANT_COVERAGE_ROOTS_MESSAGE,
  INVARIANT_TESTS_PATH_MESSAGE,
} from './invariant-coverage.mjs';
import { loadEffectiveArkRulesFromDisk } from './effective-contract-load.mjs';

export const INVARIANT_TESTS_PATH_ASK = INVARIANT_TESTS_PATH_MESSAGE;

export const INVARIANT_TESTS_PATH_NEXT =
  'Add coverage.testGlobs or coverage.coverageRoots in ark.config.json pointing at a real tests folder, then re-run.';

export const INVARIANT_COVERAGE_ROOTS_ASK = INVARIANT_COVERAGE_ROOTS_MESSAGE;

export const INVARIANT_COVERAGE_ROOTS_NEXT =
  'Add coverage.coverageRoots in ark.config.json pointing at the folder the test runner uses, then re-run.';

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
 *   config?: object,
 *   invariants?: unknown[],
 *   hasDomainInvariants?: boolean,
 *   root?: string,
 * }} [input]
 * @returns {{ missing: true, ask: string, nextAction: string } | null}
 */
function residualDemandsInvariantTests(input) {
  if (input.hasDomainInvariants === true) return true;
  if (input.hasDomainInvariants === false) return false;
  if (Array.isArray(input.invariants)) return catalogDemandsInvariantTestsPath(input.invariants);
  if (typeof input.root === 'string' && input.config) {
    try {
      const loaded = loadEffectiveArkRulesFromDisk(input.root, input.config);
      if (loaded.errors?.length) return false;
      return catalogDemandsInvariantTestsPath(loaded.arkRules?.invariants);
    } catch {
      return false;
    }
  }
  return false;
}

export function collectInvariantTestsPathResidual(input = {}) {
  if (input.adopted !== true) return null;
  const coverage = input.coverage ?? input.config?.coverage;
  const present =
    typeof input.root === 'string' && input.root.length > 0
      ? declaredInvariantTestsPathPresent(input.root, coverage)
      : hasConfiguredInvariantTestsPath(coverage);
  const findings = collectMissingInvariantTestsPathFindings({
    adopted: true,
    hasDomainInvariants: residualDemandsInvariantTests(input),
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

/**
 * First concrete coverageRoots segment exists, or every declared glob is wildcard-only.
 *
 * @param {string} root
 * @param {{ coverageRoots?: unknown } | null | undefined} coverage
 */
export function declaredCoverageRootsPresent(root, coverage) {
  const declared = configuredCoverageRoots(coverage);
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

function residualHasEnforcedInvariant(input) {
  if (input.hasEnforcedInvariant === true) return true;
  if (input.hasEnforcedInvariant === false) return false;
  if (Array.isArray(input.invariants)) return catalogHasEnforcedInvariant(input.invariants);
  const refs = input.config?.arkRules;
  if (!refs || typeof refs !== 'object' || Object.keys(refs).length === 0) return false;
  if (typeof input.root === 'string' && input.config) {
    try {
      const loaded = loadEffectiveArkRulesFromDisk(input.root, input.config);
      if (loaded.errors?.length) return false;
      return catalogHasEnforcedInvariant(loaded.arkRules?.invariants);
    } catch {
      return false;
    }
  }
  return false;
}

/** One doctor light: roots residual wins when both would fire. */
export function collectInvariantCoverageResiduals(input = {}) {
  const invariantCoverageRoots = collectCoverageRootsResidual(input);
  return {
    invariantCoverageRoots,
    invariantTestsPath: invariantCoverageRoots
      ? null
      : collectInvariantTestsPathResidual(input),
  };
}

/**
 * Doctor residual when any invariant is enforced and coverageRoots is missing/empty.
 *
 * @param {{
 *   coverage?: { coverageRoots?: unknown } | null,
 *   config?: object,
 *   invariants?: unknown[],
 *   hasEnforcedInvariant?: boolean,
 *   root?: string,
 * }} [input]
 * @returns {{ missing: true, ask: string, nextAction: string } | null}
 */
export function collectCoverageRootsResidual(input = {}) {
  const coverage = input.coverage ?? input.config?.coverage;
  const present =
    typeof input.root === 'string' && input.root.length > 0
      ? declaredCoverageRootsPresent(input.root, coverage)
      : hasConfiguredCoverageRoots(coverage);
  const findings = collectMissingCoverageRootsFindings({
    hasEnforcedInvariant: residualHasEnforcedInvariant(input),
    coverage,
    declaredPathPresent: present,
  });
  if (findings.length === 0) return null;
  return {
    missing: true,
    ask: findings[0]?.message ?? INVARIANT_COVERAGE_ROOTS_ASK,
    nextAction: INVARIANT_COVERAGE_ROOTS_NEXT,
  };
}
