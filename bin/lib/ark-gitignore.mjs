/**
 * Ark report / local-state .gitignore coverage (EH03).
 * Extracted from html-report.mjs to keep that module under its LOC budget.
 */

/**
 * Whether .gitignore already covers Ark local state / reports.
 * Exact-line equality is insufficient: `.ark/*`, `/.ark/*`, and `.ark/reports/`
 * (and common gitignore variants) already cover report output.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function gitignoreCoversArkState(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  /** Patterns that cover the whole `.ark` tree or its report subtree. */
  const cover = new Set([
    '.ark',
    '.ark/',
    '/.ark',
    '/.ark/',
    '**/.ark',
    '**/.ark/',
    '.ark/*',
    '/.ark/*',
    '**/.ark/*',
    '.ark/**',
    '/.ark/**',
    '**/.ark/**',
    '.ark/reports',
    '.ark/reports/',
    '/.ark/reports',
    '/.ark/reports/',
    '.ark/reports/*',
    '/.ark/reports/*',
    '**/.ark/reports',
    '**/.ark/reports/',
    '**/.ark/reports/*',
    '.ark/reports/**',
    '/.ark/reports/**',
  ]);

  for (const line of lines) {
    if (line.startsWith('!')) continue;
    if (cover.has(line)) return true;
    if (cover.has(`${line}/`) || cover.has(line.replace(/\/$/, ''))) return true;
  }
  return false;
}

/**
 * Whether .gitignore already has a `!` exception under `.ark` (narrower policy).
 * Appending a broad `.ark/` after such a policy defeats tracked golden-pattern exceptions.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function gitignoreHasArkNegationException(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line.startsWith('!') && /(^|\/)\.ark(\/|$|\b)/.test(line.slice(1)));
}

/**
 * Decide whether report archiving should append a .gitignore rule (EH03).
 * - Already covered → do not mutate.
 * - Has `!` exceptions under `.ark` without full cover → append **narrow**
 *   `.ark/reports/` only (never broad `.ark/`, which would defeat exceptions).
 * - Otherwise → append `.ark/`.
 *
 * @param {string} text
 * @returns {{ append: boolean, rule: string|null, reason: string }}
 */
export function arkGitignoreAppendDecision(text) {
  if (gitignoreCoversArkState(text)) {
    return { append: false, rule: null, reason: 'already-covered' };
  }
  if (gitignoreHasArkNegationException(text)) {
    // Narrow reports-only ignore keeps !/.ark/golden-pattern.json (etc.) working.
    return { append: true, rule: '.ark/reports/', reason: 'append-narrow-reports' };
  }
  return { append: true, rule: '.ark/', reason: 'append-broad' };
}
