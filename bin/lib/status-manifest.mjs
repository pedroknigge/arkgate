/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/statusManifest.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/status-manifest.mjs). Zero Node I/O.
 */

export const ARK_STATUS_MANIFEST_SCHEMA_VERSION = '1.0';
export const ARK_STATUS_MANIFEST_SCHEMA_URL = 'https://unpkg.com/arkgate@4/schemas/ark.status-manifest.schema.json';
/**
 * Honesty mode for status improvementCompass (DF02).
 * - full: residual projected from doctor-equivalent facts (residual ⊆ doctor)
 * - subset: incomplete facts; residual may omit doctor residual; never invent green
 * - unavailable: no usable facts; empty residual + reason (never silent ok)
 */
export const STATUS_COMPASS_MODES = ['full', 'subset', 'unavailable'];
/** Provenance for status compass residual (same-tree intent). */
export const STATUS_COMPASS_FACTS_SOURCES = [
    'doctor-facts',
    'report-snapshot',
    'none',
];
/** Stable reason codes when mode is not full. */
export const STATUS_COMPASS_REASON_CODES = {
    FACTS_UNAVAILABLE: 'FACTS_UNAVAILABLE',
    FACTS_PARTIAL: 'FACTS_PARTIAL',
    NO_SESSION_SNAPSHOT: 'NO_SESSION_SNAPSHOT',
};
const PROJECT_ID_PATTERN = /^sha256:[a-f0-9]{64}$/;
/**
 * Evaluate project binding for status without filesystem.
 * Paths must already be canonical absolute strings when compared.
 */
export function evaluateStatusBinding(input) {
    const expectation = input.expectation;
    if (expectation == null ||
        (expectation.expectedRoot === undefined && expectation.expectedProjectId === undefined)) {
        // Local CLI / unbound MCP: this process is bound to resolvedRoot when known.
        return {
            status: 'matched',
            authoritative: Boolean(input.resolvedRoot),
        };
    }
    if (expectation && typeof expectation !== 'object') {
        return {
            status: 'mismatch',
            authoritative: false,
            code: 'INVALID_PROJECT_EXPECTATION',
            message: 'project must be an object containing expectedRoot and/or expectedProjectId.',
        };
    }
    const rawRoot = expectation.expectedRoot;
    const rawId = expectation.expectedProjectId;
    if (rawRoot !== undefined &&
        (typeof rawRoot !== 'string' || rawRoot.trim() === '')) {
        return {
            status: 'mismatch',
            authoritative: false,
            code: 'INVALID_PROJECT_EXPECTATION',
            message: 'project.expectedRoot must be a non-empty absolute path.',
        };
    }
    if (rawId !== undefined && (typeof rawId !== 'string' || !PROJECT_ID_PATTERN.test(rawId))) {
        return {
            status: 'mismatch',
            authoritative: false,
            code: 'INVALID_PROJECT_EXPECTATION',
            message: 'project.expectedProjectId must be a sha256:<64 lowercase hex> identity.',
        };
    }
    if (rawRoot === undefined && rawId !== undefined) {
        if (input.projectId && rawId !== input.projectId) {
            return {
                status: 'mismatch',
                authoritative: false,
                expectedProjectId: rawId,
                code: 'PROJECT_ID_MISMATCH',
                message: `Expected project id ${rawId}, but this process is bound to ${input.projectId}.`,
            };
        }
        return {
            status: 'unverified',
            authoritative: false,
            expectedProjectId: rawId,
            message: 'project.expectedProjectId matched or could not be compared, but expectedRoot is required for an authoritative workspace binding.',
        };
    }
    const relation = input.expectedRootRelation ?? 'unknown';
    if (relation === 'outside') {
        return {
            status: 'mismatch',
            authoritative: false,
            expectedRoot: rawRoot,
            expectedProjectId: rawId,
            code: 'PROJECT_ROOT_MISMATCH',
            message: `Expected workspace ${rawRoot}, but this process is bound to ${input.resolvedRoot}.`,
        };
    }
    if (relation === 'unknown') {
        return {
            status: 'unverified',
            authoritative: false,
            expectedRoot: rawRoot,
            expectedProjectId: rawId,
            message: 'Could not prove expectedRoot against the resolved project root (stale or incomplete path evidence).',
        };
    }
    if (relation === 'descendant' && rawId === undefined) {
        return {
            status: 'unverified',
            authoritative: false,
            expectedRoot: rawRoot,
            message: `Expected workspace ${rawRoot} is inside this project, but an exact project root is required for the initial authoritative handshake.`,
        };
    }
    if (rawId !== undefined && input.projectId && rawId !== input.projectId) {
        return {
            status: 'mismatch',
            authoritative: false,
            expectedRoot: rawRoot,
            expectedProjectId: rawId,
            code: 'PROJECT_ID_MISMATCH',
            message: `Expected project id ${rawId}, but this process is bound to ${input.projectId}.`,
        };
    }
    if (relation === 'exact' || (relation === 'descendant' && rawId && rawId === input.projectId)) {
        return {
            status: 'matched',
            authoritative: true,
            ...(rawRoot ? { expectedRoot: rawRoot } : {}),
            ...(rawId ? { expectedProjectId: rawId } : {}),
        };
    }
    return {
        status: 'unverified',
        authoritative: false,
        expectedRoot: rawRoot,
        expectedProjectId: rawId,
        message: 'Project expectation could not be fully verified.',
    };
}
/**
 * Map write-path evidence to the closed activation writePath vocabulary.
 * Soft hosts never become hard; missing analysis → unavailable.
 */
