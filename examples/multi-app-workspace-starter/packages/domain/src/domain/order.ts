export type Order = { id: string; sku: string; quantity: number };

export function validateOrder(order: Order): void {
  if (order.quantity < 1) throw new Error('quantity must be positive');
}