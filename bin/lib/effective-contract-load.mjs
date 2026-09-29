/**
 * Tooling adapter: load Effective Contract from disk for a root config.
 * Pure resolution lives in Domain (`resolveEffectiveContract`); this module owns I/O.
 *
 * `loadEffectiveArkRules` is the source-agnostic core (working tree, a policy base
 * ref, or supplied file objects all pass the same path validation); only the
 * reader differs.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  emptyEffectiveArkRules,
  buildEffectiveArkRules,
  loadArkRulesContract,
} from './arkrules-contract.mjs';

export function normalizeProjectRelativePath(value) {
  const normalized = value.replace(/\\/g, '/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.includes('\0')
  ) {
    return undefined;
  }
  const segments = [];
  for (const segment of normalized.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') return undefined;
    segments.push(segment);
  }
  return segments.length > 0 ? segments.join('/') : undefined;
}

export function isWithinRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

/**
 * @typedef {{ ok: true, content: string } | { ok: false, missing?: boolean, message: string }} ArkRulesRead
 */

/**
 * Core loader shared by every source.
 *
 * @param {Record<string, unknown>} config loaded ark.config.json object
 * @param {(rel: string) => ArkRulesRead} readRelative
 * @param {{ missingAsEmpty?: boolean }} [opts] missingAsEmpty: a referenced file absent
 *   from the source counts as an empty layer (a base that predates the file), not an error.
 * @returns {{ arkRules: ReturnType<typeof emptyEffectiveArkRules>, errors: Array<{path:string,message:string}>, referenced: Set<string> }}
 */
export function loadEffectiveArkRules(config, readRelative, opts = {}) {
  const refs = config?.arkRules;
  const referenced = new Set();
  if (!refs || typeof refs !== 'object' || Object.keys(refs).length === 0) {
    return { arkRules: emptyEffectiveArkRules(), errors: [], referenced };
  }
  const layerNames = new Set(
    Array.isArray(config.layers) ? config.layers.map((layer) => layer.name) : []
  );
  const errors = [];
  const parts = [];
  for (const layer of Object.keys(refs).sort()) {
    const relRaw = refs[layer];
    const pathKey = `$.arkRules[${JSON.stringify(layer)}]`;
    if (typeof relRaw !== 'string' || relRaw.length === 0) {
      errors.push({ path: pathKey, message: 'must be a non-empty relative path string' });
      continue;
    }
    const rel = normalizeProjectRelativePath(relRaw);
    if (!rel) {
      errors.push({
        path: pathKey,
        message:
          'must be a project-relative path without absolute roots or parent-directory traversal',
      });
      continue;
    }
    if (!layerNames.has(layer)) {
      errors.push({
        path: pathKey,
        message: `layer ${JSON.stringify(layer)} is not declared in layers[]`,
      });
      continue;
    }
    referenced.add(rel);
    const read = readRelative(rel);
    if (!read.ok) {
      if (read.missing && opts.missingAsEmpty) continue;
      errors.push({ path: pathKey, message: read.message });
      continue;
    }
    try {
      const loaded = loadArkRulesContract(JSON.parse(read.content), rel, layer);
      parts.push({ layer, sourceFile: rel, file: loaded.config });
    } catch (error) {
      errors.push({
        path: pathKey,
        message:
          error instanceof Error
            ? error.message
            : `referenced ArkRules file ${JSON.stringify(rel)} failed to load`,
      });
    }
  }
  if (errors.length > 0) return { arkRules: emptyEffectiveArkRules(), errors, referenced };
  return { arkRules: buildEffectiveArkRules(parts), errors: [], referenced };
}

/**
 * Directory reader: realpath + within-root guards, then readFileSync.
 * @param {string} canonicalRoot realpath of the directory the paths are relative to
 * @param {{ observeInput?: (abs: string, kind: string) => void }} [opts]
 * @returns {(rel: string) => ArkRulesRead}
 */