export function classifyStatusWritePath(input) {
    if (input.writePathUnavailable === true)
        return 'unavailable';
    if (input.softWriteHost === true)
        return 'advisory';
    if (input.hardWriteActive === true)
        return 'hard';
    // Hard-capable host without proven hard → advisory (honest, not hard).
    const host = typeof input.activeHost === 'string' ? input.activeHost.trim().toLowerCase() : '';
    if (!host || host === 'unknown')
        return 'unavailable';
    return 'advisory';
}
export function defaultHonestLabel(writePath, host) {
    const hostLabel = host && host !== 'unknown' ? host : 'unknown-host';
    if (writePath === 'hard') {
        return `Local write is hard for ${hostLabel} when the covered PreToolUse path is active; CI --strict-merge remains the merge backstop.`;
    }
    if (writePath === 'advisory') {
        return `Local write is advisory for ${hostLabel}; hard merge boundary is a required status running arkgate-check --strict-merge (alias ark-check).`;
    }
    return 'Write-path activation is unavailable or unverified for this invocation (no active host / incomplete evidence).';
}
/**
 * Deterministic next action from residual facts (no LLM).
 * Prefer explicit override from productHonesty when provided.
 */
export function resolveStatusNextAction(facts, binding, activation, lastCheck, rules) {
    if (facts.nextActionOverride?.id && facts.nextActionOverride.summary) {
        return {
            id: facts.nextActionOverride.id,
            summary: facts.nextActionOverride.summary,
        };
    }
    if (binding.status === 'mismatch') {
        return {
            id: 'rebind-project-identity',
            summary: binding.message ||
                'Project expectation does not match this process — call ark_identity / ark status with the correct expectedRoot (and projectId for descendants).',
        };
    }
    if (binding.status === 'unverified' && facts.expectation) {
        return {
            id: 'complete-identity-handshake',
            summary: binding.message ||
                'Supply project.expectedRoot at the exact project root (and expectedProjectId for descendants) for authoritative status.',
        };
    }
    if (!facts.resolvedConfigPath) {
        return {
            id: 'run-ark-start',
            summary: 'No ark.config.json found — run ark start (preview) then ark start --apply.',
        };
    }
    if (lastCheck.verdict === 'fail' || (lastCheck.activeViolations ?? 0) > 0) {
        return {
            id: 'fix-active-violations',
            summary: `Clear ${lastCheck.activeViolations ?? 'active'} blocking architecture finding(s), then re-run ark-check (or ark-check --doctor).`,
        };
    }
    if (lastCheck.verdict === 'incomplete') {
        return {
            id: 'restore-complete-analysis',
            summary: 'Last check was incomplete — restore TypeScript/analysis inputs and re-run ark-check.',
        };
    }
    if (lastCheck.verdict == null && lastCheck.at == null) {
        return {
            id: 'run-ark-check',
            summary: 'No last-check snapshot yet — run ark-check --report (or --doctor) to freeze session evidence.',
        };
    }
    if (activation.writePath === 'unavailable') {
        return {
            id: 'install-write-path',
            summary: 'Write path is unavailable — install agent gates for your host (ark start / --install-agent-gates) and keep required CI --strict-merge.',
        };
    }
    if (activation.writePath === 'advisory') {
        return {
            id: 'keep-ci-merge-hard',
            summary: 'Local write is advisory for this host — keep a required GitHub status on arkgate-check --strict-merge as the hard merge boundary.',
        };
    }
    if (rules.arkRulesLoaded && (rules.frozenResidual ?? 0) > 0) {
        return {
            id: 'review-arkrules-residual',
            summary: 'ArkRules residual remains frozen — review inventory debt without claiming a score.',
        };
    }
    return {
        id: 'stay-enforced',
        summary: 'Contract looks enforceable for this session — keep writing through the gate and re-check after structural edits.',
    };
}
export function buildStatusManifest(facts) {
    const resolvedRoot = typeof facts.resolvedRoot === 'string' && facts.resolvedRoot.length > 0
        ? facts.resolvedRoot
        : '.';
    const projectId = typeof facts.projectId === 'string' && PROJECT_ID_PATTERN.test(facts.projectId)
        ? facts.projectId
        : null;
    const binding = evaluateStatusBinding({
        resolvedRoot,
        projectId,
        expectation: facts.expectation,
        expectedRootRelation: facts.expectedRootRelation,
    });
    const hostRaw = typeof facts.activeHost === 'string' ? facts.activeHost.trim().toLowerCase() : '';
    const host = hostRaw && hostRaw !== 'unknown' ? hostRaw : hostRaw === 'unknown' ? 'unknown' : null;
    const writePath = classifyStatusWritePath({
        hardWriteActive: facts.hardWriteActive,
        softWriteHost: facts.softWriteHost,
        writePathUnavailable: facts.writePathUnavailable,
        activeHost: host,
    });
    const honestLabel = typeof facts.honestLabel === 'string' && facts.honestLabel.trim().length > 0
        ? facts.honestLabel.trim()
        : defaultHonestLabel(writePath, host);
    const lastCheck = {
        at: typeof facts.lastCheckAt === 'string' ? facts.lastCheckAt : null,
        verdict: facts.lastCheckVerdict === 'pass' ||
            facts.lastCheckVerdict === 'fail' ||
            facts.lastCheckVerdict === 'incomplete'
            ? facts.lastCheckVerdict
            : null,
        activeViolations: numberOrNull(facts.activeViolations),
        frozenResidual: numberOrNull(facts.frozenResidual),
    };
    const rules = {
        arkRulesLoaded: facts.arkRulesLoaded === true,
        inventoried: numberOrNull(facts.rulesInventoried),
        underContract: numberOrNull(facts.rulesUnderContract),
        frozenResidual: numberOrNull(facts.rulesFrozenResidual),
    };
    const activation = {
        writePath,
        host,
        honestLabel,
    };
    const projectIdentity = {
        projectId,
        resolvedRoot,
        resolvedConfigPath: typeof facts.resolvedConfigPath === 'string' && facts.resolvedConfigPath.length > 0
            ? facts.resolvedConfigPath
            : null,
        binding: binding.status,
        authoritative: binding.authoritative,
        ...(binding.code ? { code: binding.code } : {}),
        ...(binding.message ? { message: binding.message } : {}),
    };
    const status = {
        schemaVersion: ARK_STATUS_MANIFEST_SCHEMA_VERSION,
        arkgateVersion: typeof facts.arkgateVersion === 'string' && facts.arkgateVersion.length > 0
            ? facts.arkgateVersion
            : 'unknown',
        projectIdentity,
        activation,
        lastCheck,
        rules,
        nextAction: resolveStatusNextAction(facts, binding, activation, lastCheck, rules),
    };
    const compass = normalizeStatusImprovementCompass(facts.improvementCompass);
    if (compass)
        status.improvementCompass = compass;
    if (facts.vsBase && typeof facts.vsBase.baseRef === 'string' && facts.vsBase.baseRef.length > 0) {
        status.vsBase = facts.vsBase;
    }
    return status;
}
const STATUS_COMPASS_MODE_SET = new Set(STATUS_COMPASS_MODES);
const STATUS_COMPASS_SOURCE_SET = new Set(STATUS_COMPASS_FACTS_SOURCES);
/**
 * Project a thin status improvementCompass with explicit honesty mode (DF02).
 *
 * Rules:
 * - always notAScore: true
 * - mode full | subset | unavailable (invalid mode → unavailable)
 * - unavailable: topResidual forced empty (never invent residual or silent green)
 * - full/subset: residual ids from input only (never fabricate ok lenses)
 * - never carries valid / goal.met / score fields
 */
