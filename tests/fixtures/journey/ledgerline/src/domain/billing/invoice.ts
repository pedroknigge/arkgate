import { addCents, zeroCents, type Cents } from '../shared/money';
import { lineTotal, type InvoiceLine } from './invoiceLine';
import { taxOn, type TaxRate } from './taxRate';
import type { InvoiceId } from '../shared/ids';

export class Invoice {
  private total: Cents = zeroCents();

  private constructor(
    readonly id: InvoiceId,
    private readonly lines: InvoiceLine[],
    private readonly tax: TaxRate
  ) {
    this.total = this.computeTotal();
  }

  static draft(id: InvoiceId, lines: readonly InvoiceLine[], tax: TaxRate): Invoice {
    return new Invoice(id, [...lines], tax);
  }

  private computeTotal(): Cents {
    const net = this.lines.reduce((sum, line) => addCents(sum, lineTotal(line)), zeroCents());
    return addCents(net, taxOn(net, this.tax));
  }

  amountDue(): Cents {
    return this.total < 0 ? 0 : this.total;
  }
}
