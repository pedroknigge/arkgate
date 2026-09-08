/**
 * Soft ADR / decision-note presence when gates are demanded.
 * Tooling I/O. Never a gate fail. Absence is silent unless require-gates
 * or adopted-strict (required-merge) is on.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Conventional homes a human already uses. First hit wins. No config key. */
export const ADR_PRESENCE_HOMES = Object.freeze([
  'docs/adr',
  'docs/decisions',
  'docs/adr.md',
  'docs/decision-log.md',
  'ADR.md',
  'DECISIONS.md',
]);

export const ADR_PRESENCE_ASK =
  'Gates are required here, but there is no short decision note yet.';

export const ADR_PRESENCE_NEXT =
  'Add a short note under docs/adr/ (or docs/decisions/) when you loosen a rule or add a real gate. Not every change.';

function isNonEmptyMarkdownFile(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  try {
    return fs.readFileSync(file, 'utf8').trim().length > 0;
  } catch {
    return false;
  }
}

function directoryHasMarkdown(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
  try {
    return fs.readdirSync(dir).some((name) => {
      if (!name.toLowerCase().endsWith('.md')) return false;
      return isNonEmptyMarkdownFile(path.join(dir, name));
    });
  } catch {
    return false;
  }
}

/**
 * First conventional decision-note home that already has a note.
 * Empty folders and empty files do not count.
 *
 * @param {string} root
 * @returns {string | null}
 */
export function findAdrPresenceHome(root) {
  if (typeof root !== 'string' || root.length === 0) return null;
  for (const rel of ADR_PRESENCE_HOMES) {
    const abs = path.join(root, rel);
    if (rel.endsWith('.md')) {
      if (isNonEmptyMarkdownFile(abs)) return rel;
      continue;
    }
    if (directoryHasMarkdown(abs)) return rel;
  }
  return null;
}

/**
 * Soft residual when gates are demanded and no decision-note home exists.
 * `demanded` is --require-gates / --strict / --strict-merge, or doctor
 * adopted === 'required-merge'. Off → null (silent).
 *
 * @param {{ root?: string, demanded?: boolean }} [input]
 * @returns {{ missing: true, ask: string, nextAction: string } | null}
 */
export function collectAdrPresenceResidual(input = {}) {
  if (input.demanded !== true) return null;
  const home = findAdrPresenceHome(input.root ?? '');
  if (home) return null;
  return {
    missing: true,
    ask: ADR_PRESENCE_ASK,
    nextAction: ADR_PRESENCE_NEXT,
  };
}

/**
 * Human hint for --require-gates. Never changes exit code.
 *
 * @param {string} root
 * @param {(line: string) => void} write
 */
export function printAdrPresenceHint(root, write) {
  const residual = collectAdrPresenceResidual({ root, demanded: true });
  if (!residual || typeof write !== 'function') return;
  write(residual.ask);
  write(`Next: ${residual.nextAction}`);
}
