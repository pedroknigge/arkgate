/**
 * Tooling I/O for AR07 orchestration-only / thin-adapter fileHints.
 * Pure derivation lives in Domain (`deriveArkRuleFileHints` / `buildArkRuleFileHints`);
 * this module loads bounded source text when those sensors are active.
 *
 * The file budget is `coverage.maxFiles` (default 400). There is no
 * `arkrules.hintBudget`. When eligible governed files exceed the budget, the
 * loader records exact hinted/governed counts and a completeness reason so an
 * enforced sensor that never saw its scope cannot look green.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildArkRuleFileHints } from './arkrules-sensors.mjs';

/** Default hint-file budget. Same lever as `coverage.maxFiles`. */
export const DEFAULT_MAX_HINT_FILES = 400;
/** Hard ceiling — same clamp as coverage.maxFiles. */
export const MAX_HINT_FILES_CAP = 20_000;
const MAX_FILE_BYTES = 256 * 1024;

const HINT_SENSORS = new Set([
  'orchestration-only',
  'thin-adapter',
  'writes-via-aggregate',
]);

const HINT_BUDGET_META = Symbol.for('arkgate.hintBudget');

/** --doctor sentence: coverage.maxFiles also bounds structural-hint preload. */
export const HINT_BUDGET_DOCTOR_LINE =
  'coverage.maxFiles (default 400) also bounds structural-hint preload for orchestration-only, thin-adapter, and writes-via-aggregate; there is no separate arkrules.hintBudget.';

/**
 * @param {{ structure?: Array<{ sensor?: string }> } | null | undefined} arkRules
 */
export function needsArkRuleFileHints(arkRules) {
  return (arkRules?.structure ?? []).some((rule) => HINT_SENSORS.has(rule?.sensor));
}

/**
 * @param {unknown} maxFiles
 * @returns {number}
 */
export function resolveHintBudget(maxFiles) {
  if (Number.isInteger(maxFiles) && maxFiles > 0) {
    return Math.min(maxFiles, MAX_HINT_FILES_CAP);
  }
  return DEFAULT_MAX_HINT_FILES;
}

/**
 * @param {unknown} hints
 * @returns {null | {
 *   hinted: number,
 *   governed: number,
 *   budget: number,
 *   truncated: boolean,
 *   sensors: Array<{ sensor: string, reviewed: number, scope: number, mode: string }>,
 *   finding: { ruleId: string, message: string, failsStrict: boolean } | null,
 *   completenessReason: { code: string, message: string } | null,
 * }}
 */
export function getArkRuleHintBudget(hints) {
  if (!hints || typeof hints !== 'object') return null;
  return hints[HINT_BUDGET_META] ?? null;
}

/**
 * @param {ReturnType<typeof getArkRuleHintBudget>} [budget]
 * @returns {string}
 */
export function formatHintBudgetDoctorLine(budget) {
  if (!budget?.truncated) return HINT_BUDGET_DOCTOR_LINE;
  return `${HINT_BUDGET_DOCTOR_LINE} Hinted ${budget.hinted} of ${budget.governed} eligible governed files (budget ${budget.budget}).`;
}

/**
 * Minimal glob match (double-star slash = zero path segments).
 * @param {string} glob
 * @param {string} file
 */
