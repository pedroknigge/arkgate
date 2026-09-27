import type { Invoice } from '../../domain/billing/invoice';
import type { InvoiceId } from '../../domain/shared/ids';

export interface InvoiceRepository {
  save(invoice: Invoice): void;
  find(id: InvoiceId): Invoice | undefined;
}
