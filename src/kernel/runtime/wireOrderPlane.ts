/**
 * Composable ArkOrder <-> ArkRun bridge (ADR 0034 D6/D7).
 *
 * - `absorb` travels through `kernel.publisher(source).send(...)`
 * - `escalate_up` (`target: 'human'`) travels through `raises` (`publisher.publish(...)`)
 * - Every decision is appended to a bounded `decisionTape` visible in
 *   `kernel.getInspectorSnapshot()` and `kernel.getDependencyInformationPackage()`
 * - `restore(previousXi)` runs through the valve (`proposeRelease` -> `apply`)
 *   and records an explicit audit entry + decisionTape record.
 */
import { ingestTravelAction } from '../../domain/arkOrderInvariants';
import type {
  FieldEvent,
  IngestAbsorb,
  IngestEscalateUp,
  IngestResult,
  ProposeResult,
  Release,
  XiRecord,
} from '../../domain/arkOrderTypes';
import type { ArkRunDecisionTapeRecord } from '../../domain/arkRunInformationPackage';
import type { EventMetadata, IntentName } from '../../domain/types';
import type { EventDispatchControl } from '../event-bus';
import type { IntentCreator } from '../intent';
import type { OrderPlane } from '../order/createOrderPlane';
import type { ArkRunSendOptions, ArkRunSendResult } from './transport';
import type { ArkKernel, ArkRunPublisher } from './types';

export const DEFAULT_MAX_DECISION_TAPE_SIZE = 500;

export type OrderPlaneTravelAction = 'send' | 'raises' | 'none';

export interface OrderAbsorbDispatch {
  intent: IntentCreator<IntentName, never>;
  payload: unknown;
  options?: Omit<ArkRunSendOptions, 'source'>;
}

export interface OrderEscalateDispatch {
  intent: IntentCreator<IntentName, never>;
  payload: unknown;
  metadata?: Partial<EventMetadata>;
  control?: EventDispatchControl;
}

export type OrderPlaneRaiseFn = <N extends IntentName, P>(
  intent: IntentCreator<N, P>,
  payload: P,
  metadata?: Partial<EventMetadata>,
  control?: EventDispatchControl
) => Promise<void>;

export interface WireOrderPlaneOptions {
  /** Registered ArkRun producer intent name for outbound sends and raises. */
  source: IntentName;
  /**
   * Handle an `absorb` residual. Either call the provided `send(...)` helper or
   * return `{ intent, payload, options? }` to send via `kernel.publisher(source).send(...)`.
   */
  onAbsorb?: (
    result: IngestAbsorb,
    send: ArkRunPublisher['send']
  ) =>
    | OrderAbsorbDispatch
    | ArkRunSendResult
    | void
    | Promise<OrderAbsorbDispatch | ArkRunSendResult | void>;
  /**
   * Handle an `escalate_up` (`target: 'human'`) residual. Either call the provided
   * `raise(...)` helper or return `{ intent, payload, metadata? }` to raise via
   * `kernel.publisher(source).publish(...)`.
   */
  onEscalate?: (
    result: IngestEscalateUp,
    raise: OrderPlaneRaiseFn
  ) =>
    | OrderEscalateDispatch
    | void
    | Promise<OrderEscalateDispatch | void>;
  /**
   * Maximum entries kept in the kernel decision tape (oldest evicted first).
   * Default: 500.
   */
  maxDecisionTapeSize?: number;
}

export interface OrderPlaneRestoreOptions {
  reason?: string;
  actor?: string;
}

export interface OrderPlaneRestoreResult {
  release: Release;
  proposal: ProposeResult;
  previousXiHash: string;
  previousVersion: number;
}

export interface OrderPlaneIngestOutcome {
  result: IngestResult;
  travelAction: OrderPlaneTravelAction;
  sendResult?: ArkRunSendResult;
  raised?: boolean;
}

export interface WiredOrderPlane {
  readonly source: IntentName;
  readonly plane: OrderPlane;
  readonly maxDecisionTapeSize: number;
  ingest(event: FieldEvent): Promise<OrderPlaneIngestOutcome>;
  restore(
    previousXi: XiRecord,
    options?: OrderPlaneRestoreOptions
  ): Promise<OrderPlaneRestoreResult>;
  getDecisionTape(): ArkRunDecisionTapeRecord[];
}

function normalizeTapeSize(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_DECISION_TAPE_SIZE;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new RangeError('maxDecisionTapeSize must be a positive integer.');
  }
  return value;
}

function isAbsorbDispatch(value: unknown): value is OrderAbsorbDispatch {
  return (
    value !== null &&
    typeof value === 'object' &&
    'intent' in value &&
    typeof (value as { intent?: unknown }).intent === 'function'
  );
}

function isSendResult(value: unknown): value is ArkRunSendResult {
  return (
    value !== null &&
    typeof value === 'object' &&
    'deliveredVia' in value &&
    'transport' in value
  );
}

function isEscalateDispatch(value: unknown): value is OrderEscalateDispatch {
  return (
    value !== null &&
    typeof value === 'object' &&
    'intent' in value &&
    typeof (value as { intent?: unknown }).intent === 'function'
  );
}

