import type { Order, OrderStore } from '../domain/orders.js';
import { activeOrders } from '../domain/orders.js';

export async function syncOrders(store: OrderStore): Promise<Order[]> {
  const all = await store.list();
  return activeOrders(all);
}
