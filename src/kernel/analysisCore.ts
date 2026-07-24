/**
 * Contract loading, project/change analysis, and policy-delta analysis
 * (U02 pilot 2). Reached through the src/kernel/analysis.ts facade; consumer
 * import paths never change.
 */
import {
  ANALYSIS_IR_SCHEMA_VERSION,
  deterministicHash,
  stableSerialize,
  type AnalysisCapabilityUse,
  type AnalysisFile,
  type AnalysisViolation,
} from '../domain/analysis';
import {
  effectiveCapabilityDeny,
  forbiddenGlobalForModuleSpecifier,
} from '../domain/capabilities';
import { loadArkConfigContract, parseArkConfigJson } from '../domain/configContract';
import {
  emptyEffectiveArkRules,
  type EffectiveArkRules,
} from '../domain/arkRulesContract';
import {
  effectiveContractPolicyPayload,
  type EffectiveContract,
} from '../domain/effectiveContract';
import { layerForRelativePath } from '../domain/layerMatch';
import {
  classifyArkPolicyDelta,
  policyDeltaAcknowledgementMatches,
} from '../domain/policyDelta';
import { moduleFactsFor, normalizePath, violationsFor } from './moduleGraph';
import type {
  AnalysisContract,
  AnalysisResult,
  AnalyzeChangeInput,
  AnalyzePolicyDeltaInput,
  AnalyzeProjectInput,
  PolicyDeltaAnalysis,
} from './analysisTypes';

const LEXICAL_EVIDENCE_INCOMPLETE = {
  code: 'LEXICAL_EVIDENCE_INCOMPLETE',
  message:
    'Lexical compatibility mode cannot prove parse status, TypeScript/package/symlink resolution, or symbol-aware source-policy and safety evidence. Use the resolved candidate facts APIs for an authoritative verdict.',
} as const;

export type LoadContractOptions = {
  /** Pre-resolved Effective ArkRules (from resolveEffectiveContract). */
  arkRules?: EffectiveArkRules;
};

function hasActiveArkRules(
  config: { arkRules?: Record<string, string> },
  arkRules: EffectiveArkRules
): boolean {
  return (
    (config.arkRules !== undefined && Object.keys(config.arkRules).length > 0) ||
    arkRules.structure.length > 0 ||
    arkRules.invariants.length > 0
  );
}

function policyHashFor(config: AnalysisContract['config'], arkRules: EffectiveArkRules): string {
  // Preserve historical hashes for projects that never opt into ArkRules.
  if (!hasActiveArkRules(config, arkRules)) {
    return deterministicHash(stableSerialize(config));
  }
  const effective: EffectiveContract = {
    config,
    arkRules,
    warnings: [],
  };
  return deterministicHash(stableSerialize(effectiveContractPolicyPayload(effective)));
}

export function loadContract(
  input: unknown,
  source?: string,
  options?: LoadContractOptions
): AnalysisContract {
  const loaded =
    typeof input === 'string'
      ? parseArkConfigJson(input, source)
      : loadArkConfigContract(input, source);
  const arkRules = options?.arkRules ?? emptyEffectiveArkRules();
  return {
    ...loaded,
    arkRules,
    policyHash: policyHashFor(loaded.config, arkRules),
  };
}

export function analyzePolicyDelta(input: AnalyzePolicyDeltaInput): PolicyDeltaAnalysis {
  const base = loadContract(input.baseConfig, input.baseSource ?? 'base ark.config.json', {
    arkRules: input.baseArkRules,
  });
  const candidate = loadContract(
    input.candidateConfig,
    input.candidateSource ?? 'candidate ark.config.json',
    { arkRules: input.candidateArkRules }
  );
  const delta = classifyArkPolicyDelta(base.config, candidate.config, {
    baseArkRules: base.arkRules,
    candidateArkRules: candidate.arkRules,
    candidateInvariantCoverage: input.candidateInvariantCoverage,
  });
  const blockingFindingIds = delta.findings
    .filter(
      (finding) =>
        finding.classification === 'weakening' ||
        finding.classification === 'judgment-required'
    )
    .map((finding) => finding.id)
    .sort();
  const requiresAcknowledgement = blockingFindingIds.length > 0;
  const acknowledged =
    requiresAcknowledgement &&
    policyDeltaAcknowledgementMatches(input.acknowledgement, {
      basePolicyHash: base.policyHash,
      candidatePolicyHash: candidate.policyHash,
      findingIds: blockingFindingIds,
    });

  return {
    schemaVersion: delta.schemaVersion,
    basePolicyHash: base.policyHash,
    candidatePolicyHash: candidate.policyHash,
    classification: delta.classification,
    findings: delta.findings,
    blockingFindingIds,
    requiresAcknowledgement,
    acknowledged,
    valid: !requiresAcknowledgement || acknowledged,
  };
}

