import type { OrderStore } from '../domain/orders.js';

export function createStore(): OrderStore {
  return { async pull() { return 3; } };
}