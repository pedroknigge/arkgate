import type { Customer } from '../../domain/customers/customer';
import type { CustomerId } from '../../domain/shared/ids';

export interface CustomerRepository {
  save(customer: Customer): void;
  find(id: CustomerId): Customer | undefined;
}