function toTapeRecord(result: IngestResult): ArkRunDecisionTapeRecord {
  const payload =
    result.event.payload &&
    typeof result.event.payload === 'object' &&
    !Array.isArray(result.event.payload)
      ? (result.event.payload as Record<string, string | number | boolean | null>)
      : undefined;
  return {
    xiHash: result.xiHash,
    event: {
      kind: result.event.kind,
      ...(payload ? { payload } : {}),
    },
    residual: {
      kind: result.kind,
      eventId: result.eventId,
      ...(result.kind !== 'absorb' ? { reasonCode: result.reasonCode } : {}),
      ...(result.kind === 'escalate_up' ? { target: result.target } : {}),
    },
  };
}

function buildRestoreDelta(currentXi: XiRecord, targetXi: XiRecord): Record<string, unknown> {
  const delta: Record<string, unknown> = {};
  for (const key of Object.keys(currentXi)) {
    if (!Object.prototype.hasOwnProperty.call(targetXi, key)) {
      delta[key] = undefined;
    }
  }
  for (const [key, value] of Object.entries(targetXi)) {
    delta[key] = value;
  }
  return delta;
}

/**
 * Bridge an ArkOrder `OrderPlane` into an ArkRun `ArkKernel`.
 */
export function wireOrderPlane(
  kernel: ArkKernel,
  plane: OrderPlane,
  options: WireOrderPlaneOptions
): WiredOrderPlane {
  const maxDecisionTapeSize = normalizeTapeSize(options.maxDecisionTapeSize);
  const publisher = kernel.publisher(options.source);

  return {
    source: options.source,
    plane,
    maxDecisionTapeSize,

    async ingest(event: FieldEvent): Promise<OrderPlaneIngestOutcome> {
      const result = plane.ingest(event);
      const travelAction = ingestTravelAction(result);

      kernel.recordDecisionTape(toTapeRecord(result), maxDecisionTapeSize);
      await kernel.auditTrail.record({
        type: 'order.decision',
        source: options.source,
        subject: result.eventId,
        details: {
          kind: result.kind,
          eventKind: result.event.kind,
          xiHash: result.xiHash,
          travelAction,
          ...(result.kind !== 'absorb'
            ? { reasonCode: result.reasonCode, reason: result.reason }
            : {}),
          ...(result.kind === 'escalate_up' ? { target: result.target } : {}),
        },
      });

      let sendResult: ArkRunSendResult | undefined;
      let raised = false;

      if (travelAction === 'send' && result.kind === 'absorb' && options.onAbsorb) {
        const trackedSend: ArkRunPublisher['send'] = async (
          intent,
          payload,
          sendOptions
        ) => {
          const outcome = await publisher.send(intent, payload, sendOptions);
          sendResult = outcome;
          return outcome;
        };
        const returned = await options.onAbsorb(result, trackedSend);
        if (isAbsorbDispatch(returned)) {
          sendResult = await trackedSend(
            returned.intent,
            returned.payload as never,
            returned.options
          );
        } else if (isSendResult(returned)) {
          sendResult = returned;
        }
      } else if (
        travelAction === 'raises' &&
        result.kind === 'escalate_up' &&
        options.onEscalate
      ) {
        const trackedRaise: OrderPlaneRaiseFn = async (
          intent,
          payload,
          metadata,
          control
        ) => {
          await publisher.publish(intent, payload, metadata, control);
          raised = true;
        };
        const returned = await options.onEscalate(result, trackedRaise);
        if (isEscalateDispatch(returned)) {
          await trackedRaise(
            returned.intent,
            returned.payload as never,
            returned.metadata,
            returned.control
          );
        }
      }

      return {
        result,
        travelAction,
        ...(sendResult ? { sendResult } : {}),
        ...(raised ? { raised } : {}),
      };
    },

    async restore(
      previousXi: XiRecord,
      restoreOptions?: OrderPlaneRestoreOptions
    ): Promise<OrderPlaneRestoreResult> {
      const before = plane.current();
      const delta = before ? buildRestoreDelta(before.xi, previousXi) : { ...previousXi };
      const proposal = plane.proposeRelease(delta);
      const release = plane.apply(proposal);
      const previousXiHash = before!.xiHash;
      const previousVersion = before!.version;

      await kernel.auditTrail.record({
        type: 'order.restored',
        source: options.source,
        actor: restoreOptions?.actor,
        subject: release.xiHash,
        details: {
          previousXiHash,
          previousVersion,
          nextXiHash: release.xiHash,
          nextVersion: release.version,
          blastRadius: [...proposal.blastRadius],
          invalidations: [...proposal.invalidations],
          ...(restoreOptions?.reason ? { reason: restoreOptions.reason } : {}),
        },
      });

      kernel.recordDecisionTape(
        {
          xiHash: release.xiHash,
          event: {
            kind: 'order.restore',
            payload: {
              previousXiHash,
              previousVersion,
              nextVersion: release.version,
              ...(restoreOptions?.reason ? { reason: restoreOptions.reason } : {}),
              ...(restoreOptions?.actor ? { actor: restoreOptions.actor } : {}),
            },
          },
          residual: {
            kind: 'absorb',
            reasonCode: 'restore',
            eventId: `restore:v${previousVersion}->v${release.version}`,
          },
        },
        maxDecisionTapeSize
      );

      return {
        release,
        proposal,
        previousXiHash,
        previousVersion,
      };
    },

    getDecisionTape() {
      return kernel.getDecisionTape();
    },
  };
}
