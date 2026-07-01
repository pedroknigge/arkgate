/**
 * Core domain primitives for Ark.
 * These types are the foundation for all governance concepts.
 */

/**
 * Semantic intent names follow a convention:
 * - Domain.* for domain events and entities
 * - Application.* for use-cases / orchestration
 * - Adapter.* for integration points
 * - Workflow.* for sagas and processes
 */
export type IntentName =
  | `Domain.${string}`
  | `Application.${string}`
  | `Adapter.${string}`
  | `Workflow.${string}`;

export type CorrelationId = string;

export interface EventMetadata {
  occurredAt: string; // ISO-8601
  source: string; // e.g. "Application.OrderService" or "Adapter.PaymentGateway"
  correlationId?: CorrelationId;
  causationId?: string;
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
