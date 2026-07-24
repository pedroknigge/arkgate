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

  for (const layer of Object.keys(refs).sort()) {
    const relRaw = refs[layer];
    const pathKey = `$.arkRules[${JSON.stringify(layer)}]`;
    if (typeof relRaw !== 'string' || relRaw.length === 0) {
      errors.push({ path: pathKey, message: 'must be a non-empty relative path string' });
      continue;
    }
    if (relRaw.startsWith('/') || /^[A-Za-z]:[\\/]/.test(relRaw)) {
      errors.push({
        path: pathKey,
        message: 'must be a project-relative path (absolute paths are not allowed)',
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

    const rel = relRaw.replace(/\\/g, '/').replace(/^\.\//, '');
    referenced.add(rel);
    const absolute = path.resolve(root, rel);
    opts.observeInput?.(absolute, 'arkrules');
    if (!fs.existsSync(absolute)) {
      errors.push({
        path: pathKey,
        message: `referenced ArkRules file ${JSON.stringify(rel)} is missing`,
      });
      continue;
    }
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
  const arkrulesDir = path.join(root, 'arkrules');
  if (fs.existsSync(arkrulesDir) && fs.statSync(arkrulesDir).isDirectory()) {
    for (const name of fs.readdirSync(arkrulesDir).sort()) {
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
