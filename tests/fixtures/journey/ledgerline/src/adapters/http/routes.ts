export type Route = { method: 'GET' | 'POST'; path: string };

export const routes: readonly Route[] = [
  { method: 'POST', path: '/invoices' },
  { method: 'POST', path: '/customers/:id/email' },
  { method: 'POST', path: '/refunds' },
  { method: 'POST', path: '/uploads' },
];
