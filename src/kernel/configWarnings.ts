/**
 * Canonical config diagnostics over repo-relative file paths (U02 pilot 2).
 *
 * Reached through the src/kernel/analysis.ts facade; consumer import paths
 * never change.
 */
import { globToRegExp, layerForRelativePath, patternSpecificity } from '../domain/layerMatch';
import type {
  ArchitectureEngineViolation,
  CollectAnalysisConfigWarningsInput,
} from './analysisTypes';

function configWarning(
  ruleId: string,
  message: string,
  extra: Record<string, unknown> = {}
): ArchitectureEngineViolation {
  return { ruleId, message, ...extra };
}

/** Canonical config diagnostics over repo-relative file paths. */
export function collectAnalysisConfigWarnings(
  input: CollectAnalysisConfigWarningsInput
): ArchitectureEngineViolation[] {
  const { config, rules, files, manifest } = input;
  const warnings: ArchitectureEngineViolation[] = [];
  if (
    config.dynamicImportAllowlist !== undefined &&
    (!Array.isArray(config.dynamicImportAllowlist) ||
      config.dynamicImportAllowlist.some((entry) => typeof entry !== 'string'))
  ) {
    warnings.push(
      configWarning(
        'CONFIG_INVALID_DYNAMIC_IMPORT_ALLOWLIST',
        'dynamicImportAllowlist must be an array of file globs.'
      )
    );
  }
  if (
    config.safety !== undefined &&
    (config.safety === null || typeof config.safety !== 'object' || Array.isArray(config.safety))
  ) {
    warnings.push(configWarning('CONFIG_INVALID_SAFETY', 'safety must be an object.'));
  } else if (config.safety) {
    for (const key of ['maxTsSuppressions', 'maxAnyCasts'] as const) {
      const value = config.safety[key];
      if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
        warnings.push(
          configWarning(
            'CONFIG_INVALID_SAFETY_THRESHOLD',
            `safety.${key} must be a non-negative integer.`
          )
        );
      }
    }
  }

  const layers = Array.isArray(config.layers) ? config.layers : [];
  const manifestLayers = Array.isArray(manifest?.architecture?.layers)
    ? manifest.architecture.layers
    : [];
  const knownLayers = new Set([
    ...layers.map((layer) => layer.name).filter(Boolean),
    ...manifestLayers.map((layer) => layer.name).filter((name): name is string => Boolean(name)),
  ]);

  if (layers.length === 0) {
    warnings.push(
      configWarning(
        'CONFIG_NO_LAYERS',
        'No file layers are configured; ark-check cannot classify files for import-boundary enforcement.'
      )
    );
  }

  const seenLayers = new Set<string>();
  const duplicateLayers = new Set<string>();
  for (const layer of layers) {
    if (!layer.name) {
      warnings.push(configWarning('CONFIG_LAYER_WITHOUT_NAME', 'A configured layer is missing a name.'));
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
      let expression: RegExp;
      try {
        expression = globToRegExp(pattern);
      } catch (error) {
        warnings.push(
          configWarning(
            'CONFIG_INVALID_LAYER_PATTERN',
            `Layer "${layer.name}" has an invalid pattern "${pattern}": ${
              error instanceof Error ? error.message : String(error)
            }`,
            { layer: layer.name, pattern }
          )
        );
        continue;
      }
      if (!files.some((file) => expression.test(file)) && !layer.optional) {
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
      configWarning('CONFIG_DUPLICATE_LAYER', `Layer "${name}" is configured more than once.`, {
        layer: name,
      })
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

  const ambiguousPairs = new Set<string>();
  if (layers.length > 1) {
    for (const file of files) {
      let topScore = -1;
      let topLayers: string[] = [];
      for (const layer of layers) {
        for (const pattern of layer.patterns ?? []) {
          if (!globToRegExp(pattern).test(file)) continue;
          const score = patternSpecificity(pattern);
          if (score > topScore) {
            topScore = score;
            topLayers = [layer.name];
          } else if (score === topScore && !topLayers.includes(layer.name)) {
            topLayers.push(layer.name);
          }
        }
      }
      if (topLayers.length > 1) ambiguousPairs.add([...topLayers].sort().join(' + '));
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

  const unclassified = files.filter((file) => !layerForRelativePath(file, layers));
  if (unclassified.length > 0) {
    warnings.push(
      configWarning(
        'CONFIG_UNCLASSIFIED_FILES',
        `${unclassified.length} included source file(s) are not matched by any configured layer; ark-check will not enforce import rules for those source files.`,
        { count: unclassified.length, samples: unclassified.slice(0, 5) }
      )
    );
  }

  return warnings;
}
