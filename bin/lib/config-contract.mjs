/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/configContract.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/config-contract.mjs). Zero Node I/O.
 */

import { ARK_ORDER_SCHEMA_DEF, ARK_RUN_SCHEMA_DEF, defaultedArkOrder, defaultedArkRun, validateArkOrderExtra, validateArkRunExtra, } from './config-extras.mjs';
import { canonicalStewardId } from './team-parliament.mjs';
/** Current published ark.config.json schema version (ADR 0027: 1.3 adds optional arkOrder). */
export const ARK_CONFIG_SCHEMA_VERSION = '1.3';
/** Closed layer trust tags. Optional; absence is silent. Not a schemaVersion bump. */
export const LAYER_TRUST_BOUNDARIES = ['public', 'auth', 'admin', 'internal'];
/** Future house: empty globs are expected; missing owners stay silent even when required. */
export function isFutureHouseLayer(layer) {
    return layer?.optional === true || layer?.reserved === true || layer?.allowEmpty === true;
}
/**
 * Present `layers[].owners` as non-empty strings. Absence / empty / wrong type → undefined.
 */
export function layerOwnersList(layer) {
    const raw = layer && typeof layer === 'object' ? layer.owners : undefined;
    if (!Array.isArray(raw) || raw.length === 0)
        return undefined;
    const ids = raw.filter((entry) => typeof entry === 'string' && entry.length > 0);
    return ids.length > 0 ? ids : undefined;
}
/**
 * Layer names that must name owners when `requireLayerOwners` is on.
 * Empty when the require flag is absent or false.
 */
export function layersMissingRequiredOwners(config) {
    if (config?.requireLayerOwners !== true || !Array.isArray(config.layers))
        return [];
    return config.layers
        .filter((layer) => !isFutureHouseLayer(layer) && !layerOwnersList(layer))
        .map((layer) => layer.name);
}
export function missingLayerOwnersNextAction(layerName) {
    return `Add a GitHub handle or email to ${layerName}'s owners in ark.config.json (/ark-adopt).`;
}
export const ARK_CONFIG_SCHEMA_URL = 'https://unpkg.com/arkgate@4/schemas/ark.config.schema.json';
const DEFAULT_LAYER_NAMES = [
    'DomainModel',
    'ApplicationOrchestration',
    'PersistenceAdapters',
    'IntegrationAdapters',
    'WorkflowSagaEngine',
    'BackgroundJobsScheduling',
    'PresentationAdapters',
    'ReportingReadModels',
    'ExtensibilityMetadata',
    'SecurityAuditObservability',
    'Kernel',
];
const DEFAULT_ALLOWED_FLOWS = new Set([
    'PresentationAdapters->ApplicationOrchestration',
    'ApplicationOrchestration->DomainModel',
    'WorkflowSagaEngine->ApplicationOrchestration',
    'WorkflowSagaEngine->DomainModel',
    'BackgroundJobsScheduling->ApplicationOrchestration',
]);
function createDefaultRules() {
    const rules = [];
    for (const from of DEFAULT_LAYER_NAMES) {
        for (const to of DEFAULT_LAYER_NAMES) {
            if (from === to || DEFAULT_ALLOWED_FLOWS.has(`${from}->${to}`))
                continue;
            rules.push({ from, to, allowed: false });
        }
    }
    return rules;
}
export const DEFAULT_ARK_CONFIG_RULES = createDefaultRules();
/**
 * Ordered migration steps. Loader walks from the input version until
 * ARK_CONFIG_SCHEMA_VERSION. Additive only — never drops fields.
 */
