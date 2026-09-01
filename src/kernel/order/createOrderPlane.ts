/**
 * ArkOrder plane factory (ADR 0028 / 0030 / 0034). Haken slaving at the call site:
 * first release freezes ξ; later ξ change is proposeRelease then apply;
 * project derives s; ingest never returns a Release; empty blast fails.
 */
import { ArkOrderError } from '../../domain/arkOrderError';
import {
  applyProposedRelease,
  assertInformationBudget,
  assertSigmaFresh,
  assertUnvalvedRelease,
  assertXiHasNoTtl,
  assertXiKeyCap,
  assertXiSchema,
  classifyIngest,
  createFrozenRelease,
  DEFAULT_MAX_XI_KEYS,
  fieldEventIdentity,
  freezeRecord,
  hashReleasePayload,
  hashSigmaIdentity,
  hashXiIdentity,
  isForbiddenPlaneMethod,
  proposePatternChange,
  refreshSigmaRecord,
} from '../../domain/arkOrderInvariants';
import type {
  ConstraintPack,
  FieldEvent,
  InformationBudget,
  IngestResult,
  InjectedClock,
  Projection,
  Projector,
  ProposeResult,
  Release,
  XiSchema,
} from '../../domain/arkOrderTypes';
import type { ReleaseStore } from './releaseStore';

export type CreateOrderPlaneOptions = {
  projector: Projector;
  xiSchema?: XiSchema;
  maxXiKeys?: number;
  clocks?: InjectedClock;
  packs?: readonly ConstraintPack[];
  informationBudget?: InformationBudget;
  sigmaMaxAgeMs?: number;
  /** Injected. Default is process-local memory — not durable, not K01. */
  store?: ReleaseStore;
  /** Optional catalog digest keyed by ξ.catalogReleaseId. SKU set does not enter the hash. */
  catalogDigest?: string;
};

export type OrderPlane = {
  release(xi: Record<string, unknown>, sigma?: Record<string, unknown>): Release;
  project(): Projection;
  ingest(event: FieldEvent): IngestResult;
  proposeRelease(delta: Record<string, unknown>): ProposeResult;
  apply(proposal: ProposeResult): Release;
  refreshSigma(sigma: Record<string, unknown>): Release;
  /** Process-local install of a frozen Release. Hash is identity. Not durable; does not close K01. */
  restore(release: Release): Release;
  current(): Release | null;
};

