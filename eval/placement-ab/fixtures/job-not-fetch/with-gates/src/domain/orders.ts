export type Order = { id: string };

export interface OrderStore {
  list(): Promise<Order[]>;
}

export function activeOrders(orders: Order[]): Order[] {
  return orders.filter((o) => o.id.length > 0);
}
