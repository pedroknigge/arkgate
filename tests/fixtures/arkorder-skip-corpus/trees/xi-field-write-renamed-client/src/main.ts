import { createOrderPlane } from 'arkgate/order';

export function boot(): void {
  createOrderPlane({
    projector: () => ({ allowedKinds: ['InvoicePosted'], invalidated: [] }),
  });
}
