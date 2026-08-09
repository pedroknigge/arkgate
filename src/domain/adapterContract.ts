/** Versioned public result contract shared by every ArkGate enforcement adapter. */

/**
 * 1.5 adds stable finding refs on every factory-emitted diagnostic (ACS06):
 * `findingRef`, `targetKey` (baseline-compatible), `docsCodePath`.
 * 1.4 added optional evidence.arkruleId + evidence.arkruleSource (ADR 0012 / AR03).
 */
export const ARK_ANALYSIS_RESULT_SCHEMA_VERSION = '1.5' as const;

/** Repo-relative diagnostics docs path (parity with ACS02 diagnostic catalog). */
export const ADAPTER_DIAGNOSTIC_DOCS_RELATIVE_PATH = 'docs/diagnostics.md' as const;

export type AdapterSeverity = 'error' | 'warning';
export type AnalysisCompleteness = 'complete' | 'partial' | 'unavailable';
export type AnalysisMode = 'lexical-compatibility' | 'resolved-candidate-facts';

export type AdapterCompletenessReason = {
  code: string;
  message: string;
  file?: string;
};

export type AdapterViolationInput = {
  ruleId?: unknown;
  code?: unknown;
  message?: unknown;
  file?: unknown;
  line?: unknown;
  column?: unknown;
  target?: unknown;
  fromLayer?: unknown;
  toLayer?: unknown;
  typeOnly?: unknown;
  targetTypeOnlyExports?: unknown;
  sourcePureTypeModule?: unknown;
  namedBindingsTypeOnly?: unknown;
  portProofEligible?: unknown;
  peerIsolation?: unknown;
  edgeKind?: unknown;
  severity?: unknown;
  /** When false, finding is non-blocking (e.g. type-only placement debt). */
  failsStrict?: unknown;
  nextAction?: unknown;
  /** U04: the denied capability id on CAPABILITY_VIOLATION. */
  capability?: unknown;
  /** AR03: ArkRule identity for structure/invariant diagnostics. */
  arkruleId?: unknown;
  /** AR03: project-relative ArkRules source file that declared the rule. */
  arkruleSource?: unknown;
};

export type AdapterDiagnostic = {
  ruleId: string;
  severity: AdapterSeverity;
  message: string;
  location: { file: string; line: number; column: number };
  evidence: {
    target?: string;
    fromLayer?: string;
    toLayer?: string;
    typeOnly?: boolean;
    targetTypeOnlyExports?: boolean;
    sourcePureTypeModule?: boolean;
    namedBindingsTypeOnly?: boolean;
    portProofEligible?: boolean;
    peerIsolation?: boolean;
    capability?: string;
    edgeKind?: string;
    /** AR03 — ArkRule id (structure or invariant). */
    arkruleId?: string;
    /** AR03 — ArkRules source file path. */
    arkruleSource?: string;
  };
  /** Added in schema 1.1; optional in TypeScript so 1.0 consumer-owned values remain valid. */
  nextAction?: string;
  /**
   * ACS06 / schema 1.5 — compact stable id for multi-turn re-address
   * (`fnv1a-` + hex). Always derived from `targetKey`. Optional so 1.0–1.4
   * consumer-owned diagnostics remain assignable.
   */
  findingRef?: string;
  /**
   * ACS06 / schema 1.5 — baseline-compatible freeze identity
   * (`ruleId|file|fromLayer|toLayer|target`, with occurrence `#N` suffixes in lists).
   * Must match `baselineKey` / `baselineOccurrenceKeys` so refs never orphan baselines.
   */
  targetKey?: string;
  /**
   * ACS06 / schema 1.5 — package-relative docs path with rule anchor
   * (`docs/diagnostics.md#RULE_ID`). Optional for legacy consumer-owned values.
   */
  docsCodePath?: string;
};

type LegacyAdapterResult = {
  schemaVersion: '1.0' | '1.1';
  valid: boolean;
  diagnostics: AdapterDiagnostic[];
  completeness?: never;
  mode?: never;
};

type Version12AdapterResultBase = {
  schemaVersion: '1.2';
  diagnostics: AdapterDiagnostic[];
  mode?: never;
};

type Version12AdapterResult =
  | (Version12AdapterResultBase & { completeness: 'complete'; valid: boolean })
  | (Version12AdapterResultBase & {
      completeness: 'partial' | 'unavailable';
      valid: false;
    });

type CurrentAdapterResultBase = {
  schemaVersion: typeof ARK_ANALYSIS_RESULT_SCHEMA_VERSION;
  completenessReasons: AdapterCompletenessReason[];
  diagnostics: AdapterDiagnostic[];
};

type ResolvedAdapterEvidence = {
  policyHash: string;
  resolverIdentity: string;
  factsHash: string;
  candidateTreeHash: string;
};

