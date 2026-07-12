/**
 * EventBus implementation — public surface + publish orchestration.
 *
 * Publish pipeline stages live in cohesive modules (R8):
 *   guards → interceptors → contract re-check → observed layer flow →
 *   policy → history/outbox/trace → handlers → onPublish hook
 */
import type {
  DomainEvent,
  EventMetadata,
  IntentName,
} from '../../domain/types';
import type {
  EventBus,
  EventBusOptions,
  EventHandler,
  EventInterceptor,
  EventInterceptionInfo,
  EventPublisher,
  IntentCreator,
  ObservedLayerFlowMode,
  PublishedEventRecord,
  TraceRecord,
  Unsubscribe,
} from './types';
import type { IntentRegistry } from '../intent/IntentRegistry';
import type { DependencyGraph } from '../graph';
import type { ArchitectureProfile } from '../layers';
import type { EventContractRegistry } from '../event-contracts';
import {
  PolicyEngine,
  isLayerPolicy,
} from '../policy';
import { buildPublishPolicyContext } from './policyContext';
import {
  LayerPolicyContextError,
  SourceMetadataOverrideError,
} from './errors';
import {
  assertIntentAllowed,
  assertSourceAllowed,
  assertContractAllowed,
} from './publishGuards';
import { applyInterceptors, type RegisteredInterceptor } from './publishInterceptors';
import { assertObservedLayerFlowAllowed } from './observedLayerFlow';
import { enforcePublishPolicy } from './publishPolicy';
import {
  appendTrace as appendTraceToBuffers,
  recordAudit as recordAuditToBuffers,
  recordRawPublishDiagnostic,
  recordSuccessfulPublish,
  enrichMetadata,
  type RecordingBuffers,
} from './publishRecording';

interface InternalSubscription {
  intentName: string;
  handler: EventHandler<IntentName, unknown>;
}

let interceptorSequence = 0;

function nextInterceptorRegistrationId(): string {
  interceptorSequence += 1;
  return `interceptor-${Date.now()}-${interceptorSequence}`;
}

export class EventBusImpl<Context = unknown> implements EventBus {
  private readonly subscriptions: InternalSubscription[] = [];
  private readonly subscriptionsByIntent = new Map<string, InternalSubscription[]>();
  private readonly interceptors: RegisteredInterceptor[] = [];
  private readonly interceptorsByIntent = new Map<string, RegisteredInterceptor[]>();
  private readonly recording: RecordingBuffers;
  private readonly onPublish?: (event: DomainEvent) => void | Promise<void>;
  private readonly onSoftViolation?: EventBusOptions<Context>['onSoftViolation'];
  private readonly onHandlerError?: EventBusOptions<Context>['onHandlerError'];
  private readonly eventContracts?: EventContractRegistry;
  private readonly strictEventContracts: boolean;
  private readonly requireKnownSource: boolean;
  private readonly architectureProfile?: ArchitectureProfile;
  private readonly enforceObservedLayerFlowMode: ObservedLayerFlowMode;
  private readonly rethrowHandlerErrors: boolean;
  private readonly policyEngine?: PolicyEngine<Context>;
  private readonly getPolicyContext: (event: DomainEvent) => Context;
  private readonly intentRegistry?: IntentRegistry;
  private readonly dependencyGraph?: DependencyGraph;
  private readonly strictRegistry: boolean;
  private readonly validateIntentNaming: boolean;