export function createOrderPlane(options: CreateOrderPlaneOptions): OrderPlane {
  if (typeof options?.projector !== 'function') {
    throw new ArkOrderError('ARKORDER_SCHEMA', 'createOrderPlane requires a consumer projector h(ξ)');
  }
  const maxXiKeys =
    typeof options.maxXiKeys === 'number' && options.maxXiKeys > 0
      ? options.maxXiKeys
      : DEFAULT_MAX_XI_KEYS;
  const packs = options.packs ?? [];
  const clock: InjectedClock = options.clocks ?? {
    now() {
      return Date.now();
    },
  };
  const store = options.store;
  let current: Release | null = store?.load() ?? null;
  let version = current?.version ?? 0;
  const catalogDigest = options.catalogDigest;

  function persist(next: Release): Release {
    current = next;
    version = next.version;
    store?.save(next);
    return next;
  }

  function requireCurrent(): Release {
    if (!current) {
      throw new ArkOrderError('ARKORDER_NO_RELEASE', 'no pattern is frozen; call release(ξ) first');
    }
    return current;
  }

  const plane: OrderPlane = {
    release(xi, sigma) {
      if (current) {
        assertUnvalvedRelease(current, freezeRecord(xi, 'ξ'));
      }
      return persist(
        createFrozenRelease({
          xi,
          sigma,
          version: version + 1,
          now: clock.now(),
          maxXiKeys,
          xiSchema: options.xiSchema,
          catalogDigest,
        })
      );
    },
    project() {
      const release = requireCurrent();
      const projection = options.projector(release, release.sigma);
      assertInformationBudget(projection, options.informationBudget);
      return projection;
    },
    ingest(event) {
      const release = requireCurrent();
      try {
        assertSigmaFresh({
          sigma: release.sigma,
          now: clock.now(),
          maxAgeMs: options.sigmaMaxAgeMs,
          releasedAt: release.releasedAt,
        });
      } catch (error) {
        if (error instanceof ArkOrderError && error.code === 'ARKORDER_STALE_SIGMA') {
          return {
            kind: 'hold' as const,
            event,
            xiHash: release.xiHash,
            eventId: fieldEventIdentity(event),
            reasonCode: 'stale-sigma' as const,
            reason: error.message,
          };
        }
        throw error;
      }
      const projection = options.projector(release, release.sigma);
      assertInformationBudget(projection, options.informationBudget);
      return classifyIngest(projection, event, packs, release.xiHash, release.sigma);
    },
    proposeRelease(delta) {
      return proposePatternChange({
        current: requireCurrent(),
        delta,
        projector: options.projector,
        maxXiKeys,
        xiSchema: options.xiSchema,
        now: clock.now(),
        catalogDigest,
      });
    },
    apply(proposal) {
      return persist(
        applyProposedRelease({
          current: requireCurrent(),
          proposal,
          projector: options.projector,
          maxXiKeys,
          xiSchema: options.xiSchema,
          now: clock.now(),
          catalogDigest,
        })
      );
    },
    refreshSigma(sigma) {
      return persist(
        refreshSigmaRecord({
          current: requireCurrent(),
          sigma,
          now: clock.now(),
          catalogDigest,
        })
      );
    },
    restore(release) {
      return persist(assertRestorableRelease(release, maxXiKeys, options.xiSchema, catalogDigest));
    },
    current() {
      return current;
    },
  };

  for (const name of ['update', 'patch', 'set', 'mutate'] as const) {
    Object.defineProperty(plane, name, {
      enumerable: false,
      configurable: false,
      get() {
        throw new ArkOrderError(
          'ARKORDER_FORBIDDEN_METHOD',
          `${name}() is not a Haken operation; freeze a pattern with release() or proposeRelease()`
        );
      },
    });
  }
  void isForbiddenPlaneMethod;
  return Object.freeze(plane);
}

function assertRestorableRelease(
  candidate: unknown,
  maxXiKeys: number,
  xiSchema: XiSchema | undefined,
  catalogDigest: string | undefined
): Release {
  const closed = () =>
    new ArkOrderError(
      'ARKORDER_SCHEMA',
      'restore() requires a frozen Release; hash is the identity (not durable, not K01)'
    );
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw closed();
  }
  const release = candidate as Release;
  if (
    !Object.isFrozen(release) ||
    !release.xi ||
    typeof release.xi !== 'object' ||
    Array.isArray(release.xi) ||
    !Object.isFrozen(release.xi) ||
    !release.sigma ||
    typeof release.sigma !== 'object' ||
    Array.isArray(release.sigma) ||
    !Object.isFrozen(release.sigma)
  ) {
    throw closed();
  }
  if (
    typeof release.version !== 'number' ||
    !Number.isInteger(release.version) ||
    release.version < 1 ||
    typeof release.hash !== 'string' ||
    release.hash.length === 0 ||
    typeof release.xiHash !== 'string' ||
    typeof release.sigmaHash !== 'string' ||
    typeof release.releasedAt !== 'number' ||
    !Number.isFinite(release.releasedAt)
  ) {
    throw closed();
  }
  try {
    assertXiKeyCap(release.xi, maxXiKeys);
    assertXiHasNoTtl(release.xi);
    assertXiSchema(release.xi, xiSchema);
  } catch (error) {
    if (error instanceof ArkOrderError) throw error;
    throw closed();
  }
  const expectedHash = hashReleasePayload(release.xi, release.sigma, catalogDigest);
  const expectedXi = hashXiIdentity(release.xi, catalogDigest);
  const expectedSigma = hashSigmaIdentity(release.sigma);
  if (
    release.hash !== expectedHash ||
    release.xiHash !== expectedXi ||
    release.sigmaHash !== expectedSigma
  ) {
    throw closed();
  }
  return release;
}
