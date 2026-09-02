import { deterministicNextAction } from './remediation';
import {
  ARK_ANALYSIS_RESULT_SCHEMA_VERSION,
  type AdapterCompletenessReason,
  type AdapterDiagnostic,
  type AdapterSeverity,
  type AdapterViolationInput,
  type AnalysisCompleteness,
  type AnalysisMode,
  type CurrentAdapterResult,
  type ResolvedAdapterEvidence,
} from './adapterContractTypes';
import {
  adapterDocsCodePath,
  adapterFindingOccurrenceTargetKeys,
  adapterFindingRefFromTargetKey,
  adapterFindingTargetKey,
} from './adapterFindingRefs';

export {
  ADAPTER_DIAGNOSTIC_DOCS_RELATIVE_PATH,
  ARK_ANALYSIS_RESULT_SCHEMA,
  ARK_ANALYSIS_RESULT_SCHEMA_VERSION,
  type AdapterCompletenessReason,
  type AdapterDiagnostic,
  type AdapterResult,
  type AdapterSeverity,
  type AdapterViolationInput,
  type AnalysisCompleteness,
  type AnalysisMode,
} from './adapterContractTypes';

export {
  adapterDocsCodePath,
  adapterFindingOccurrenceTargetKeys,
  adapterFindingRefFromTargetKey,
  adapterFindingTargetKey,
} from './adapterFindingRefs';

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function positiveInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function nextActionForDiagnostic(
  ruleId: string,
  evidence: AdapterDiagnostic['evidence'],
  violation: AdapterViolationInput
): string {
  return deterministicNextAction({
    ruleId,
    target: text(evidence.target) ?? text(violation.target) ?? undefined,
    fromLayer: text(evidence.fromLayer) ?? undefined,
    toLayer: text(evidence.toLayer) ?? undefined,
    typeOnly: evidence.typeOnly === true,
    targetTypeOnlyExports: evidence.targetTypeOnlyExports === true,
    namedBindingsTypeOnly: evidence.namedBindingsTypeOnly === true,
    portProofEligible: evidence.portProofEligible === true,
    peerIsolation: evidence.peerIsolation === true,
    sourcePureTypeModule: evidence.sourcePureTypeModule === true,
    edgeKind: text(evidence.edgeKind) ?? undefined,
    capability: text(evidence.capability) ?? text(violation.capability) ?? undefined,
    arkruleId: text(evidence.arkruleId) ?? undefined,
    arkruleSource: text(evidence.arkruleSource) ?? undefined,
  });
}

export function toAdapterDiagnostic(
  violation: AdapterViolationInput,
  fallbackSeverity: AdapterSeverity = 'error',
  /**
   * Optional precomputed baseline-compatible targetKey (e.g. occurrence-aware from
   * `adapterFindingOccurrenceTargetKeys`). When omitted, uses the first-occurrence key.
   */
  targetKeyOverride?: string
): AdapterDiagnostic {
  const ruleId = text(violation.ruleId) ?? text(violation.code) ?? 'ARK_UNKNOWN';
  // Type-only placement debt (failsStrict:false / typeOnly non-peer) is warning severity.
  const severity =
    violation.severity === 'warning' ||
    violation.failsStrict === false ||
    (violation.typeOnly === true && violation.peerIsolation !== true)
      ? 'warning'
      : fallbackSeverity;
  const evidence = {
    ...(text(violation.target) ? { target: text(violation.target) } : {}),
    ...(text(violation.fromLayer) ? { fromLayer: text(violation.fromLayer) } : {}),
    ...(text(violation.toLayer) ? { toLayer: text(violation.toLayer) } : {}),
    ...(typeof violation.typeOnly === 'boolean' ? { typeOnly: violation.typeOnly } : {}),
    ...(typeof violation.targetTypeOnlyExports === 'boolean'
      ? { targetTypeOnlyExports: violation.targetTypeOnlyExports }
      : {}),
    ...(typeof violation.sourcePureTypeModule === 'boolean'
      ? { sourcePureTypeModule: violation.sourcePureTypeModule }
      : {}),
    ...(typeof violation.namedBindingsTypeOnly === 'boolean'
      ? { namedBindingsTypeOnly: violation.namedBindingsTypeOnly }
      : {}),
    ...(typeof violation.portProofEligible === 'boolean'
      ? { portProofEligible: violation.portProofEligible }
      : {}),
    ...(typeof violation.peerIsolation === 'boolean'
      ? { peerIsolation: violation.peerIsolation }
      : {}),
    ...(text(violation.capability) ? { capability: text(violation.capability) } : {}),
    ...(text(violation.edgeKind) ? { edgeKind: text(violation.edgeKind) } : {}),
    ...(text(violation.arkruleId) ? { arkruleId: text(violation.arkruleId) } : {}),
    ...(text(violation.arkruleSource) ? { arkruleSource: text(violation.arkruleSource) } : {}),
  };
  const targetKey = targetKeyOverride ?? adapterFindingTargetKey(violation);
  const findingRef = adapterFindingRefFromTargetKey(targetKey);
  return {
    ruleId,
    severity,
    message: text(violation.message) ?? ruleId,
    location: {
      file: text(violation.file) ?? '<unknown>',
      line: positiveInteger(violation.line, 1),
      column: positiveInteger(violation.column, 1),
    },
    evidence,
    nextAction: text(violation.nextAction) ?? nextActionForDiagnostic(ruleId, evidence, violation),
    findingRef,
    targetKey,
    docsCodePath: adapterDocsCodePath(ruleId),
  };
}

