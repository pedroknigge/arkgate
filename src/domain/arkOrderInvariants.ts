/**
 * Haken slaving invariants for ArkOrder (pure).
 *
 * Slow keys (ξ) freeze as a Release. Fast state (s) is derived by a consumer
 * projector. Field events absorb or escalate; they never mint a new Release.
 * A pattern change with empty blast radius is not an order parameter.
 */
import { ArkOrderError } from './arkOrderError';
import { CAPACITY_OPS, DEFAULT_MAX_XI_KEYS, XI_TTL_KEY_RE } from './arkOrderTypes';
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
    (typeof value === 'number' && Number.isFinite(value)) ||
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
    if (typeof value === 'number' && !Number.isFinite(value)) {
      // JSON (and so the hash) turns NaN/±Infinity into null: no stable identity.
      throw new ArkOrderError(
        'ARKORDER_NESTED_XI',
        `${label} key ${JSON.stringify(key)} is a non-finite number (NaN/±Infinity has no stable identity)`
      );
    }
    if (!isPrimitive(value)) {
      throw new ArkOrderError(
        'ARKORDER_NESTED_XI',
        `${label} key ${JSON.stringify(key)} is not a slow primitive (nested values are microstate)`
      );
    }
    out[key] = Object.is(value, -0) ? 0 : value;
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

/**
 * σ freshness. A numeric σ.freshUntil is honored on its own and wins over the age
 * check; otherwise `maxAgeMs` (sigmaMaxAgeMs) bounds the age from σ.releasedAt or
 * the Release freeze time. Neither set means σ never goes stale.
 */
export function assertSigmaFresh(input: {
  sigma: SigmaRecord;
  now: number;
  maxAgeMs?: number;
  /** Freeze time on the Release. Used when σ has no freshUntil / releasedAt. */
  releasedAt?: number;
}): void {
  const until = input.sigma.freshUntil;
  if (typeof until === 'number') {
    if (input.now > until) {
      throw new ArkOrderError('ARKORDER_STALE_SIGMA', 'σ freshUntil has elapsed; ξ does not TTL');
    }
    return;
  }
  if (input.maxAgeMs === undefined) return;
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

/** Inputs a ξ transition needs, shared by proposePatternChange and applyProposedRelease. */
type PatternTransitionInput = {
  current: Release;
  projector: (release: Release, sigma: SigmaRecord) => Projection;
  maxXiKeys: number;
  xiSchema?: XiSchema;
  now: number;
  catalogDigest?: string;
  informationBudget?: InformationBudget;
};

/** The next frozen Release: ξ replaced, σ carried over, version + 1. */
function successorRelease(input: PatternTransitionInput, xi: Record<string, unknown>): Release {
  return createFrozenRelease({
    xi,
    sigma: { ...input.current.sigma },
    version: input.current.version + 1,
    now: input.now,
    maxXiKeys: input.maxXiKeys,
    xiSchema: input.xiSchema,
    catalogDigest: input.catalogDigest,
  });
}

/**
 * Blast radius of moving from the current Release to `candidate`. Throws when the
 * information budget denies the next pattern, or when the blast radius is empty.
 */
function transitionBlast(
  input: PatternTransitionInput,
  candidate: Release
): { blastRadius: string[]; invalidations: string[] } {
  const previous = input.projector(input.current, input.current.sigma);
  const next = input.projector(candidate, candidate.sigma);
  // A pattern the budget denies is never offered for review.
  assertInformationBudget(next, input.informationBudget);
  const { blastRadius, invalidations } = blastRadiusOf(previous, next);
  if (blastRadius.length === 0) {
    throw new ArkOrderError(
      'ARKORDER_EMPTY_BLAST',
      'pattern change has empty blast radius; that key is not an order parameter'
    );
  }
  return { blastRadius, invalidations };
}

export function proposePatternChange(input: {
  current: Release;
  delta: Record<string, unknown>;
  projector: (release: Release, sigma: SigmaRecord) => Projection;
  maxXiKeys: number;
  xiSchema?: XiSchema;
  now: number;
  catalogDigest?: string;
  informationBudget?: InformationBudget;
}): ProposeResult {
  const merged: Record<string, unknown> = { ...input.current.xi };
  for (const [key, value] of Object.entries(input.delta)) {
    if (value === undefined) {
      delete merged[key];
      continue;
    }
    merged[key] = value;
  }
  const candidate = successorRelease(input, merged);
  if (candidate.hash === input.current.hash) {
    throw new ArkOrderError(
      'ARKORDER_EMPTY_BLAST',
      'delta does not change ξ; that is not a pattern change'
    );
  }
  const { blastRadius, invalidations } = transitionBlast(input, candidate);
  return {
    nextXi: candidate.xi,
    blastRadius,
    invalidations,
    baseXiHash: input.current.xiHash,
    baseVersion: input.current.version,
  };
}

function sameSortedList(left: unknown, right: readonly string[]): boolean {
  if (!Array.isArray(left) || left.length !== right.length) return false;
  const sorted = [...left].map(String).sort();
  return sorted.every((item, index) => item === right[index]);
}

function staleProposal(detail: string): ArkOrderError {
  return new ArkOrderError(
    'ARKORDER_STALE_PROPOSAL',
    `${detail}; re-run proposeRelease against the current Release and review the new blast radius`
  );
}

/**
 * D1 valve: freeze ProposeResult.nextXi. The proposal must be bound to the current
 * Release (baseXiHash + baseVersion) and its reviewed blastRadius / invalidations must
 * equal the transition actually committed — otherwise ARKORDER_STALE_PROPOSAL.
 * Empty blast still fails; a pattern the information budget denies never persists.
 */
export function applyProposedRelease(input: {
  current: Release;
  proposal: ProposeResult;
  projector: (release: Release, sigma: SigmaRecord) => Projection;
  maxXiKeys: number;
  xiSchema?: XiSchema;
  now: number;
  catalogDigest?: string;
  informationBudget?: InformationBudget;
}): Release {
  const proposal = input.proposal as Partial<ProposeResult> | null | undefined;
  if (
    !proposal ||
    typeof proposal !== 'object' ||
    !proposal.nextXi ||
    typeof proposal.nextXi !== 'object'
  ) {
    throw staleProposal('apply() requires a ProposeResult from proposeRelease');
  }
  if (
    proposal.baseXiHash !== input.current.xiHash ||
    proposal.baseVersion !== input.current.version
  ) {
    throw staleProposal(
      `proposal was computed against a different Release (base v${String(proposal.baseVersion)}, current v${input.current.version})`
    );
  }
  const candidate = successorRelease(input, { ...input.proposal.nextXi });
  if (xiRecordsEqual(candidate.xi, input.current.xi)) {
    throw new ArkOrderError(
      'ARKORDER_EMPTY_BLAST',
      'delta does not change ξ; that is not a pattern change'
    );
  }
  const { blastRadius, invalidations } = transitionBlast(input, candidate);
  if (
    !sameSortedList(proposal.blastRadius, blastRadius) ||
    !sameSortedList(proposal.invalidations, invalidations)
  ) {
    throw staleProposal('the reviewed blast radius is not the transition apply() would commit');
  }
  return candidate;
}
