import { syncOrders } from '../application/sync-orders.js';
import type { OrderStore } from '../domain/orders.js';

export async function run(store: OrderStore) {
  return syncOrders(store);
}