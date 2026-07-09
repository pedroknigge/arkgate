/**
 * Interceptor application stage of the publish pipeline.
 * Applies registered interceptors in order; re-validates contracts after each patch set.
 */
import type { DomainEvent, IntentName } from '../../domain/types';
import type { AuditRecordType } from '../audit';
import type {
  EventInterceptor,
  EventPayloadPatch,
  TraceRecord,
} from './types';
import { applyPayloadPatch } from './payloadPatch';
import { assertContractAllowed } from './publishGuards';
import type { EventContractRegistry } from '../event-contracts';

export interface RegisteredInterceptor {
  registrationId: string;
  interceptorId: string;
  intentName: string;
  interceptor: EventInterceptor<IntentName, unknown>;
  createdAt: string;
  lastInterceptedAt?: string;
}

export type ApplyInterceptorsDeps = {
  interceptorsForIntent: (intent: string) => RegisteredInterceptor[];
  eventContracts?: EventContractRegistry;
  strictEventContracts: boolean;
  appendTrace: (record: TraceRecord) => void;
  recordAudit: (
    type: AuditRecordType,
    event: DomainEvent,
    details?: unknown
  ) => Promise<void>;
};

export async function applyInterceptors<N extends IntentName, P>(
  event: DomainEvent<N, P>,
  deps: ApplyInterceptorsDeps
): Promise<DomainEvent<N, P>> {
  if (event.metadata.allowInterception === false) {
    return event;
  }

  const matching = [...deps.interceptorsForIntent(event.intent)];
  let current = event as DomainEvent<N, P>;

  for (const registration of matching) {
    const patches: EventPayloadPatch[] = [];
    try {
      await Promise.resolve(
        registration.interceptor({
          event: current as Readonly<DomainEvent<IntentName, unknown>>,
          intercept: (patch) => {
            patches.push(patch);
          },
        })
      );

      if (patches.length === 0) {
        continue;
      }

      const timestamp = new Date().toISOString();
      let candidate = {
        ...current,
        metadata: {
          ...current.metadata,
          interceptions: [
            ...(current.metadata.interceptions ?? []),
            { interceptorId: registration.interceptorId, timestamp },
          ],
        },
      } as DomainEvent<N, P>;

      for (const patch of patches) {
        candidate = {
          ...candidate,
          payload: applyPayloadPatch(candidate.payload, patch) as P,
          metadata: { ...candidate.metadata },
        };
      }

      assertContractAllowed(candidate as DomainEvent, {
        eventContracts: deps.eventContracts,
        strictEventContracts: deps.strictEventContracts,
      });
      current = candidate;
      registration.lastInterceptedAt = timestamp;

      deps.appendTrace({
        type: 'event.intercepted',
        timestamp,
        intent: current.intent,
        correlationId: current.metadata.correlationId,
        traceId: current.metadata.traceId,
        spanId: current.metadata.spanId,
        details: {
          registrationId: registration.registrationId,
          interceptorId: registration.interceptorId,
          patchesApplied: patches.length,
        },
      });
      await deps.recordAudit('event.intercepted', current as DomainEvent, {
        registrationId: registration.registrationId,
        interceptorId: registration.interceptorId,
        patchesApplied: patches.length,
      });
    } catch (err) {
      await recordInterceptorError(registration, current as DomainEvent, err, deps);
    }
  }

  return current;
}

async function recordInterceptorError(
  interceptor: RegisteredInterceptor,
  event: DomainEvent,
  error: unknown,
  deps: Pick<ApplyInterceptorsDeps, 'appendTrace' | 'recordAudit'>
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  deps.appendTrace({
    type: 'interceptor.error',
    timestamp: new Date().toISOString(),
    intent: event.intent,
    correlationId: event.metadata.correlationId,
    traceId: event.metadata.traceId,
    spanId: event.metadata.spanId,
    details: {
      registrationId: interceptor.registrationId,
      interceptorId: interceptor.interceptorId,
      error: message,
    },
  });
  await deps.recordAudit('interceptor.error', event, {
    registrationId: interceptor.registrationId,
    interceptorId: interceptor.interceptorId,
    error: message,
  });
}