export function projectStatusImprovementCompass(input) {
    const mode = STATUS_COMPASS_MODE_SET.has(input.mode)
        ? input.mode
        : 'unavailable';
    const factsSource = input.factsSource != null && STATUS_COMPASS_SOURCE_SET.has(input.factsSource)
        ? input.factsSource
        : mode === 'unavailable'
            ? 'none'
            : undefined;
    const contractHash = typeof input.contractHash === 'string' && input.contractHash.length > 0
        ? input.contractHash
        : undefined;
    if (mode === 'unavailable') {
        const out = {
            schemaVersion: '1.0',
            notAScore: true,
            mode: 'unavailable',
            topResidual: [],
            reasonCode: typeof input.reasonCode === 'string' && input.reasonCode.length > 0
                ? input.reasonCode
                : STATUS_COMPASS_REASON_CODES.FACTS_UNAVAILABLE,
            reason: typeof input.reason === 'string' && input.reason.length > 0
                ? input.reason
                : 'Improvement compass facts are unavailable — run ark-check --doctor for residual lenses. Status never invents green.',
            factsSource: factsSource ?? 'none',
        };
        if (contractHash)
            out.contractHash = contractHash;
        return out;
    }
    const topResidual = Array.isArray(input.topResidual)
        ? input.topResidual
            .filter((id) => typeof id === 'string' && id.length > 0)
            .slice(0, 15)
        : [];
    const out = {
        schemaVersion: '1.0',
        notAScore: true,
        mode,
        topResidual,
    };
    if (mode === 'subset') {
        out.reasonCode =
            typeof input.reasonCode === 'string' && input.reasonCode.length > 0
                ? input.reasonCode
                : STATUS_COMPASS_REASON_CODES.FACTS_PARTIAL;
        out.reason =
            typeof input.reason === 'string' && input.reason.length > 0
                ? input.reason
                : 'Status compass is a subset of doctor residual — incomplete session facts; run doctor for full.';
    }
    else if (typeof input.reasonCode === 'string' && input.reasonCode.length > 0) {
        out.reasonCode = input.reasonCode;
    }
    if (typeof input.reason === 'string' && input.reason.length > 0 && mode === 'full') {
        out.reason = input.reason;
    }
    if (factsSource)
        out.factsSource = factsSource;
    if (contractHash)
        out.contractHash = contractHash;
    return out;
}
/**
 * Unavailable compass when Tooling has no doctor/report residual facts.
 * Empty residual + mode label — never a green / ok claim.
 */
