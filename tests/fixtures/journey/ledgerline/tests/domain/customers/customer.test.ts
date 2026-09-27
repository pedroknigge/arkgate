import { Customer } from '../../../src/domain/customers/customer';
import { customerId } from '../../../src/domain/shared/ids';

describe('customers', () => {
  it('stores the trimmed email the caller submitted', () => {
    const customer = Customer.register(customerId('ada'), '  Ada@Example.invalid ');
    if (customer.address() !== 'ada@example.invalid') throw new Error('email');
  });
});
