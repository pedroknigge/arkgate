import type { InvoiceRepository } from '../../application/ports/invoiceRepository';
import type { Invoice } from '../../domain/billing/invoice';
import type { InvoiceId } from '../../domain/shared/ids';

export class InMemoryInvoices implements InvoiceRepository {
  private readonly rows = new Map<InvoiceId, Invoice>();

  save(invoice: Invoice): void {
    this.rows.set(invoice.id, invoice);
  }

  find(id: InvoiceId): Invoice | undefined {
    return this.rows.get(id);
  }
}
