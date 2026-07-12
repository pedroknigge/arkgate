/**
 * Config validation warnings + intent layer helpers for ark-check.
 * Extracted from ark-check entry (R3).
 */
import path from 'node:path';
import {
  DEFAULT_INTENT_PREFIXES,
  resolveIntentLayer,
} from '../ark-shared.mjs';
import { findDeniedEdgeRule } from '../ark-layer-match.mjs';
import { collectAnalysisConfigWarnings } from './analysis-engine.mjs';
import { normalize } from './scan-files.mjs';

export function intentLayersFromManifest(manifest) {
  const layers = manifest?.architecture?.layers;
  if (!Array.isArray(layers)) return undefined;
  return layers
    .filter((layer) => Array.isArray(layer.prefixes) && layer.prefixes.length > 0)
    .map((layer) => ({ name: layer.name, prefixes: layer.prefixes }));
}

export function layerForIntent(intent, layers, manifestIntentLayers) {
  // Use only layers that declare intent prefixes; fall back to the built-in defaults when
  // none do (mirrors the write-gate). resolveIntentLayer applies the library's exact
  // longest-prefix + trailing-dot semantics so CI and the MCP gate classify identically.
  const configured =
    manifestIntentLayers ??
    layers
      .filter((layer) => (layer.intentPrefixes ?? []).length > 0)
      .map((layer) => ({ name: layer.name, prefixes: layer.intentPrefixes }));
  const source =
    configured.length > 0
      ? configured
      : DEFAULT_INTENT_PREFIXES.map((entry) => ({ name: entry.layer, prefixes: entry.prefixes }));
  return resolveIntentLayer(intent, source);
}

/**
 * First denying edge rule for from→to, or undefined.
 * Path-aware when options.fromPath / options.toPath are set (peerIsolation).
 * @param {object[]} rules
 * @param {string} from
 * @param {string} to
 * @param {{ fromPath?: string, toPath?: string, layers?: object[] }} [options]
 */
export function isBlocked(rules, from, to, options) {
  return findDeniedEdgeRule(rules, from, to, options);
}

export function configWarning(ruleId, message, extra = {}) {
  return { ruleId, message, ...extra };
}

export function collectConfigWarnings(root, config, files, rules, manifest) {
  return collectAnalysisConfigWarnings({
    config,
    rules,
    manifest,
    files: files.map((file) => normalize(path.relative(root, file))),
  });
}
