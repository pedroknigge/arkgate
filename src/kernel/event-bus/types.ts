/**
 * Event Bus types for the Ark kernel.
 *
 * The Event Bus is the central nervous system for Domain Events.
 * It provides publish/subscribe, history for observability, and metadata handling.
 */

import type { DomainEvent, EventMetadata, IntentName } from '../../domain/types';
import type { IntentCreator, IntentRegistry } from '../intent';
import type { DependencyGraph } from '../graph';
import type { ArchitectureProfile } from '../layers';
import type { Policy, PolicyEngine, PolicyEvaluationResult } from '../policy';
import type { AuditTrail } from '../audit';
import type { EventContractRegistry } from '../event-contracts';
import type { EventBufferStore } from '../outbox';

export type { IntentCreator };

/** Standard trace record for observability and agent consumption. */
export type TraceRecordType =
  | 'event.published'
  | 'event.rawPublish'
  | 'event.intercepted'
  | 'interceptor.error'
  | 'policy.hardViolation'
  | 'policy.softViolation'
  | 'layer.observedViolation'
  | 'handler.error'
  | 'hook.error';

/**
 * Runtime enforcement mode for observed producer→event layer flows.
 * - 'off': flows are recorded (for drift reports) but never enforced.
 * - 'soft': a `layer.observedViolation` trace + audit record is emitted; publish proceeds.
 * - 'hard': publish throws `ObservedLayerFlowViolationError` before the event reaches
 *   history, outbox, or subscribers.
 */
export type ObservedLayerFlowMode = 'off' | 'soft' | 'hard';

export interface TraceRecord {
  type: TraceRecordType;
  timestamp: string;
  intent: string;
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  details?: unknown;
}

export type TraceSink = (record: TraceRecord) => void;

/**
 * Options when creating an EventBus.
 */
export interface EventBusOptions<Context = unknown> {
  /** Optional hook called after every successful publish */
  onPublish?: (event: DomainEvent) => void | Promise<void>;

  /** Native audit trail used to persist publish, policy, and handler events. */
  auditTrail?: AuditTrail;

  /** Event contracts used to validate payload shape and event versions. */
  eventContracts?: EventContractRegistry;

  /** When true, events without a registered contract are rejected. */
  strictEventContracts?: boolean;

  /** When true, metadata.source must be explicit and not "unknown". */
  requireKnownSource?: boolean;

  /**
   * Architecture profile used to enforce the OBSERVED producer→event layer flow at
   * publish time. Required for `enforceObservedLayerFlow` to have effect.
   */
  architectureProfile?: ArchitectureProfile;

  /**
   * Enforce each published event's real producer→event flow (metadata.source → intent)
   * against `architectureProfile` layer rules at runtime. Unlike the declared-model layer
   * policy, this checks what the system actually did. Default: 'off'.
   */
  enforceObservedLayerFlow?: ObservedLayerFlowMode;

  /** Optional non-atomic event buffer for dispatch handoff. */
  eventBuffer?: EventBufferStore;
  /** @deprecated Use eventBuffer. */
  outbox?: EventBufferStore;

  /** Stable id stamped into event metadata for this kernel/event bus instance. */
  instanceId?: string;

  /** Lightweight tracing hooks for OpenTelemetry or custom tracer bridges. */
  traceSinks?: TraceSink[];

  /** Called when soft policies produce violations (publish still proceeds). */
  onSoftViolation?: (result: PolicyEvaluationResult, event: DomainEvent) => void | Promise<void>;

  /** Called when a subscriber handler throws or rejects. */
  onHandlerError?: (
    error: unknown,
    event: DomainEvent,
    intentName: string
  ) => void | Promise<void>;

  /** When true, rethrow handler errors after calling onHandlerError. Default: false. */
  rethrowHandlerErrors?: boolean;

  /**
   * Policies to evaluate on every publish.
   * If provided, they run before subscribers are notified.
   * Hard violations will cause publish to throw.
   */
  policies?: Policy<Context>[];

  /**
   * Function to build the context object passed to policies for a given event.
   * Default: { event }, or { event, relationships, edges } when registry/graph provided.
   */
  getPolicyContext?: (event: DomainEvent) => Context;

