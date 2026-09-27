import type { CustomerRepository } from '../../application/ports/customerRepository';
import type { Customer } from '../../domain/customers/customer';
import type { CustomerId } from '../../domain/shared/ids';

export class InMemoryCustomers implements CustomerRepository {
  private readonly rows = new Map<CustomerId, Customer>();

  save(customer: Customer): void {
    this.rows.set(customer.id, customer);
  }

  find(id: CustomerId): Customer | undefined {
    return this.rows.get(id);
  }
}
