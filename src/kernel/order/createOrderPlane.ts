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

export type CreateOrderPlaneOptions = {
  projector: Projector;
  xiSchema?: XiSchema;
  maxXiKeys?: number;
  clocks?: InjectedClock;
  packs?: readonly ConstraintPack[];
  informationBudget?: InformationBudget;
  sigmaMaxAgeMs?: number;
};

export type OrderPlane = {
  release(xi: Record<string, unknown>, sigma?: Record<string, unknown>): Release;
  project(): Projection;
  ingest(event: FieldEvent): IngestResult;
  proposeRelease(delta: Record<string, unknown>): ProposeResult;
  apply(proposal: ProposeResult): Release;
  refreshSigma(sigma: Record<string, unknown>): Release;
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
      return 0;
    },
  };
  let current: Release | null = null;
  let version = 0;

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
      const next = createFrozenRelease({
        xi,
        sigma,
        version: version + 1,
        now: clock.now(),
        maxXiKeys,
        xiSchema: options.xiSchema,
      });
      version = next.version;
      current = next;
      return current;
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
      });
    },
    apply(proposal) {
      const next = applyProposedRelease({
        current: requireCurrent(),
        proposal,
        projector: options.projector,
        maxXiKeys,
        xiSchema: options.xiSchema,
        now: clock.now(),
      });
      version = next.version;
      current = next;
      return current;
    },
    refreshSigma(sigma) {
      current = refreshSigmaRecord({
        current: requireCurrent(),
        sigma,
        now: clock.now(),
      });
      return current;
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