export function createAdapterResult(input: {
  valid: boolean;
  completeness?: AnalysisCompleteness;
  mode?: AnalysisMode;
  policyHash?: unknown;
  resolverIdentity?: unknown;
  factsHash?: unknown;
  candidateTreeHash?: unknown;
  completenessReasons?: readonly AdapterCompletenessReason[];
  violations?: readonly AdapterViolationInput[];
  warnings?: readonly AdapterViolationInput[];
}): CurrentAdapterResult {
  const completeness = input.completeness ?? 'complete';
  const mode = input.mode ?? 'lexical-compatibility';
  if (completeness === 'complete' && (input.completenessReasons?.length ?? 0) > 0) {
    throw new Error('completenessReasons must be empty when completeness is complete.');
  }
  const completenessReasons =
    completeness === 'complete'
      ? []
      : input.completenessReasons && input.completenessReasons.length > 0
        ? input.completenessReasons.map((reason) => ({
            code: text(reason.code) ?? 'ANALYSIS_EVIDENCE_INCOMPLETE',
            message:
              text(reason.message) ??
              `Analysis ${completeness}: required evidence is incomplete.`,
            ...(text(reason.file) ? { file: text(reason.file) } : {}),
          }))
        : [
            {
              code:
                completeness === 'unavailable'
                  ? 'ANALYSIS_UNAVAILABLE'
                  : 'ANALYSIS_EVIDENCE_INCOMPLETE',
              message: `Analysis ${completeness}: required evidence is incomplete.`,
            },
          ];
  const evidence = {
    ...(text(input.policyHash) ? { policyHash: text(input.policyHash) } : {}),
    ...(text(input.resolverIdentity) ? { resolverIdentity: text(input.resolverIdentity) } : {}),
    ...(text(input.factsHash) ? { factsHash: text(input.factsHash) } : {}),
    ...(text(input.candidateTreeHash) ? { candidateTreeHash: text(input.candidateTreeHash) } : {}),
  };
  if (mode === 'resolved-candidate-facts' && completeness !== 'unavailable') {
    for (const field of ['policyHash', 'resolverIdentity', 'factsHash', 'candidateTreeHash'] as const) {
      if (!evidence[field]) {
        throw new Error(`${field} is required for resolved ${completeness} adapter evidence.`);
      }
    }
  }
  // Occurrence-aware targetKeys (violations and warnings counted separately) so
  // list identity matches baselineOccurrenceKeys on each stream — ACS06 freeze parity.
  const violationList = input.violations ?? [];
  const warningList = input.warnings ?? [];
  const violationTargetKeys = adapterFindingOccurrenceTargetKeys(violationList);
  const warningTargetKeys = adapterFindingOccurrenceTargetKeys(warningList);
  const diagnostics = [
    // toAdapterDiagnostic maps failsStrict:false / typeOnly non-peer → warning severity.
    ...violationList.map((item, index) =>
      toAdapterDiagnostic(item, 'error', violationTargetKeys[index])
    ),
    ...warningList.map((item, index) =>
      toAdapterDiagnostic(item, 'warning', warningTargetKeys[index])
    ),
  ];
  const base = {
    schemaVersion: ARK_ANALYSIS_RESULT_SCHEMA_VERSION,
    completenessReasons,
    diagnostics,
  };
  if (mode === 'resolved-candidate-facts') {
    if (completeness === 'unavailable') {
      return {
        ...base,
        mode,
        valid: false,
        completeness,
        ...evidence,
      };
    }
    const resolvedEvidence: ResolvedAdapterEvidence = {
      policyHash: evidence.policyHash!,
      resolverIdentity: evidence.resolverIdentity!,
      factsHash: evidence.factsHash!,
      candidateTreeHash: evidence.candidateTreeHash!,
    };
    if (completeness === 'complete') {
      return {
        ...base,
        mode,
        valid: input.valid,
        completeness,
        ...resolvedEvidence,
      };
    }
    return {
      ...base,
      mode,
      valid: false,
      completeness,
      ...resolvedEvidence,
    };
  }
  if (completeness === 'complete') {
    return { ...base, mode, valid: input.valid, completeness, ...evidence };
  }
  return { ...base, mode, valid: false, completeness, ...evidence };
}
