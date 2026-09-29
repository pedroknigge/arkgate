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
  classifyIngest,
  createFrozenRelease,
  DEFAULT_MAX_XI_KEYS,
  fieldEventIdentity,
  freezeRecord,
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
import { rehydrateRelease } from './releaseIntegrity';
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
  /**
   * Reinstall a validated Release (frozen or JSON-deserialized; hash is identity).
   * On a live plane it never changes ξ and accepts only the current version or the
   * next one (no rollback, no jump) — a pattern change is proposeRelease then apply.
   * A freeze time after the plane clock fails closed. Not durable; does not close K01.
   */
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
  const catalogDigest = options.catalogDigest;
  const integrity = (now: number) => ({
    maxXiKeys,
    xiSchema: options.xiSchema,
    catalogDigest,
    now,
  });
  // ADR 0034 D8: a stored Release is validated exactly like restore() — fail closed.
  const loaded: unknown = store ? store.load() : null;
  let current: Release | null =
    loaded === null || loaded === undefined
      ? null
      : rehydrateRelease(loaded, integrity(clock.now()), 'ReleaseStore.load()');
  let version = current?.version ?? 0;

  /** Save first; the plane advances only after the store accepted the Release. */
  function persist(next: Release): Release {
    store?.save(next);
    current = next;
    version = next.version;
    return next;
  }

  /** A Release whose projection the information budget denies is never persisted. */
  function withinBudget(candidate: Release): Release {
    assertInformationBudget(
      options.projector(candidate, candidate.sigma),
      options.informationBudget
    );
    return candidate;
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
        withinBudget(
          createFrozenRelease({
            xi,
            sigma,
            version: version + 1,
            now: clock.now(),
            maxXiKeys,
            xiSchema: options.xiSchema,
            catalogDigest,
          })
        )
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
        informationBudget: options.informationBudget,
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
          informationBudget: options.informationBudget,
        })
      );
    },
    refreshSigma(sigma) {
      return persist(
        withinBudget(
          refreshSigmaRecord({
            current: requireCurrent(),
            sigma,
            now: clock.now(),
            catalogDigest,
          })
        )
      );
    },
    restore(release) {
      const candidate = rehydrateRelease(release, integrity(clock.now()));
      if (current) {
        // ξ changes only through the valve (proposeRelease -> apply).
        assertUnvalvedRelease(current, candidate.xi);
        // Only a Release this plane's own verbs could reach: the current version
        // (refreshSigma) or the next one (a same-ξ release()). No rollback, no jump.
        if (candidate.version < current.version || candidate.version > current.version + 1) {
          throw new ArkOrderError(
            'ARKORDER_UNVALVED_RELEASE',
            `restore() on a live plane accepts version ${current.version} or ${current.version + 1}, got ${candidate.version}; change the pattern with proposeRelease then apply`
          );
        }
      }
      return persist(withinBudget(candidate));
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
