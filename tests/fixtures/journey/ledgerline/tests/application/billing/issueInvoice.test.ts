import { issueInvoice } from '../../../src/application/billing/issueInvoice';
import { InMemoryInvoices } from '../../../src/adapters/persistence/inMemoryInvoices';

describe('issue invoice', () => {
  it('saves a draft the repository can find', () => {
    const repository = new InMemoryInvoices();
    const invoice = issueInvoice(
      repository,
      'inv-9',
      [{ sku: 'starter', seats: 1, unitCents: 2900 }],
      { region: 'none', basisPoints: 0 }
    );
    if (repository.find(invoice.id) !== invoice) throw new Error('saved');
  });
});
