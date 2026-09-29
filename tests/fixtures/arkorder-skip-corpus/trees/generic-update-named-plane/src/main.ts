import { createOrderPlane } from 'arkgate/order';

/** Plane root: a Map.set here is not ξ mutation. */
const cache = new Map<string, number>();
cache.set('warm', 1);

export const billingPlane = createOrderPlane({
  projector: () => ({ allowedKinds: ['InvoicePosted'], invalidated: [] }),
});
