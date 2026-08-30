import { createOrderPlane } from 'arkgate/order';

export function boot(): void {
  const plane = createOrderPlane({
    projector: () => ({ allowedKinds: ['InvoicePosted'], invalidated: [] }),
  });
  plane.release({ plan: 'free' });
  const release = plane.ingest({ kind: 'InvoicePosted' });
  void release;
}
