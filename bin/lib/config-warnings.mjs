/**
 * Config validation warnings + intent layer helpers for ark-check.
 * Extracted from ark-check entry (R3).
 */
import path from 'node:path';
import {
  DEFAULT_INTENT_PREFIXES,
  globToRegExp,
  layerForFile,
  patternSpecificity,
  resolveIntentLayer,
} from '../ark-shared.mjs';
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

export function isBlocked(rules, from, to) {
  return rules.find((rule) => !rule.allowed && rule.from === from && rule.to === to);
}

export function configWarning(ruleId, message, extra = {}) {
  return { ruleId, message, ...extra };
}

export function collectConfigWarnings(root, config, files, rules, manifest) {
  const warnings = [];
  const layers = Array.isArray(config.layers) ? config.layers : [];
  const manifestLayers = Array.isArray(manifest?.architecture?.layers)
    ? manifest.architecture.layers
    : [];
  const knownLayers = new Set([
    ...layers.map((layer) => layer.name).filter(Boolean),
    ...manifestLayers.map((layer) => layer.name).filter(Boolean),
  ]);

  if (layers.length === 0) {
    warnings.push(
      configWarning(
        'CONFIG_NO_LAYERS',
        'No file layers are configured; ark-check cannot classify files for import-boundary enforcement.'
      )
    );
  }

  const seenLayers = new Set();
  const duplicateLayers = new Set();
  for (const layer of layers) {
    if (!layer.name) {
      warnings.push(
        configWarning('CONFIG_LAYER_WITHOUT_NAME', 'A configured layer is missing a name.')
      );
      continue;
    }
    if (seenLayers.has(layer.name)) duplicateLayers.add(layer.name);
    seenLayers.add(layer.name);

    if (
      layer.forbiddenGlobals !== undefined &&
      (!Array.isArray(layer.forbiddenGlobals) ||
        layer.forbiddenGlobals.some((entry) => typeof entry !== 'string'))
    ) {
      warnings.push(
        configWarning(
          'CONFIG_INVALID_FORBIDDEN_GLOBALS',
          `Layer "${layer.name}" has an invalid forbiddenGlobals value; expected an array of strings (e.g. ["fetch", "Date.now"]). The entry is ignored.`,
          { layer: layer.name }
        )
      );
    }

    const patterns = Array.isArray(layer.patterns) ? layer.patterns : [];
    if (patterns.length === 0) {
      warnings.push(
        configWarning(
          'CONFIG_LAYER_WITHOUT_PATTERNS',
          `Layer "${layer.name}" has no file patterns and will never classify files.`,
          { layer: layer.name }
        )
      );
      continue;
    }

    for (const pattern of patterns) {
      let re;
      try {
        re = globToRegExp(pattern);
      } catch (err) {
        warnings.push(
          configWarning(
            'CONFIG_INVALID_LAYER_PATTERN',
            `Layer "${layer.name}" has an invalid pattern "${pattern}": ${
              err instanceof Error ? err.message : String(err)
            }`,
            { layer: layer.name, pattern }
          )
        );
        continue;
      }

      const matched = files.some((file) => {
        const rel = normalize(path.relative(root, file));
        return re.test(rel);
      });
      if (!matched && !layer.optional) {
        // Advisory only under --strict-config: monorepo/Next presets ship many optional-looking
        // globs (e.g. src/layouts/**, app/**) that never match when include is ["frontend"].
        // Failing the release gate on dead preset globs caused false CI red while architecture
        // edges were clean (deer-flow host validation). Real safety is import violations +
        // CONFIG_UNCLASSIFIED_FILES / invalid patterns.
        warnings.push(
          configWarning(
            'CONFIG_LAYER_PATTERN_NO_MATCHES',
            `Layer "${layer.name}" pattern "${pattern}" matched no included files.`,
            { layer: layer.name, pattern, failsStrict: false }
          )
        );
      }
    }
  }

  for (const name of duplicateLayers) {
    warnings.push(
      configWarning(
        'CONFIG_DUPLICATE_LAYER',
        `Layer "${name}" is configured more than once.`,
        { layer: name }
      )
    );
  }

  if (knownLayers.size > 0) {
    for (const rule of rules ?? []) {
      if (rule.from && !knownLayers.has(rule.from)) {
        warnings.push(
          configWarning(
            'CONFIG_RULE_UNKNOWN_FROM_LAYER',
            `Rule references unknown source layer "${rule.from}".`,
            { fromLayer: rule.from, toLayer: rule.to }
          )
        );
      }
      if (rule.to && !knownLayers.has(rule.to)) {
        warnings.push(
          configWarning(
            'CONFIG_RULE_UNKNOWN_TO_LAYER',
            `Rule references unknown target layer "${rule.to}".`,
            { fromLayer: rule.from, toLayer: rule.to }
          )
        );
      }
    }
  }

  // Ambiguous overlap: a file matched by two different layers at the SAME top specificity.
  // layerForFile breaks the tie by declaration order, but the config is genuinely undecided
  // (unlike a facade split, where the surface pattern is strictly more specific and wins
  // cleanly). Surface the layer pairs so the author disambiguates instead of relying on order.
  const ambiguousPairs = new Set();
  if (layers.length > 1) {
    for (const file of files) {
      const rel = normalize(path.relative(root, file));
      let topScore = -1;
      let topLayers = [];
      for (const layer of layers) {
        for (const pattern of layer.patterns ?? []) {
          if (!globToRegExp(pattern).test(rel)) continue;
          const score = patternSpecificity(pattern);
          if (score > topScore) {
            topScore = score;
            topLayers = [layer.name];
          } else if (score === topScore && !topLayers.includes(layer.name)) {
            topLayers.push(layer.name);
          }
        }
      }
      if (topLayers.length > 1) {
        ambiguousPairs.add([...topLayers].sort().join(' + '));
      }
    }
  }
  if (ambiguousPairs.size > 0) {
    warnings.push(
      configWarning(
        'CONFIG_AMBIGUOUS_LAYERS',
        `Some files match multiple layers at equal specificity; classification falls back to declaration order. Disambiguate the overlapping patterns: ${[...ambiguousPairs].join(', ')}.`,
        { pairs: [...ambiguousPairs] }
      )
    );
  }

  const unclassified = files.filter((file) => !layerForFile(root, file, layers));
  if (unclassified.length > 0) {
    warnings.push(
      configWarning(
        'CONFIG_UNCLASSIFIED_FILES',
        `${unclassified.length} included source file(s) are not matched by any configured layer; ark-check will not enforce import rules for those source files.`,
        {
          count: unclassified.length,
          samples: unclassified.slice(0, 5).map((file) => normalize(path.relative(root, file))),
        }
      )
    );
  }

  return warnings;
}
