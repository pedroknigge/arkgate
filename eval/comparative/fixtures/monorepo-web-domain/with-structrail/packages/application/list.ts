import type { Order } from '../domain/order.js';

export function listOrders(seed: Order[]) {
  return seed.length;
}