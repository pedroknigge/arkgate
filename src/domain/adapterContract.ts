/** Versioned public result contract shared by every ArkGate enforcement adapter. */

export const ARK_ANALYSIS_RESULT_SCHEMA_VERSION = '1.2' as const;

export type AdapterSeverity = 'error' | 'warning';
export type AnalysisCompleteness = 'complete' | 'partial' | 'unavailable';

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
  namedBindingsTypeOnly?: unknown;
  peerIsolation?: unknown;
  severity?: unknown;
  nextAction?: unknown;
  /** U04: the denied capability id on CAPABILITY_VIOLATION. */
  capability?: unknown;
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
  };
  /** Added in schema 1.1; optional in TypeScript so 1.0 consumer-owned values remain valid. */
  nextAction?: string;
};

type LegacyAdapterResult = {
  schemaVersion: '1.0' | '1.1';
  valid: boolean;
  diagnostics: AdapterDiagnostic[];
  completeness?: never;
};

type CompleteAdapterResult = {
  schemaVersion: typeof ARK_ANALYSIS_RESULT_SCHEMA_VERSION;
  valid: boolean;
  completeness: 'complete';
  diagnostics: AdapterDiagnostic[];
};

type IncompleteAdapterResult = {
  schemaVersion: typeof ARK_ANALYSIS_RESULT_SCHEMA_VERSION;
  valid: false;
  completeness: 'partial' | 'unavailable';
  diagnostics: AdapterDiagnostic[];
};

type CurrentAdapterResult = CompleteAdapterResult | IncompleteAdapterResult;

export type AdapterResult = LegacyAdapterResult | CurrentAdapterResult;

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
  return `Resolve ${ruleId} without weakening ark.config.json, then run Ark again.`;
}

export function toAdapterDiagnostic(
  violation: AdapterViolationInput,
  fallbackSeverity: AdapterSeverity = 'error'
): AdapterDiagnostic {
  const ruleId = text(violation.ruleId) ?? text(violation.code) ?? 'ARK_UNKNOWN';
  const severity = violation.severity === 'warning' ? 'warning' : fallbackSeverity;
  const evidence = {
    ...(text(violation.target) ? { target: text(violation.target) } : {}),
    ...(text(violation.fromLayer) ? { fromLayer: text(violation.fromLayer) } : {}),
    ...(text(violation.toLayer) ? { toLayer: text(violation.toLayer) } : {}),
    ...(typeof violation.typeOnly === 'boolean' ? { typeOnly: violation.typeOnly } : {}),
  };
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
  };
}

export function createAdapterResult(input: {
  valid: boolean;
  completeness?: AnalysisCompleteness;
  violations?: readonly AdapterViolationInput[];
  warnings?: readonly AdapterViolationInput[];
}): CurrentAdapterResult {
  const completeness = input.completeness ?? 'complete';
  const diagnostics = [
    ...(input.violations ?? []).map((item) => toAdapterDiagnostic(item, 'error')),
    ...(input.warnings ?? []).map((item) => toAdapterDiagnostic(item, 'warning')),
  ];
  if (completeness !== 'complete') {
    return {
      schemaVersion: ARK_ANALYSIS_RESULT_SCHEMA_VERSION,
      valid: false,
      completeness,
      diagnostics,
    };
  }
  return {
    schemaVersion: ARK_ANALYSIS_RESULT_SCHEMA_VERSION,
    valid: input.valid,
    completeness,
    diagnostics,
  };
}

export const ARK_ANALYSIS_RESULT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://unpkg.com/arkgate@2/schemas/ark.analysis-result.schema.json',
  title: 'ArkGate analysis result',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'valid', 'completeness', 'diagnostics'],
  allOf: [
    {
      if: {
        properties: { completeness: { enum: ['partial', 'unavailable'] } },
        required: ['completeness'],
      },
      then: { properties: { valid: { const: false } } },
    },
  ],
  properties: {
    schemaVersion: { const: ARK_ANALYSIS_RESULT_SCHEMA_VERSION },
    valid: { type: 'boolean' },
    completeness: { enum: ['complete', 'partial', 'unavailable'] },
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
            },
          },
          nextAction: { type: 'string', minLength: 1 },
        },
      },
    },
  },
} as const;
