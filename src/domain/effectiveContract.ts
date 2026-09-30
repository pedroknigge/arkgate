/**
 * Pure Effective Contract composition (ADR 0012).
 *
 * Resolves `arkRules` references against a supplied file-content map (Tooling owns I/O),
 * validates each part, and returns one in-memory contract with per-rule provenance.
 * The serialized effective rules feed policyHash via the analysis contract loader.
 */

import {
  buildEffectiveArkRules,
  duplicateArkRuleIds,
  emptyEffectiveArkRules,
  loadArkRulesContract,
  sliceScopeEscapes,
  type ArkRulesBuildPart,
  type EffectiveArkRules,
  ArkRulesValidationError,
} from './arkRulesContract';
import { resolveSliceRulePlan } from './layerMatch';
import type { ArkConfig, ArkConfigIssue } from './configTypes';

export type EffectiveContractWarning = {
  path: string;
  message: string;
  /** advisory | error — errors fail closed; warnings surface drift (unreferenced files). */
  severity: 'advisory' | 'error';
};

export type EffectiveContract = {
  config: ArkConfig;
  arkRules: EffectiveArkRules;
  warnings: EffectiveContractWarning[];
};

export type ResolveEffectiveContractInput = {
  config: ArkConfig;
  /**
   * Project-relative path → file contents. Missing keys mean the file is absent.
   * Paths must use forward slashes and match the arkRules map values exactly.
   */
  fileContents: Readonly<Record<string, string>>;
  /**
   * Optional inventory of files under arkrules/ (or other dirs) used only to
   * detect unreferenced ArkRules files (advisory drift).
   */
  discoveredArkRulesFiles?: readonly string[];
  /**
   * Governed project-relative paths. The child wall names slice rule files from
   * this index. Absence keeps central `arkRules` only.
   */
  governedFiles?: readonly string[];
};

export class EffectiveContractError extends Error {
  readonly issues: ArkConfigIssue[];
  readonly source: string;

  constructor(source: string, issues: ArkConfigIssue[]) {
    super(
      `Invalid Effective Contract (${source}):\n${issues
        .map((issue) => `- ${issue.path}: ${issue.message}`)
        .join('\n')}`
    );
    this.name = 'EffectiveContractError';
    this.source = source;
    this.issues = issues;
  }
}

