import type { OrderStore } from '../domain/orders.js';
import { syncOrders } from '../application/sync-orders.js';

export function runNightly(store: OrderStore) {
  return syncOrders(store);
}