export function unavailableStatusImprovementCompass(input = {}) {
    return projectStatusImprovementCompass({
        mode: 'unavailable',
        topResidual: [],
        reasonCode: input.reasonCode ?? STATUS_COMPASS_REASON_CODES.NO_SESSION_SNAPSHOT,
        reason: input.reason ??
            'No session compass facts yet — run ark-check --doctor or --report for residual lenses. Status never invents green.',
        factsSource: 'none',
        contractHash: input.contractHash,
    });
}
/**
 * Normalize an incoming status compass slice (Tooling pass-through / snapshot).
 * Rejects score-like shapes; coerces missing mode to subset (never silent full).
 * Unavailable always clears residual.
 */
export function normalizeStatusImprovementCompass(value) {
    if (value == null || typeof value !== 'object')
        return null;
    const record = value;
    if (record.notAScore !== true)
        return null;
    if (record.schemaVersion !== '1.0')
        return null;
    // Score-like fields never allowed on status compass.
    if ('score' in record || 'valid' in record || 'goal' in record)
        return null;
    let mode;
    if (typeof record.mode === 'string' && STATUS_COMPASS_MODE_SET.has(record.mode)) {
        mode = record.mode;
    }
    else if (Array.isArray(record.topResidual)) {
        // Legacy thin slice without mode → subset honesty (never silent full).
        mode = 'subset';
    }
    else {
        mode = 'unavailable';
    }
    return projectStatusImprovementCompass({
        mode,
        topResidual: Array.isArray(record.topResidual)
            ? record.topResidual
            : [],
        reasonCode: typeof record.reasonCode === 'string' ? record.reasonCode : null,
        reason: typeof record.reason === 'string' ? record.reason : null,
        factsSource: typeof record.factsSource === 'string' ? record.factsSource : null,
        contractHash: typeof record.contractHash === 'string' ? record.contractHash : null,
    });
}
/**
 * Residual-id subset check for status ⊆ doctor parity fixtures (DF02).
 * Returns true when every status residual id appears in doctor residual ids.
 */
