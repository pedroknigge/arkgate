import { Customer } from '../../domain/customers/customer';
import { customerId } from '../../domain/shared/ids';
import type { CustomerRepository } from '../ports/customerRepository';

export function updateEmail(repository: CustomerRepository, rawId: string, rawEmail: string): Customer {
  const id = customerId(rawId);
  const existing = repository.find(id) ?? Customer.register(id, rawEmail);
  existing.changeEmail(rawEmail);
  repository.save(existing);
  return existing;
}
