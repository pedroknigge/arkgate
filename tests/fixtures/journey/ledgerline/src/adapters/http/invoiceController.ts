import { issueInvoice } from '../../application/billing/issueInvoice';
import type { InvoiceRepository } from '../../application/ports/invoiceRepository';
import type { InvoiceLine } from '../../domain/billing/invoiceLine';
import type { TaxRate } from '../../domain/billing/taxRate';

export function postInvoice(
  repository: InvoiceRepository,
  body: { id: string; lines: InvoiceLine[]; tax: TaxRate }
): { amountDue: number } {
  const invoice = issueInvoice(repository, body.id, body.lines, body.tax);
  return { amountDue: invoice.amountDue() };
}
