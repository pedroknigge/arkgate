import { Invoice } from '../../../src/domain/billing/invoice';
import { invoiceId } from '../../../src/domain/shared/ids';

describe('invoices', () => {
  it('INV-INVOICE-NON-NEGATIVE keeps a drafted total at or above zero', () => {
    const invoice = Invoice.draft(invoiceId('inv-1'), [], { region: 'none', basisPoints: 0 });
    if (invoice.amountDue() < 0) throw new Error('negative total');
  });
});
