import { Invoice } from '../../domain/billing/invoice';
import type { InvoiceLine } from '../../domain/billing/invoiceLine';
import type { TaxRate } from '../../domain/billing/taxRate';
import { invoiceId } from '../../domain/shared/ids';
import type { InvoiceRepository } from '../ports/invoiceRepository';

export function issueInvoice(
  repository: InvoiceRepository,
  rawId: string,
  lines: readonly InvoiceLine[],
  tax: TaxRate
): Invoice {
  const invoice = Invoice.draft(invoiceId(rawId), lines, tax);
  repository.save(invoice);
  return invoice;
}
