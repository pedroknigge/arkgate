/**
 * Q03 — optional golden pattern artifact for *new* code guidance.
 *
 * Path: `.ark/golden-pattern.json` (side-car under existing local-state convention).
 * Absent is normal. Presence is advisory only — never ENFORCE, never clears design-weak.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Relative path from project root (stable contract). */
export const GOLDEN_PATTERN_REL = '.ark/golden-pattern.json';

export const GOLDEN_PATTERN_SCHEMA_VERSION = '1';

/**
 * @typedef {{
 *   schemaVersion?: string,
 *   name: string,
 *   norm: string,
 *   newCodeHome?: string,
 *   examplePath?: string,
 * }} GoldenPattern
 */

/**
 * @typedef {{
 *   ok: boolean,
 *   present: boolean,
 *   path: string,
 *   golden?: GoldenPattern,
 *   invalid?: boolean,
 *   error?: string,
 * }} GoldenPatternLoadResult
 */

/**
 * Load optional golden pattern from the consumer tree.
 * Never throws. Malformed → invalid, not present, ok:false.
 *
 * @param {string} root
 * @returns {GoldenPatternLoadResult}
 */
export function loadGoldenPattern(root) {
  const rel = GOLDEN_PATTERN_REL;
  if (typeof root !== 'string' || !root) {
    return { ok: true, present: false, path: rel };
  }
  const abs = path.join(root, '.ark', 'golden-pattern.json');
  let raw;
  try {
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      return { ok: true, present: false, path: rel };
    }
    raw = fs.readFileSync(abs, 'utf8');
  } catch {
    return {
      ok: false,
      present: false,
      invalid: true,
      error: 'unreadable',
      path: rel,
    };
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      present: false,
      invalid: true,
      error: 'invalid-json',
      path: rel,
    };
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      ok: false,
      present: false,
      invalid: true,
      error: 'not-object',
      path: rel,
    };
  }

  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const norm = typeof data.norm === 'string' ? data.norm.trim() : '';
  if (!name || !norm) {
    return {
      ok: false,
      present: false,
      invalid: true,
      error: 'missing-name-or-norm',
      path: rel,
    };
  }

  /** @type {GoldenPattern} */
  const golden = {
    schemaVersion:
      typeof data.schemaVersion === 'string' && data.schemaVersion.trim()
        ? data.schemaVersion.trim()
        : GOLDEN_PATTERN_SCHEMA_VERSION,
    name,
    norm,
  };
  if (typeof data.newCodeHome === 'string' && data.newCodeHome.trim()) {
    golden.newCodeHome = data.newCodeHome.trim();
  }
  if (typeof data.examplePath === 'string' && data.examplePath.trim()) {
    golden.examplePath = data.examplePath.trim();
  }

  return { ok: true, present: true, path: rel, golden };
}

/**
 * One-line guidance for agents / placement notes.
 * @param {GoldenPatternLoadResult} result
 * @returns {string | null}
 */
export function formatGoldenPatternNote(result) {
  if (!result?.present || !result.golden) return null;
  const g = result.golden;
  let s = `Golden pattern (advisory for NEW code only): "${g.name}" — ${g.norm}`;
  if (g.newCodeHome) s += ` Prefer new files under ${g.newCodeHome}.`;
  if (g.examplePath) s += ` Example: ${g.examplePath}.`;
  s += ' Does not clear design-weak or replace the gate.';
  return s;
}

/**
 * Compact JSON-safe summary for doctor / prepare_write.
 * @param {GoldenPatternLoadResult} result
 */
export function summarizeGoldenPattern(result) {
  if (!result) {
    return { present: false, path: GOLDEN_PATTERN_REL };
  }
  if (result.invalid) {
    return {
      present: false,
      path: result.path || GOLDEN_PATTERN_REL,
      invalid: true,
      error: result.error || 'invalid',
    };
  }
  if (!result.present || !result.golden) {
    return { present: false, path: result.path || GOLDEN_PATTERN_REL };
  }
  return {
    present: true,
    path: result.path || GOLDEN_PATTERN_REL,
    name: result.golden.name,
    norm: result.golden.norm,
    ...(result.golden.newCodeHome ? { newCodeHome: result.golden.newCodeHome } : {}),
    ...(result.golden.examplePath ? { examplePath: result.golden.examplePath } : {}),
    advisoryOnly: true,
    doesNotClearDesignWeak: true,
  };
}

/**
 * Attach golden guidance to a placement object (ark_place / prepare_write).
 * @param {object} placement
 * @param {GoldenPatternLoadResult} goldenResult
 */
export function attachGoldenToPlacement(placement, goldenResult) {
  if (!placement || typeof placement !== 'object') return placement;
  if (placement.error) return placement;

  const summary = summarizeGoldenPattern(goldenResult);
  const note = formatGoldenPatternNote(goldenResult);
  const next = {
    ...placement,
    goldenPattern: summary,
  };
  if (note) {
    next.note = placement.note ? `${placement.note} ${note}` : note;
  }
  return next;
}
