/**
 * Pure evaluation of validated, resolver-supplied candidate facts (ADR 0011).
 *
 * Filesystem discovery and TypeScript resolution remain Tooling concerns. This
 * module only classifies canonical paths against the supplied contract and
 * produces the one architecture verdict consumed by every resolved adapter.
 */
import {
  loadResolvedCandidateFacts,
  resolvedFactsEvidenceRequirementsHash,
  type ResolvedCandidateFacts,
} from '../domain/analysis';
import {
  ambientCoveredByForbiddenGlobals,
  effectiveCapabilityDeny,
  forbiddenGlobalForModuleSpecifier,
} from '../domain/capabilities';
import { findDeniedEdgeRule, globToRegExp, layerForRelativePath } from '../domain/layerMatch';
import {
  DEFAULT_INTENT_PREFIXES,
  classifyPublishFacts,
  resolveIntentLayer,
} from '../domain/sourcePolicy';
import { emptyEffectiveArkRules } from '../domain/arkRulesContract';
import { evaluateArkRuleSensors } from '../domain/arkRuleSensors';
import { collectAnalysisConfigWarnings } from './configWarnings';
import { evaluateArchitectureGraph } from './graphEvaluate';
import type {
  AnalysisContract,
  AnalyzeResolvedProjectInput,
  ArchitectureEngineEdge,
  ArchitectureEngineViolation,
  ResolvedAnalysisResult,
  ResolvedSafetyReport,
} from './analysisTypes';

function matchesAny(file: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => {
    try {
      return globToRegExp(pattern).test(file);
    } catch {
      return false;
    }
  });
}

function evaluateSafety(
  input: AnalyzeResolvedProjectInput,
  facts: ResolvedCandidateFacts
): { report: ResolvedSafetyReport; warnings: ArchitectureEngineViolation[] } {
  const safety = input.contract.config.safety ?? {};
  const maxTsSuppressions = Number.isInteger(safety.maxTsSuppressions)
    ? Number(safety.maxTsSuppressions)
    : 0;
  const maxAnyCasts = Number.isInteger(safety.maxAnyCasts) ? Number(safety.maxAnyCasts) : 0;
  const dynamicAllowlist = input.contract.config.dynamicImportAllowlist ?? [];
  const tsSuppressions = facts.safetyUses
    .filter((fact) => fact.kind === 'ts-suppression')
    .map(({ file, line }) => ({ file, line }));
  const anyCasts = facts.safetyUses
    .filter((fact) => fact.kind === 'any-cast')
    .map(({ file, line }) => ({ file, line }));
  const nonLiteralDynamicImports = facts.safetyUses
    .filter(
      (fact) =>
        (fact.kind === 'dynamic-import' || fact.kind === 'dynamic-require') &&
        !matchesAny(fact.file, dynamicAllowlist)
    )
    .map((fact) => ({
      file: fact.file,
      line: fact.line,
      kind: fact.kind === 'dynamic-require' ? ('require' as const) : ('import' as const),
    }));
  const inMemoryProductionStores =
    safety.allowInMemory === true || facts.projectPackageName === 'arkgate'
      ? []
      : facts.safetyUses
          .filter((fact) => fact.kind === 'in-memory-store')
          .map((fact) => ({
            file: fact.file,
            line: fact.line,
            store: fact.symbol ?? 'in-memory store',
          }));
  const disabledPeerIsolationRules =
    safety.allowDisabledPeerIsolation === true
      ? []
      : (input.contract.config.rules ?? [])
          .filter(
            (rule) =>
              rule.peerIsolation === false ||
              (rule.allowed === false &&
                Boolean(rule.from) &&
                rule.from === rule.to &&
                rule.peerIsolation !== true)
          )
          .map((rule) => ({ from: rule.from, to: rule.to }));
  const report: ResolvedSafetyReport = {
    tsSuppressions,
    anyCasts,
    nonLiteralDynamicImports,
    inMemoryProductionStores,
    disabledPeerIsolationRules,
    thresholds: { maxTsSuppressions, maxAnyCasts },
  };
  const warnings: ArchitectureEngineViolation[] = [];
  const nonLiteralImports = nonLiteralDynamicImports.filter((entry) => entry.kind === 'import');
  if (nonLiteralImports.length > 0) {
    const first = nonLiteralImports[0];
    warnings.push({
      ruleId: 'DYNAMIC_IMPORT_NOT_ALLOWLISTED',
      file: first.file,
      line: first.line,
      message: `${nonLiteralImports.length} non-literal dynamic import(s) cannot be resolved statically. Add only reviewed files to dynamicImportAllowlist.`,
    });
  }
  const nonLiteralRequires = nonLiteralDynamicImports.filter((entry) => entry.kind === 'require');
  if (nonLiteralRequires.length > 0) {
    const first = nonLiteralRequires[0];
    warnings.push({
      ruleId: 'DYNAMIC_REQUIRE_NOT_ALLOWLISTED',
      file: first.file,
      line: first.line,
      message: `${nonLiteralRequires.length} non-literal require call(s) cannot be resolved statically. Add only reviewed files to dynamicImportAllowlist.`,
    });
  }
  if (tsSuppressions.length > maxTsSuppressions) {
    const first = tsSuppressions[0];
    warnings.push({
      ruleId: 'TS_SUPPRESSION_THRESHOLD_EXCEEDED',
      file: first.file,
      line: first.line,
      message: `${tsSuppressions.length} @ts-ignore/@ts-nocheck directive(s) exceed safety.maxTsSuppressions (${maxTsSuppressions}).`,
    });
  }
  if (anyCasts.length > maxAnyCasts) {
    const first = anyCasts[0];
    warnings.push({
      ruleId: 'ANY_CAST_THRESHOLD_EXCEEDED',
      file: first.file,
      line: first.line,
      message: `${anyCasts.length} explicit any cast(s) exceed safety.maxAnyCasts (${maxAnyCasts}).`,
    });
  }
  if (inMemoryProductionStores.length > 0) {
    const first = inMemoryProductionStores[0];
    warnings.push({
      ruleId: 'IN_MEMORY_STORE_IN_PRODUCTION_SOURCE',
      file: first.file,
      line: first.line,
      message: `${inMemoryProductionStores.length} ArkGate InMemory store risk(s) appear in governed production source. Provide durable stores or set safety.allowInMemory only for an explicitly ephemeral service.`,
    });
  }
  if (disabledPeerIsolationRules.length > 0) {
    warnings.push({
      ruleId: 'PEER_ISOLATION_DISABLED',
      message: `${disabledPeerIsolationRules.length} rule(s) disable or omit required peerIsolation. Restore peerIsolation: true or set safety.allowDisabledPeerIsolation only with a documented production exception.`,
    });
  }
  return { report, warnings };
}

