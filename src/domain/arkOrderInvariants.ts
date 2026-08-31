/**
 * Haken slaving invariants for ArkOrder (pure).
 *
 * Slow keys (ξ) freeze as a Release. Fast state (s) is derived by a consumer
 * projector. Field events absorb or escalate; they never mint a new Release.
 * A pattern change with empty blast radius is not an order parameter.
 */
import { ArkOrderError } from './arkOrderError';
import { CAPACITY_OPS, DEFAULT_MAX_XI_KEYS } from './arkOrderTypes';
import type {
  CapacityOp,
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

/** D7: consumer still owns handlers — this only names the travel verb. */
export function ingestTravelAction(residual: IngestResult): 'send' | 'raises' | 'none' {
  if (residual.kind === 'absorb') return 'send';
  if (residual.kind === 'escalate_up' && residual.target === 'human') return 'raises';
  return 'none';
}

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

function catalogDigestFor(xi: XiRecord, catalogDigest?: string): string | undefined {
  if (typeof catalogDigest !== 'string') return undefined;
  if (!Object.prototype.hasOwnProperty.call(xi, 'catalogReleaseId')) return undefined;
  return catalogDigest;
}

export function hashReleasePayload(
  xi: XiRecord,
  sigma: SigmaRecord,
  catalogDigest?: string
): string {
  const digest = catalogDigestFor(xi, catalogDigest);
  if (digest !== undefined) return deterministicHash(stableSerialize({ xi, sigma, catalogDigest: digest }));
  return deterministicHash(stableSerialize({ xi, sigma }));
}

export function hashXiIdentity(xi: XiRecord, catalogDigest?: string): string {
  const digest = catalogDigestFor(xi, catalogDigest);
  if (digest !== undefined) return deterministicHash(stableSerialize({ xi, catalogDigest: digest }));
  return deterministicHash(stableSerialize({ xi }));
}

export function hashSigmaIdentity(sigma: SigmaRecord): string {
  return deterministicHash(stableSerialize({ sigma }));
}

export function xiRecordsEqual(left: XiRecord, right: XiRecord): boolean {
  return stableSerialize(left) === stableSerialize(right);
}

/** D1: after the first freeze, a later release() may not change ξ. */
export function assertUnvalvedRelease(current: Release | null, nextXi: XiRecord): void {
  if (!current) return;
  if (xiRecordsEqual(current.xi, nextXi)) return;
  throw new ArkOrderError(
    'ARKORDER_UNVALVED_RELEASE',
    'ξ is frozen; change the pattern with proposeRelease then apply(ProposeResult)'
  );
}

export function createFrozenRelease(input: {
  xi: Record<string, unknown>;
  sigma?: Record<string, unknown>;
  version: number;
  now: number;
  maxXiKeys: number;
  xiSchema?: XiSchema;
  catalogDigest?: string;
}): Release {
  assertXiKeyCap(input.xi, input.maxXiKeys);
  const xi = freezeRecord(input.xi, 'ξ');
  assertXiHasNoTtl(xi);
  assertXiSchema(xi, input.xiSchema);
  const sigma = freezeRecord(input.sigma ?? {}, 'σ');
  const release: Release = Object.freeze({
    version: input.version,
    hash: hashReleasePayload(xi, sigma, input.catalogDigest),
    xiHash: hashXiIdentity(xi, input.catalogDigest),
    sigmaHash: hashSigmaIdentity(sigma),
    xi,
    sigma,
    releasedAt: input.now,
  });
  return release;
}

/** D2: refresh σ without minting a pattern. xiHash must not change. */
export function refreshSigmaRecord(input: {
  current: Release;
  sigma: Record<string, unknown>;
  now: number;
  catalogDigest?: string;
}): Release {
  const sigma = freezeRecord(input.sigma, 'σ');
  return Object.freeze({
    version: input.current.version,
    hash: hashReleasePayload(input.current.xi, sigma, input.catalogDigest),
    xiHash: input.current.xiHash,
    sigmaHash: hashSigmaIdentity(sigma),
    xi: input.current.xi,
    sigma,
    releasedAt: input.now,
  });
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

export function fieldEventIdentity(event: FieldEvent): string {
  return deterministicHash(stableSerialize({ kind: event.kind, payload: event.payload ?? null }));
}

function bindResidual(event: FieldEvent, xiHash: string) {
  return { event, xiHash, eventId: fieldEventIdentity(event) };
}

const CAPACITY_OP_SET = new Set<string>(CAPACITY_OPS);

function isCapacityOp(value: unknown): value is CapacityOp {
  return typeof value === 'string' && CAPACITY_OP_SET.has(value);
}

function numericLeaf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function compareCapacity(left: number, op: CapacityOp, right: number): boolean {
  if (op === 'lte') return left <= right;
  if (op === 'lt') return left < right;
  if (op === 'gte') return left >= right;
  return left > right;
}

function packHasFunction(value: unknown): boolean {
  if (typeof value === 'function') return true;
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(packHasFunction);
  return Object.values(value as Record<string, unknown>).some(packHasFunction);
}

function evaluateCapacity(
  event: FieldEvent,
  sigma: SigmaRecord,
  pack: ConstraintPack
): 'ok' | 'capacity' | 'pack' {
  const rows = pack.capacity ?? [];
  for (const row of rows) {
    if (packHasFunction(row) || !isCapacityOp(row.op)) return 'pack';
    if (row.kind !== event.kind) continue;
    const payload =
      event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
        ? numericLeaf((event.payload as Record<string, unknown>)[row.payloadKey])
        : undefined;
    const limit = numericLeaf(sigma[row.sigmaKey]);
    if (payload === undefined || limit === undefined) return 'pack';
    if (!compareCapacity(payload, row.op, limit)) return 'capacity';
  }
  return 'ok';
}

export function classifyIngest(
  projection: Projection,
  event: FieldEvent,
  packs: readonly ConstraintPack[] = [],
  xiHash = '',
  sigma: SigmaRecord = Object.freeze({})
): IngestResult {
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
      const target: EscalationTarget = pack.escalateTarget ?? 'human';
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
    if (cap === 'ok') continue;
    return {
      ...bound,
      kind: 'hold',
      reasonCode: cap,
      reason:
        cap === 'capacity'
          ? `pack ${pack.id} capacity ${JSON.stringify(event.kind)} does not hold`
          : `pack ${pack.id} capacity is not numeric data`,
    };
  }
  return { ...bound, kind: 'absorb' };
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
  catalogDigest?: string;
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
    catalogDigest: input.catalogDigest,
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

/** D1 valve: freeze ProposeResult.nextXi. Empty blast still fails. */
export function applyProposedRelease(input: {
  current: Release;
  proposal: ProposeResult;
  projector: (release: Release, sigma: SigmaRecord) => Projection;
  maxXiKeys: number;
  xiSchema?: XiSchema;
  now: number;
  catalogDigest?: string;
}): Release {
  const candidate = createFrozenRelease({
    xi: { ...input.proposal.nextXi },
    sigma: { ...input.current.sigma },
    version: input.current.version + 1,
    now: input.now,
    maxXiKeys: input.maxXiKeys,
    xiSchema: input.xiSchema,
    catalogDigest: input.catalogDigest,
  });
  if (xiRecordsEqual(candidate.xi, input.current.xi)) {
    throw new ArkOrderError(
      'ARKORDER_EMPTY_BLAST',
      'delta does not change ξ; that is not a pattern change'
    );
  }
  const previous = input.projector(input.current, input.current.sigma);
  const next = input.projector(candidate, candidate.sigma);
  const { blastRadius } = blastRadiusOf(previous, next);
  if (blastRadius.length === 0) {
    throw new ArkOrderError(
      'ARKORDER_EMPTY_BLAST',
      'pattern change has empty blast radius; that key is not an order parameter'
    );
  }
  return candidate;
}
