/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/arkRulesContract.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/arkrules-contract.mjs). Zero Node I/O.
 */

export const ARK_RULES_SCHEMA_VERSION = '1.0';
export const ARK_RULES_SCHEMA_URL = 'https://unpkg.com/arkgate/schemas/ark.arkrules.schema.json';
/** Closed sensor vocabulary — keep in lockstep with arkRulesTypes.ARK_RULE_SENSOR_IDS. */
export const ARK_RULE_SENSORS = [
    'aggregate-private-state',
    'always-valid-factory',
    'domain-event-on-mutation',
    'orchestration-only',
    'thin-adapter',
    'no-anemic-model',
    'invariant-coverage',
];
export const ARK_RULE_TIER2_SENSORS = ['no-anemic-model'];
const stringArraySchema = {
    type: 'array',
    items: { type: 'string', minLength: 1 },
    uniqueItems: true,
};
export const ARK_RULES_SCHEMA = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: ARK_RULES_SCHEMA_URL,
    title: 'ArkGate ArkRules (intra-layer contract)',
    description: 'Per-layer structure sensors and invariant catalog consumed by the ArkGate Effective Contract.',
    type: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'layer'],
    properties: {
        $schema: {
            type: 'string',
            minLength: 1,
            default: ARK_RULES_SCHEMA_URL,
        },
        schemaVersion: {
            type: 'string',
            const: ARK_RULES_SCHEMA_VERSION,
            default: ARK_RULES_SCHEMA_VERSION,
        },
        layer: { type: 'string', minLength: 1 },
        structure: {
            type: 'array',
            default: [],
            items: { $ref: '#/$defs/structureEntry' },
        },
        invariants: {
            type: 'array',
            default: [],
            items: { $ref: '#/$defs/invariantEntry' },
        },
    },
    $defs: {
        structureEntry: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'sensor'],
            properties: {
                id: { type: 'string', minLength: 1 },
                sensor: { type: 'string', enum: [...ARK_RULE_SENSORS] },
                mode: { type: 'string', enum: ['advisory', 'enforced'], default: 'advisory' },
                appliesTo: stringArraySchema,
                description: { type: 'string', minLength: 1 },
            },
        },
        invariantEntry: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'description'],
            properties: {
                id: { type: 'string', minLength: 1 },
                description: { type: 'string', minLength: 1 },
                aggregate: { type: 'string', minLength: 1 },
                coverage: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        test: { type: 'boolean' },
                        symbol: { type: 'string', minLength: 1 },
                    },
                },
                mode: { type: 'string', enum: ['advisory', 'enforced'], default: 'advisory' },
                appliesTo: stringArraySchema,
            },
        },
    },
};
export class ArkRulesValidationError extends Error {
    issues;
    source;
    constructor(source, issues) {
        super(`Invalid ArkRules (${source}):\n${issues
            .map((issue) => `- ${issue.path}: ${issue.message}`)
            .join('\n')}`);
        this.name = 'ArkRulesValidationError';
        this.source = source;
        this.issues = issues;
    }
}
function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function propertyPath(parent, key) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
        ? `${parent}.${key}`
        : `${parent}[${JSON.stringify(key)}]`;
}
function valueType(value) {
    if (value === null)
        return 'null';
    if (Array.isArray(value))
        return 'array';
    return typeof value;
}
function resolveSchemaRef(ref, root) {
    const prefix = '#/$defs/';
    if (!ref.startsWith(prefix))
        return undefined;
    return root.$defs[ref.slice(prefix.length)];
}
function validateNode(value, schema, path, root, issues) {
    if (schema.$ref) {
        const referenced = resolveSchemaRef(schema.$ref, root);
        if (!referenced) {
            issues.push({ path, message: `schema reference ${schema.$ref} cannot be resolved` });
            return;
        }
        validateNode(value, referenced, path, root, issues);
        return;
    }
    if (schema.const !== undefined && !Object.is(value, schema.const)) {
        issues.push({ path, message: `must equal ${JSON.stringify(schema.const)}` });
        return;
    }
    if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) {
        issues.push({ path, message: `must be one of ${schema.enum.map(String).join(', ')}` });
        return;
    }
    if (schema.type === 'object') {
        if (!isObject(value)) {
            issues.push({ path, message: `must be an object; received ${valueType(value)}` });
            return;
        }
        const properties = schema.properties ?? {};
        for (const key of schema.required ?? []) {
            if (value[key] === undefined) {
                issues.push({ path: propertyPath(path, key), message: 'is required' });
            }
        }
        if (schema.additionalProperties === false) {
            for (const key of Object.keys(value)) {
                if (!(key in properties)) {
                    issues.push({ path: propertyPath(path, key), message: 'unknown field' });
                }
            }
        }
        else if (isObject(schema.additionalProperties)) {
            const additional = schema.additionalProperties;
            for (const key of Object.keys(value)) {
                if (!(key in properties)) {
                    validateNode(value[key], additional, propertyPath(path, key), root, issues);
                }
            }
        }
        for (const [key, childSchema] of Object.entries(properties)) {
            if (value[key] !== undefined) {
                validateNode(value[key], childSchema, propertyPath(path, key), root, issues);
            }
        }
        return;
    }
    if (schema.type === 'array') {
        if (!Array.isArray(value)) {
            issues.push({ path, message: `must be an array; received ${valueType(value)}` });
            return;
        }
        if (schema.minItems !== undefined && value.length < schema.minItems) {
            issues.push({ path, message: `must contain at least ${schema.minItems} item(s)` });
        }
        if (schema.uniqueItems) {
            const serialized = value.map((entry) => JSON.stringify(entry));
            if (new Set(serialized).size !== serialized.length) {
                issues.push({ path, message: 'must not contain duplicate items' });
            }
        }
        if (schema.items) {
            value.forEach((entry, index) => validateNode(entry, schema.items, `${path}[${index}]`, root, issues));
        }
        return;
    }
    if (schema.type === 'string') {
        if (typeof value !== 'string') {
            issues.push({ path, message: `must be a string; received ${valueType(value)}` });
            return;
        }
        if (schema.minLength !== undefined && value.length < schema.minLength) {
            issues.push({ path, message: `must contain at least ${schema.minLength} character(s)` });
        }
        return;
    }
    if (schema.type === 'boolean') {
        if (typeof value !== 'boolean') {
            issues.push({ path, message: `must be a boolean; received ${valueType(value)}` });
        }
    }
}
function defaultedArkRules(input) {
    return {
        ...input,
        $schema: input.$schema === undefined ? ARK_RULES_SCHEMA_URL : input.$schema,
        schemaVersion: input.schemaVersion === undefined ? ARK_RULES_SCHEMA_VERSION : input.schemaVersion,
        structure: input.structure === undefined ? [] : input.structure,
        invariants: input.invariants === undefined ? [] : input.invariants,
    };
}
function normalizeMode(mode) {
    return mode === 'enforced' ? 'enforced' : 'advisory';
}
function isTier2Sensor(sensor) {
    return ARK_RULE_TIER2_SENSORS.includes(sensor);
}
/**
 * Semantic checks that sit on top of the JSON Schema walk:
 * unique ids, tier-2 cannot be enforced, empty appliesTo arrays rejected.
 */
