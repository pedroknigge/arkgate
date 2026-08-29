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
import { DEFAULT_MAX_XI_KEYS } from './ark-order-types.mjs';
import { deterministicHash, stableSerialize } from './stableHash';
export { DEFAULT_MAX_XI_KEYS };
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
export function createFrozenRelease(input) {
    assertXiKeyCap(input.xi, input.maxXiKeys);
    const xi = freezeRecord(input.xi, 'ξ');
    assertXiSchema(xi, input.xiSchema);
    const sigma = freezeRecord(input.sigma ?? {}, 'σ');
    const release = Object.freeze({
        version: input.version,
        hash: hashReleasePayload(xi, sigma),
        xi,
        sigma,
        releasedAt: input.now,
    });
    return release;
}
export function classifyIngest(projection, event, packs = []) {
    const kind = event.kind;
    for (const pack of packs) {
        if (pack.escalateKinds?.includes(kind)) {
            return {
                kind: 'escalate',
                event,
                reason: `pack ${pack.id} slaves kind ${JSON.stringify(kind)} to a pattern change`,
            };
        }
    }
    if (projection.allowedKinds.includes(kind)) {
        return { kind: 'absorb', event };
    }
    return {
        kind: 'escalate',
        event,
        reason: `kind ${JSON.stringify(kind)} is not allowed by h(ξ); field cannot rewrite the pattern`,
    };
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