function matchSimpleGlob(glob, file) {
  const pattern = String(glob || '').replace(/\\/g, '/');
  const target = String(file || '').replace(/\\/g, '/');
  if (!pattern) return false;
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else if (/[.+^${}()|[\]\\]/.test(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  return new RegExp(`^${out}$`).test(target);
}

/**
 * @param {string} file
 * @param {unknown} appliesTo
 */
function matchesAppliesTo(file, appliesTo) {
  if (!Array.isArray(appliesTo) || appliesTo.length === 0) return true;
  return appliesTo.some(
    (pattern) => typeof pattern === 'string' && matchSimpleGlob(pattern, file)
  );
}

function normalizeRel(relPath) {
  return String(relPath || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

function isHintEligiblePath(rel) {
  if (!rel) return false;
  if (!/\.(tsx?|mts|cts|jsx?|mjs|cjs)$/i.test(rel)) return false;
  if (rel.includes('node_modules/') || rel.endsWith('.d.ts')) return false;
  return true;
}

/**
 * One row per hint sensor (union of appliesTo; enforced if any rule is).
 * @param {{ structure?: Array<{ sensor?: string, mode?: string, appliesTo?: string[] }> } | null | undefined} arkRules
 */
function hintSensorScopes(arkRules) {
  /** @type {Map<string, { sensor: string, appliesTo: string[], unconstrained: boolean, enforced: boolean }>} */
  const bySensor = new Map();
  for (const rule of arkRules?.structure ?? []) {
    const sensor = rule?.sensor;
    if (!HINT_SENSORS.has(sensor)) continue;
    const applies = Array.isArray(rule.appliesTo)
      ? rule.appliesTo.filter((item) => typeof item === 'string' && item.length > 0)
      : [];
    const existing = bySensor.get(sensor);
    if (!existing) {
      bySensor.set(sensor, {
        sensor,
        appliesTo: [...applies],
        unconstrained: applies.length === 0,
        enforced: rule.mode === 'enforced',
      });
      continue;
    }
    if (applies.length === 0) existing.unconstrained = true;
    else existing.appliesTo.push(...applies);
    if (rule.mode === 'enforced') existing.enforced = true;
  }
  return [...bySensor.values()];
}

/**
 * @param {ReturnType<typeof hintSensorScopes>} scopes
 * @param {string[]} eligible
 * @param {Set<string>} hintedSet
 */
function sensorCoverage(scopes, eligible, hintedSet) {
  return scopes.map((scope) => {
    const inScope = scope.unconstrained
      ? eligible
      : eligible.filter((file) => matchesAppliesTo(file, scope.appliesTo));
    return {
      sensor: scope.sensor,
      reviewed: inScope.filter((file) => hintedSet.has(file)).length,
      scope: inScope.length,
      mode: scope.enforced ? 'enforced' : 'advisory',
    };
  });
}

function formatSensorSummaries(sensors) {
  return sensors
    .map((row) => `${row.sensor} reviewed ${row.reviewed}/${row.scope} files of its scope`)
    .join('; ');
}

function attachHintBudget(hints, meta) {
  Object.defineProperty(hints, HINT_BUDGET_META, {
    value: meta,
    enumerable: false,
    configurable: true,
  });
  return hints;
}

/**
 * Load governed source contents (bounded) and derive fileHints.
 *
 * Return value stays a path→flags map so architecture-scan can pass it through
 * unchanged. Truncation stats hang on a non-enumerable symbol — read them with
 * `getArkRuleHintBudget`.
 *
 * @param {string} root
 * @param {{ files?: Array<{ path: string }> }} facts
 * @param {{ structure?: Array<{ sensor?: string, mode?: string, appliesTo?: string[] }> } | null | undefined} arkRules
 * @param {Readonly<Record<string, string>>} [preloadedContents] optional reuse from coverage I/O
 * @param {{ maxFiles?: number }} [options] `coverage.maxFiles` when the caller knows it
 * @returns {Record<string, { orchestrationHeavy?: boolean, adapterThick?: boolean, persistenceWrite?: boolean }> | undefined}
 */
export function loadArkRuleFileHints(root, facts, arkRules, preloadedContents, options) {
  if (!needsArkRuleFileHints(arkRules)) return undefined;

  const explicitBudget =
    Number.isInteger(options?.maxFiles) && options.maxFiles > 0
      ? Math.min(options.maxFiles, MAX_HINT_FILES_CAP)
      : null;

  const eligible = [];
  const seenEligible = new Set();
  for (const file of facts?.files ?? []) {
    const rel = normalizeRel(file?.path);
    if (!isHintEligiblePath(rel) || seenEligible.has(rel)) continue;
    seenEligible.add(rel);
    eligible.push(rel);
  }
  eligible.sort();

  let fileContents = { ...(preloadedContents ?? {}) };
  if (explicitBudget != null) {
    const keys = Object.keys(fileContents).sort();
    if (keys.length > explicitBudget) {
      fileContents = Object.fromEntries(
        keys.slice(0, explicitBudget).map((key) => [key, fileContents[key]])
      );
    }
  }
  const seen = new Set(Object.keys(fileContents));
  // When coverage already preloaded more than the default 400, that preload *is*
  // the coverage.maxFiles lever. Do not trim it unless the caller passed maxFiles.
  const budget =
    explicitBudget ??
    Math.min(Math.max(DEFAULT_MAX_HINT_FILES, seen.size), MAX_HINT_FILES_CAP);

  const rootResolved = path.resolve(root);
  const pushFile = (relPath) => {
    const rel = normalizeRel(relPath);
    if (!rel || seen.has(rel) || seen.size >= budget) return;
    if (!isHintEligiblePath(rel)) return;
    const absolute = path.resolve(root, rel);
    const relative = path.relative(rootResolved, absolute);
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
      return;
    }
    try {
      const stat = fs.statSync(absolute);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return;
      fileContents[rel] = fs.readFileSync(absolute, 'utf8');
      seen.add(rel);
    } catch {
      // skip unreadable
    }
  };

  for (const rel of eligible) {
    pushFile(rel);
  }

  const hintedSet = new Set(Object.keys(fileContents));
  const hinted = hintedSet.size;
  const governed = eligible.length;
  const truncated = governed > hinted;
  const sensors = sensorCoverage(hintSensorScopes(arkRules), eligible, hintedSet);
  const enforcedMiss = sensors.some(
    (row) => row.mode === 'enforced' && row.reviewed < row.scope
  );
  const sensorSummary = formatSensorSummaries(sensors);
  const message = truncated
    ? `Structural-hint budget exhausted: hinted ${hinted} of ${governed} eligible governed files (budget ${budget}; raise coverage.maxFiles — this cap also bounds structural-hint preload)${sensorSummary ? `. ${sensorSummary}` : ''}.`
    : null;
  const finding = truncated
    ? {
        ruleId: 'ARKRULE_HINT_BUDGET_EXHAUSTED',
        message,
        failsStrict: enforcedMiss,
      }
    : null;
  const completenessReason = truncated
    ? { code: 'ARKRULE_HINT_BUDGET_EXHAUSTED', message }
    : null;
  const meta = {
    hinted,
    governed,
    budget,
    truncated,
    sensors,
    finding,
    completenessReason,
  };

  if (Object.keys(fileContents).length === 0 && !truncated) return undefined;

  const derived = buildArkRuleFileHints(fileContents);
  const hints = derived && typeof derived === 'object' ? derived : {};
  attachHintBudget(hints, meta);
  return hints;
}