export const ARK_CONFIG_MIGRATIONS = [
    { from: 'unversioned', to: '1.0' },
    { from: '1.0', to: '1.1' },
    { from: '1.1', to: '1.2' },
    { from: '1.2', to: '1.3' },
];
const stringArraySchema = {
    type: 'array',
    items: { type: 'string', minLength: 1 },
    uniqueItems: true,
};
export const ARK_CONFIG_SCHEMA = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: ARK_CONFIG_SCHEMA_URL,
    title: 'ArkGate architecture contract',
    description: 'Versioned contract consumed identically by ArkGate CLI, MCP, and ESLint surfaces.',
    type: 'object',
    additionalProperties: false,
    required: ['$schema', 'schemaVersion', 'include', 'layers', 'rules'],
    properties: {
        $schema: {
            type: 'string',
            minLength: 1,
            default: ARK_CONFIG_SCHEMA_URL,
            description: 'Editor-facing URL or local path for this JSON Schema.',
        },
        schemaVersion: {
            type: 'string',
            const: ARK_CONFIG_SCHEMA_VERSION,
            default: ARK_CONFIG_SCHEMA_VERSION,
        },
        name: { type: 'string', minLength: 1 },
        include: { ...stringArraySchema, minItems: 1, default: ['src'] },
        exclude: { ...stringArraySchema, default: [] },
        excludeGenerated: { type: 'boolean', default: true },
        frameworkOverlay: { type: 'string', minLength: 1 },
        layers: { type: 'array', default: [], items: { $ref: '#/$defs/layer' } },
        rules: {
            type: 'array',
            default: DEFAULT_ARK_CONFIG_RULES,
            items: { $ref: '#/$defs/rule' },
        },
        cyclePolicy: {
            type: 'string',
            enum: ['strict', 'soft', 'framework-soft', 'off'],
            default: 'strict',
        },
        dynamicImportAllowlist: { ...stringArraySchema, default: [] },
        safety: {
            $ref: '#/$defs/safety',
            default: {
                maxTsSuppressions: 0,
                maxAnyCasts: 0,
                allowInMemory: false,
                allowDisabledPeerIsolation: false,
            },
        },
        /** Invariant-coverage scan controls (test globs + file budget). Absence keeps defaults.
         *  maxFiles also bounds structural-hint preload (orchestration-only / thin-adapter /
         *  writes-via-aggregate). There is no arkrules.hintBudget. */
        coverage: { $ref: '#/$defs/coverage' },
        /** ADR 0012 — layer name → relative path to arkrules/<Layer>.json */
        arkRules: {
            type: 'object',
            additionalProperties: { type: 'string', minLength: 1 },
            default: {},
        },
        /** ADR 0020 — optional ArkRun extra. Absence is silent; unknown keys fail closed. */
        arkRun: { $ref: '#/$defs/arkRun' },
        /** ADR 0027 — optional ArkOrder extra. Absence is silent; unknown keys fail closed. */
        arkOrder: { $ref: '#/$defs/arkOrder' },
        /** Team parliament — GitHub handles or emails who may loosen the law (not part of policy hash). */
        stewards: { ...stringArraySchema, default: [] },
        /**
         * When true, every non-reserved layer must name owners. Absence/false is
         * silent. Policy teeth — stays in policyHash. Owners stay metadata.
         */
        requireLayerOwners: { type: 'boolean' },
    },
    $defs: {
        layer: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'patterns'],
            properties: {
                name: { type: 'string', minLength: 1 },
                patterns: { ...stringArraySchema, minItems: 1 },
                exclude: stringArraySchema,
                intentPrefixes: stringArraySchema,
                description: { type: 'string', minLength: 1 },
                trustBoundary: { type: 'string', enum: [...LAYER_TRUST_BOUNDARIES] },
                owners: { ...stringArraySchema, minItems: 1 },
                forbiddenGlobals: stringArraySchema,
                capabilities: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        deny: {
                            type: 'array',
                            uniqueItems: true,
                            items: {
                                type: 'string',
                                // Parity with src/domain/capabilities.ts CAPABILITY_IDS (guarded by tests;
                                // this literal keeps the generated CLI artifact self-contained).
                                enum: [
                                    'network',
                                    'filesystem',
                                    'clock',
                                    'randomness',
                                    'environment',
                                    'process',
                                    'persistence',
                                ],
                            },
                        },
                    },
                },
                pure: { type: 'boolean' },
                mayImportInfrastructure: { type: 'boolean' },
                optional: { type: 'boolean' },
                reserved: { type: 'boolean' },
                allowEmpty: { type: 'boolean' },
            },
        },
        rule: {
            type: 'object',
            additionalProperties: false,
            required: ['from', 'to', 'allowed'],
            properties: {
                from: { type: 'string', minLength: 1 },
                to: { type: 'string', minLength: 1 },
                allowed: { type: 'boolean' },
                message: { type: 'string', minLength: 1 },
                peerIsolation: { type: 'boolean' },
                sliceFolders: { ...stringArraySchema, minItems: 1 },
                sliceIdentity: {
                    type: 'string',
                    enum: ['path', 'stars'],
                    description: 'How a starred sliceFolders prefix is named. Absent and path keep today\'s ids (every literal and star binding). stars keeps the last literal plus the star bindings, so parallel trees share one feature id. Bare names are unchanged.',
                },
                sharedRoots: { ...stringArraySchema, minItems: 1 },
                allowedCrossSlice: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['from', 'to'],
                        properties: {
                            from: { type: 'string', minLength: 1 },
                            to: { type: 'string', minLength: 1 },
                        },
                    },
                },
                sharedImportsSlice: {
                    type: 'string',
                    enum: ['deny', 'deny-cross-parent'],
                    description: 'deny blocks every shared-root import of a slice. deny-cross-parent leaves that hop as a warning and, in ark-check and CI only, reports a slice that reaches another universe through a shared root. The write hook and ESLint see one edge and do not block it. arkgate 4.8.22 and older reject deny-cross-parent.',
                },
                childSlices: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['sliceFolders'],
                    description: 'Optional inner wall under this rule. Absent keeps today\'s universe wall. sliceFolders names children. commonFolders and flat files are universe common. siblings is "deny" (default), "advisory", or { default, enforce }. parentMayImportChild defaults to false. allowedCrossSlice may use a whole-segment *. It clears only a sibling crossing. Cross-parent has no advisory knob. arkgate 4.8.22 and older reject this key. A build that still rejects unknown childSlices fields rejects allowedCrossSlice at config load. A build that still types siblings as a string enum rejects the object at config load.',
                    properties: {
                        sliceFolders: { ...stringArraySchema, minItems: 1 },
                        sliceIdentity: {
                            type: 'string',
                            enum: ['path', 'stars'],
                        },
                        commonFolders: { ...stringArraySchema, minItems: 1 },
                        siblings: {
                            description: '"deny" or "advisory", or { default, enforce } so listed subtrees are errors while the default stays advisory. A string-enum build rejects the object at config load (must be one of deny, advisory).',
                            oneOf: [
                                { type: 'string', enum: ['deny', 'advisory'] },
                                {
                                    type: 'object',
                                    additionalProperties: false,
                                    required: ['default'],
                                    properties: {
                                        default: { type: 'string', enum: ['deny', 'advisory'] },
                                        enforce: { ...stringArraySchema },
                                    },
                                },
                            ],
                        },
                        parentMayImportChild: { type: 'boolean' },
                        sliceAliases: {
                            type: 'array',
                            minItems: 1,
                            description: 'Maps a source path glob onto a child slice id (universe id plus one child segment) so files outside the slice trees take that universe and child for both walls. A bare name, a universe id alone, an unknown universe, and a wildcard in to are rejected. The glob may not overlap a slice folder, and two aliases may not match the same file. Doctor lists each alias as an owed move. A build that rejects unknown childSlices fields fails at config load (unknown field). arkgate 4.8.22 and older reject childSlices.',
                            items: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['from', 'to'],
                                properties: {
                                    from: { type: 'string', minLength: 1 },
                                    to: { type: 'string', minLength: 1 },
                                },
                            },
                        },
                        allowedCrossSlice: {
                            type: 'array',
                            minItems: 1,
                            description: 'Directed child-slice allowances. * matches one whole path segment (features/projects/*). ** and a partial segment are rejected. A bare name is rejected. This list clears only CROSS_SIBLING_SLICE. It cannot clear CROSS_PARENT_SLICE or CROSS_PARENT_VIA_SHARED. The universe allowedCrossSlice still treats * as a literal. A build that rejects unknown childSlices fields fails at config load (unknown field).',
                            items: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['from', 'to'],
                                properties: {
                                    from: { type: 'string', minLength: 1 },
                                    to: { type: 'string', minLength: 1 },
                                },
                            },
                        },
                    },
                },
            },
        },
        safety: {
            type: 'object',
            additionalProperties: false,
            properties: {
                maxTsSuppressions: { type: 'integer', minimum: 0, default: 0 },
                maxAnyCasts: { type: 'integer', minimum: 0, default: 0 },
                allowInMemory: { type: 'boolean', default: false },
                allowDisabledPeerIsolation: { type: 'boolean', default: false },
            },
        },
        coverage: {
            type: 'object',
            additionalProperties: false,
            description: 'Invariant coverage scan controls. testGlobs replaces the built-in test-name heuristic; maxFiles raises or lowers the evidence file budget and also bounds structural-hint preload for orchestration-only, thin-adapter, and writes-via-aggregate (default 400; there is no arkrules.hintBudget); coverageRoots declares where the project runs its tests, so a covering test found outside them is reported instead of silently certifying an invariant. When any invariant is enforced, missing coverageRoots fails closed.',
            properties: {
                testGlobs: { ...stringArraySchema, minItems: 1 },
                maxFiles: {
                    type: 'integer',
                    minimum: 1,
                    description: 'Evidence file budget (default 400) and structural-hint preload cap for orchestration-only, thin-adapter, and writes-via-aggregate. Raise this when hinted/governed counts show truncated sensors. There is no separate arkrules.hintBudget.',
                },
                coverageRoots: { ...stringArraySchema, minItems: 1 },
            },
        },
        arkRun: ARK_RUN_SCHEMA_DEF,
        arkOrder: ARK_ORDER_SCHEMA_DEF,
    },
};
export class ArkConfigValidationError extends Error {
    issues;
    source;
    constructor(source, issues) {
        super(`Invalid ArkGate config (${source}):\n${issues
            .map((issue) => `- ${issue.path}: ${issue.message}`)
            .join('\n')}`);
        this.name = 'ArkConfigValidationError';
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
        else if (schema.additionalProperties !== undefined &&
            schema.additionalProperties !== true &&
            typeof schema.additionalProperties === 'object') {
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
        return;
    }
    if (schema.type === 'integer') {
        if (!Number.isInteger(value)) {
            issues.push({ path, message: `must be an integer; received ${valueType(value)}` });
            return;
        }
        if (schema.minimum !== undefined && value < schema.minimum) {
            issues.push({ path, message: `must be at least ${schema.minimum}` });
        }
    }
}
const SIBLING_MODES = ['deny', 'advisory'];
/**
 * String enum builds reject this object before they reach a decision.
 * The message names both forms so a bad value is obvious at config load.
 */
const SIBLINGS_FORM_MESSAGE = 'must be "deny", "advisory", or { "default": "deny" | "advisory", "enforce": ["<child id or subtree path>"] }';
function validateChildSliceSiblings(candidate, issues) {
    const rules = candidate.rules;
    if (!Array.isArray(rules))
        return;
    rules.forEach((rule, index) => {
        if (!isObject(rule))
            return;
        const child = rule.childSlices;
        if (!isObject(child) || child.siblings === undefined)
            return;
        const siblings = child.siblings;
        const path = `$.rules[${index}].childSlices.siblings`;
        if (typeof siblings === 'string') {
            if (!SIBLING_MODES.includes(siblings)) {
                issues.push({ path, message: SIBLINGS_FORM_MESSAGE });
            }
            return;
        }
        if (!isObject(siblings)) {
            issues.push({ path, message: SIBLINGS_FORM_MESSAGE });
            return;
        }
        for (const key of Object.keys(siblings)) {
            if (key !== 'default' && key !== 'enforce') {
                issues.push({ path: propertyPath(path, key), message: 'unknown field' });
            }
        }
        if (siblings.default === undefined) {
            issues.push({ path: `${path}.default`, message: 'is required' });
        }
        else if (siblings.default !== 'deny' && siblings.default !== 'advisory') {
            issues.push({ path: `${path}.default`, message: 'must be deny or advisory' });
        }
        if (siblings.enforce === undefined)
            return;
        if (!Array.isArray(siblings.enforce)) {
            issues.push({
                path: `${path}.enforce`,
                message: 'must be an array of child slice ids or subtree paths',
            });
            return;
        }
        const seen = new Set();
        siblings.enforce.forEach((entry, entryIndex) => {
            const entryPath = `${path}.enforce[${entryIndex}]`;
            if (typeof entry !== 'string' || entry.trim().length === 0) {
                issues.push({ path: entryPath, message: 'must be a non-empty child slice id or subtree path' });
                return;
            }
            const normalized = trimTrailingSlashes(entry.trim().replace(/\\/g, '/'));
            if (normalized.split('/').some((part) => part.length === 0 || part === '.' || part === '..')) {
                issues.push({ path: entryPath, message: 'must be a child slice id or subtree path without . or ..' });
                return;
            }
            if (normalized.includes('*')) {
                issues.push({
                    path: entryPath,
                    message: 'must be a child slice id or subtree path. * is not a wildcard on siblings.enforce',
                });
                return;
            }
            if (seen.has(normalized)) {
                issues.push({ path: entryPath, message: 'duplicate enforce entry' });
                return;
            }
            seen.add(normalized);
        });
    });
}
const BARE_CHILD_CROSS_SLICE = 'must be a slice id with a slash. A bare name is ambiguous across universes.';
const WHOLE_SEGMENT_STAR = '* matches one whole path segment. ** and a partial segment are not wildcards.';
/**
 * Whole-segment `*` is legal only on this list. A bare name is rejected.
 * The universe allowedCrossSlice is not checked here and still treats `*` as a literal.
 */
function childCrossSlicePatternIssue(raw) {
    const trimmed = trimTrailingSlashes(raw.trim().replace(/\\/g, '/'));
    if (trimmed.length === 0)
        return 'must be a non-empty slice id';
    if (!trimmed.includes('/'))
        return BARE_CHILD_CROSS_SLICE;
    const parts = trimmed.split('/');
    for (const part of parts) {
        if (part.length === 0 || part === '.' || part === '..') {
            return 'must be a slice id without empty, . or .. segments';
        }
        if (part.includes('*') && part !== '*')
            return WHOLE_SEGMENT_STAR;
    }
    return null;
}
function childCrossSlicePatternKey(raw) {
    return trimTrailingSlashes(raw.trim().replace(/\\/g, '/')).toLowerCase();
}
function validateChildSliceAllowedCrossSlice(candidate, issues) {
    const rules = candidate.rules;
    if (!Array.isArray(rules))
        return;
    rules.forEach((rule, index) => {
        if (!isObject(rule))
            return;
        const child = rule.childSlices;
        if (!isObject(child) || child.allowedCrossSlice === undefined)
            return;
        const edges = child.allowedCrossSlice;
        const path = `$.rules[${index}].childSlices.allowedCrossSlice`;
        if (!Array.isArray(edges)) {
            issues.push({ path, message: 'must be an array of { from, to } child slice ids' });
            return;
        }
        const seen = new Set();
        edges.forEach((edge, edgeIndex) => {
            const edgePath = `${path}[${edgeIndex}]`;
            if (!isObject(edge)) {
                issues.push({ path: edgePath, message: 'must be an object with from and to' });
                return;
            }
            for (const key of Object.keys(edge)) {
                if (key !== 'from' && key !== 'to') {
                    issues.push({ path: propertyPath(edgePath, key), message: 'unknown field' });
                }
            }
            for (const side of ['from', 'to']) {
                const value = edge[side];
                const sidePath = `${edgePath}.${side}`;
                if (typeof value !== 'string' || value.trim().length === 0) {
                    issues.push({ path: sidePath, message: 'must be a non-empty slice id' });
                    continue;
                }
                const issue = childCrossSlicePatternIssue(value);
                if (issue)
                    issues.push({ path: sidePath, message: issue });
            }
            if (typeof edge.from !== 'string' || typeof edge.to !== 'string')
                return;
            const key = `${childCrossSlicePatternKey(edge.from)}\0${childCrossSlicePatternKey(edge.to)}`;
            if (!key.startsWith('\0') && !key.endsWith('\0')) {
                if (seen.has(key)) {
                    issues.push({ path: edgePath, message: 'duplicate child slice allowance' });
                    return;
                }
                seen.add(key);
            }
        });
    });
}
const ALIAS_TARGET_MESSAGE = 'must be a child of an existing universe (the universe id this rule already names, plus one child segment). A bare name, a universe id alone, an unknown universe, and a wildcard are rejected.';
const ALIAS_OVERLAP_MESSAGE = 'overlaps a slice folder. An alias covers only files outside the slice trees.';
const ALIAS_SAME_FILE_MESSAGE = 'two slice aliases match the same file';
function aliasPathSegments(raw) {
    return trimTrailingSlashes(raw.trim().replace(/\\/g, '/')).toLowerCase().split('/').filter((part) => part.length > 0);
}
function concreteGlobPrefix(segments) {
    const prefix = [];
    for (const segment of segments) {
        if (segment.includes('*'))
            break;
        prefix.push(segment);
    }
    return prefix;
}
function segmentsArePrefix(prefix, full) {
    if (prefix.length > full.length)
        return false;
    for (let index = 0; index < prefix.length; index += 1) {
        if (prefix[index] !== full[index])
            return false;
    }
    return true;
}
function anchoredSlicePrefix(entry) {
    const segments = entry.split(/[/\\]/).filter(Boolean).map((part) => part.toLowerCase());
    if (segments.length < 2 || segments[0] === '*' || segments[0] === '**')
        return null;
    if (!segments.some((part) => part === '*'))
        return null;
    const prefix = [];
    for (const segment of segments) {
        if (segment === '*' || segment === '**')
            break;
        if (segment.includes('*'))
            return null;
        prefix.push(segment);
    }
    return prefix.length > 0 ? prefix : null;
}
/** Trailing ** does not invent a slice-folder name the glob does not already reach. */
function globOverlapsAnchored(glob, patternPrefix) {
    const prefix = concreteGlobPrefix(glob);
    const wild = prefix.length < glob.length;
    const rooted = prefix[0] === 'src' || prefix[0] === 'app' ? prefix.slice(1) : prefix;
    if (segmentsArePrefix(patternPrefix, prefix) || segmentsArePrefix(patternPrefix, rooted))
        return true;
    if (!wild)
        return false;
    return ((segmentsArePrefix(prefix, patternPrefix) && prefix.length < patternPrefix.length) ||
        (segmentsArePrefix(prefix, ['src', ...patternPrefix]) && prefix.length < patternPrefix.length + 1) ||
        (segmentsArePrefix(prefix, ['app', ...patternPrefix]) && prefix.length < patternPrefix.length + 1));
}
function globOverlapsBare(glob, name) {
    for (let index = 0; index < glob.length; index += 1) {
        if (glob[index] !== name && glob[index] !== '*')
            continue;
        const rest = glob.slice(index + 1);
        if (rest.length >= 2)
            return true;
        if (rest.some((segment) => segment === '*' || segment === '**'))
            return true;
    }
    const prefix = concreteGlobPrefix(glob);
    return (prefix.length < glob.length &&
        (prefix.length === 0 || (prefix.length === 1 && (prefix[0] === 'src' || prefix[0] === 'app'))));
}
function globOverlapsSliceEntry(glob, entry) {
    const segments = entry.split(/[/\\]/).filter(Boolean).map((part) => part.toLowerCase());
    if (segments.length === 1 && segments[0] && !segments[0].includes('*')) {
        return globOverlapsBare(glob, segments[0]);
    }
    const prefix = anchoredSlicePrefix(entry);
    return prefix ? globOverlapsAnchored(glob, prefix) : false;
}
function aliasGlobIssue(raw) {
    const trimmed = trimTrailingSlashes(raw.trim().replace(/\\/g, '/'));
    if (trimmed.length === 0)
        return 'must be a non-empty path glob';
    if (trimmed === '*' || trimmed === '**')
        return 'must not cover the whole tree';
    for (const part of trimmed.split('/')) {
        if (part.length === 0 || part === '.' || part === '..') {
            return 'must be a path glob without empty, . or .. segments';
        }
        if (part === '*' || part === '**')
            continue;
        if (part.includes('*') || part.includes('?') || part.includes('{') || part.includes('[')) {
            return '* matches one whole path segment. ** is a whole segment. A partial segment is not a wildcard.';
        }
    }
    return null;
}
function universeShapes(folders, identity) {
    const shapes = [];
    if (!Array.isArray(folders))
        return shapes;
    const stars = identity === 'stars';
    for (const raw of folders) {
        if (typeof raw !== 'string' || raw.length === 0)
            continue;
        const segments = raw.split(/[/\\]/).filter(Boolean).map((part) => part.toLowerCase());
        if (segments.length === 1 && segments[0] && !segments[0].includes('*')) {
            shapes.push({ literals: [segments[0], null] });
            continue;
        }
        if (segments.some((part) => part === '**' || (part.includes('*') && part !== '*')))
            continue;
        if (!segments.includes('*'))
            continue;
        if (stars) {
            let lastLiteral = -1;
            for (let index = 0; index < segments.length; index += 1) {
                if (segments[index] !== '*')
                    lastLiteral = index;
            }
            if (lastLiteral < 0)
                continue;
            shapes.push({
                literals: segments.slice(lastLiteral).map((part) => (part === '*' ? null : part)),
            });
            continue;
        }
        shapes.push({ literals: segments.map((part) => (part === '*' ? null : part)) });
    }
    return shapes;
}
function shapeMatches(shape, segments) {
    if (shape.literals.length !== segments.length)
        return false;
    return shape.literals.every((literal, index) => literal === null || literal === segments[index]);
}
function aliasTargetIssue(raw, shapes) {
    const trimmed = trimTrailingSlashes(raw.trim().replace(/\\/g, '/'));
    if (trimmed.length === 0 || trimmed.split('/').some((part) => part.length === 0 || part === '.' || part === '..')) {
        return ALIAS_TARGET_MESSAGE;
    }
    if (trimmed.includes('*') || !trimmed.includes('/'))
        return ALIAS_TARGET_MESSAGE;
    const parts = trimmed.split('/').map((part) => part.toLowerCase());
    if (shapes.length === 0)
        return ALIAS_TARGET_MESSAGE;
    if (shapes.some((shape) => shapeMatches(shape, parts)))
        return ALIAS_TARGET_MESSAGE;
    if (shapes.some((shape) => shapeMatches(shape, parts.slice(0, -1))))
        return null;
    return ALIAS_TARGET_MESSAGE;
}
/** A leading src/ or app/ is optional at match time, so both spellings are one glob. */
function aliasGlobVariants(segments) {
    const head = segments[0];
    if ((head === 'src' || head === 'app') && segments.length > 1)
        return [segments, segments.slice(1)];
    return [segments];
}
function aliasesCanMatchSameFile(left, right) {
    const leftVariants = aliasGlobVariants(left);
    const rightVariants = aliasGlobVariants(right);
    for (const a of leftVariants) {
        if (globsCanMatchSame(a, right, 0, 0, new Map()))
            return true;
    }
    for (const b of rightVariants) {
        if (globsCanMatchSame(left, b, 0, 0, new Map()))
            return true;
    }
    return false;
}
function globsCanMatchSame(left, right, i, j, memo) {
    const key = `${i}:${j}`;
    const cached = memo.get(key);
    if (cached !== undefined)
        return cached;
    let matched = false;
    if (i === left.length && j === right.length)
        matched = true;
    else if (i < left.length && left[i] === '**') {
        matched =
            globsCanMatchSame(left, right, i + 1, j, memo) ||
                (j < right.length && globsCanMatchSame(left, right, i, j + 1, memo));
    }
    else if (j < right.length && right[j] === '**') {
        matched =
            globsCanMatchSame(left, right, i, j + 1, memo) ||
                (i < left.length && globsCanMatchSame(left, right, i + 1, j, memo));
    }
    else if (i < left.length && j < right.length) {
        const a = left[i];
        const b = right[j];
        if (a === b || a === '*' || b === '*')
            matched = globsCanMatchSame(left, right, i + 1, j + 1, memo);
    }
    memo.set(key, matched);
    return matched;
}
function validateChildSliceAliases(candidate, issues) {
    const rules = candidate.rules;
    if (!Array.isArray(rules))
        return;
    rules.forEach((rule, index) => {
        if (!isObject(rule))
            return;
        const child = rule.childSlices;
        if (!isObject(child) || child.sliceAliases === undefined)
            return;
        const aliases = child.sliceAliases;
        const path = `$.rules[${index}].childSlices.sliceAliases`;
        if (!Array.isArray(aliases)) {
            issues.push({ path, message: 'must be an array of { from, to } slice aliases' });
            return;
        }
        const shapes = universeShapes(rule.sliceFolders, rule.sliceIdentity);
        const sliceEntries = [
            ...(Array.isArray(rule.sliceFolders) ? rule.sliceFolders : []),
            ...(Array.isArray(child.sliceFolders) ? child.sliceFolders : []),
        ].filter((entry) => typeof entry === 'string' && entry.length > 0);
        const globs = [];
        aliases.forEach((alias, aliasIndex) => {
            const aliasPath = `${path}[${aliasIndex}]`;
            if (!isObject(alias)) {
                issues.push({ path: aliasPath, message: 'must be an object with from and to' });
                return;
            }
            for (const key of Object.keys(alias)) {
                if (key !== 'from' && key !== 'to') {
                    issues.push({ path: propertyPath(aliasPath, key), message: 'unknown field' });
                }
            }
            const from = alias.from;
            const to = alias.to;
            if (typeof from !== 'string' || from.trim().length === 0) {
                issues.push({ path: `${aliasPath}.from`, message: 'must be a non-empty path glob' });
            }
            else {
                const issue = aliasGlobIssue(from);
                if (issue)
                    issues.push({ path: `${aliasPath}.from`, message: issue });
                else {
                    const segments = aliasPathSegments(from);
                    if (sliceEntries.some((entry) => globOverlapsSliceEntry(segments, entry))) {
                        issues.push({ path: `${aliasPath}.from`, message: ALIAS_OVERLAP_MESSAGE });
                    }
                    for (const previous of globs) {
                        if (aliasesCanMatchSameFile(previous, segments)) {
                            issues.push({ path: aliasPath, message: ALIAS_SAME_FILE_MESSAGE });
                            break;
                        }
                    }
                    globs.push(segments);
                }
            }
            if (typeof to !== 'string' || to.trim().length === 0) {
                issues.push({ path: `${aliasPath}.to`, message: ALIAS_TARGET_MESSAGE });
            }
            else {
                const issue = aliasTargetIssue(to, shapes);
                if (issue)
                    issues.push({ path: `${aliasPath}.to`, message: issue });
            }
        });
    });
}
function validateLayerOwners(candidate, issues) {
    const layers = candidate.layers;
    if (!Array.isArray(layers))
        return;
    layers.forEach((layer, index) => {
        if (!layer || typeof layer !== 'object' || Array.isArray(layer))
            return;
        if (!('owners' in layer))
            return;
        const owners = layer.owners;
        if (!Array.isArray(owners))
            return;
        owners.forEach((entry, ownerIndex) => {
            if (typeof entry !== 'string')
                return;
            if (!canonicalStewardId(entry)) {
                issues.push({
                    path: `$.layers[${index}].owners[${ownerIndex}]`,
                    message: 'must be a GitHub handle or email (not a display name)',
                });
            }
        });
    });
}
function defaultedConfig(input) {
    const result = {
        ...input,
        $schema: input.$schema === undefined ? ARK_CONFIG_SCHEMA_URL : input.$schema,
        schemaVersion: input.schemaVersion === undefined ? ARK_CONFIG_SCHEMA_VERSION : input.schemaVersion,
        include: input.include === undefined ? ['src'] : input.include,
        layers: input.layers === undefined ? [] : input.layers,
        rules: input.rules === undefined
            ? DEFAULT_ARK_CONFIG_RULES.map((rule) => ({ ...rule }))
            : input.rules,
    };
    if (input.arkRun !== undefined)
        result.arkRun = defaultedArkRun(input.arkRun);
    if (input.arkOrder !== undefined)
        result.arkOrder = defaultedArkOrder(input.arkOrder);
    return result;
}
function migratedFromOf(originalVersion) {
    if (originalVersion === ARK_CONFIG_SCHEMA_VERSION)
        return null;
    if (originalVersion === 'unversioned')
        return 'unversioned';
    if (originalVersion === '1.0' ||
        originalVersion === '1.1' ||
        originalVersion === '1.2') {
        return originalVersion;
    }
    return null;
}
function knownInputVersions() {
    const versions = new Set([ARK_CONFIG_SCHEMA_VERSION]);
    for (const step of ARK_CONFIG_MIGRATIONS) {
        if (step.from !== 'unversioned')
            versions.add(step.from);
        versions.add(step.to);
    }
    return versions;
}
/**
 * Rewrite schemaVersion through ARK_CONFIG_MIGRATIONS until current.
 * Additive only: field defaults are applied after the chain, never removed.
 */
export function migrateArkConfig(input, source = 'ark.config.json') {
    if (!isObject(input)) {
        throw new ArkConfigValidationError(source, [
            { path: '$', message: `must be an object; received ${valueType(input)}` },
        ]);
    }
    const known = knownInputVersions();
    const originalVersion = input.schemaVersion === undefined
        ? 'unversioned'
        : typeof input.schemaVersion === 'string'
            ? input.schemaVersion
            : null;
    if (originalVersion === null) {
        throw new ArkConfigValidationError(source, [
            {
                path: '$.schemaVersion',
                message: `unsupported version ${JSON.stringify(input.schemaVersion)}; expected ${ARK_CONFIG_SCHEMA_VERSION}`,
            },
        ]);
    }
    if (originalVersion !== 'unversioned' && !known.has(originalVersion)) {
        throw new ArkConfigValidationError(source, [
            {
                path: '$.schemaVersion',
                message: `unsupported version ${JSON.stringify(originalVersion)}; expected ${ARK_CONFIG_SCHEMA_VERSION}`,
            },
        ]);
    }
    let version = originalVersion;
    const working = { ...input };
    // Walk the migration table. Each step is a pure version stamp (optional extras
    // like arkRules / arkRun need no field rewrite when absent).
    let guard = 0;
    while (version !== ARK_CONFIG_SCHEMA_VERSION && guard < ARK_CONFIG_MIGRATIONS.length + 1) {
        guard += 1;
        const step = ARK_CONFIG_MIGRATIONS.find((candidate) => candidate.from === version);
        if (!step) {
            throw new ArkConfigValidationError(source, [
                {
                    path: '$.schemaVersion',
                    message: `unsupported version ${JSON.stringify(version)}; expected ${ARK_CONFIG_SCHEMA_VERSION}`,
                },
            ]);
        }
        version = step.to;
        working.schemaVersion = version;
    }
    if (version !== ARK_CONFIG_SCHEMA_VERSION) {
        throw new ArkConfigValidationError(source, [
            {
                path: '$.schemaVersion',
                message: `unsupported version ${JSON.stringify(originalVersion)}; expected ${ARK_CONFIG_SCHEMA_VERSION}`,
            },
        ]);
    }
    return { candidate: defaultedConfig(working), migratedFrom: migratedFromOf(originalVersion) };
}
export function loadArkConfigContract(input, source = 'ark.config.json') {
    const { candidate, migratedFrom } = migrateArkConfig(input, source);
    const issues = [];
    validateNode(candidate, ARK_CONFIG_SCHEMA, '$', ARK_CONFIG_SCHEMA, issues);
    validateArkRunExtra(candidate, issues);
    validateArkOrderExtra(candidate, issues);
    validateLayerOwners(candidate, issues);
    validateChildSliceSiblings(candidate, issues);
    validateChildSliceAllowedCrossSlice(candidate, issues);
    validateChildSliceAliases(candidate, issues);
    if (issues.length > 0)
        throw new ArkConfigValidationError(source, issues);
    return { config: candidate, migratedFrom };
}
export function parseArkConfigJson(json, source = 'ark.config.json') {
    let input;
    try {
        input = JSON.parse(json);
    }
    catch (error) {
        throw new ArkConfigValidationError(source, [
            {
                path: '$',
                message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
            },
        ]);
    }
    return loadArkConfigContract(input, source);
}
export function withArkConfigMetadata(config) {
    const result = {
        $schema: typeof config.$schema === 'string' && config.$schema.length > 0
            ? config.$schema
            : ARK_CONFIG_SCHEMA_URL,
        schemaVersion: ARK_CONFIG_SCHEMA_VERSION,
    };
    for (const [key, value] of Object.entries(config)) {
        if (key !== '$schema' && key !== 'schemaVersion')
            result[key] = value;
    }
    return result;
}
/**
 * Trim trailing slashes without a regex.
 *
 * `/\/+$/` is a polynomial ReDoS on a value that comes from the repo's own
 * contract but is still library input. A scan is linear and says the same thing.
 */
function trimTrailingSlashes(value) {
    let end = value.length;
    while (end > 0 && value[end - 1] === '/')
        end -= 1;
    return value.slice(0, end);
}
