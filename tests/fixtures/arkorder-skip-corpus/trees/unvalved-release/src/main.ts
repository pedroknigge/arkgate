import { createOrderPlane } from 'arkgate/order';

/** Two freeze calls — runtime fail-closed, not a lexical skip sensor (ADR 0034 D1). */
export function boot(): void {
  const plane = createOrderPlane({
    projector: () => ({ allowedKinds: ['InvoicePosted'], invalidated: [] }),
  });
  plane.release({ plan: 'free' });
  plane.release({ plan: 'pro' });
}
