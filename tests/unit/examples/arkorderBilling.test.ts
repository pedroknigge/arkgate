import { describe, expect, it } from 'vitest';
import { createOrderPlane } from '../../../src/kernel/order';
import { billingProjector, billingXi } from '../../../examples/arkorder-billing/projector';

describe('arkorder-billing consumer physics', () => {
  it('does not teach the core billing keys — projector lives in the example', () => {
    const plane = createOrderPlane({
      projector: billingProjector,
      xiSchema: { additionalProperties: false, properties: billingXi },
      clocks: { now: () => 0 },
    });
    plane.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    expect(plane.ingest({ kind: 'InvoicePosted' }).kind).toBe('absorb');
    expect(plane.ingest({ kind: 'SeatAdded' }).kind).toBe('escalate');
    const next = plane.proposeRelease({ plan: 'enterprise', tenancy: 'org' });
    expect(next.blastRadius.length).toBeGreaterThan(0);
    expect(next.nextXi.plan).toBe('enterprise');
  });
});
