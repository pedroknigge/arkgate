import type { Order, OrderStore } from '../domain/orders.js';

export function createOrderStore(seed: Order[] = []): OrderStore {
  return {
    async list() {
      return [...seed];
    },
  };
}
