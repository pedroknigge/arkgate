export type CustomerId = string & { readonly brand: 'CustomerId' };
export type InvoiceId = string & { readonly brand: 'InvoiceId' };

export function customerId(raw: string): CustomerId {
  return raw.trim().toLowerCase() as CustomerId;
}

export function invoiceId(raw: string): InvoiceId {
  return raw.trim() as InvoiceId;
}
