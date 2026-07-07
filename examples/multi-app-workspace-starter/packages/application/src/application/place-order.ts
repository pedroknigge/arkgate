import type { Order } from '../../../domain/src/domain/order.js';
import { validateOrder } from '../../../domain/src/domain/order.js';

export function placeOrder(input: Order): Order {
  validateOrder(input);
  return input;
}