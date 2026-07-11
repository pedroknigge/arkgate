import { syncOrders } from '../adapters/orders.js';

export async function run() {
  return syncOrders();
}