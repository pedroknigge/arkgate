/**
 * Public ArkOrder surface — compiled to `arkgate/order` only (ADR 0030).
 * Not re-exported from `src/gate.ts`.
 */
export { createOrderPlane, type CreateOrderPlaneOptions, type OrderPlane } from './createOrderPlane';
export { ArkOrderError } from '../../domain/arkOrderError';
export { DEFAULT_MAX_XI_KEYS } from '../../domain/arkOrderTypes';
export type {
  ConstraintPack,
  EscalationTarget,
  FieldEvent,
  InformationBudget,
  IngestEscalate,
  IngestEscalateUp,
  IngestHold,
  IngestReasonCode,
  IngestResult,
  InjectedClock,
  Projection,
  Projector,
  ProposeResult,
  Release,
  SigmaRecord,
  XiRecord,
  XiSchema,
} from '../../domain/arkOrderTypes';