type CurrentAdapterResult =
  | (CurrentAdapterResultBase &
      Partial<ResolvedAdapterEvidence> & {
      mode: 'lexical-compatibility';
      valid: boolean;
      completeness: 'complete';
    })
  | (CurrentAdapterResultBase &
      Partial<ResolvedAdapterEvidence> & {
      mode: 'lexical-compatibility';
      valid: false;
      completeness: 'partial' | 'unavailable';
    })
  | (CurrentAdapterResultBase &
      ResolvedAdapterEvidence & {
        mode: 'resolved-candidate-facts';
        valid: boolean;
        completeness: 'complete';
      })
  | (CurrentAdapterResultBase &
      ResolvedAdapterEvidence & {
        mode: 'resolved-candidate-facts';
        valid: false;
        completeness: 'partial';
      })
  | (CurrentAdapterResultBase &
      Partial<ResolvedAdapterEvidence> & {
        mode: 'resolved-candidate-facts';
        valid: false;
        completeness: 'unavailable';
    });

export type AdapterResult = LegacyAdapterResult | Version12AdapterResult | CurrentAdapterResult;

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function positiveInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

/**
 * Baseline-compatible target key for a violation input.
 * Field order and empty-string fallbacks **must** match `baselineKey` in
 * `baselineKey.ts` — parity tests guard this so finding refs never orphan freezes.
 *
 * Note: uses raw ruleId/file strings (including empty) the same way baseline does;
 * display `ruleId` / `location.file` may still normalize to ARK_UNKNOWN / `<unknown>`.
 */
export function adapterFindingTargetKey(violation: AdapterViolationInput): string {
  const ruleId =
    typeof violation.ruleId === 'string'
      ? violation.ruleId
      : typeof violation.code === 'string'
        ? violation.code
        : undefined;
  const file = typeof violation.file === 'string' ? violation.file : undefined;
  const fromLayer =
    typeof violation.fromLayer === 'string' ? violation.fromLayer : undefined;
  const toLayer = typeof violation.toLayer === 'string' ? violation.toLayer : undefined;
  const target = typeof violation.target === 'string' ? violation.target : undefined;
  return [
    ruleId,
    file,
    fromLayer ?? '',
    toLayer ?? '',
    target ?? '',
  ].join('|');
}

/**
 * Occurrence-aware target keys for a violation list (parity with baselineOccurrenceKeys).
 * First occurrence keeps the historical base key; duplicates get `#N`.
 */
export function adapterFindingOccurrenceTargetKeys(
  violations: readonly AdapterViolationInput[]
): string[] {
  const counts = new Map<string, number>();
  return violations.map((violation) => {
    const base = adapterFindingTargetKey(violation);
    const occurrence = (counts.get(base) ?? 0) + 1;
    counts.set(base, occurrence);
    return occurrence === 1 ? base : `${base}#${occurrence}`;
  });
}