function validateSemantics(candidate, issues) {
    const structure = Array.isArray(candidate.structure) ? candidate.structure : [];
    const invariants = Array.isArray(candidate.invariants) ? candidate.invariants : [];
    const seen = new Set();
    structure.forEach((entry, index) => {
        if (!isObject(entry))
            return;
        const id = typeof entry.id === 'string' ? entry.id : '';
        if (id) {
            if (seen.has(id)) {
                issues.push({
                    path: `$.structure[${index}].id`,
                    message: `duplicate rule id ${JSON.stringify(id)}`,
                });
            }
            seen.add(id);
        }
        if (typeof entry.sensor === 'string' &&
            isTier2Sensor(entry.sensor) &&
            entry.mode === 'enforced') {
            issues.push({
                path: `$.structure[${index}].mode`,
                message: `sensor ${JSON.stringify(entry.sensor)} is Tier-2 advisory-only and cannot be enforced`,
            });
        }
        if (Array.isArray(entry.appliesTo) && entry.appliesTo.length === 0) {
            issues.push({
                path: `$.structure[${index}].appliesTo`,
                message: 'must not be an empty array (omit the field to apply to the whole layer)',
            });
        }
    });
    invariants.forEach((entry, index) => {
        if (!isObject(entry))
            return;
        const id = typeof entry.id === 'string' ? entry.id : '';
        if (id) {
            if (seen.has(id)) {
                issues.push({
                    path: `$.invariants[${index}].id`,
                    message: `duplicate rule id ${JSON.stringify(id)}`,
                });
            }
            seen.add(id);
        }
        if (Array.isArray(entry.appliesTo) && entry.appliesTo.length === 0) {
            issues.push({
                path: `$.invariants[${index}].appliesTo`,
                message: 'must not be an empty array (omit the field to apply to the whole layer)',
            });
        }
    });
}
export function loadArkRulesContract(input, source = 'arkrules.json', expectedLayer) {
    if (!isObject(input)) {
        throw new ArkRulesValidationError(source, [
            { path: '$', message: `must be an object; received ${valueType(input)}` },
        ]);
    }
    const candidate = defaultedArkRules(input);
    const issues = [];
    validateNode(candidate, ARK_RULES_SCHEMA, '$', ARK_RULES_SCHEMA, issues);
    validateSemantics(candidate, issues);
    if (expectedLayer !== undefined &&
        typeof candidate.layer === 'string' &&
        candidate.layer !== expectedLayer) {
        issues.push({
            path: '$.layer',
            message: `must match referencing key ${JSON.stringify(expectedLayer)}; received ${JSON.stringify(candidate.layer)}`,
        });
    }
    if (issues.length > 0)
        throw new ArkRulesValidationError(source, issues);
    return { config: candidate };
}
export function parseArkRulesJson(json, source = 'arkrules.json', expectedLayer) {
    let input;
    try {
        input = JSON.parse(json);
    }
    catch (error) {
        throw new ArkRulesValidationError(source, [
            {
                path: '$',
                message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
            },
        ]);
    }
    return loadArkRulesContract(input, source, expectedLayer);
}
/**
 * Build the Effective Contract from already-validated ArkRules files.
 * Callers supply `{ layer → { sourceFile, file } }` after resolving references.
 */