function ambientForbiddenGlobal(symbol: string, entries: readonly string[]): string | undefined {
  return [...entries]
    .filter((entry) => symbol === entry || symbol.startsWith(`${entry}.`))
    .sort((left, right) => right.length - left.length)[0];
}

function intentLayer(intent: string, contract: AnalysisContract): string | undefined {
  const configured = contract.config.layers.filter(
    (layer) => (layer.intentPrefixes ?? []).length > 0
  );
  return resolveIntentLayer(
    intent,
    configured.length > 0
      ? configured
      : DEFAULT_INTENT_PREFIXES.map((entry) => ({
          name: entry.layer,
          prefixes: entry.prefixes,
        }))
  );
}

function contentViolations(
  input: AnalyzeResolvedProjectInput,
  facts: ResolvedCandidateFacts,
  layerByFile: ReadonlyMap<string, string | null>
): ArchitectureEngineViolation[] {
  const violations: ArchitectureEngineViolation[] = [];
  const policyByLayer = new Map(
    input.contract.config.layers.map((layer) => [layer.name, layer] as const)
  );

  for (const use of facts.ambientUses) {
    const fromLayer = layerByFile.get(use.file);
    if (!fromLayer) continue;
    const forbiddenGlobal = ambientForbiddenGlobal(
      use.symbol,
      policyByLayer.get(fromLayer)?.forbiddenGlobals ?? []
    );
    if (!forbiddenGlobal) continue;
    violations.push({
      ruleId: 'FORBIDDEN_GLOBAL',
      file: use.file,
      line: use.line,
      fromLayer,
      target: use.symbol,
      message: `${fromLayer} must not use the ambient global "${use.symbol}".`,
    });
  }

  for (const use of facts.capabilityUses) {
    const fromLayer = layerByFile.get(use.file);
    if (!fromLayer) continue;
    const layer = policyByLayer.get(fromLayer);
    const forbiddenGlobals = layer?.forbiddenGlobals ?? [];
    const dependencyKind =
      use.source === 'import-based'
        ? facts.dependencies.find(
            (dependency) =>
              dependency.from === use.file &&
              dependency.line === use.line &&
              dependency.specifier === use.symbol &&
              !dependency.typeOnly
          )?.kind
        : undefined;
    if (
      use.source === 'ambient-global' &&
      ambientCoveredByForbiddenGlobals(use.symbol, forbiddenGlobals)
    ) {
      continue;
    }
    if (use.source === 'import-based') {
      const forbiddenGlobal = forbiddenGlobalForModuleSpecifier(use.symbol, forbiddenGlobals);
      if (forbiddenGlobal) {
        violations.push({
          ruleId: 'FORBIDDEN_GLOBAL',
          file: use.file,
          line: use.line,
          fromLayer,
          target: use.symbol,
          ...(dependencyKind ? { edgeKind: dependencyKind } : {}),
          message: `${fromLayer} must not use module "${use.symbol}" because it is the import form of forbidden global "${forbiddenGlobal}".`,
        });
        continue;
      }
    }
    if (!effectiveCapabilityDeny(layer).includes(use.capability)) continue;
    violations.push({
      ruleId: 'CAPABILITY_VIOLATION',
      file: use.file,
      line: use.line,
      fromLayer,
      target: use.symbol,
      capability: use.capability,
      ...(dependencyKind ? { edgeKind: dependencyKind } : {}),
      message:
        use.source === 'import-based'
          ? `${fromLayer} denies the ${use.capability} capability; found import of "${use.symbol}".`
          : `${fromLayer} denies the ${use.capability} capability; found ambient "${use.symbol}".`,
    });
  }

  for (const call of facts.publishCalls) {
    const fromLayer = layerByFile.get(call.file);
    if (!fromLayer) continue;
    for (const finding of classifyPublishFacts({
      publishCall: true,
      rawIntentName: call.rawIntentName,
      objectHasIntent: call.objectHasIntent,
      arkPublishCandidate: call.arkPublishCandidate,
      hasSource: call.hasSource,
    })) {
      violations.push({
        ruleId: finding.ruleId,
        file: call.file,
        line: call.line,
        ...(finding.ruleId === 'PUBLISH_MISSING_SOURCE' ? { fromLayer } : {}),
        message: finding.message,
      });
    }
    if (!call.sourceIntent) continue;
    const sourceIntentLayer = intentLayer(call.sourceIntent, input.contract);
    if (!sourceIntentLayer || sourceIntentLayer === fromLayer) continue;
    violations.push({
      ruleId: 'PUBLISH_SOURCE_LAYER_MISMATCH',
      file: call.file,
      line: call.line,
      fromLayer,
      toLayer: sourceIntentLayer,
      target: call.sourceIntent,
      message: `Publish source "${call.sourceIntent}" resolves to ${sourceIntentLayer}, but the publishing file is classified as ${fromLayer}.`,
    });
  }

  for (const reference of facts.intentReferences) {
    const fromLayer = layerByFile.get(reference.file);
    if (!fromLayer) continue;
    const toLayer = intentLayer(reference.intent, input.contract);
    if (!toLayer) continue;
    const rule = findDeniedEdgeRule(input.contract.config.rules, fromLayer, toLayer);
    if (!rule) continue;
    violations.push({
      ruleId: 'LAYER_INTENT_REFERENCE_VIOLATION',
      file: reference.file,
      line: reference.line,
      fromLayer,
      toLayer,
      target: reference.intent,
      message: rule.message ?? `${fromLayer} must not reference ${toLayer} intent ${reference.intent}.`,
    });
  }

  return violations;
}

