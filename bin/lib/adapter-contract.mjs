/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/adapterContract.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/adapter-contract.mjs). Zero Node I/O.
 */

export const ARK_ANALYSIS_RESULT_SCHEMA_VERSION = '1.0';
function text(value) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function positiveInteger(value, fallback) {
    return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}
export function toAdapterDiagnostic(violation, fallbackSeverity = 'error') {
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
export function createAdapterResult(input) {
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
};