export function buildEffectiveArkRules(parts) {
    const byLayer = {};
    const structure = [];
    const invariants = [];
    const ordered = [...parts].sort((a, b) => a.layer.localeCompare(b.layer));
    for (const part of ordered) {
        const structureRules = (part.file.structure ?? []).map((entry) => ({
            ...entry,
            mode: normalizeMode(entry.mode),
            provenance: {
                sourceFile: part.sourceFile,
                ruleId: entry.id,
                layer: part.layer,
            },
        }));
        const invariantRules = (part.file.invariants ?? []).map((entry) => ({
            ...entry,
            mode: normalizeMode(entry.mode),
            provenance: {
                sourceFile: part.sourceFile,
                ruleId: entry.id,
                layer: part.layer,
            },
        }));
        byLayer[part.layer] = {
            sourceFile: part.sourceFile,
            structure: structureRules,
            invariants: invariantRules,
        };
        structure.push(...structureRules);
        invariants.push(...invariantRules);
    }
    structure.sort((a, b) => {
        const layer = a.provenance.layer.localeCompare(b.provenance.layer);
        return layer !== 0 ? layer : a.id.localeCompare(b.id);
    });
    invariants.sort((a, b) => {
        const layer = a.provenance.layer.localeCompare(b.provenance.layer);
        return layer !== 0 ? layer : a.id.localeCompare(b.id);
    });
    return {
        schemaVersion: ARK_RULES_SCHEMA_VERSION,
        byLayer,
        structure,
        invariants,
    };
}
/** Empty Effective Contract used when `arkRules` is absent (byte-for-byte verdict parity). */
export function emptyEffectiveArkRules() {
    return {
        schemaVersion: ARK_RULES_SCHEMA_VERSION,
        byLayer: {},
        structure: [],
        invariants: [],
    };
}
