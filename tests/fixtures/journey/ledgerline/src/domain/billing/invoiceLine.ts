import type { Cents } from '../shared/money';

export type InvoiceLine = {
  sku: string;
  seats: number;
  unitCents: Cents;
};

export function lineTotal(line: InvoiceLine): Cents {
  return line.seats * line.unitCents;
}
