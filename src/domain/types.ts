/**
 * Core domain primitives for Structrail.
 * These types are the foundation for all governance concepts.
 */

/**
 * Semantic intent names follow a convention:
 * - Domain.* for domain events and entities
 * - Application.* for use-cases / orchestration
 * - Adapter.* for integration points
 * - Workflow.* for sagas and processes
 * - Job.* for background jobs and scheduling
 * - Presentation.* for UI/API adapters
 * - Reporting.* for read models and projections
 * - Metadata.* for extensibility contracts
 * - Security.* / Audit.* / Observability.* for cross-cutting kernel concerns
 * - Kernel.* for Structrail-owned governance signals
 */
export type IntentName =
  | `Domain.${string}`
  | `Application.${string}`
  | `Adapter.${string}`
  | `Workflow.${string}`
  | `Job.${string}`
  | `Presentation.${string}`
  | `Reporting.${string}`
  | `Metadata.${string}`
  | `Security.${string}`
  | `Audit.${string}`
  | `Observability.${string}`
  | `Kernel.${string}`;

export type CorrelationId = string;

export interface EventMetadata {
  occurredAt: string; // ISO-8601
  source: string; // e.g. "Application.OrderService" or "Adapter.PaymentGateway"
  kernelInstanceId?: string;
  eventVersion?: string;
  schemaVersion?: string;
  allowInterception?: boolean;
  interceptions?: Array<{
    interceptorId: string;
    timestamp: string;
  }>;
  correlationId?: CorrelationId;
  causationId?: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  [key: string]: unknown;
}

export interface DomainEvent<Name extends IntentName = IntentName, Payload = unknown> {
  intent: Name;
  payload: Payload;
  metadata: EventMetadata;
}

/**
 * Branded intent definition.
 * Returned by defineIntent in later iterations.
 */
export interface IntentDefinition<Name extends IntentName, Payload> {
  readonly name: Name;
  create(payload: Payload): DomainEvent<Name, Payload>;
}

// Re-export for convenience
export type { IntentName as Intent };
