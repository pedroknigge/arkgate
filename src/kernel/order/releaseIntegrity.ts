/**
 * Release integrity for the two install paths that do not mint a Release:
 * `ReleaseStore.load()` at construction and `restore()`. Both accept a frozen
 * Release or a JSON-deserialized copy; both fail closed on tampering.
 * Not durable; does not close K01.
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
};

function closed(origin: string): ArkOrderError {
  return new ArkOrderError(
    'ARKORDER_SCHEMA',
    `${origin} requires a valid Release; hash is the identity (not durable, not K01)`
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate a candidate Release and return a canonical deep-frozen copy.
 * Checks shape, primitive ξ/σ (no nested or non-finite values), key cap, no TTL on ξ,
 * xiSchema, and all three recomputed hashes.
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
  // freezeRecord rejects nested / non-finite values with ARKORDER_NESTED_XI.
  assertXiKeyCap(candidate.xi, options.maxXiKeys);
  const xi = freezeRecord(candidate.xi, 'ξ');
  const sigma = freezeRecord(sigmaInput, 'σ');
  assertXiHasNoTtl(xi);
  assertXiSchema(xi, options.xiSchema);
  if (
    hash !== hashReleasePayload(xi, sigma, options.catalogDigest) ||
    xiHash !== hashXiIdentity(xi, options.catalogDigest) ||
    sigmaHash !== hashSigmaIdentity(sigma)
  ) {
    throw closed(origin);
  }
  return Object.freeze({ version, hash, xiHash, sigmaHash, xi, sigma, releasedAt });
}
