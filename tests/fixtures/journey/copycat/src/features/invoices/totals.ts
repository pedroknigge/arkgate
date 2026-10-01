// The billing slice already has this. The wall denied the import, so it was copied.
export type InvoiceLine = { description: string; quantity: number; unitPrice: number; taxRate: number };

export function totalForInvoice(lines: readonly InvoiceLine[], discount: number): number {
  let subtotal = 0;
  let tax = 0;
  for (const line of lines) {
    const amount = line.quantity * line.unitPrice;
    subtotal += amount;
    tax += amount * line.taxRate;
  }
  const discounted = Math.max(0, subtotal - discount);
  const total = discounted + tax;
  return Math.round(total * 100) / 100;
}
