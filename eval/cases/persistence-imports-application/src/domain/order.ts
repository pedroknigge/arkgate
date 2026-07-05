export interface Order {
  id: string;
  total: number;
}

// The port the persistence layer is meant to implement.
export interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
}
