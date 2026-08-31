/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/arkOrderInvariants.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/ark-order-invariants.mjs). Zero Node I/O.
 */

import { ArkOrderError } from './ark-order-error.mjs';
import { CAPACITY_OPS, DEFAULT_MAX_XI_KEYS } from './ark-order-types.mjs';
import { deterministicHash, stableSerialize } from './stableHash';
export { DEFAULT_MAX_XI_KEYS };
/** D7: consumer still owns handlers — this only names the travel verb. */
export function ingestTravelAction(residual) {
    if (residual.kind === 'absorb')
        return 'send';
    if (residual.kind === 'escalate_up' && residual.target === 'human')
        return 'raises';
    return 'none';
}
const FORBIDDEN_PLANE_METHODS = ['update', 'patch', 'set', 'mutate'];
export function isForbiddenPlaneMethod(name) {
    return FORBIDDEN_PLANE_METHODS.includes(name);
}
function isPrimitive(value) {
    return (value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean');
}
export function freezeRecord(input, label) {
    const keys = Object.keys(input);
    if (keys.length === 0 && label === 'ξ') {
        throw new ArkOrderError('ARKORDER_EMPTY_XI', 'ξ must name at least one slow mode');
    }
    const out = {};
    for (const key of keys.sort()) {
        const value = input[key];
        if (!isPrimitive(value)) {
            throw new ArkOrderError('ARKORDER_NESTED_XI', `${label} key ${JSON.stringify(key)} is not a slow primitive (nested values are microstate)`);
        }
        out[key] = value;
    }
    return Object.freeze(out);
}
export function assertXiKeyCap(xi, maxXiKeys) {
    const n = Object.keys(xi).length;
    if (n === 0) {
        throw new ArkOrderError('ARKORDER_EMPTY_XI', 'ξ must name at least one slow mode');
    }
    if (n > maxXiKeys) {
        throw new ArkOrderError('ARKORDER_TOO_MANY_PARAMS', `ξ has ${n} keys; maxXiKeys is ${maxXiKeys} (Haken: few slow modes)`);
    }
}
export function assertXiSchema(xi, schema) {
    if (!schema)
        return;
    const properties = schema.properties ?? {};
    const additional = schema.additionalProperties !== false ? true : false;
    for (const key of Object.keys(xi)) {
        const prop = properties[key];
        if (!prop) {
            if (!additional) {
                throw new ArkOrderError('ARKORDER_SCHEMA', `ξ key ${JSON.stringify(key)} is not in xiSchema.properties`);
            }
            continue;
        }
        if (prop.enum && !prop.enum.some((allowed) => allowed === xi[key])) {
            throw new ArkOrderError('ARKORDER_SCHEMA', `ξ key ${JSON.stringify(key)} value is not in enum`);
        }
        if (prop.type === 'null' && xi[key] !== null) {
            throw new ArkOrderError('ARKORDER_SCHEMA', `ξ key ${JSON.stringify(key)} must be null`);
        }
        if (prop.type && prop.type !== 'null' && typeof xi[key] !== prop.type) {
            throw new ArkOrderError('ARKORDER_SCHEMA', `ξ key ${JSON.stringify(key)} must be ${prop.type}`);
        }
    }
}
export function hashReleasePayload(xi, sigma) {
    return deterministicHash(stableSerialize({ xi, sigma }));
}
export function hashXiIdentity(xi) {
    return deterministicHash(stableSerialize({ xi }));
}
export function hashSigmaIdentity(sigma) {
    return deterministicHash(stableSerialize({ sigma }));
}
export function xiRecordsEqual(left, right) {
    return stableSerialize(left) === stableSerialize(right);
}
/** D1: after the first freeze, a later release() may not change ξ. */
export function assertUnvalvedRelease(current, nextXi) {
    if (!current)
        return;
    if (xiRecordsEqual(current.xi, nextXi))
        return;
    throw new ArkOrderError('ARKORDER_UNVALVED_RELEASE', 'ξ is frozen; change the pattern with proposeRelease then apply(ProposeResult)');
}
export function createFrozenRelease(input) {
    assertXiKeyCap(input.xi, input.maxXiKeys);
    const xi = freezeRecord(input.xi, 'ξ');
    assertXiHasNoTtl(xi);
    assertXiSchema(xi, input.xiSchema);
    const sigma = freezeRecord(input.sigma ?? {}, 'σ');
    const release = Object.freeze({
        version: input.version,
        hash: hashReleasePayload(xi, sigma),
        xiHash: hashXiIdentity(xi),
        sigmaHash: hashSigmaIdentity(sigma),
        xi,
        sigma,
        releasedAt: input.now,
    });
    return release;
}
/** D2: refresh σ without minting a pattern. xiHash must not change. */
export function refreshSigmaRecord(input) {
    const sigma = freezeRecord(input.sigma, 'σ');
    return Object.freeze({
        version: input.current.version,
        hash: hashReleasePayload(input.current.xi, sigma),
        xiHash: input.current.xiHash,
        sigmaHash: hashSigmaIdentity(sigma),
        xi: input.current.xi,
        sigma,
        releasedAt: input.now,
    });
}
const XI_TTL_KEY_RE = /^(ttl|freshUntil|fresh_until|maxAge|max_age)$/i;
export function assertXiHasNoTtl(xi) {
    for (const key of Object.keys(xi)) {
        if (XI_TTL_KEY_RE.test(key)) {
            throw new ArkOrderError('ARKORDER_XI_TTL', `ξ key ${JSON.stringify(key)} is a freshness field; TTL belongs on σ, never on ξ`);
        }
    }
}
export function assertInformationBudget(projection, budget) {
    if (!budget || budget.cannotObserve.length === 0)
        return;
    const denied = new Set(budget.cannotObserve);
    for (const kind of projection.allowedKinds) {
        if (denied.has(kind)) {
            throw new ArkOrderError('ARKORDER_INFORMATION_BUDGET', `projection allows ${JSON.stringify(kind)}; informationBudget.cannotObserve forbids it`);
        }
    }
}
export function assertSigmaFresh(input) {
    if (input.maxAgeMs === undefined)
        return;
    const until = input.sigma.freshUntil;
    if (typeof until === 'number') {
        if (input.now > until) {
            throw new ArkOrderError('ARKORDER_STALE_SIGMA', 'σ freshUntil has elapsed; ξ does not TTL');
        }
        return;
    }
    const origin = typeof input.sigma.releasedAt === 'number' ? input.sigma.releasedAt : input.releasedAt;
    if (typeof origin === 'number' && input.now - origin > input.maxAgeMs) {
        throw new ArkOrderError('ARKORDER_STALE_SIGMA', 'σ is older than sigmaMaxAgeMs; ξ does not TTL');
    }
}
export function fieldEventIdentity(event) {
    return deterministicHash(stableSerialize({ kind: event.kind, payload: event.payload ?? null }));
}
function bindResidual(event, xiHash) {
    return { event, xiHash, eventId: fieldEventIdentity(event) };
}
const CAPACITY_OP_SET = new Set(CAPACITY_OPS);
function isCapacityOp(value) {
    return typeof value === 'string' && CAPACITY_OP_SET.has(value);
}
function numericLeaf(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function compareCapacity(left, op, right) {
    if (op === 'lte')
        return left <= right;
    if (op === 'lt')
        return left < right;
    if (op === 'gte')
        return left >= right;
    return left > right;
}
function packHasFunction(value) {
    if (typeof value === 'function')
        return true;
    if (value === null || typeof value !== 'object')
        return false;
    if (Array.isArray(value))
        return value.some(packHasFunction);
    return Object.values(value).some(packHasFunction);
}
function evaluateCapacity(event, sigma, pack) {
    const rows = pack.capacity ?? [];
    for (const row of rows) {
        if (packHasFunction(row) || !isCapacityOp(row.op))
            return 'pack';
        if (row.kind !== event.kind)
            continue;
        const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
            ? numericLeaf(event.payload[row.payloadKey])
            : undefined;
        const limit = numericLeaf(sigma[row.sigmaKey]);
        if (payload === undefined || limit === undefined)
            return 'pack';
        if (!compareCapacity(payload, row.op, limit))
            return 'capacity';
    }
    return 'ok';
}
export function classifyIngest(projection, event, packs = [], xiHash = '', sigma = Object.freeze({})) {
    const kind = event.kind;
    const bound = bindResidual(event, xiHash);
    for (const pack of packs) {
        if (packHasFunction(pack.capacity) || packHasFunction(pack.escalateKinds)) {
            return {
                ...bound,
                kind: 'hold',
                reasonCode: 'pack',
                reason: `pack ${pack.id} is not data-only; user predicates are forbidden`,
            };
        }
        if (pack.escalateKinds?.includes(kind)) {
            const target = pack.escalateTarget ?? 'human';
            return {
                ...bound,
                kind: 'escalate_up',
                reasonCode: 'pack',
                reason: `pack ${pack.id} slaves kind ${JSON.stringify(kind)} to a pattern change`,
                target,
            };
        }
    }
    if (!projection.allowedKinds.includes(kind)) {
        return {
            ...bound,
            kind: 'escalate_up',
            reasonCode: 'not-in-pattern',
            reason: `kind ${JSON.stringify(kind)} is not allowed by h(ξ); field cannot rewrite the pattern`,
            target: 'human',
        };
    }
    for (const pack of packs) {
        const cap = evaluateCapacity(event, sigma, pack);
        if (cap === 'ok')
            continue;
        return {
            ...bound,
            kind: 'hold',
            reasonCode: cap,
            reason: cap === 'capacity'
                ? `pack ${pack.id} capacity ${JSON.stringify(event.kind)} does not hold`
                : `pack ${pack.id} capacity is not numeric data`,
        };
    }
    return { ...bound, kind: 'absorb' };
}
export function blastRadiusOf(previous, next) {
    const prev = new Set(previous.allowedKinds);
    const nxt = new Set(next.allowedKinds);
    const blast = new Set();
    for (const kind of prev) {
        if (!nxt.has(kind))
            blast.add(kind);
    }
    for (const kind of nxt) {
        if (!prev.has(kind))
            blast.add(kind);
    }
    for (const item of next.invalidated)
        blast.add(item);
    return {
        blastRadius: [...blast].sort(),
        invalidations: [...next.invalidated].sort(),
    };
}
export function proposePatternChange(input) {
    const merged = { ...input.current.xi };
    for (const [key, value] of Object.entries(input.delta)) {
        if (value === undefined) {
            delete merged[key];
            continue;
        }
        merged[key] = value;
    }
    const candidate = createFrozenRelease({
        xi: merged,
        sigma: { ...input.current.sigma },
        version: input.current.version + 1,
        now: input.now,
        maxXiKeys: input.maxXiKeys,
        xiSchema: input.xiSchema,
    });
    if (candidate.hash === input.current.hash) {
        throw new ArkOrderError('ARKORDER_EMPTY_BLAST', 'delta does not change ξ; that is not a pattern change');
    }
    const previous = input.projector(input.current, input.current.sigma);
    const next = input.projector(candidate, candidate.sigma);
    const { blastRadius, invalidations } = blastRadiusOf(previous, next);
    if (blastRadius.length === 0) {
        throw new ArkOrderError('ARKORDER_EMPTY_BLAST', 'pattern change has empty blast radius; that key is not an order parameter');
    }
    return {
        nextXi: candidate.xi,
        blastRadius,
        invalidations,
    };
}
/** D1 valve: freeze ProposeResult.nextXi. Empty blast still fails. */
export function applyProposedRelease(input) {
    const candidate = createFrozenRelease({
        xi: { ...input.proposal.nextXi },
        sigma: { ...input.current.sigma },
        version: input.current.version + 1,
        now: input.now,
        maxXiKeys: input.maxXiKeys,
        xiSchema: input.xiSchema,
    });
    if (xiRecordsEqual(candidate.xi, input.current.xi)) {
        throw new ArkOrderError('ARKORDER_EMPTY_BLAST', 'delta does not change ξ; that is not a pattern change');
    }
    const previous = input.projector(input.current, input.current.sigma);
    const next = input.projector(candidate, candidate.sigma);
    const { blastRadius } = blastRadiusOf(previous, next);
    if (blastRadius.length === 0) {
        throw new ArkOrderError('ARKORDER_EMPTY_BLAST', 'pattern change has empty blast radius; that key is not an order parameter');
    }
    return candidate;
}