  constructor(options: EventBusOptions<Context> = {}) {
    this.onPublish = options.onPublish;
    this.onSoftViolation = options.onSoftViolation;
    this.onHandlerError = options.onHandlerError;
    this.eventContracts = options.eventContracts;
    this.strictEventContracts = options.strictEventContracts ?? false;
    this.requireKnownSource = options.requireKnownSource ?? false;
    this.architectureProfile = options.architectureProfile;
    this.enforceObservedLayerFlowMode = options.enforceObservedLayerFlow ?? 'off';
    this.rethrowHandlerErrors = options.rethrowHandlerErrors ?? false;
    this.intentRegistry = options.intentRegistry;
    this.dependencyGraph = options.dependencyGraph;
    this.strictRegistry =
      options.strictRegistry ?? options.intentRegistry !== undefined;
    this.validateIntentNaming =
      options.validateIntentNaming ?? this.strictRegistry;

    this.recording = {
      history: [],
      trace: [],
      maxHistorySize: options.maxHistorySize,
      traceSinks: [...(options.traceSinks ?? [])],
      auditTrail: options.auditTrail,
      eventBuffer: options.eventBuffer ?? options.outbox,
      instanceId: options.instanceId,
    };

    if (options.policyEngine) {
      this.policyEngine = options.policyEngine;
    } else if (options.policies && options.policies.length > 0) {
      this.policyEngine = new PolicyEngine(options.policies);
    }

    const allPolicies =
      this.policyEngine?.getPolicies() ?? options.policies ?? [];
    if (
      allPolicies.some(isLayerPolicy) &&
      !options.intentRegistry &&
      !options.dependencyGraph &&
      !options.getPolicyContext
    ) {
      throw new LayerPolicyContextError();
    }

    if (options.getPolicyContext) {
      this.getPolicyContext = options.getPolicyContext;
    } else if (options.intentRegistry || options.dependencyGraph) {
      this.getPolicyContext = buildPublishPolicyContext({
        intentRegistry: options.intentRegistry,
        dependencyGraph: options.dependencyGraph,
      }) as (event: DomainEvent) => Context;
    } else {
      this.getPolicyContext = (event) => ({ event } as Context);
    }
  }

  async publish<N extends IntentName, P>(
    eventOrCreator: DomainEvent<N, P> | IntentCreator<N, P>,
    payloadOrMeta?: P | Partial<EventMetadata>,
    metadata?: Partial<EventMetadata>
  ): Promise<void> {
    let event: DomainEvent<N, P>;
    const rawPublish = typeof eventOrCreator !== 'function';

    if (!rawPublish) {
      const creator = eventOrCreator as IntentCreator<N, P>;
      const payload = payloadOrMeta as P;
      const extraMeta = metadata ?? {};
      const created = creator(payload);
      event = {
        ...created,
        metadata: enrichMetadata(
          created.metadata,
          extraMeta,
          this.recording.instanceId
        ),
      } as DomainEvent<N, P>;
    } else {
      const rawEvent = eventOrCreator as DomainEvent<N, P>;
      const extraMeta =
        (metadata as Partial<EventMetadata>) ??
        (payloadOrMeta as Partial<EventMetadata>) ??
        {};
      event = {
        ...rawEvent,
        metadata: enrichMetadata(
          rawEvent.metadata,
          extraMeta,
          this.recording.instanceId
        ),
      };
    }

    // --- Publish pipeline (order is the product contract) ---

    if (rawPublish && this.strictRegistry) {
      await recordRawPublishDiagnostic(this.recording, event as DomainEvent);
    }

    // 1. Guards: intent + source + contract
    assertIntentAllowed(event.intent, {
      strictRegistry: this.strictRegistry,
      validateIntentNaming: this.validateIntentNaming,
      intentRegistry: this.intentRegistry,
    });
    assertSourceAllowed(event as DomainEvent, {
      requireKnownSource: this.requireKnownSource,
      intentRegistry: this.intentRegistry,
    });
    assertContractAllowed(event as DomainEvent, {
      eventContracts: this.eventContracts,
      strictEventContracts: this.strictEventContracts,
    });

    // 2. Interceptors (may patch payload; contract re-checked per interceptor)
    event = await applyInterceptors(event as DomainEvent<N, P>, {
      interceptorsForIntent: (intent) => this.interceptorsByIntent.get(intent) ?? [],
      eventContracts: this.eventContracts,
      strictEventContracts: this.strictEventContracts,
      appendTrace: (r) => this.appendTrace(r),
      recordAudit: (type, e, details) => this.recordAudit(type, e, details),
    });

    // 3. Contract again after interceptors
    assertContractAllowed(event as DomainEvent, {
      eventContracts: this.eventContracts,
      strictEventContracts: this.strictEventContracts,
    });

    // 4. Observed layer flow BEFORE graph edge registration
    await assertObservedLayerFlowAllowed(event as DomainEvent, {
      mode: this.enforceObservedLayerFlowMode,
      architectureProfile: this.architectureProfile,
      appendTrace: (r) => this.appendTrace(r),
      recordAudit: (type, e, details) => this.recordAudit(type, e, details),
    });
    this.dependencyGraph?.registerEventFlow(event.metadata.source, event.intent);

    // Snapshot subscribers before policy hooks so onSoftViolation cannot change
    // who is notified for this publish (preserves pre-R8 semantics).
    const matching = [...(this.subscriptionsByIntent.get(event.intent) ?? [])];

    // 5. Policy
    if (this.policyEngine) {
      await enforcePublishPolicy(event as DomainEvent, {
        policyEngine: this.policyEngine,
        getPolicyContext: this.getPolicyContext,
        appendTrace: (r) => this.appendTrace(r),
        recordAudit: (type, e, details) => this.recordAudit(type, e, details),
        onSoftViolation: this.onSoftViolation,
        safeHook: (fn, name, e) => this.safeHook(fn, name, e),
      });
    }

    // 6. History / outbox / published trace
    await recordSuccessfulPublish(
      this.recording,
      event as DomainEvent,
      matching.length
    );

    // 7. Handlers + onPublish hook
    await Promise.all(
      matching.map((sub) => this.invokeHandler(sub, event as DomainEvent))
    );

    if (this.onPublish) {
      await this.safeHook(
        () => this.onPublish!(event as DomainEvent),
        'onPublish',
        event as DomainEvent
      );
    }
  }

