/**
 * Haken slaving invariants for ArkOrder (pure).
 *
 * Slow keys (ξ) freeze as a Release. Fast state (s) is derived by a consumer
 * projector. Field events absorb or escalate; they never mint a new Release.
 * A pattern change with empty blast radius is not an order parameter.
 */
import { ArkOrderError } from './arkOrderError';
import { DEFAULT_MAX_XI_KEYS } from './arkOrderTypes';
import type {
  ConstraintPack,
  EscalationTarget,
  FieldEvent,
  InformationBudget,
  IngestResult,
  Projection,
  ProposeResult,
  Release,
  SigmaRecord,
  XiPrimitive,
  XiRecord,
  XiSchema,
} from './arkOrderTypes';
import { deterministicHash, stableSerialize } from './stableHash';

export { DEFAULT_MAX_XI_KEYS };

const FORBIDDEN_PLANE_METHODS = ['update', 'patch', 'set', 'mutate'] as const;

export function isForbiddenPlaneMethod(name: string): boolean {
  return (FORBIDDEN_PLANE_METHODS as readonly string[]).includes(name);
}

function isPrimitive(value: unknown): value is XiPrimitive {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

export function freezeRecord(input: Record<string, unknown>, label: string): XiRecord {
  const keys = Object.keys(input);
  if (keys.length === 0 && label === 'ξ') {
    throw new ArkOrderError('ARKORDER_EMPTY_XI', 'ξ must name at least one slow mode');
  }
  const out: Record<string, XiPrimitive> = {};
  for (const key of keys.sort()) {
    const value = input[key];
    if (!isPrimitive(value)) {
      throw new ArkOrderError(
        'ARKORDER_NESTED_XI',
        `${label} key ${JSON.stringify(key)} is not a slow primitive (nested values are microstate)`
      );
    }
    out[key] = value;
  }
  return Object.freeze(out);
}

export function assertXiKeyCap(xi: Record<string, unknown>, maxXiKeys: number): void {
  const n = Object.keys(xi).length;
  if (n === 0) {
    throw new ArkOrderError('ARKORDER_EMPTY_XI', 'ξ must name at least one slow mode');
  }
  if (n > maxXiKeys) {
    throw new ArkOrderError(
      'ARKORDER_TOO_MANY_PARAMS',
      `ξ has ${n} keys; maxXiKeys is ${maxXiKeys} (Haken: few slow modes)`
    );
  }
}

export function assertXiSchema(xi: XiRecord, schema: XiSchema | undefined): void {
  if (!schema) return;
  const properties = schema.properties ?? {};
  const additional = schema.additionalProperties !== false ? true : false;
  for (const key of Object.keys(xi)) {
    const prop = properties[key];
    if (!prop) {
      if (!additional) {
        throw new ArkOrderError(
          'ARKORDER_SCHEMA',
          `ξ key ${JSON.stringify(key)} is not in xiSchema.properties`
        );
      }
      continue;
    }
    if (prop.enum && !prop.enum.some((allowed) => allowed === xi[key])) {
      throw new ArkOrderError(
        'ARKORDER_SCHEMA',
        `ξ key ${JSON.stringify(key)} value is not in enum`
      );
    }
    if (prop.type === 'null' && xi[key] !== null) {
      throw new ArkOrderError('ARKORDER_SCHEMA', `ξ key ${JSON.stringify(key)} must be null`);
    }
    if (prop.type && prop.type !== 'null' && typeof xi[key] !== prop.type) {
      throw new ArkOrderError(
        'ARKORDER_SCHEMA',
        `ξ key ${JSON.stringify(key)} must be ${prop.type}`
      );
    }
  }
}

export function hashReleasePayload(xi: XiRecord, sigma: SigmaRecord): string {
  return deterministicHash(stableSerialize({ xi, sigma }));
}

export function createFrozenRelease(input: {
  xi: Record<string, unknown>;
  sigma?: Record<string, unknown>;
  version: number;
  now: number;
  maxXiKeys: number;
  xiSchema?: XiSchema;
}): Release {
  assertXiKeyCap(input.xi, input.maxXiKeys);
  const xi = freezeRecord(input.xi, 'ξ');
  assertXiHasNoTtl(xi);
  assertXiSchema(xi, input.xiSchema);
  const sigma = freezeRecord(input.sigma ?? {}, 'σ');
  const release: Release = Object.freeze({
    version: input.version,
    hash: hashReleasePayload(xi, sigma),
    xi,
    sigma,
    releasedAt: input.now,
  });
  return release;
}

const XI_TTL_KEY_RE = /^(ttl|freshUntil|fresh_until|maxAge|max_age)$/i;

export function assertXiHasNoTtl(xi: XiRecord): void {
  for (const key of Object.keys(xi)) {
    if (XI_TTL_KEY_RE.test(key)) {
      throw new ArkOrderError(
        'ARKORDER_XI_TTL',
        `ξ key ${JSON.stringify(key)} is a freshness field; TTL belongs on σ, never on ξ`
      );
    }
  }
}

export function assertInformationBudget(
  projection: Projection,
  budget: InformationBudget | undefined
): void {
  if (!budget || budget.cannotObserve.length === 0) return;
  const denied = new Set(budget.cannotObserve);
  for (const kind of projection.allowedKinds) {
    if (denied.has(kind)) {
      throw new ArkOrderError(
        'ARKORDER_INFORMATION_BUDGET',
        `projection allows ${JSON.stringify(kind)}; informationBudget.cannotObserve forbids it`
      );
    }
  }
}

export function assertSigmaFresh(input: {
  sigma: SigmaRecord;
  now: number;
  maxAgeMs?: number;
  /** Freeze time on the Release. Used when σ has no freshUntil / releasedAt. */
  releasedAt?: number;
}): void {
  if (input.maxAgeMs === undefined) return;
  const until = input.sigma.freshUntil;
  if (typeof until === 'number') {
    if (input.now > until) {
      throw new ArkOrderError('ARKORDER_STALE_SIGMA', 'σ freshUntil has elapsed; ξ does not TTL');
    }
    return;
  }
  const origin =
    typeof input.sigma.releasedAt === 'number' ? input.sigma.releasedAt : input.releasedAt;
  if (typeof origin === 'number' && input.now - origin > input.maxAgeMs) {
    throw new ArkOrderError('ARKORDER_STALE_SIGMA', 'σ is older than sigmaMaxAgeMs; ξ does not TTL');
  }
}

export function classifyIngest(
  projection: Projection,
  event: FieldEvent,
  packs: readonly ConstraintPack[] = []
): IngestResult {
  const kind = event.kind;
  for (const pack of packs) {
    if (pack.escalateKinds?.includes(kind)) {
      const target: EscalationTarget = pack.escalateTarget ?? 'human';
      return {
        kind: 'escalate',
        event,
        reason: `pack ${pack.id} slaves kind ${JSON.stringify(kind)} to a pattern change`,
        target,
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
    target: 'human',
  };
}

export function blastRadiusOf(
  previous: Projection,
  next: Projection
): { blastRadius: string[]; invalidations: string[] } {
  const prev = new Set(previous.allowedKinds);
  const nxt = new Set(next.allowedKinds);
  const blast = new Set<string>();
  for (const kind of prev) {
    if (!nxt.has(kind)) blast.add(kind);
  }
  for (const kind of nxt) {
    if (!prev.has(kind)) blast.add(kind);
  }
  for (const item of next.invalidated) blast.add(item);
  return {
    blastRadius: [...blast].sort(),
    invalidations: [...next.invalidated].sort(),
  };
}

export function proposePatternChange(input: {
  current: Release;
  delta: Record<string, unknown>;
  projector: (release: Release, sigma: SigmaRecord) => Projection;
  maxXiKeys: number;
  xiSchema?: XiSchema;
  now: number;
}): ProposeResult {
  const merged: Record<string, unknown> = { ...input.current.xi };
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
    throw new ArkOrderError(
      'ARKORDER_EMPTY_BLAST',
      'delta does not change ξ; that is not a pattern change'
    );
  }
  const previous = input.projector(input.current, input.current.sigma);
  const next = input.projector(candidate, candidate.sigma);
  const { blastRadius, invalidations } = blastRadiusOf(previous, next);
  if (blastRadius.length === 0) {
    throw new ArkOrderError(
      'ARKORDER_EMPTY_BLAST',
      'pattern change has empty blast radius; that key is not an order parameter'
    );
  }
  return {
    nextXi: candidate.xi,
    blastRadius,
    invalidations,
  };
}
