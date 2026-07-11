/**
 * Intent-specific types for the Structrail kernel.
 *
 * Intents provide semantic naming for every important concept in the system
 * (domain events, application operations, adapters, workflows).
 */

import type { DomainEvent, IntentName } from '../../domain/types';

/**
 * An IntentCreator is a callable that creates a strongly-typed DomainEvent
 * when invoked with a payload.
 *
 * It also carries the semantic `name`.
 *
 * @example
 * const OrderPlaced = defineIntent<'Domain.Order.OrderPlaced', { orderId: string }>('Domain.Order.OrderPlaced');
 * const event = OrderPlaced({ orderId: 'o-1' });
 */
export interface IntentCreator<Name extends IntentName, Payload = unknown> {
  /**
   * Creates a DomainEvent for this intent.
   */
  (payload: Payload): DomainEvent<Name, Payload>;

  /**
   * The fully-qualified semantic name of the intent (e.g. "Domain.Order.OrderPlaced").
   */
  readonly name: Name;
}

/** Kind of relationship between two intents. */
export type IntentRelationshipKind = 'dependsOn' | 'produces';

/**
 * Relationship declarations between intents.
 * Used for dependency analysis and graph generation.
 */
export interface IntentRelationship {
  from: string;
  to: string;
  kind: IntentRelationshipKind;
}