  createPublisher<N extends IntentName, P>(
    source: N | IntentCreator<N, P>
  ): EventPublisher {
    const sourceName =
      typeof source === 'string' ? source : (source as IntentCreator<N, P>).name;

    assertIntentAllowed(sourceName, {
      strictRegistry: this.strictRegistry,
      validateIntentNaming: this.validateIntentNaming,
      intentRegistry: this.intentRegistry,
    });

    return {
      source: sourceName,
      publish: async <EventName extends IntentName, Payload>(
        intent: IntentCreator<EventName, Payload>,
        payload: Payload,
        metadata: Partial<EventMetadata> = {}
      ) => {
        if (metadata.source && metadata.source !== sourceName) {
          throw new SourceMetadataOverrideError(sourceName, metadata.source);
        }
        await this.publish(intent, payload, {
          ...metadata,
          source: sourceName,
        });
      },
    };
  }

  subscribe<N extends IntentName, P>(
    intent: N | IntentCreator<N, P>,
    handler: EventHandler<N, P>
  ): Unsubscribe {
    const intentName =
      typeof intent === 'string' ? intent : (intent as IntentCreator<N, P>).name;

    assertIntentAllowed(intentName, {
      strictRegistry: this.strictRegistry,
      validateIntentNaming: this.validateIntentNaming,
      intentRegistry: this.intentRegistry,
    });

    const sub: InternalSubscription = {
      intentName,
      handler: handler as EventHandler<IntentName, unknown>,
    };

    this.subscriptions.push(sub);
    const subscriptionsForIntent = this.subscriptionsByIntent.get(intentName) ?? [];
    subscriptionsForIntent.push(sub);
    this.subscriptionsByIntent.set(intentName, subscriptionsForIntent);

    return () => {
      const idx = this.subscriptions.indexOf(sub);
      if (idx >= 0) this.subscriptions.splice(idx, 1);

      const byIntent = this.subscriptionsByIntent.get(intentName);
      if (!byIntent) return;

      const intentIdx = byIntent.indexOf(sub);
      if (intentIdx >= 0) byIntent.splice(intentIdx, 1);
      if (byIntent.length === 0) this.subscriptionsByIntent.delete(intentName);
    };
  }

