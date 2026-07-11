/**
 * defineIntent
 *
 * The primary ergonomic function for declaring semantic intents.
 *
 * Uses a default shared registry for convenience, while still allowing
 * isolated registries via `createIntentRegistry()`.
 *
 * Intents are the core of Structrail's governance model. They give every
 * architectural concept (domain events, use cases, adapter operations, workflows)
 * an explicit, namespaced, machine-readable identity.
 */

import type { IntentName } from '../../domain/types';
import type { IntentCreator } from './types';
import { IntentRegistry, type DefineIntentOptions } from './IntentRegistry';

// Default registry used by the top-level defineIntent for simplicity
const defaultRegistry = new IntentRegistry();

/**
 * Define a new semantic intent.
 *
 * This is the main entry point most users (and AI generators) will use.
 *
 * @example
 * ```ts
 * // Domain event
 * const OrderPlaced = defineIntent<'Domain.Order.OrderPlaced', {
 *   orderId: string;
 *   amount: number;
 * }>('Domain.Order.OrderPlaced');
 *
 * const event = OrderPlaced({ orderId: 'o-42', amount: 99.5 });
 *
 * // Application operation that declares a dependency at definition time
 * const ConfirmOrder = defineIntent<'Application.ConfirmOrder', { orderId: string }>(
 *   'Application.ConfirmOrder',
 *   { dependsOn: ['Domain.Order.OrderPlaced'] }
 * );
 * ```
 *
 * @param name - Unique semantic name. Recommended convention:
 *   - `Domain.*` for domain concepts and events
 *   - `Application.*` for use cases / orchestration
 *   - `Adapter.*` for external integrations
 *   - `Workflow.*` for sagas and long-running processes
 * @param options - Optional initial relationship declarations (`dependsOn`, `produces`)
 */
export function defineIntent<N extends IntentName, P = unknown>(
  name: N,
  options?: DefineIntentOptions
): IntentCreator<N, P> {
  return defaultRegistry.define(name, options);
}

/**
 * Create an isolated IntentRegistry.
 * Useful for testing, multiple bounded contexts, or advanced governance setups.
 */
export function createIntentRegistry(): IntentRegistry {
  return new IntentRegistry();
}

/**
 * The default registry backing the top-level `defineIntent` calls.
 * You can inspect it or use it directly if needed.
 */
export const defaultIntentRegistry = defaultRegistry;
