import type { OrderStore } from '../domain/orders.js';

export async function syncOrders(store: OrderStore) {
  return store.pull();
}