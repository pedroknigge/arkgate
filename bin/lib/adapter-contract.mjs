/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/adapterContract.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/adapter-contract.mjs). Zero Node I/O.
 */

export const ARK_ANALYSIS_RESULT_SCHEMA_VERSION = '1.1';
function text(value) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function positiveInteger(value, fallback) {
    return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}
function nextActionForDiagnostic(ruleId, evidence, violation) {
    if (ruleId === 'LAYER_IMPORT_VIOLATION') {
        if (evidence.typeOnly ||
            violation.targetTypeOnlyExports === true ||
            violation.namedBindingsTypeOnly === true) {
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
    if (ruleId === 'CIRCULAR_DEPENDENCY') {
        return 'Extract the shared dependency into a third module, then preflight again.';
    }
    if (ruleId === 'RAW_EVENT_PUBLISH')
        return 'Publish through a registered intent creator, then run Ark again.';
    if (ruleId === 'PUBLISH_MISSING_SOURCE')
        return 'Add metadata.source to the publish call, then run Ark again.';
    return `Resolve ${ruleId} without weakening ark.config.json, then run Ark again.`;
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
        nextAction: text(violation.nextAction) ?? nextActionForDiagnostic(ruleId, evidence, violation),
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
                    nextAction: { type: 'string', minLength: 1 },
                },
            },
        },
    },
};
