/**
 * History, outbox, trace, and audit recording for a successful publish path.
 * Keeps size-capped in-memory buffers and optional durable hooks.
 */
import type { DomainEvent, EventMetadata } from '../../domain/types';
import type { AuditRecordType, AuditTrail } from '../audit';
import type { EventBufferRecord, EventBufferStore } from '../outbox';
import type { PublishedEventRecord, TraceRecord, TraceSink } from './types';

export type RecordingBuffers = {
  history: PublishedEventRecord[];
  trace: TraceRecord[];
  maxHistorySize?: number;
  traceSinks: TraceSink[];
  auditTrail?: AuditTrail;
  eventBuffer?: EventBufferStore;
  instanceId?: string;
};

function appendHistory(
  buffers: RecordingBuffers,
  record: PublishedEventRecord
): void {
  buffers.history.push(record);
  if (
    buffers.maxHistorySize !== undefined &&
    buffers.history.length > buffers.maxHistorySize
  ) {
    buffers.history.splice(0, buffers.history.length - buffers.maxHistorySize);
  }
}

export function appendTrace(buffers: RecordingBuffers, record: TraceRecord): void {
  buffers.trace.push(record);
  if (
    buffers.maxHistorySize !== undefined &&
    buffers.trace.length > buffers.maxHistorySize
  ) {
    buffers.trace.splice(0, buffers.trace.length - buffers.maxHistorySize);
  }
  for (const sink of buffers.traceSinks) {
    try {
      sink(record);
    } catch {
      /* Trace sinks must not affect publish semantics. */
    }
  }
}

export async function recordAudit(
  buffers: RecordingBuffers,
  type: AuditRecordType,
  event: DomainEvent,
  details?: unknown
): Promise<void> {
  if (!buffers.auditTrail) return;
  try {
    await buffers.auditTrail.record({
      type,
      source: event.metadata.source,
      intent: event.intent,
      correlationId: event.metadata.correlationId,
      causationId: event.metadata.causationId,
      subject: event.intent,
      details,
    });
  } catch (err) {
    appendTrace(buffers, {
      type: 'hook.error',
      timestamp: new Date().toISOString(),
      intent: event.intent,
      correlationId: event.metadata.correlationId,
      traceId: event.metadata.traceId,
      spanId: event.metadata.spanId,
      details: {
        hook: 'auditTrail',
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

export async function recordRawPublishDiagnostic(
  buffers: RecordingBuffers,
  event: DomainEvent
): Promise<void> {
  const details = {
    intent: event.intent,
    source: event.metadata.source,
    suggestion:
      'Publish through a registered intent creator so strict registry, contracts, and agent tooling share one source of truth.',
  };
  appendTrace(buffers, {
    type: 'event.rawPublish',
    timestamp: new Date().toISOString(),
    intent: event.intent,
    correlationId: event.metadata.correlationId,
    traceId: event.metadata.traceId,
    spanId: event.metadata.spanId,
    details,
  });
  await recordAudit(buffers, 'event.rawPublish', event, details);
}

export type SuccessfulPublishRecording = {
  record: PublishedEventRecord;
  /** Event-buffer record written for this publish (undefined without a buffer). */
  bufferRecord?: EventBufferRecord;
};

/**
 * After policy: write history + outbox + published trace/audit.
 */
export async function recordSuccessfulPublish(
  buffers: RecordingBuffers,
  event: DomainEvent,
  subscribersNotified: number,
  tx?: unknown
): Promise<SuccessfulPublishRecording> {
  const record: PublishedEventRecord = {
    event,
    publishedAt: new Date().toISOString(),
    subscribersNotified,
  };
  appendHistory(buffers, record);
  const bufferRecord = await buffers.eventBuffer?.enqueue(event, tx);

  appendTrace(buffers, {
    type: 'event.published',
    timestamp: record.publishedAt,
    intent: event.intent,
    correlationId: event.metadata.correlationId,
    traceId: event.metadata.traceId,
    spanId: event.metadata.spanId,
    details: { subscribersNotified },
  });
  await recordAudit(buffers, 'event.published', event, {
    subscribersNotified,
  });

  return { record, bufferRecord: bufferRecord ?? undefined };
}

/**
 * Settle an event-buffer record after the kernel itself finished delivery
 * (local handlers or a broker handoff). Buffer errors never change publish
 * semantics; they surface as a `hook.error` trace instead.
 */
export async function settleBufferRecord(
  buffers: RecordingBuffers,
  event: DomainEvent,
  bufferRecordId: string,
  outcome: { ok: true } | { ok: false; error: unknown }
): Promise<void> {
  const store = buffers.eventBuffer;
  if (!store) return;
  try {
    if (outcome.ok) await store.markDispatched(bufferRecordId);
    else await store.markFailed(bufferRecordId, outcome.error);
  } catch (err) {
    appendTrace(buffers, {
      type: 'hook.error',
      timestamp: new Date().toISOString(),
      intent: event.intent,
      correlationId: event.metadata.correlationId,
      traceId: event.metadata.traceId,
      spanId: event.metadata.spanId,
      details: {
        hook: 'eventBuffer',
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

/**
 * Record a failed broker handoff (ADR 0024): trace + audit `event.handoffFailed`.
 */
export async function recordHandoffFailure(
  buffers: RecordingBuffers,
  event: DomainEvent,
  error: unknown,
  transport: string
): Promise<void> {
  const details = {
    transport,
    error: error instanceof Error ? error.message : String(error),
  };
  appendTrace(buffers, {
    type: 'event.handoffFailed',
    timestamp: new Date().toISOString(),
    intent: event.intent,
    correlationId: event.metadata.correlationId,
    traceId: event.metadata.traceId,
    spanId: event.metadata.spanId,
    details,
  });
  await recordAudit(buffers, 'event.handoffFailed', event, details);
}

export function enrichMetadata(
  base: EventMetadata,
  extra: Partial<EventMetadata>,
  instanceId?: string
): EventMetadata {
  return {
    ...base,
    ...extra,
    occurredAt: extra.occurredAt || base.occurredAt || new Date().toISOString(),
    source: extra.source || base.source || 'unknown',
    kernelInstanceId: extra.kernelInstanceId ?? base.kernelInstanceId ?? instanceId,
    eventVersion: extra.eventVersion ?? base.eventVersion,
    schemaVersion: extra.schemaVersion ?? base.schemaVersion,
    allowInterception: extra.allowInterception ?? base.allowInterception,
    interceptions: extra.interceptions ?? base.interceptions,
    correlationId: extra.correlationId ?? base.correlationId,
    causationId: extra.causationId ?? base.causationId,
    traceId: extra.traceId ?? base.traceId,
    spanId: extra.spanId ?? base.spanId,
    parentSpanId: extra.parentSpanId ?? base.parentSpanId,
  };
}
