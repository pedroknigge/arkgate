/**
 * Tooling adapter: load Effective Contract from disk for a root config.
 * Pure resolution lives in Domain (`resolveEffectiveContract`); this module owns I/O.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  emptyEffectiveArkRules,
  buildEffectiveArkRules,
  loadArkRulesContract,
} from './arkrules-contract.mjs';

function normalizeProjectRelativePath(value) {
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

function isWithinRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

/**
 * @param {string} root
 * @param {Record<string, unknown>} config loaded ark.config.json object
 * @param {{ observeInput?: (abs: string, kind: string) => void }} [opts]
 * @returns {{ arkRules: ReturnType<typeof emptyEffectiveArkRules>, warnings: Array<{path:string,message:string,severity:string}>, errors: Array<{path:string,message:string}> }}
 */
export function loadEffectiveArkRulesFromDisk(root, config, opts = {}) {
  const refs = config?.arkRules;
  if (!refs || typeof refs !== 'object' || Object.keys(refs).length === 0) {
    return { arkRules: emptyEffectiveArkRules(), warnings: [], errors: [] };
  }

  const layerNames = new Set(
    Array.isArray(config.layers) ? config.layers.map((layer) => layer.name) : []
  );
  const errors = [];
  const warnings = [];
  const parts = [];
  const referenced = new Set();
  const canonicalRoot = fs.realpathSync(root);

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
    const lexicalTarget = path.resolve(canonicalRoot, ...rel.split('/'));
    if (!isWithinRoot(canonicalRoot, lexicalTarget)) {
      errors.push({
        path: pathKey,
        message: `referenced ArkRules path ${JSON.stringify(rel)} resolves outside the project root`,
      });
      continue;
    }
    if (!fs.existsSync(lexicalTarget)) {
      errors.push({
        path: pathKey,
        message: `referenced ArkRules file ${JSON.stringify(rel)} is missing`,
      });
      continue;
    }
    let absolute;
    try {
      absolute = fs.realpathSync(lexicalTarget);
    } catch (error) {
      errors.push({
        path: pathKey,
        message: `referenced ArkRules file ${JSON.stringify(rel)} could not be resolved: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      continue;
    }
    if (!isWithinRoot(canonicalRoot, absolute)) {
      errors.push({
        path: pathKey,
        message: `referenced ArkRules path ${JSON.stringify(rel)} resolves outside the project root`,
      });
      continue;
    }
    opts.observeInput?.(absolute, 'arkrules');
    let content;
    try {
      content = fs.readFileSync(absolute, 'utf8');
    } catch (error) {
      errors.push({
        path: pathKey,
        message: `referenced ArkRules file ${JSON.stringify(rel)} could not be read: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      continue;
    }
    try {
      const loaded = loadArkRulesContract(JSON.parse(content), rel, layer);
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

  // Drift: unreferenced files under arkrules/
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

  if (errors.length > 0) {
    return { arkRules: emptyEffectiveArkRules(), warnings, errors };
  }
  return {
    arkRules: buildEffectiveArkRules(parts),
    warnings,
    errors: [],
  };
}