  /**
   * Intent registry whose relationships are injected into the default policy context.
   * Enables layer policies (e.g. architecturalPolicies.layerIsolation) on publish.
   */
  intentRegistry?: IntentRegistry;

  /**
   * Dependency graph whose edges are injected into the default policy context.
   */
  dependencyGraph?: DependencyGraph;

  /**
   * Pre-configured PolicyEngine to use (alternative to policies array).
   */
  policyEngine?: PolicyEngine<Context>;

  /**
   * Maximum publish history entries to retain. Oldest evicted when exceeded.
   * Default: unlimited.
   */
  maxHistorySize?: number;

  /**
   * When true (default: true if intentRegistry is provided), reject publish/subscribe
   * for intents not registered in intentRegistry and optionally validate naming.
   */
  strictRegistry?: boolean;

  /**
   * When true (default: matches strictRegistry), validate intent names follow
   * Domain.* / Application.* / Adapter.* / Workflow.* conventions at runtime.
   */
  validateIntentNaming?: boolean;
}

/**
 * A subscriber is a function that receives events of a specific intent.
 */
export type EventHandler<N extends IntentName, P = unknown> = (
  event: DomainEvent<N, P>
) => void | Promise<void>;

export type EventPayloadPatch = Record<string, unknown> | unknown[];

export interface EventInterceptorContext<N extends IntentName = IntentName, P = unknown> {
  readonly event: Readonly<DomainEvent<N, P>>;
  intercept(patch: EventPayloadPatch): void;
}

export type EventInterceptor<N extends IntentName = IntentName, P = unknown> = (
  context: EventInterceptorContext<N, P>
) => void | Promise<void>;

export interface EventInterceptionInfo {
  registrationId: string;
  interceptorId: string;
  intent: string;
  createdAt: string;
  lastInterceptedAt?: string;
}

/**
 * Unsubscribe function returned by subscribe.
 */
export type Unsubscribe = () => void;

/**
 * Record of a published event for observability.
 */
export interface PublishedEventRecord {
  event: DomainEvent;
  publishedAt: string;
  subscribersNotified: number;
}

export interface EventPublisher {
  readonly source: string;
  publish<N extends IntentName, P>(
    intent: IntentCreator<N, P>,
    payload: P,
    metadata?: Partial<EventMetadata>
  ): Promise<void>;
}

/**
 * The public EventBus interface.
 */
export interface EventBus {
  /**
   * Publish an event.
   * Accepts either a pre-built DomainEvent or an IntentCreator + payload (plus optional metadata).
   */
  publish<N extends IntentName, P>(
    eventOrCreator: DomainEvent<N, P> | IntentCreator<N, P>,
    payloadOrMeta?: P | Partial<EventMetadata>,
    metadata?: Partial<EventMetadata>
  ): Promise<void>;

  /**
   * Create a source-bound publisher capability. The returned publisher stamps
   * metadata.source internally and rejects attempts to publish as another source.
   */
  createPublisher<N extends IntentName, P>(
    source: N | IntentCreator<N, P>
  ): EventPublisher;

  /**
   * Subscribe to events for a specific intent (by name or creator).
   * Returns an unsubscribe function.
   */
  subscribe<N extends IntentName, P>(
    intent: N | IntentCreator<N, P>,
    handler: EventHandler<N, P>
  ): Unsubscribe;

  /**
   * Register an add-only interceptor for one intent.
   * Interceptors may enrich payloads, but cannot overwrite existing payload fields.
   */
  registerInterceptor<N extends IntentName, P>(
    intent: N | IntentCreator<N, P>,
    interceptor: EventInterceptor<N, P>,
    interceptorId?: string
  ): string;

  /**
   * Remove a registered interceptor by registration id.
   */
  unregisterInterceptor(registrationId: string): boolean;

  /**
   * List registered interceptors.
   */
  listInterceptors(intent?: string): EventInterceptionInfo[];

  /**
   * Returns the history of published events (for observability and testing).
   */
  getHistory(): PublishedEventRecord[];

  /**
   * Clears publish history (useful in tests).
   */
  clearHistory(): void;

  /**
   * Returns the observability trace (publish, soft violations, handler errors).
   */
  getTrace(): TraceRecord[];

  /**
   * Clears the observability trace.
   */
  clearTrace(): void;
}
