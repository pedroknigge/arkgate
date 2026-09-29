/**
 * ArkRun send ports (ADR 0024): local / localBlocking / broker-with-local-fallback.
 * Consumers inject broker adapters. This package does not ship cloud SDKs.
 * Fallback is in-process local delivery — not cloud portability.
 */
import type { DomainEvent, EventMetadata, IntentName } from '../../domain/types';
import {
  resolveArkRunSendPlan,
  type ArkRunSendPlan,
  type ArkRunTransportKind,
} from '../../domain/arkRunTransport';
import { SourceMetadataOverrideError } from '../event-bus/errors';
import type { EventBusImpl } from '../event-bus/EventBus';
import type { IntentCreator } from '../intent';

export type { ArkRunSendPlan, ArkRunTransportKind };

/**
 * Consumer-owned broker handoff. Resolving means the adapter accepted the
 * message, not that downstream consumers processed it. Not a durability claim.
 */
export interface ArkRunBrokerAdapter {
  send(event: DomainEvent): void | Promise<void>;
}

export interface ArkRunSendOptions {
  transport?: ArkRunTransportKind;
  /** Override kernel `ephemeral`. Default remains true when both are omitted. */
  ephemeral?: boolean;
  source?: string;
  metadata?: Partial<EventMetadata>;
}

export type ArkRunSendResult = ArkRunSendPlan;

export interface ArkRunTransportDeps {
  eventBus: EventBusImpl;
  broker?: ArkRunBrokerAdapter;
  defaultEphemeral: boolean;
}

function stampMetadata(
  options: ArkRunSendOptions
): Partial<EventMetadata> {
  const metadata: Partial<EventMetadata> = { ...(options.metadata ?? {}) };
  if (options.source === undefined) return metadata;
  if (metadata.source && metadata.source !== options.source) {
    throw new SourceMetadataOverrideError(options.source, metadata.source);
  }
  metadata.source = options.source;
  return metadata;
}

export async function sendOnArkRunTransport<N extends IntentName, P>(
  deps: ArkRunTransportDeps,
  intent: IntentCreator<N, P>,
  payload: P,
  options: ArkRunSendOptions = {}
): Promise<ArkRunSendResult> {
  const plan = resolveArkRunSendPlan({
    transport: options.transport,
    ephemeral: options.ephemeral ?? deps.defaultEphemeral,
    brokerBound: typeof deps.broker?.send === 'function',
  });
  const metadata = stampMetadata(options);
  const viaBroker = plan.deliveredVia === 'broker' && deps.broker !== undefined;
  let bufferRecordId: string | undefined;
  const event = await deps.eventBus.dispatch(intent, payload, metadata, {
    notifySubscribers: plan.notifySubscribers,
    awaitHandlers: plan.awaitHandlers,
    // The broker handoff, not local delivery, decides this record's outcome.
    ...(viaBroker ? { settleBufferOnLocalDelivery: false } : {}),
    onBufferRecord: (record) => {
      bufferRecordId = record.id;
    },
  });

  if (viaBroker && deps.broker) {
    const bus = deps.eventBus;
    const broker = deps.broker;
    const handoff = (async () => {
      try {
        await broker.send(event);
      } catch (error) {
        // Record the failed handoff so the outbox monitor and audit trail see it.
        if (bufferRecordId !== undefined) {
          await bus.settleBufferRecord(event, bufferRecordId, { ok: false, error });
        }
        await bus.recordHandoffFailure(event, error, 'broker');
        throw error;
      }
      if (bufferRecordId !== undefined) {
        await bus.settleBufferRecord(event, bufferRecordId, { ok: true });
      }
    })();
    if (plan.awaitHandoff) {
      await handoff;
    } else {
      // Fire-and-forget after kernel accept: the failure is already recorded
      // (buffer `failed` + `event.handoffFailed` trace/audit); never unhandled.
      void handoff.then(undefined, () => undefined);
    }
  }

  return plan;
}
