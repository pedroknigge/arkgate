import type { Order } from '../../domain/order.js';
// ILLEGAL: a persistence adapter must not depend on an application use case.
import { createPlaceOrder } from '../../application/place-order.js';

const store = new Map<string, Order>();

export class InMemoryOrderRepository {
  // Smuggling the use case into the adapter — the dependency that ark-check blocks.
  readonly placeOrder = createPlaceOrder(this as never);

  async save(order: Order): Promise<void> {
    store.set(order.id, order);
  }

  async findById(id: string): Promise<Order | null> {
    return store.get(id) ?? null;
  }
}
