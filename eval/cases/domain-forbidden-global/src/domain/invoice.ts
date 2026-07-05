export interface Invoice {
  id: string;
  amount: number;
  issuedAt: number;
}

export function issueInvoice(id: string, amount: number): Invoice {
  // Reaches for the ambient clock inside the domain — forbidden.
  return { id, amount, issuedAt: Date.now() };
}
