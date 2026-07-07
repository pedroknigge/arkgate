import { listOrders } from '../../../../../packages/application/list.js';

export function home() {
  return listOrders([{ sku: 'A' }]);
}