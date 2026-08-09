import { fetchOrders } from '../adapters/orders.js';

/** Misplaced: job reaches persistence directly and embeds domain logic. */
export async function runNightly() {
  const orders = await fetchOrders();
  return orders.filter((o) => o.id.length > 0);
}