  registerInterceptor<N extends IntentName, P>(
    intent: N | IntentCreator<N, P>,
    interceptor: EventInterceptor<N, P>,
    interceptorId?: string
  ): string {
    const intentName =
      typeof intent === 'string' ? intent : (intent as IntentCreator<N, P>).name;

    assertIntentAllowed(intentName, {
      strictRegistry: this.strictRegistry,
      validateIntentNaming: this.validateIntentNaming,
      intentRegistry: this.intentRegistry,
    });

    const registration: RegisteredInterceptor = {
      registrationId: nextInterceptorRegistrationId(),
      interceptorId: interceptorId ?? intentName,
      intentName,
      interceptor: interceptor as EventInterceptor<IntentName, unknown>,
      createdAt: new Date().toISOString(),
    };

    this.interceptors.push(registration);
    const interceptorsForIntent = this.interceptorsByIntent.get(intentName) ?? [];
    interceptorsForIntent.push(registration);
    this.interceptorsByIntent.set(intentName, interceptorsForIntent);

    return registration.registrationId;
  }

  unregisterInterceptor(registrationId: string): boolean {
    const interceptor = this.interceptors.find(
      (candidate) => candidate.registrationId === registrationId
    );
    if (!interceptor) return false;

    const idx = this.interceptors.indexOf(interceptor);
    if (idx >= 0) this.interceptors.splice(idx, 1);

    const byIntent = this.interceptorsByIntent.get(interceptor.intentName);
    if (byIntent) {
      const intentIdx = byIntent.indexOf(interceptor);
      if (intentIdx >= 0) byIntent.splice(intentIdx, 1);
      if (byIntent.length === 0) this.interceptorsByIntent.delete(interceptor.intentName);
    }

    return true;
  }

  listInterceptors(intent?: string): EventInterceptionInfo[] {
    return this.interceptors
      .filter((interceptor) => !intent || interceptor.intentName === intent)
      .map((interceptor) => ({
        registrationId: interceptor.registrationId,
        interceptorId: interceptor.interceptorId,
        intent: interceptor.intentName,
        createdAt: interceptor.createdAt,
        lastInterceptedAt: interceptor.lastInterceptedAt,
      }));
  }

  getHistory(): PublishedEventRecord[] {
    return [...this.recording.history];
  }

  clearHistory(): void {
    this.recording.history.length = 0;
  }

  getTrace(): TraceRecord[] {
    return [...this.recording.trace];
  }

  clearTrace(): void {
    this.recording.trace.length = 0;
  }

  private appendTrace(record: TraceRecord): void {
    appendTraceToBuffers(this.recording, record);
  }

  private async recordAudit(
    type: Parameters<typeof recordAuditToBuffers>[1],
    event: DomainEvent,
    details?: unknown
  ): Promise<void> {
    await recordAuditToBuffers(this.recording, type, event, details);
  }

  private async invokeHandler(
    sub: InternalSubscription,
    event: DomainEvent
  ): Promise<void> {
    try {
      await Promise.resolve(sub.handler(event));
    } catch (err) {
      this.appendTrace({
        type: 'handler.error',
        timestamp: new Date().toISOString(),
        intent: event.intent,
        correlationId: event.metadata.correlationId,
        traceId: event.metadata.traceId,
        spanId: event.metadata.spanId,
        details: { error: err instanceof Error ? err.message : String(err) },
      });
      await this.recordAudit('handler.error', event, {
        handlerIntent: sub.intentName,
        error: err instanceof Error ? err.message : String(err),
      });

      if (this.onHandlerError) {
        await this.safeHook(
          () => this.onHandlerError!(err, event, sub.intentName),
          'onHandlerError',
          event
        );
      }

      if (this.rethrowHandlerErrors) {
        throw err;
      }
    }
  }

  private async safeHook(
    fn: () => void | Promise<void>,
    hookName: string,
    event: DomainEvent
  ): Promise<void> {
    try {
      await Promise.resolve(fn());
    } catch (err) {
      this.appendTrace({
        type: 'hook.error',
        timestamp: new Date().toISOString(),
        intent: event.intent,
        correlationId: event.metadata.correlationId,
        traceId: event.metadata.traceId,
        spanId: event.metadata.spanId,
        details: {
          hook: hookName,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      await this.recordAudit('hook.error', event, {
        hook: hookName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function createEventBus<Context = unknown>(
  options?: EventBusOptions<Context>
): EventBus {
  return new EventBusImpl(options);
}
