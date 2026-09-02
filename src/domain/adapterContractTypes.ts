/** Versioned public result contract types + JSON Schema (adapter envelope). */

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

export type ResolvedAdapterEvidence = {
  policyHash: string;
  resolverIdentity: string;
  factsHash: string;
  candidateTreeHash: string;
};

export type CurrentAdapterResult =
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
