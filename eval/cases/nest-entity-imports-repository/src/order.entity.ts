import { OrderRepository } from './order.repository';

// Nest-shaped domain entity must not depend on a repository implementation.
export class OrderEntity {
  constructor(private readonly repo = new OrderRepository()) {}
  persist(id: string) {
    return this.repo.save(id);
  }
}

