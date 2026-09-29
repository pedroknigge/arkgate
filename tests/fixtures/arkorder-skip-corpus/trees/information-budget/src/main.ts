import { createOrderPlane } from 'arkgate/order';

export function boot(): void {
  const plane = createOrderPlane({
    projector: () => ({ allowedKinds: ['InvoicePosted', 'LedgerRead'], invalidated: [] }),
    informationBudget: { cannotObserve: ['LedgerRead'] },
  });
  plane.release({ plan: 'free' });
}