export function analyzeProject(input: AnalyzeProjectInput): AnalysisResult {
  const files = input.files
    .map((inputFile) => {
      const path = normalizePath(inputFile.path);
      return {
        path,
        content: inputFile.content,
        contentHash: deterministicHash(inputFile.content),
        layer: layerForRelativePath(path, input.contract.config.layers) ?? null,
      } satisfies AnalysisFile;
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  const fileByPath = new Map(files.map((file) => [file.path, file]));
  // U03: ONE specifier scan per file yields edges and import-based capability
  // evidence together (V01 budget); files are sorted, so identical content
  // reproduces identical ordered output.
  const edges: ReturnType<typeof moduleFactsFor>['edges'] = [];
  const capabilityUses: AnalysisCapabilityUse[] = [];
  for (const file of files) {
    const facts = moduleFactsFor(file, fileByPath);
    edges.push(...facts.edges);
    capabilityUses.push(...facts.capabilityUses);
  }
  const violations = violationsFor(edges, input.contract.config);

  // U04: opted-in capability walls over the pure engine's import-based evidence.
  // Absence of the surface adds nothing; ambient enforcement stays on the
  // symbol-aware adapter path (documented envelope).
  const policyByLayer = new Map(input.contract.config.layers.map((layer) => [layer.name, layer]));
  const denyByLayer = new Map(
    input.contract.config.layers.map((layer) => [
      layer.name,
      new Set<string>(effectiveCapabilityDeny(layer)),
    ])
  );
  for (const use of capabilityUses) {
    const layer = fileByPath.get(use.file)?.layer;
    if (!layer) continue;
    const layerPolicy = policyByLayer.get(layer);
    const forbiddenGlobal = forbiddenGlobalForModuleSpecifier(
      use.symbol,
      layerPolicy?.forbiddenGlobals ?? []
    );
    if (forbiddenGlobal) {
      violations.push({
        ruleId: 'FORBIDDEN_GLOBAL',
        message: `${layer} must not use module "${use.symbol}" because it is the import form of forbidden global "${forbiddenGlobal}".`,
        symbol: use.symbol,
        evidence: use.evidence,
      });
      continue;
    }
    if (!denyByLayer.get(layer)?.has(use.capability)) continue;
    violations.push({
      ruleId: 'CAPABILITY_VIOLATION',
      message: `${layer} denies the ${use.capability} capability; found import of "${use.symbol}".`,
      capability: use.capability,
      symbol: use.symbol,
      evidence: use.evidence,
    });
  }

  const completeness = files.length === 0 ? 'complete' : 'partial';
  const completenessReasons =
    completeness === 'complete' ? [] : [{ ...LEXICAL_EVIDENCE_INCOMPLETE }];
  const ir = {
    schemaVersion: ANALYSIS_IR_SCHEMA_VERSION,
    policyHash: input.contract.policyHash,
    compilerOptionsHash: deterministicHash(stableSerialize(input.compilerOptions ?? {})),
    files,
    layers: input.contract.config.layers.map((layer) => layer.name),
    edges,
    capabilityUses,
    violations,
  };
  return {
    mode: 'lexical-compatibility',
    completeness,
    completenessReasons,
    valid: completeness === 'complete' && violations.length === 0,
    ir,
  };
}

export function analyzeChange(input: AnalyzeChangeInput): AnalysisResult {
  const files = new Map(input.files.map((file) => [normalizePath(file.path), file]));
  for (const change of input.changes) {
    const path = normalizePath(change.path);
    if ('delete' in change && change.delete) files.delete(path);
    else if ('content' in change) files.set(path, { path, content: change.content });
  }
  return analyzeProject({
    contract: input.contract,
    files: [...files.values()],
    compilerOptions: input.compilerOptions,
  });
}

export function explainViolation(violation: AnalysisViolation): string {
  const location = `${violation.evidence.file}:${violation.evidence.line}`;
  if (!violation.edge) return `${violation.ruleId} at ${location}: ${violation.message}`;
  const target = violation.edge.to ?? violation.edge.specifier;
  return `${violation.ruleId} at ${location}: ${violation.edge.from} imports ${target}. ${violation.message}`;
}
