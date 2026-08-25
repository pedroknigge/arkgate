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

function ignoreDetachedFailure(): void {
  /* Fire-and-forget after kernel accept; adapter errors must not become unhandled. */
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
  const event = await deps.eventBus.dispatch(intent, payload, metadata, {
    notifySubscribers: plan.notifySubscribers,
    awaitHandlers: plan.awaitHandlers,
  });

  if (plan.deliveredVia === 'broker' && deps.broker) {
    const handoff = Promise.resolve(deps.broker.send(event));
    if (plan.awaitHandoff) {
      await handoff;
    } else {
      void handoff.then(undefined, ignoreDetachedFailure);
    }
  }

  return plan;
}
