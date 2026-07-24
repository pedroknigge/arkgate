/**
 * Pure Effective Contract composition (ADR 0012).
 *
 * Resolves `arkRules` references against a supplied file-content map (Tooling owns I/O),
 * validates each part, and returns one in-memory contract with per-rule provenance.
 * The serialized effective rules feed policyHash via the analysis contract loader.
 */

import {
  buildEffectiveArkRules,
  emptyEffectiveArkRules,
  loadArkRulesContract,
  type EffectiveArkRules,
  ArkRulesValidationError,
} from './arkRulesContract';
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
  const refs = input.config.arkRules;
  const warnings: EffectiveContractWarning[] = [];

  if (!refs || Object.keys(refs).length === 0) {
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
  const parts: Array<{ layer: string; sourceFile: string; file: ReturnType<typeof loadArkRulesContract>['config'] }> =
    [];
  const referenced = new Set<string>();

  for (const layer of Object.keys(refs).sort()) {
    const rawPath = refs[layer];
    const pathKey = `$.arkRules[${JSON.stringify(layer)}]`;
    if (typeof rawPath !== 'string' || rawPath.length === 0) {
      issues.push({ path: pathKey, message: 'must be a non-empty relative path string' });
      continue;
    }
    if (rawPath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(rawPath)) {
      issues.push({
        path: pathKey,
        message: 'must be a project-relative path (absolute paths are not allowed)',
      });
      continue;
    }
    if (!layerNames.has(layer)) {
      issues.push({
        path: pathKey,
        message: `layer ${JSON.stringify(layer)} is not declared in layers[]`,
      });
      continue;
    }

    const rel = normalizeRel(rawPath);
    referenced.add(rel);
    const content = input.fileContents[rel] ?? input.fileContents[rawPath];
    if (content === undefined) {
      issues.push({
        path: pathKey,
        message: `referenced ArkRules file ${JSON.stringify(rel)} is missing`,
      });
      continue;
    }

    try {
      const loaded = loadArkRulesContract(JSON.parse(content), rel, layer);
      parts.push({ layer, sourceFile: rel, file: loaded.config });
    } catch (error) {
      if (error instanceof ArkRulesValidationError) {
        for (const issue of error.issues) {
          issues.push({
            path: `${pathKey}${issue.path === '$' ? '' : issue.path.replace(/^\$/, '')}`,
            message: `${rel}: ${issue.message}`,
          });
        }
      } else if (error instanceof SyntaxError) {
        issues.push({
          path: pathKey,
          message: `referenced ArkRules file ${JSON.stringify(rel)} is not valid JSON: ${error.message}`,
        });
      } else {
        issues.push({
          path: pathKey,
          message: `referenced ArkRules file ${JSON.stringify(rel)} failed to load: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    }
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

/**
 * Canonical payload for policyHash: root config + sorted effective ArkRules.
 * Absence of arkRules yields the same payload shape with empty structure/invariants.
 */
export function effectiveContractPolicyPayload(contract: EffectiveContract): unknown {
  return {
    config: contract.config,
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
