/** Versioned public result contract shared by every ArkGate enforcement adapter. */

export const ARK_ANALYSIS_RESULT_SCHEMA_VERSION = '1.0' as const;

export type AdapterSeverity = 'error' | 'warning';

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
  severity?: unknown;
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
};

export type AdapterResult = {
  schemaVersion: typeof ARK_ANALYSIS_RESULT_SCHEMA_VERSION;
  valid: boolean;
  diagnostics: AdapterDiagnostic[];
};

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function positiveInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
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
  };
}

export function createAdapterResult(input: {
  valid: boolean;
  violations?: readonly AdapterViolationInput[];
  warnings?: readonly AdapterViolationInput[];
}): AdapterResult {
  return {
    schemaVersion: ARK_ANALYSIS_RESULT_SCHEMA_VERSION,
    valid: input.valid,
    diagnostics: [
      ...(input.violations ?? []).map((item) => toAdapterDiagnostic(item, 'error')),
      ...(input.warnings ?? []).map((item) => toAdapterDiagnostic(item, 'warning')),
    ],
  };
}

export const ARK_ANALYSIS_RESULT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://unpkg.com/arkgate@2/schemas/ark.analysis-result.schema.json',
  title: 'ArkGate analysis result',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'valid', 'diagnostics'],
  properties: {
    schemaVersion: { const: ARK_ANALYSIS_RESULT_SCHEMA_VERSION },
    valid: { type: 'boolean' },
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
        },
      },
    },
  },
} as const;