function normalizeRel(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Resolve arkRules references into a single Effective Contract.
 * Fail-closed for missing, unparsable, or schema-invalid referenced files.
 */
export function resolveEffectiveContract(
  input: ResolveEffectiveContractInput,
  source = 'ark.config.json'
): EffectiveContract {
  const refs = input.config.arkRules ?? {};
  const warnings: EffectiveContractWarning[] = [];
  const hasRefs = Object.keys(refs).length > 0;
  const hasGoverned = Boolean(input.governedFiles && input.governedFiles.length > 0);

  if (!hasRefs && !hasGoverned) {
    if (input.discoveredArkRulesFiles && input.discoveredArkRulesFiles.length > 0) {
      for (const file of [...input.discoveredArkRulesFiles].sort()) {
        warnings.push({
          path: file,
          message: `ArkRules file ${JSON.stringify(file)} is not referenced by arkRules and will not be enforced`,
          severity: 'advisory',
        });
      }
    }
    return {
      config: input.config,
      arkRules: emptyEffectiveArkRules(),
      warnings,
    };
  }

  const layerNames = new Set(input.config.layers.map((layer) => layer.name));
  const issues: ArkConfigIssue[] = [];
  const parts: ArkRulesBuildPart[] = [];
  const referenced = new Set<string>();

  const pushLoadIssue = (pathKey: string, rel: string, error: unknown) => {
    if (error instanceof ArkRulesValidationError) {
      for (const issue of error.issues) {
        issues.push({
          path: `${pathKey}${issue.path === '$' ? '' : issue.path.replace(/^\$/, '')}`,
          message: `${rel}: ${issue.message}`,
        });
      }
      return;
    }
    if (error instanceof SyntaxError) {
      issues.push({
        path: pathKey,
        message: `referenced ArkRules file ${JSON.stringify(rel)} is not valid JSON: ${error.message}`,
      });
      return;
    }
    issues.push({
      path: pathKey,
      message: `referenced ArkRules file ${JSON.stringify(rel)} failed to load: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  };

  for (const layer of Object.keys(refs).sort()) {
    const rawPath = refs[layer];
    const pathKey = `$.arkRules[${JSON.stringify(layer)}]`;
    const paths = Array.isArray(rawPath) ? rawPath : typeof rawPath === 'string' ? [rawPath] : null;
    if (!paths || paths.length === 0 || paths.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
      issues.push({ path: pathKey, message: 'must be a non-empty path string or an array of paths' });
      continue;
    }
    if (!layerNames.has(layer)) {
      issues.push({
        path: pathKey,
        message: `layer ${JSON.stringify(layer)} is not declared in layers[]`,
      });
      continue;
    }
    paths.forEach((raw, index) => {
      const itemKey = paths.length === 1 && typeof rawPath === 'string' ? pathKey : `${pathKey}[${index}]`;
      if (raw.startsWith('/') || /^[A-Za-z]:[\\/]/.test(raw)) {
        issues.push({
          path: itemKey,
          message: 'must be a project-relative path (absolute paths are not allowed)',
        });
        return;
      }
      const rel = normalizeRel(raw);
      referenced.add(rel);
      const content = input.fileContents[rel] ?? input.fileContents[raw];
      if (content === undefined) {
        issues.push({
          path: itemKey,
          message: `referenced ArkRules file ${JSON.stringify(rel)} is missing`,
        });
        return;
      }
      try {
        const loaded = loadArkRulesContract(JSON.parse(content), rel, layer);
        parts.push({ layer, sourceFile: rel, file: loaded.config });
      } catch (error) {
        pushLoadIssue(itemKey, rel, error);
      }
    });
  }

  if (input.governedFiles && input.governedFiles.length > 0) {
    const plan = resolveSliceRulePlan({
      files: input.governedFiles,
      rules: input.config.rules,
      layers: [...layerNames],
    });
    for (const entry of plan) {
      const content = input.fileContents[entry.path];
      if (content === undefined) continue;
      referenced.add(entry.path);
      try {
        const loaded = loadArkRulesContract(JSON.parse(content), entry.path, entry.layer);
        const part: ArkRulesBuildPart = {
          layer: entry.layer,
          sourceFile: entry.path,
          file: loaded.config,
          childId: entry.childId,
          defaultAppliesTo: entry.defaultAppliesTo,
        };
        const escapes = sliceScopeEscapes(part);
        if (escapes.length > 0) {
          issues.push({
            path: entry.path,
            message: `ARKRULE_SCOPE_ESCAPES_SLICE: ${entry.path} appliesTo ${escapes
              .map((row) => row.pattern)
              .join(', ')} escapes ${entry.childId}`,
          });
          continue;
        }
        parts.push(part);
      } catch (error) {
        pushLoadIssue(entry.path, entry.path, error);
      }
    }
  }

  for (const dupe of duplicateArkRuleIds(parts)) {
    issues.push({
      path: `$.arkRules[${JSON.stringify(dupe.layer)}]`,
      message: `ARKRULE_DUPLICATE_ID: ${dupe.id} is declared in ${dupe.sourceFiles.join(', ')}`,
    });
  }

  if (input.discoveredArkRulesFiles) {
    for (const file of [...input.discoveredArkRulesFiles].sort()) {
      const rel = normalizeRel(file);
      if (!referenced.has(rel)) {
        warnings.push({
          path: rel,
          message: `ArkRules file ${JSON.stringify(rel)} is not referenced by arkRules and will not be enforced`,
          severity: 'advisory',
        });
      }
    }
  }

  if (issues.length > 0) {
    throw new EffectiveContractError(source, issues);
  }

  return {
    config: input.config,
    arkRules: buildEffectiveArkRules(parts),
    warnings,
  };
}

/** Layer captions, trust tags, and owners are metadata and must not change policy identity. */
export function omitLayerDescriptions(config: ArkConfig): ArkConfig {
  return {
    ...config,
    layers: config.layers.map((layer) => {
      const {
        description: _description,
        trustBoundary: _trustBoundary,
        owners: _owners,
        ...rest
      } = layer;
      return rest;
    }),
  };
}

/**
 * Canonical payload for policyHash: root config + sorted effective ArkRules.
 * Absence of arkRules yields the same payload shape with empty structure/invariants.
 * `stewards`, `layers[].description`, `layers[].trustBoundary`, and
 * `layers[].owners` are metadata — not import-rule teeth.
 * `requireLayerOwners` stays in the hash (it is the require switch).
 */
export function effectiveContractPolicyPayload(contract: EffectiveContract): unknown {
  const { stewards: _stewards, ...configForHash } = omitLayerDescriptions(contract.config);
  return {
    config: configForHash,
    arkRules: {
      schemaVersion: contract.arkRules.schemaVersion,
      structure: contract.arkRules.structure.map((rule) => ({
        id: rule.id,
        sensor: rule.sensor,
        mode: rule.mode,
        appliesTo: rule.appliesTo ?? null,
        description: rule.description ?? null,
        provenance: rule.provenance,
      })),
      invariants: contract.arkRules.invariants.map((rule) => ({
        id: rule.id,
        description: rule.description,
        aggregate: rule.aggregate ?? null,
        coverage: rule.coverage ?? null,
        mode: rule.mode,
        appliesTo: rule.appliesTo ?? null,
        provenance: rule.provenance,
      })),
    },
  };
}
