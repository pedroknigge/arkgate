/**
 * Policy-ack ADR path tooth (AP02). Tooling I/O on the existing
 * --policy-ack / --strict-merge plane. Doctor does not import this file.
 */

import path from 'node:path';
import { ADR_PRESENCE_HOMES, isNonEmptyMarkdownFile } from './adr-presence.mjs';

export const ADR_PATH_ASK =
  'This change loosens a rule or adds a layer edge, but the acknowledgement has no decision-note path.';

export const ADR_PATH_NEXT =
  'Add a short note under docs/adr/ (or docs/decisions/) and put that file path in --policy-ack as adrPath.';

export const ADR_PATH_MISSING_FILE_ASK =
  'The acknowledgement names a decision note that is missing or empty.';

export const ADR_PATH_MISSING_FILE_NEXT =
  'Write that note (or fix adrPath) under docs/adr/ or docs/decisions/, then run ArkGate again.';

/**
 * Relative path under a conventional decision-note home. No I/O.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function canonicalizeAdrPath(value) {
  if (typeof value !== 'string') return null;
  const rel = value.trim().replace(/\\/g, '/');
  if (!rel || rel.startsWith('/') || /^[A-Za-z]:\//.test(rel) || rel.includes('\0')) return null;
  const parts = [];
  for (const segment of rel.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') return null;
    parts.push(segment);
  }
  return parts.join('/') || null;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isConventionalAdrPath(value) {
  const rel = canonicalizeAdrPath(value);
  if (!rel) return false;
  for (const home of ADR_PRESENCE_HOMES) {
    if (home.endsWith('.md')) {
      if (rel === home) return true;
      continue;
    }
    if (rel.startsWith(`${home}/`) && rel.toLowerCase().endsWith('.md') && rel.length > home.length + 4) {
      return true;
    }
  }
  return false;
}

/**
 * Conventional path that already has a non-empty markdown file.
 *
 * @param {string} root
 * @param {unknown} adrPath
 * @returns {string | null}
 */
export function resolveAdrNotePath(root, adrPath) {
  const rel = isConventionalAdrPath(adrPath) ? canonicalizeAdrPath(adrPath) : null;
  if (!rel || typeof root !== 'string' || root.length === 0) return null;
  return isNonEmptyMarkdownFile(path.join(root, rel)) ? rel : null;
}

/**
 * Residual when a weaken / new-edge needs a tied note path.
 * `needed` is policyDelta.requiresAcknowledgement. Off → null.
 *
 * @param {{ root?: string, needed?: boolean, adrPath?: unknown }} [input]
 * @returns {{ missing: true, ask: string, nextAction: string, path?: string } | null}
 */
export function collectAdrPathResidual(input = {}) {
  if (input.needed !== true) return null;
  const rel = canonicalizeAdrPath(input.adrPath);
  if (!rel) {
    return { missing: true, ask: ADR_PATH_ASK, nextAction: ADR_PATH_NEXT };
  }
  if (resolveAdrNotePath(input.root ?? '', input.adrPath)) return null;
  return {
    missing: true,
    path: rel,
    ask: isConventionalAdrPath(input.adrPath) ? ADR_PATH_MISSING_FILE_ASK : ADR_PATH_ASK,
    nextAction: isConventionalAdrPath(input.adrPath) ? ADR_PATH_MISSING_FILE_NEXT : ADR_PATH_NEXT,
  };
}

/**
 * Attach `adrNote` to a policy-delta result. Flips `valid` only when
 * `failClosed` (existing policy-ack / --strict-merge plane) and the path
 * is missing. Domain hash match stays I/O-free.
 *
 * @param {object | undefined} result
 * @param {{ root?: string, acknowledgement?: { adrPath?: unknown }, failClosed?: boolean }} [input]
 */
export function attachPolicyAdrNote(result, input = {}) {
  if (!result || result.requiresAcknowledgement !== true) return result;
  const residual = collectAdrPathResidual({
    root: input.root,
    needed: true,
    adrPath: input.acknowledgement?.adrPath,
  });
  const adrNote = residual
    ? residual
    : { missing: false, path: canonicalizeAdrPath(input.acknowledgement?.adrPath) };
  if (!residual || input.failClosed !== true) {
    return { ...result, adrNote };
  }
  return { ...result, adrNote, valid: false };
}