export function directoryArkRulesReader(canonicalRoot, opts = {}) {
  return (rel) => {
    const lexicalTarget = path.resolve(canonicalRoot, ...rel.split('/'));
    const outside = {
      ok: false,
      message: `referenced ArkRules path ${JSON.stringify(rel)} resolves outside the project root`,
    };
    if (!isWithinRoot(canonicalRoot, lexicalTarget)) return outside;
    if (!fs.existsSync(lexicalTarget)) {
      return {
        ok: false,
        missing: true,
        message: `referenced ArkRules file ${JSON.stringify(rel)} is missing`,
      };
    }
    let absolute;
    try {
      absolute = fs.realpathSync(lexicalTarget);
    } catch (error) {
      return {
        ok: false,
        message: `referenced ArkRules file ${JSON.stringify(rel)} could not be resolved: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
    if (!isWithinRoot(canonicalRoot, absolute)) return outside;
    opts.observeInput?.(absolute, 'arkrules');
    try {
      return { ok: true, content: fs.readFileSync(absolute, 'utf8') };
    } catch (error) {
      return {
        ok: false,
        message: `referenced ArkRules file ${JSON.stringify(rel)} could not be read: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  };
}

/**
 * Reader over supplied ArkRules file objects keyed by project-relative path
 * (MCP callers hand a catalog as data instead of a checkout).
 * @param {Record<string, unknown>} files
 * @returns {(rel: string) => ArkRulesRead}
 */
export function objectArkRulesReader(files) {
  const byPath = new Map();
  for (const [key, value] of Object.entries(files ?? {})) {
    const rel = normalizeProjectRelativePath(String(key));
    if (rel) byPath.set(rel, value);
  }
  return (rel) =>
    byPath.has(rel)
      ? { ok: true, content: JSON.stringify(byPath.get(rel)) }
      : {
          ok: false,
          missing: true,
          message: `ArkRules file ${JSON.stringify(rel)} was not supplied`,
        };
}

/** Advisory drift: `arkrules/*.json` files the arkRules map does not reference (ADR 0012 D2). */
function unreferencedArkRulesWarnings(canonicalRoot, referenced) {
  const warnings = [];
  const arkrulesDir = path.join(canonicalRoot, 'arkrules');
  const resolvedArkRulesDir = fs.existsSync(arkrulesDir)
    ? fs.realpathSync(arkrulesDir)
    : undefined;
  if (
    resolvedArkRulesDir &&
    isWithinRoot(canonicalRoot, resolvedArkRulesDir) &&
    fs.statSync(resolvedArkRulesDir).isDirectory()
  ) {
    for (const name of fs.readdirSync(resolvedArkRulesDir).sort()) {
      if (!name.endsWith('.json')) continue;
      const rel = `arkrules/${name}`;
      if (!referenced.has(rel)) {
        warnings.push({
          path: rel,
          message: `ArkRules file ${JSON.stringify(rel)} is not referenced by arkRules and will not be enforced`,
          severity: 'advisory',
        });
      }
    }
  }
  return warnings;
}

export const ARKRULE_FILE_UNREFERENCED = 'ARKRULE_FILE_UNREFERENCED';

/**
 * Loader drift warnings as advisory check warnings (never fail --strict-config).
 * @param {Array<{path:string,message:string}>} warnings
 */
export function arkRulesDriftWarnings(warnings) {
  return (warnings ?? []).map((warning) => ({
    ruleId: ARKRULE_FILE_UNREFERENCED,
    file: warning.path,
    line: 1,
    message: warning.message,
    severity: 'warning',
    failsStrict: false,
  }));
}

/**
 * @param {string} root
 * @param {Record<string, unknown>} config loaded ark.config.json object
 * @param {{ observeInput?: (abs: string, kind: string) => void }} [opts]
 * @returns {{ arkRules: ReturnType<typeof emptyEffectiveArkRules>, warnings: Array<{path:string,message:string,severity:string}>, errors: Array<{path:string,message:string}> }}
 */
export function loadEffectiveArkRulesFromDisk(root, config, opts = {}) {
  const canonicalRoot = fs.realpathSync(root);
  const loaded = loadEffectiveArkRules(config, directoryArkRulesReader(canonicalRoot, opts));
  // Drift runs with or without a map: an arkrules/ directory nobody references is visible.
  const warnings = unreferencedArkRulesWarnings(canonicalRoot, loaded.referenced);
  return { arkRules: loaded.arkRules, warnings, errors: loaded.errors };
}
