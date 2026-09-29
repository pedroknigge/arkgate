/**
 * Release integrity for the two install paths that do not mint a Release:
 * `ReleaseStore.load()` at construction and `restore()`. Both accept a frozen
 * Release or a JSON-deserialized copy and fail closed on an inconsistent one:
 * the three hashes are recomputed from ξ / σ, and the unhashed clock fields are
 * bounded — `releasedAt` (and a numeric σ.releasedAt) may not lie in the future of
 * the plane clock, so a rewritten timestamp cannot switch off σ staleness.
 * The hashes are a consistency check, not a signature: a writer who controls the
 * store can recompute them. Authenticity and durability stay the store's job
 * (not K01). Version continuity on a live plane is checked by restore().
 */
import { ArkOrderError } from '../../domain/arkOrderError';
import {
  assertXiHasNoTtl,
  assertXiKeyCap,
  assertXiSchema,
  freezeRecord,
  hashReleasePayload,
  hashSigmaIdentity,
  hashXiIdentity,
} from '../../domain/arkOrderInvariants';
import type { Release, XiSchema } from '../../domain/arkOrderTypes';

export type ReleaseIntegrityOptions = {
  maxXiKeys: number;
  xiSchema: XiSchema | undefined;
  catalogDigest: string | undefined;
  /** Plane clock reading; a Release may not claim a freeze time after it. */
  now: number;
};

function closed(origin: string, detail = ''): ArkOrderError {
  return new ArkOrderError(
    'ARKORDER_SCHEMA',
    `${origin} requires a valid Release${detail}; hash is the identity (not durable, not K01)`
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate a candidate Release and return a canonical deep-frozen copy.
 * Checks shape, primitive ξ/σ (no nested or non-finite values), key cap, no TTL on ξ,
 * xiSchema, all three recomputed hashes, and no freeze time after `options.now`.
 */
export function rehydrateRelease(
  candidate: unknown,
  options: ReleaseIntegrityOptions,
  origin = 'restore()'
): Release {
  if (!isPlainRecord(candidate) || !isPlainRecord(candidate.xi)) throw closed(origin);
  const sigmaInput = candidate.sigma ?? {};
  if (!isPlainRecord(sigmaInput)) throw closed(origin);
  const { version, hash, xiHash, sigmaHash, releasedAt } = candidate;
  if (
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < 1 ||
    typeof hash !== 'string' ||
    hash.length === 0 ||
    typeof xiHash !== 'string' ||
    typeof sigmaHash !== 'string' ||
    typeof releasedAt !== 'number' ||
    !Number.isFinite(releasedAt)
  ) {
    throw closed(origin);
  }
  if (releasedAt > options.now) {
    throw closed(origin, ` (releasedAt ${releasedAt} is after the plane clock ${options.now})`);
  }
  // freezeRecord rejects nested / non-finite values with ARKORDER_NESTED_XI.
  assertXiKeyCap(candidate.xi, options.maxXiKeys);
  const xi = freezeRecord(candidate.xi, 'ξ');
  const sigma = freezeRecord(sigmaInput, 'σ');
  assertXiHasNoTtl(xi);
  assertXiSchema(xi, options.xiSchema);
  if (typeof sigma.releasedAt === 'number' && sigma.releasedAt > options.now) {
    throw closed(origin, ` (σ.releasedAt ${sigma.releasedAt} is after the plane clock ${options.now})`);
  }
  if (
    hash !== hashReleasePayload(xi, sigma, options.catalogDigest) ||
    xiHash !== hashXiIdentity(xi, options.catalogDigest) ||
    sigmaHash !== hashSigmaIdentity(sigma)
  ) {
    throw closed(origin);
  }
  return Object.freeze({ version, hash, xiHash, sigmaHash, xi, sigma, releasedAt });
}
