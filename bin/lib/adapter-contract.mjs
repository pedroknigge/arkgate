/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/adapterContract.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/adapter-contract.mjs). Zero Node I/O.
 */

/** 1.4 adds optional evidence.arkruleId + evidence.arkruleSource (ADR 0012 / AR03). */
export const ARK_ANALYSIS_RESULT_SCHEMA_VERSION = '1.4';
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
    if (ruleId === 'CAPABILITY_VIOLATION') {
        return `Define a ${text(violation.capability) ?? 'capability'} port in ${evidence.fromLayer ?? 'the walled layer'}, bind the implementation outside it, then preflight again.`;
    }
    if (ruleId === 'CIRCULAR_DEPENDENCY') {
        return 'Extract the shared dependency into a third module, then preflight again.';
    }
    if (ruleId === 'RAW_EVENT_PUBLISH')
        return 'Publish through a registered intent creator, then run Ark again.';
    if (ruleId === 'PUBLISH_MISSING_SOURCE')
        return 'Add metadata.source to the publish call, then run Ark again.';
    if (ruleId === 'ARKRULE_STRUCTURE' ||
        ruleId === 'ARKRULE_INVARIANT' ||
        ruleId === 'INVARIANT_UNCOVERED' ||
        ruleId.startsWith('ARKRULE_')) {
        const source = evidence.arkruleSource ?? 'arkrules/<Layer>.json';
        const id = evidence.arkruleId ?? 'the ArkRule';
        return `Fix the structure or invariant for ${id} (declared in ${source}), then preflight again. Do not demote the rule without a hash-bound policy acknowledgement.`;
    }
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
    const completeness = input.completeness ?? 'complete';
    const mode = input.mode ?? 'lexical-compatibility';
    if (completeness === 'complete' && (input.completenessReasons?.length ?? 0) > 0) {
        throw new Error('completenessReasons must be empty when completeness is complete.');
    }
    const completenessReasons = completeness === 'complete'
        ? []
        : input.completenessReasons && input.completenessReasons.length > 0
            ? input.completenessReasons.map((reason) => ({
                code: text(reason.code) ?? 'ANALYSIS_EVIDENCE_INCOMPLETE',
                message: text(reason.message) ??
                    `Analysis ${completeness}: required evidence is incomplete.`,
                ...(text(reason.file) ? { file: text(reason.file) } : {}),
            }))
            : [
                {
                    code: completeness === 'unavailable'
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
        for (const field of ['policyHash', 'resolverIdentity', 'factsHash', 'candidateTreeHash']) {
            if (!evidence[field]) {
                throw new Error(`${field} is required for resolved ${completeness} adapter evidence.`);
            }
        }
    }
    const diagnostics = [
        ...(input.violations ?? []).map((item) => toAdapterDiagnostic(item, 'error')),
        ...(input.warnings ?? []).map((item) => toAdapterDiagnostic(item, 'warning')),
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
        const resolvedEvidence = {
            policyHash: evidence.policyHash,
            resolverIdentity: evidence.resolverIdentity,
            factsHash: evidence.factsHash,
            candidateTreeHash: evidence.candidateTreeHash,
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
                },
            },
        },
    },
};
