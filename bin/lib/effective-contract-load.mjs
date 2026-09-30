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
  duplicateArkRuleIds,
  loadArkRulesContract,
  sliceScopeEscapes,
} from './arkrules-contract.mjs';
import { resolveSliceRulePlan } from '../ark-layer-match.mjs';
import { collectGovernedFiles } from './scan-files.mjs';

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
function declaredLayerNames(config) {
  return new Set(Array.isArray(config?.layers) ? config.layers.map((layer) => layer?.name).filter(Boolean) : []);
}

function arkRulesRefList(value) {
  if (typeof value === 'string') return value.length > 0 ? [value] : null;
  if (Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === 'string' && entry.length > 0)) {
    return value;
  }
  return null;
}

function pushReadError(errors, pathKey, rel, error) {
  errors.push({
    path: pathKey,
    message:
      error instanceof Error
        ? error.message
        : `referenced ArkRules file ${JSON.stringify(rel)} failed to load`,
  });
}

export function loadEffectiveArkRules(config, readRelative, opts = {}) {
  const refs = config?.arkRules;
  const referenced = new Set();
  const layerNames = declaredLayerNames(config);
  const errors = [];
  const parts = [];
  const hasRefs = Boolean(refs && typeof refs === 'object' && Object.keys(refs).length > 0);
  if (hasRefs) {
    for (const layer of Object.keys(refs).sort()) {
      const raw = refs[layer];
      const paths = arkRulesRefList(raw);
      const pathKey = `$.arkRules[${JSON.stringify(layer)}]`;
      if (!paths) {
        errors.push({ path: pathKey, message: 'must be a non-empty path string or an array of paths' });
        continue;
      }
      if (!layerNames.has(layer)) {
        errors.push({
          path: pathKey,
          message: `layer ${JSON.stringify(layer)} is not declared in layers[]`,
        });
        continue;
      }
      paths.forEach((relRaw, index) => {
        const itemKey = paths.length === 1 && typeof raw === 'string' ? pathKey : `${pathKey}[${index}]`;
        const rel = normalizeProjectRelativePath(relRaw);
        if (!rel) {
          errors.push({
            path: itemKey,
            message:
              'must be a project-relative path without absolute roots or parent-directory traversal',
          });
          return;
        }
        referenced.add(rel);
        const read = readRelative(rel);
        if (!read.ok) {
          if (read.missing && opts.missingAsEmpty) return;
          errors.push({ path: itemKey, message: read.message });
          return;
        }
        try {
          const loaded = loadArkRulesContract(JSON.parse(read.content), rel, layer);
          parts.push({ layer, sourceFile: rel, file: loaded.config });
        } catch (error) {
          pushReadError(errors, itemKey, rel, error);
        }
      });
    }
  }
  const plan = resolveSliceRulePlan({
    files: Array.isArray(opts.files) ? opts.files : [],
    rules: Array.isArray(config?.rules) ? config.rules : [],
    layers: [...layerNames],
  });
  for (const entry of plan) {
    const read = readRelative(entry.path);
    if (!read.ok) {
      if (read.missing) continue;
      errors.push({ path: entry.path, message: read.message });
      continue;
    }
    referenced.add(entry.path);
    try {
      const loaded = loadArkRulesContract(JSON.parse(read.content), entry.path, entry.layer);
      const part = {
        layer: entry.layer,
        sourceFile: entry.path,
        file: loaded.config,
        childId: entry.childId,
        defaultAppliesTo: entry.defaultAppliesTo,
      };
      const escapes = sliceScopeEscapes(part);
      if (escapes.length > 0) {
        errors.push({
          path: entry.path,
          message: `ARKRULE_SCOPE_ESCAPES_SLICE: ${entry.path} appliesTo ${escapes
            .map((row) => row.pattern)
            .join(', ')} escapes ${entry.childId}`,
        });
        continue;
      }
      parts.push(part);
    } catch (error) {
      pushReadError(errors, entry.path, entry.path, error);
    }
  }
  for (const dupe of duplicateArkRuleIds(parts)) {
    errors.push({
      path: `$.arkRules[${JSON.stringify(dupe.layer)}]`,
      message: `ARKRULE_DUPLICATE_ID: ${dupe.id} is declared in ${dupe.sourceFiles.join(', ')}`,
    });
  }
  if (!hasRefs && parts.length === 0 && errors.length === 0) {
    return { arkRules: emptyEffectiveArkRules(), errors: [], referenced };
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
function governedRelativeFiles(canonicalRoot, config) {
  const include = Array.isArray(config?.include) && config.include.length > 0 ? config.include : ['src'];
  return collectGovernedFiles(canonicalRoot, { ...config, include })
    .map((file) => path.relative(canonicalRoot, file).split(path.sep).join('/'))
    .filter((rel) => rel && !rel.startsWith('..'));
}

function sliceRuleBasenames(config) {
  return [...declaredLayerNames(config)].map((layer) => `arkrules.${layer}.json`);
}

/** `arkrules.<Layer>.json` beside a governed file or one of its parents. Not a repo-wide search. */
function unreferencedSliceRuleWarnings(canonicalRoot, referenced, files, basenames) {
  const wanted = new Set(basenames);
  if (wanted.size === 0) return [];
  const dirs = new Set();
  for (const rel of files) {
    let end = String(rel).lastIndexOf('/');
    while (end > 0) {
      const dir = String(rel).slice(0, end);
      if (dirs.has(dir)) break;
      dirs.add(dir);
      end = dir.lastIndexOf('/');
    }
  }
  const warnings = [];
  for (const dir of dirs) {
    let names;
    try {
      names = fs.readdirSync(path.join(canonicalRoot, ...dir.split('/')));
    } catch {
      continue;
    }
    for (const name of names) {
      if (!wanted.has(name)) continue;
      const candidate = `${dir}/${name}`;
      if (referenced.has(candidate)) continue;
      warnings.push({
        path: candidate,
        message: `ArkRules file ${JSON.stringify(candidate)} is not referenced by arkRules and will not be enforced`,
        severity: 'advisory',
      });
    }
  }
  return warnings;
}

export function arkRulesLoadFailed(source, errors) {
  const message = (errors ?? []).map((issue) => `- ${issue.path}: ${issue.message}`).join('\n');
  const contractError = (errors ?? []).some(
    (issue) =>
      typeof issue.message === 'string' &&
      (issue.message.includes('ARKRULE_DUPLICATE_ID') || issue.message.includes('ARKRULE_SCOPE_ESCAPES_SLICE'))
  );
  const label = contractError ? 'Invalid ArkGate config' : 'Invalid Effective Contract';
  const error = new Error(`${label} (${source}):\n${message}`);
  error.code = 'ARKRULES_LOAD_FAILED';
  error.issues = errors;
  if (contractError) {
    error.name = 'ArkConfigValidationError';
    error.source = source;
  }
  return error;
}

export function loadEffectiveArkRulesFromDisk(root, config, opts = {}) {
  const canonicalRoot = fs.realpathSync(root);
  const files = Array.isArray(opts.files) ? opts.files : governedRelativeFiles(canonicalRoot, config);
  const loaded = loadEffectiveArkRules(config, directoryArkRulesReader(canonicalRoot, opts), { ...opts, files });
  // Drift runs with or without a map: an arkrules/ directory nobody references is visible.
  const warnings = [
    ...unreferencedArkRulesWarnings(canonicalRoot, loaded.referenced),
    ...unreferencedSliceRuleWarnings(canonicalRoot, loaded.referenced, files, sliceRuleBasenames(config)),
  ].sort((left, right) => left.path.localeCompare(right.path));
  return { arkRules: loaded.arkRules, warnings, errors: loaded.errors };
}
