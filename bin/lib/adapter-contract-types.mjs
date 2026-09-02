/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/adapterContractTypes.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/adapter-contract-types.mjs). Zero Node I/O.
 */

/**
 * 1.5 adds stable finding refs on every factory-emitted diagnostic (ACS06):
 * `findingRef`, `targetKey` (baseline-compatible), `docsCodePath`.
 * 1.4 added optional evidence.arkruleId + evidence.arkruleSource (ADR 0012 / AR03).
 */
export const ARK_ANALYSIS_RESULT_SCHEMA_VERSION = '1.5';
/** Repo-relative diagnostics docs path (parity with ACS02 diagnostic catalog). */
export const ADAPTER_DIAGNOSTIC_DOCS_RELATIVE_PATH = 'docs/diagnostics.md';
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
};