export function statusCompassResidualIsSubsetOfDoctor(statusResidual, doctorResidual) {
    const status = Array.isArray(statusResidual) ? statusResidual : [];
    const doctor = new Set(Array.isArray(doctorResidual) ? doctorResidual : []);
    for (const id of status) {
        if (typeof id !== 'string' || id.length === 0)
            continue;
        if (!doctor.has(id))
            return false;
    }
    return true;
}
function numberOrNull(value) {
    if (value == null)
        return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0)
        return null;
    return Math.floor(n);
}
/** JSON Schema for the public status manifest (package export + agents). */
export const ARK_STATUS_MANIFEST_SCHEMA = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: ARK_STATUS_MANIFEST_SCHEMA_URL,
    title: 'ArkGate status manifest',
    description: 'Unified session/project status snapshot for agents (identity, activation honesty, last check, rules counts, next action). Not a score.',
    type: 'object',
    additionalProperties: false,
    required: [
        'schemaVersion',
        'arkgateVersion',
        'projectIdentity',
        'activation',
        'lastCheck',
        'rules',
        'nextAction',
    ],
    properties: {
        schemaVersion: { const: ARK_STATUS_MANIFEST_SCHEMA_VERSION },
        arkgateVersion: { type: 'string', minLength: 1 },
        projectIdentity: {
            type: 'object',
            additionalProperties: false,
            required: [
                'projectId',
                'resolvedRoot',
                'resolvedConfigPath',
                'binding',
                'authoritative',
            ],
            properties: {
                projectId: {
                    anyOf: [
                        { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
                        { type: 'null' },
                    ],
                },
                resolvedRoot: { type: 'string', minLength: 1 },
                resolvedConfigPath: { anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
                binding: { enum: ['matched', 'unverified', 'mismatch'] },
                authoritative: { type: 'boolean' },
                code: {
                    enum: [
                        'PROJECT_ROOT_MISMATCH',
                        'PROJECT_ID_MISMATCH',
                        'INVALID_PROJECT_EXPECTATION',
                    ],
                },
                message: { type: 'string', minLength: 1 },
            },
        },
        activation: {
            type: 'object',
            additionalProperties: false,
            required: ['writePath', 'host', 'honestLabel'],
            properties: {
                writePath: { enum: ['hard', 'advisory', 'unavailable'] },
                host: { anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
                honestLabel: { type: 'string', minLength: 1 },
            },
        },
        lastCheck: {
            type: 'object',
            additionalProperties: false,
            required: ['at', 'verdict', 'activeViolations', 'frozenResidual'],
            properties: {
                at: { anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
                verdict: { anyOf: [{ enum: ['pass', 'fail', 'incomplete'] }, { type: 'null' }] },
                activeViolations: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
                frozenResidual: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
            },
        },
        rules: {
            type: 'object',
            additionalProperties: false,
            required: ['arkRulesLoaded', 'inventoried', 'underContract', 'frozenResidual'],
            properties: {
                arkRulesLoaded: { type: 'boolean' },
                inventoried: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
                underContract: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
                frozenResidual: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
            },
        },
        nextAction: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'summary'],
            properties: {
                id: { type: 'string', minLength: 1 },
                summary: { type: 'string', minLength: 1 },
            },
        },
        improvementCompass: {
            type: 'object',
            description: 'Thin improvement-compass residual ids with honesty mode (notAScore). full | subset | unavailable. Never a gate input; full lenses on doctor JSON. When full, residual ids ⊆ doctor residual for the same facts. unavailable never invents green residual.',
            additionalProperties: false,
            required: ['schemaVersion', 'notAScore', 'mode', 'topResidual'],
            properties: {
                schemaVersion: { const: '1.0' },
                notAScore: { const: true },
                mode: { enum: ['full', 'subset', 'unavailable'] },
                topResidual: {
                    type: 'array',
                    items: { type: 'string', minLength: 1 },
                    maxItems: 15,
                },
                reasonCode: { type: 'string', minLength: 1 },
                reason: { type: 'string', minLength: 1 },
                factsSource: { enum: ['doctor-facts', 'report-snapshot', 'none'] },
                contractHash: { type: 'string', minLength: 1 },
            },
        },
        vsBase: {
            type: 'object',
            description: 'Checkout vs a git base ref: pin, contract identity, baseline grow. Advisory honesty only — never a gate input.',
            additionalProperties: false,
            required: ['baseRef', 'line', 'pinLocal', 'pinBase', 'contractEqual', 'baselineGrew'],
            properties: {
                baseRef: { type: 'string', minLength: 1 },
                line: { type: 'string', minLength: 1 },
                pinLocal: { anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
                pinBase: { anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
                contractEqual: { type: 'boolean' },
                baselineGrew: { type: 'boolean' },
            },
        },
    },
};
