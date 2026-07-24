import type { EventPublisher, IntentCreator } from '@arkgate/runtime';
import { ORDER_PLACED, placeOrder, type OrderPlacedPayload } from '../domain/order.js';
import type { OrderRepository } from '../domain/order-repository.js';

export const PLACE_ORDER = 'Application.PlaceOrder' as const;

export interface PlaceOrderInput {
  sku: string;
  quantity: number;
  amount: number;
}

/**
 * Use case: depends only on the domain and on Ark ports (publisher + intent
 * creator), never on concrete adapters.
 */
export function createPlaceOrder(deps: {
  repository: OrderRepository;
  publisher: EventPublisher;
  orderPlaced: IntentCreator<typeof ORDER_PLACED, OrderPlacedPayload>;
}) {
  return async (input: PlaceOrderInput): Promise<string> => {
    const order = placeOrder({ id: crypto.randomUUID(), ...input });
    await deps.repository.save(order);
    await deps.publisher.publish(
      deps.orderPlaced,
      { orderId: order.id, sku: order.sku, quantity: order.quantity, amount: order.amount },
      { source: PLACE_ORDER, eventVersion: '1' }
    );
    return order.id;
  };
}
