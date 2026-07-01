/**
 * EventBus implementation.
 *
 * Core publish/subscribe mechanics with:
 * - Intent-aware typing via creators
 * - Automatic metadata enrichment
 * - Full publish history for observability
 * - Strict registry validation (opt-in by default when registry provided)
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
  EventPayloadPatch,
  IntentCreator,
  ObservedLayerFlowMode,
  PublishedEventRecord,
  TraceRecord,
  TraceSink,
  Unsubscribe,
} from './types';
import type { IntentRegistry } from '../intent/IntentRegistry';
import type { DependencyGraph } from '../graph';
import type { ArchitectureProfile } from '../layers';
import type { AuditRecordType, AuditTrail } from '../audit';
import type { EventContractRegistry } from '../event-contracts';
import type { OutboxStore } from '../outbox';
import { validateIntentName } from '../intent/validateIntentName';
import {
  PolicyEngine,
  PolicyViolationError,
  isLayerPolicy,
  type PolicyEvaluationResult,
} from '../policy';
import { buildPublishPolicyContext } from './policyContext';
import {
  UnregisteredIntentError,
  InvalidIntentNameError,
  LayerPolicyContextError,
  EventContractViolationError,
  UnknownEventSourceError,
  ObservedLayerFlowViolationError,
} from './errors';

interface InternalSubscription {
  intentName: string;
  handler: EventHandler<IntentName, unknown>;
}

interface InternalInterceptor {
  registrationId: string;
  interceptorId: string;
  intentName: string;
  interceptor: EventInterceptor<IntentName, unknown>;
  createdAt: string;
  lastInterceptedAt?: string;
}

let interceptorSequence = 0;

function nextInterceptorRegistrationId(): string {
  interceptorSequence += 1;
  return `interceptor-${Date.now()}-${interceptorSequence}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function clonePatchValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clonePatchValue);
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, clonePatchValue(child)])
    );
  }
  return value;
}

function mergeRecordPatch(
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
  path = 'payload'
): Record<string, unknown> {
  const next = { ...target };

  for (const [key, value] of Object.entries(patch)) {
    const childPath = `${path}.${key}`;
    if (!(key in next) || next[key] === undefined) {
      next[key] = clonePatchValue(value);
      continue;
    }

    if (isPlainRecord(next[key]) && isPlainRecord(value)) {
      next[key] = mergeRecordPatch(next[key] as Record<string, unknown>, value, childPath);
      continue;
    }

    if (Array.isArray(next[key]) && Array.isArray(value)) {
      next[key] = mergeArrayPatch(next[key] as unknown[], value, childPath);
      continue;
    }

    throw new Error(`Interceptor patch cannot overwrite existing ${childPath}.`);
  }

  return next;
}

function mergeArrayPatch(
  target: unknown[],
  patch: unknown[],
  path = 'payload'
): unknown[] {
  const next = [...target];

  patch.forEach((value, index) => {
    const childPath = `${path}[${index}]`;
    if (index >= next.length || next[index] === undefined) {
      next[index] = clonePatchValue(value);
      return;
    }

    if (isPlainRecord(next[index]) && isPlainRecord(value)) {
      next[index] = mergeRecordPatch(next[index] as Record<string, unknown>, value, childPath);
      return;
    }

    if (Array.isArray(next[index]) && Array.isArray(value)) {
      next[index] = mergeArrayPatch(next[index] as unknown[], value, childPath);
      return;
    }

    throw new Error(`Interceptor patch cannot overwrite existing ${childPath}.`);
  });

  return next;
}

function applyPayloadPatch(payload: unknown, patch: EventPayloadPatch): unknown {
  if (Array.isArray(patch)) {
    if (payload === undefined) return clonePatchValue(patch);
    if (!Array.isArray(payload)) {
      throw new Error('Array interceptor patch requires an array payload.');
    }
    return mergeArrayPatch(payload, patch);
  }

  if (payload === undefined) return clonePatchValue(patch);
  if (!isPlainRecord(payload)) {
    throw new Error('Object interceptor patch requires an object payload.');
  }
  return mergeRecordPatch(payload, patch);
}

export class EventBusImpl<Context = unknown> implements EventBus {
  private readonly subscriptions: InternalSubscription[] = [];
  private readonly subscriptionsByIntent = new Map<string, InternalSubscription[]>();
  private readonly interceptors: InternalInterceptor[] = [];
  private readonly interceptorsByIntent = new Map<string, InternalInterceptor[]>();
  private readonly history: PublishedEventRecord[] = [];
  private readonly trace: TraceRecord[] = [];
  private readonly onPublish?: (event: DomainEvent) => void | Promise<void>;
  private readonly onSoftViolation?: EventBusOptions<Context>['onSoftViolation'];
  private readonly onHandlerError?: EventBusOptions<Context>['onHandlerError'];
  private readonly auditTrail?: AuditTrail;
  private readonly eventContracts?: EventContractRegistry;
  private readonly strictEventContracts: boolean;
  private readonly requireKnownSource: boolean;
  private readonly architectureProfile?: ArchitectureProfile;
  private readonly enforceObservedLayerFlowMode: ObservedLayerFlowMode;
  private readonly outbox?: OutboxStore;
  private readonly instanceId?: string;
  private readonly traceSinks: TraceSink[];
  private readonly rethrowHandlerErrors: boolean;
  private readonly policyEngine?: PolicyEngine<Context>;
  private readonly getPolicyContext: (event: DomainEvent) => Context;
  private readonly maxHistorySize?: number;
  private readonly intentRegistry?: IntentRegistry;
  private readonly dependencyGraph?: DependencyGraph;
  private readonly strictRegistry: boolean;
  private readonly validateIntentNaming: boolean;

  constructor(options: EventBusOptions<Context> = {}) {
    this.onPublish = options.onPublish;
    this.onSoftViolation = options.onSoftViolation;
    this.onHandlerError = options.onHandlerError;
    this.auditTrail = options.auditTrail;
    this.eventContracts = options.eventContracts;
    this.strictEventContracts = options.strictEventContracts ?? false;
    this.requireKnownSource = options.requireKnownSource ?? false;
    this.architectureProfile = options.architectureProfile;
    this.enforceObservedLayerFlowMode = options.enforceObservedLayerFlow ?? 'off';
    this.outbox = options.outbox;
    this.instanceId = options.instanceId;
    this.traceSinks = [...(options.traceSinks ?? [])];
    this.rethrowHandlerErrors = options.rethrowHandlerErrors ?? false;
    this.maxHistorySize = options.maxHistorySize;
    this.intentRegistry = options.intentRegistry;
    this.dependencyGraph = options.dependencyGraph;
    this.strictRegistry =
      options.strictRegistry ?? options.intentRegistry !== undefined;
    this.validateIntentNaming =
      options.validateIntentNaming ?? this.strictRegistry;

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

    if (typeof eventOrCreator === 'function') {
      const creator = eventOrCreator as IntentCreator<N, P>;
      const payload = payloadOrMeta as P;
      const extraMeta = metadata ?? {};
      const created = creator(payload);
      event = {
        ...created,
        metadata: this.enrichMetadata(created.metadata, extraMeta),
      } as DomainEvent<N, P>;
    } else {
      const rawEvent = eventOrCreator as DomainEvent<N, P>;
      const extraMeta =
        (metadata as Partial<EventMetadata>) ??
        (payloadOrMeta as Partial<EventMetadata>) ??
        {};
      event = {
        ...rawEvent,
        metadata: this.enrichMetadata(rawEvent.metadata, extraMeta),
      };
    }

    this.assertIntentAllowed(event.intent);
    this.assertSourceAllowed(event as DomainEvent);
    this.assertContractAllowed(event as DomainEvent);
    event = await this.applyInterceptors(event as DomainEvent<N, P>);
    this.assertContractAllowed(event as DomainEvent);
    // Enforce BEFORE recording the observed edge: in hard mode a rejected flow must not
    // leave a phantom edge in the graph that pollutes drift/manifest/observability reports.
    await this.assertObservedLayerFlowAllowed(event as DomainEvent);
    this.dependencyGraph?.registerEventFlow(event.metadata.source, event.intent);

    const matching = [...(this.subscriptionsByIntent.get(event.intent) ?? [])];

    if (this.policyEngine) {
      const ctx = this.getPolicyContext(event as DomainEvent);
      let policyResult: PolicyEvaluationResult;
      try {
        policyResult = this.policyEngine.enforce(ctx);
      } catch (err) {
        if (err instanceof PolicyViolationError) {
          this.appendTrace({
            type: 'policy.hardViolation',
            timestamp: new Date().toISOString(),
            intent: event.intent,
            correlationId: event.metadata.correlationId,
            traceId: event.metadata.traceId,
            spanId: event.metadata.spanId,
            details: { violations: err.violations },
          });
          await this.recordAudit('policy.hardViolation', event as DomainEvent, {
            violations: err.violations,
          });
        }
        throw err;
      }

      if (policyResult.softViolations.length > 0) {
        this.appendTrace({
          type: 'policy.softViolation',
          timestamp: new Date().toISOString(),
          intent: event.intent,
          correlationId: event.metadata.correlationId,
          traceId: event.metadata.traceId,
          spanId: event.metadata.spanId,
          details: { violations: policyResult.softViolations },
        });
        await this.recordAudit('policy.softViolation', event as DomainEvent, {
          violations: policyResult.softViolations,
        });

        if (this.onSoftViolation) {
          await this.safeHook(
            () => this.onSoftViolation!(policyResult, event as DomainEvent),
            'onSoftViolation',
            event as DomainEvent
          );
        }
      }
    }

    const record: PublishedEventRecord = {
      event: event as DomainEvent,
      publishedAt: new Date().toISOString(),
      subscribersNotified: matching.length,
    };
    this.appendHistory(record);
    await this.outbox?.enqueue(event as DomainEvent);

    this.appendTrace({
      type: 'event.published',
      timestamp: record.publishedAt,
      intent: event.intent,
      correlationId: event.metadata.correlationId,
      traceId: event.metadata.traceId,
      spanId: event.metadata.spanId,
      details: { subscribersNotified: matching.length },
    });
    await this.recordAudit('event.published', event as DomainEvent, {
      subscribersNotified: matching.length,
    });

    const notifications = matching.map((sub) =>
      this.invokeHandler(sub, event as DomainEvent)
    );

    await Promise.all(notifications);

    if (this.onPublish) {
      await this.safeHook(
        () => this.onPublish!(event as DomainEvent),
        'onPublish',
        event as DomainEvent
      );
    }
  }

  subscribe<N extends IntentName, P>(
    intent: N | IntentCreator<N, P>,
    handler: EventHandler<N, P>
  ): Unsubscribe {
    const intentName =
      typeof intent === 'string' ? intent : (intent as IntentCreator<N, P>).name;

    this.assertIntentAllowed(intentName);

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

    this.assertIntentAllowed(intentName);

    const registration: InternalInterceptor = {
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
    return [...this.history];
  }

  clearHistory(): void {
    this.history.length = 0;
  }

  getTrace(): TraceRecord[] {
    return [...this.trace];
  }

  clearTrace(): void {
    this.trace.length = 0;
  }

  private assertIntentAllowed(intentName: string): void {
    if (!this.strictRegistry && !this.validateIntentNaming) {
      return;
    }

    if (this.validateIntentNaming) {
      const validation = validateIntentName(intentName);
      if (!validation.valid) {
        throw new InvalidIntentNameError(intentName, validation.reason!);
      }
    }

    if (this.strictRegistry && this.intentRegistry && !this.intentRegistry.has(intentName)) {
      throw new UnregisteredIntentError(intentName);
    }
  }

  private assertSourceAllowed(event: DomainEvent): void {
    if (!this.requireKnownSource) return;
    if (!event.metadata.source || event.metadata.source === 'unknown') {
      throw new UnknownEventSourceError(event.intent);
    }
    if (this.intentRegistry && !this.intentRegistry.has(event.metadata.source)) {
      throw new UnknownEventSourceError(event.intent);
    }
  }

  private assertContractAllowed(event: DomainEvent): void {
    if (!this.eventContracts) return;
    const result = this.eventContracts.validate(event);

    if (!result.ok && (this.strictEventContracts || result.contract)) {
      throw new EventContractViolationError(event.intent, result.issues);
    }
  }

  /**
   * Enforce the OBSERVED producer→event flow (metadata.source → intent) against the
   * architecture profile's layer rules. This is the runtime counterpart to the
   * declared-model layer policy: it checks what the system actually did, using the same
   * flow edge already recorded via registerEventFlow.
   */
  private async assertObservedLayerFlowAllowed(event: DomainEvent): Promise<void> {
    if (this.enforceObservedLayerFlowMode === 'off' || !this.architectureProfile) {
      return;
    }

    const source = event.metadata.source;
    if (!source || source === 'unknown') return;

    const profile = this.architectureProfile;
    const fromLayer = profile.resolveLayer(source);
    const toLayer = profile.resolveLayer(event.intent);
    if (!fromLayer || !toLayer) return;

    const blocked = profile.rules.find(
      (rule) => !rule.allowed && rule.from === fromLayer && rule.to === toLayer
    );
    if (!blocked) return;

    const severity = this.enforceObservedLayerFlowMode;
    const message =
      blocked.message ??
      `Observed layer violation: "${source}" (${fromLayer}) must not produce "${event.intent}" (${toLayer}).`;
    const details = { source, intent: event.intent, fromLayer, toLayer, severity, message };

    this.appendTrace({
      type: 'layer.observedViolation',
      timestamp: new Date().toISOString(),
      intent: event.intent,
      correlationId: event.metadata.correlationId,
      traceId: event.metadata.traceId,
      spanId: event.metadata.spanId,
      details,
    });
    await this.recordAudit('layer.observedViolation', event, details);

    if (severity === 'hard') {
      throw new ObservedLayerFlowViolationError(source, event.intent, fromLayer, toLayer, message);
    }
  }

  private async applyInterceptors<N extends IntentName, P>(
    event: DomainEvent<N, P>
  ): Promise<DomainEvent<N, P>> {
    if (event.metadata.allowInterception === false) {
      return event;
    }

    const matching = [...(this.interceptorsByIntent.get(event.intent) ?? [])];
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

        this.assertContractAllowed(candidate as DomainEvent);
        current = candidate;
        registration.lastInterceptedAt = timestamp;

        this.appendTrace({
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
        await this.recordAudit('event.intercepted', current as DomainEvent, {
          registrationId: registration.registrationId,
          interceptorId: registration.interceptorId,
          patchesApplied: patches.length,
        });
      } catch (err) {
        await this.recordInterceptorError(registration, current as DomainEvent, err);
      }
    }

    return current;
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

  private async recordInterceptorError(
    interceptor: InternalInterceptor,
    event: DomainEvent,
    error: unknown
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.appendTrace({
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
    await this.recordAudit('interceptor.error', event, {
      registrationId: interceptor.registrationId,
      interceptorId: interceptor.interceptorId,
      error: message,
    });
  }

  private appendHistory(record: PublishedEventRecord): void {
    this.history.push(record);
    if (
      this.maxHistorySize !== undefined &&
      this.history.length > this.maxHistorySize
    ) {
      this.history.splice(0, this.history.length - this.maxHistorySize);
    }
  }

  private appendTrace(record: TraceRecord): void {
    this.trace.push(record);
    if (
      this.maxHistorySize !== undefined &&
      this.trace.length > this.maxHistorySize
    ) {
      this.trace.splice(0, this.trace.length - this.maxHistorySize);
    }
    for (const sink of this.traceSinks) {
      try {
        sink(record);
      } catch {
        /* Trace sinks must not affect publish semantics. */
      }
    }
  }

  private async recordAudit(
    type: AuditRecordType,
    event: DomainEvent,
    details?: unknown
  ): Promise<void> {
    if (!this.auditTrail) return;
    try {
      await this.auditTrail.record({
        type,
        source: event.metadata.source,
        intent: event.intent,
        correlationId: event.metadata.correlationId,
        causationId: event.metadata.causationId,
        subject: event.intent,
        details,
      });
    } catch (err) {
      this.appendTrace({
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

  private enrichMetadata(
    base: EventMetadata,
    extra: Partial<EventMetadata>
  ): EventMetadata {
    return {
      ...base,
      ...extra,
      occurredAt:
        extra.occurredAt || base.occurredAt || new Date().toISOString(),
      source: extra.source || base.source || 'unknown',
      kernelInstanceId:
        extra.kernelInstanceId ?? base.kernelInstanceId ?? this.instanceId,
      eventVersion: extra.eventVersion ?? base.eventVersion,
      schemaVersion: extra.schemaVersion ?? base.schemaVersion,
      allowInterception:
        extra.allowInterception ?? base.allowInterception,
      interceptions:
        extra.interceptions ?? base.interceptions,
      correlationId: extra.correlationId ?? base.correlationId,
      causationId: extra.causationId ?? base.causationId,
      traceId: extra.traceId ?? base.traceId,
      spanId: extra.spanId ?? base.spanId,
      parentSpanId: extra.parentSpanId ?? base.parentSpanId,
    };
  }
}

export function createEventBus<Context = unknown>(
  options?: EventBusOptions<Context>
): EventBus {
  return new EventBusImpl(options);
}
