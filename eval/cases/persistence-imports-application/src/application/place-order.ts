import type { Order, OrderRepository } from '../domain/order.js';

export function createPlaceOrder(repo: OrderRepository) {
  return async function placeOrder(order: Order): Promise<void> {
    await repo.save(order);
  };
}
