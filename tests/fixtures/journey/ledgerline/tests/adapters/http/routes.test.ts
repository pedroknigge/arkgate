import { routes } from '../../../src/adapters/http/routes';

describe('routes', () => {
  it('exposes an invoice create route', () => {
    const match = routes.find((route) => route.path === '/invoices');
    if (!match || match.method !== 'POST') throw new Error('route');
  });
});