/** FNV-1a finding ref from a baseline-compatible targetKey (not a security hash). */
export function adapterFindingRefFromTargetKey(targetKey: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < targetKey.length; index += 1) {
    hash ^= targetKey.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** Package-relative docs path with fragment for a public ruleId. */
export function adapterDocsCodePath(ruleId: string): string {
  return `${ADAPTER_DIAGNOSTIC_DOCS_RELATIVE_PATH}#${ruleId}`;
}

function nextActionForDiagnostic(
  ruleId: string,
  evidence: AdapterDiagnostic['evidence'],
  violation: AdapterViolationInput
): string {
  if (ruleId === 'LAYER_IMPORT_VIOLATION') {
    if (
      evidence.typeOnly ||
      violation.targetTypeOnlyExports === true ||
      violation.namedBindingsTypeOnly === true
    ) {
      return 'Move the referenced type to a mutually allowed layer, use `import type`, then preflight again.';
    }
    if (violation.peerIsolation === true) {
      return 'Extract the shared dependency to a shared layer, then preflight again.';
    }
    return `Define a port in ${evidence.fromLayer ?? 'the source layer'}, inject the ${evidence.toLayer ?? 'outer-layer'} implementation, then preflight again.`;
  }
  if (ruleId === 'FORBIDDEN_GLOBAL') {
    return `Inject ${evidence.target ?? 'the capability'} through a port, then preflight again.`;
  }
  if (ruleId === 'CAPABILITY_VIOLATION') {
    return `Define a ${text(violation.capability) ?? 'capability'} port in ${evidence.fromLayer ?? 'the walled layer'}, bind the implementation outside it, then preflight again.`;
  }
  if (ruleId === 'CIRCULAR_DEPENDENCY') {
    return 'Extract the shared dependency into a third module, then preflight again.';
  }
  if (ruleId === 'RAW_EVENT_PUBLISH') return 'Publish through a registered intent creator, then run Ark again.';
  if (ruleId === 'PUBLISH_MISSING_SOURCE') return 'Add metadata.source to the publish call, then run Ark again.';
  if (
    ruleId === 'ARKRULE_STRUCTURE' ||
    ruleId === 'ARKRULE_INVARIANT' ||
    ruleId === 'INVARIANT_UNCOVERED' ||
    ruleId.startsWith('ARKRULE_')
  ) {
    const source = evidence.arkruleSource ?? 'arkrules/<Layer>.json';
    const id = evidence.arkruleId ?? 'the ArkRule';
    return `Fix the structure or invariant for ${id} (declared in ${source}), then preflight again. Do not demote the rule without a hash-bound policy acknowledgement.`;
  }
  return `Resolve ${ruleId} without weakening ark.config.json, then run Ark again.`;
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

export const ARK_ANALYSIS_RESULT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://unpkg.com/arkgate@3/schemas/ark.analysis-result.schema.json',
  title: 'ArkGate analysis result',
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'mode',
    'valid',
    'completeness',
    'completenessReasons',
    'diagnostics',
  ],
  allOf: [
    {
      if: {
        properties: { completeness: { enum: ['partial', 'unavailable'] } },
        required: ['completeness'],
      },
      then: { properties: { valid: { const: false } } },
    },
    {
      if: {
        properties: {
          mode: { const: 'resolved-candidate-facts' },
          completeness: { enum: ['complete', 'partial'] },
        },
        required: ['mode', 'completeness'],
      },
      then: {
        required: ['policyHash', 'resolverIdentity', 'factsHash', 'candidateTreeHash'],
      },
    },
    {
      if: {
        properties: { completeness: { const: 'complete' } },
        required: ['completeness'],
      },
      then: { properties: { completenessReasons: { maxItems: 0 } } },
      else: { properties: { completenessReasons: { minItems: 1 } } },
    },
  ],
  properties: {
    schemaVersion: { const: ARK_ANALYSIS_RESULT_SCHEMA_VERSION },
    mode: { enum: ['lexical-compatibility', 'resolved-candidate-facts'] },
    valid: { type: 'boolean' },
    completeness: { enum: ['complete', 'partial', 'unavailable'] },
    completenessReasons: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'message'],
        properties: {
          code: { type: 'string', minLength: 1 },
          message: { type: 'string', minLength: 1 },
          file: { type: 'string', minLength: 1 },
        },
      },
    },
    policyHash: { type: 'string', minLength: 1 },
    resolverIdentity: { type: 'string', minLength: 1 },
    factsHash: { type: 'string', minLength: 1 },
    candidateTreeHash: { type: 'string', minLength: 1 },
    diagnostics: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ruleId', 'severity', 'message', 'location', 'evidence'],
        properties: {
          ruleId: { type: 'string', minLength: 1 },
          severity: { enum: ['error', 'warning'] },
          message: { type: 'string', minLength: 1 },
          location: {
            type: 'object',
            additionalProperties: false,
            required: ['file', 'line', 'column'],
            properties: {
              file: { type: 'string', minLength: 1 },
              line: { type: 'integer', minimum: 1 },
              column: { type: 'integer', minimum: 1 },
            },
          },
          evidence: {
            type: 'object',
            additionalProperties: false,
            properties: {
              target: { type: 'string' },
              fromLayer: { type: 'string' },
              toLayer: { type: 'string' },
              typeOnly: { type: 'boolean' },
              targetTypeOnlyExports: { type: 'boolean' },
              sourcePureTypeModule: { type: 'boolean' },
              namedBindingsTypeOnly: { type: 'boolean' },
              portProofEligible: { type: 'boolean' },
              peerIsolation: { type: 'boolean' },
              capability: { type: 'string', minLength: 1 },
              edgeKind: { type: 'string', minLength: 1 },
              arkruleId: { type: 'string', minLength: 1 },
              arkruleSource: { type: 'string', minLength: 1 },
            },
          },
          nextAction: { type: 'string', minLength: 1 },
          /** ACS06 — compact multi-turn id; always derived from targetKey when emitted. */
          findingRef: { type: 'string', minLength: 1, pattern: '^fnv1a-[0-9a-f]{8}$' },
          /**
           * ACS06 — baseline-compatible freeze identity
           * (`ruleId|file|from|to|target` with optional `#N` occurrence suffix).
           */
          targetKey: { type: 'string', minLength: 1 },
          /** ACS06 — package-relative diagnostics anchor path. */
          docsCodePath: { type: 'string', minLength: 1 },
        },
      },
    },
  },
} as const;
