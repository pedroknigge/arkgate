import { updateEmail } from '../../application/customers/updateEmail';
import type { CustomerRepository } from '../../application/ports/customerRepository';

export function postEmail(
  repository: CustomerRepository,
  id: string,
  body: { email: string }
): { email: string } {
  const customer = updateEmail(repository, id, body.email);
  return { email: customer.address() };
}
