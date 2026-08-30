/**
 * ArkOrder vocabulary (ADR 0027–0030). Declarations only — no runtime.
 * Haken: a few slow keys (ξ) slave derived fast state (s).
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
  readonly hash: string;
  readonly xi: XiRecord;
  readonly sigma: SigmaRecord;
  readonly releasedAt: number;
};

export type Projection = {
  readonly allowedKinds: readonly string[];
  readonly invalidated: readonly string[];
};

export type IngestAbsorb = {
  readonly kind: 'absorb';
  readonly event: FieldEvent;
};

export type IngestEscalate = {
  readonly kind: 'escalate';
  readonly event: FieldEvent;
  readonly reason: string;
};

export type IngestResult = IngestAbsorb | IngestEscalate;

export type ProposeResult = {
  readonly nextXi: XiRecord;
  readonly blastRadius: readonly string[];
  readonly invalidations: readonly string[];
};

export type Projector = (release: Release, sigma: SigmaRecord) => Projection;

export type ConstraintPack = {
  readonly id: string;
  readonly escalateKinds?: readonly string[];
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
  | 'ARKORDER_UNKNOWN_KEY';