export function analyzeCanonicalResolvedProject(
  input: { contract: AnalysisContract; facts: ResolvedCandidateFacts }
): ResolvedAnalysisResult {
  const { facts } = input;
  const expectedRequirementsHash = resolvedFactsEvidenceRequirementsHash(input.contract.config);
  const requirementsMatch = facts.evidenceRequirementsHash === expectedRequirementsHash;
  const completeness = requirementsMatch ? facts.completeness : 'unavailable';
  const completenessReasons = requirementsMatch
    ? facts.completenessReasons
    : [
        ...facts.completenessReasons,
        {
          code: 'EVIDENCE_REQUIREMENTS_MISMATCH',
          message:
            'Resolved facts were collected for different policy-controlled evidence requirements.',
        },
      ].sort((left, right) => {
        const leftKey = `${left.code}\0${left.file ?? ''}\0${left.message}`;
        const rightKey = `${right.code}\0${right.file ?? ''}\0${right.message}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      });
  const files = facts.files.map((file) => ({
    ...file,
    layer: layerForRelativePath(file.path, input.contract.config.layers) ?? null,
  }));
  const layerByFile = new Map(files.map((file) => [file.path, file.layer] as const));
  const edges: ArchitectureEngineEdge[] = facts.dependencies.map((dependency) => {
    const toLayer = dependency.target
      ? (layerByFile.get(dependency.target) ??
        layerForRelativePath(dependency.target, input.contract.config.layers))
      : undefined;
    return {
      from: dependency.from,
      fromLayer: layerByFile.get(dependency.from) ?? null,
      ...(dependency.resolution === 'resolved-project' && dependency.target
        ? {
            to: dependency.target,
            ...(toLayer ? { toLayer } : {}),
          }
        : {}),
      line: dependency.line,
      kind: dependency.kind,
      typeOnly: dependency.typeOnly,
      ...(dependency.targetTypeOnlyExports
        ? { targetTypeOnlyExports: dependency.targetTypeOnlyExports }
        : {}),
      ...(dependency.sourcePureTypeModule
        ? { sourcePureTypeModule: dependency.sourcePureTypeModule }
        : {}),
      ...(dependency.namedBindingsTypeOnly
        ? { namedBindingsTypeOnly: dependency.namedBindingsTypeOnly }
        : {}),
      ...(dependency.portProofEligible
        ? { portProofEligible: dependency.portProofEligible }
        : {}),
    };
  });
  const warnings = collectAnalysisConfigWarnings({
    config: input.contract.config,
    rules: input.contract.config.rules,
    files: files.map((file) => file.path),
  });
  const safety = evaluateSafety(input, facts);
  const arkRuleFindings = evaluateArkRuleSensors({
    arkRules: input.contract.arkRules ?? emptyEffectiveArkRules(),
    classShapes: input.contract.classShapes ?? facts.classShapes ?? [],
    files: files.map((file) => file.path),
    layerForFile: (path) => layerByFile.get(path) ?? layerForRelativePath(path, input.contract.config.layers),
  });
  const arkRuleViolations: ArchitectureEngineViolation[] = arkRuleFindings
    .filter((finding) => finding.failsStrict)
    .map((finding) => ({
      ruleId: finding.ruleId,
      file: finding.file,
      line: finding.line,
      message: finding.message,
      fromLayer: finding.fromLayer,
      arkruleId: finding.arkruleId,
      arkruleSource: finding.arkruleSource,
      nextAction: `Fix the structure or invariant for ${finding.arkruleId} (declared in ${finding.arkruleSource}), then preflight again.`,
    }));
  const arkRuleWarnings: ArchitectureEngineViolation[] = arkRuleFindings
    .filter((finding) => !finding.failsStrict)
    .map((finding) => ({
      ruleId: finding.ruleId,
      file: finding.file,
      line: finding.line,
      message: finding.message,
      fromLayer: finding.fromLayer,
      arkruleId: finding.arkruleId,
      arkruleSource: finding.arkruleSource,
      failsStrict: false,
      nextAction: `Review ArkRule ${finding.arkruleId} in ${finding.arkruleSource} (advisory).`,
    }));

  const evaluated = evaluateArchitectureGraph({
    config: input.contract.config,
    rules: input.contract.config.rules,
    files: files.filter((file) => file.layer).map((file) => file.path),
    contentViolations: [
      ...contentViolations(input, facts, layerByFile),
      ...arkRuleViolations,
    ],
    edges,
    warnings: [...warnings, ...safety.warnings, ...arkRuleWarnings],
    safety: safety.report,
  });

  const valid = completeness === 'complete' && evaluated.violations.length === 0;
  const strictValid =
    valid && evaluated.warnings.every((warning) => warning.failsStrict === false);

  return {
    mode: 'resolved-candidate-facts',
    completeness,
    completenessReasons,
    valid,
    strictValid,
    policyHash: input.contract.policyHash,
    factsHash: facts.factsHash,
    resolverIdentity: facts.resolverIdentity,
    candidateTreeHash: facts.candidateTreeHash,
    safety: safety.report,
    ir: {
      schemaVersion: '1.0',
      policyHash: input.contract.policyHash,
      compilerOptionsHash: facts.compilerOptionsHash,
      files,
      layers: input.contract.config.layers.map((layer) => layer.name),
      edges,
      capabilityUses: facts.capabilityUses,
      violations: evaluated.violations,
      warnings: evaluated.warnings,
    },
  };
}

/** Validate supplied facts and evaluate their graph without host effects. */
export function analyzeResolvedProject(input: AnalyzeResolvedProjectInput): ResolvedAnalysisResult {
  return analyzeCanonicalResolvedProject({
    contract: input.contract,
    facts: loadResolvedCandidateFacts(input.facts),
  });
}
