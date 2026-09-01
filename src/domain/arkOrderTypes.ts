/**
 * ArkOrder vocabulary (ADR 0027–0030). Runtime constants plus types.
 * Haken: a few slow keys (ξ) slave derived fast state (s).
 * The public module `arkgate/order` is runtime (`createOrderPlane`).
 */
export const DEFAULT_MAX_XI_KEYS = 7;

export type XiPrimitive = string | number | boolean | null;
export type XiRecord = Readonly<Record<string, XiPrimitive>>;
export type SigmaRecord = Readonly<Record<string, XiPrimitive>>;

export type FieldEvent = {
  readonly kind: string;
  readonly payload?: Readonly<Record<string, unknown>>;
};

export type Release = {
  readonly version: number;
  /** Combined ξ+σ fingerprint. 4.8.x compatible when no catalog digest is mixed in. */
  readonly hash: string;
  /** ξ identity. Saldo / clock refresh must not change this. */
  readonly xiHash: string;
  /** σ stamp. Independent of xiHash. */
  readonly sigmaHash: string;
  readonly xi: XiRecord;
  readonly sigma: SigmaRecord;
  readonly releasedAt: number;
};

export type Projection = {
  readonly allowedKinds: readonly string[];
  readonly invalidated: readonly string[];
};

export type EscalationTarget = 'human' | 'scale' | 'hold';

export const INGEST_RESIDUAL_KINDS = ['absorb', 'escalate_up', 'hold'] as const;
export type IngestResidualKind = (typeof INGEST_RESIDUAL_KINDS)[number];

export const INGEST_REASON_CODES = ['not-in-pattern', 'stale-sigma', 'pack', 'capacity'] as const;
export type IngestReasonCode = (typeof INGEST_REASON_CODES)[number];

export type IngestResidualBind = {
  readonly event: FieldEvent;
  readonly xiHash: string;
  readonly eventId: string;
};

export type IngestAbsorb = IngestResidualBind & {
  readonly kind: 'absorb';
};

export type IngestHold = IngestResidualBind & {
  readonly kind: 'hold';
  readonly reasonCode: IngestReasonCode;
  readonly reason?: string;
};

export type IngestEscalateUp = IngestResidualBind & {
  readonly kind: 'escalate_up';
  readonly reasonCode: IngestReasonCode;
  readonly reason?: string;
  readonly target: EscalationTarget;
  readonly proposed_patch?: { readonly nextXi: XiRecord };
};

/** Compatibility name — target remains on escalate_up (ADR 0033 D4 / 0034 D4). */
export type IngestEscalate = IngestEscalateUp;

export type IngestResult = IngestAbsorb | IngestHold | IngestEscalateUp;

export type ProposeResult = {
  readonly nextXi: XiRecord;
  readonly blastRadius: readonly string[];
  readonly invalidations: readonly string[];
};

export type Projector = (release: Release, sigma: SigmaRecord) => Projection;

export const CAPACITY_OPS = ['lte', 'lt', 'gte', 'gt'] as const;
export type CapacityOp = (typeof CAPACITY_OPS)[number];

/** Data-only cap. No user predicates (ADR 0016 / 0034 D5). */
export type CapacityConstraint = {
  readonly kind: string;
  readonly sigmaKey: string;
  readonly payloadKey: string;
  readonly op: CapacityOp;
};

export type ConstraintPack = {
  readonly id: string;
  readonly escalateKinds?: readonly string[];
  readonly escalateTarget?: EscalationTarget;
  readonly capacity?: readonly CapacityConstraint[];
};

/** What a scale may not observe (XP04). Denied kinds never appear in allowedKinds. */
export type InformationBudget = {
  readonly cannotObserve: readonly string[];
};

export type XiPropertySchema = {
  readonly type?: 'string' | 'number' | 'boolean' | 'null';
  readonly enum?: readonly XiPrimitive[];
};

export type XiSchema = {
  readonly properties?: Readonly<Record<string, XiPropertySchema>>;
  readonly additionalProperties?: boolean;
};

export type InjectedClock = {
  now(): number;
};

export type ArkOrderErrorCode =
  | 'ARKORDER_EMPTY_XI'
  | 'ARKORDER_TOO_MANY_PARAMS'
  | 'ARKORDER_NESTED_XI'
  | 'ARKORDER_SCHEMA'
  | 'ARKORDER_NO_RELEASE'
  | 'ARKORDER_EMPTY_BLAST'
  | 'ARKORDER_FORBIDDEN_METHOD'
  | 'ARKORDER_UNKNOWN_KEY'
  | 'ARKORDER_INFORMATION_BUDGET'
  | 'ARKORDER_XI_TTL'
  | 'ARKORDER_STALE_SIGMA'
  | 'ARKORDER_UNVALVED_RELEASE';
