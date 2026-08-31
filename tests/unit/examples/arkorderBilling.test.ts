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
    const frozen = plane.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    const absorbed = plane.ingest({ kind: 'InvoicePosted' });
    expect(absorbed.kind).toBe('absorb');
    expect(absorbed.xiHash).toBe(frozen.xiHash);
    const unknown = plane.ingest({ kind: 'SeatAdded' });
    expect(unknown.kind).toBe('escalate_up');
    if (unknown.kind === 'escalate_up') expect(unknown.reasonCode).toBe('not-in-pattern');
    const next = plane.proposeRelease({ plan: 'enterprise', tenancy: 'org' });
    expect(next.blastRadius.length).toBeGreaterThan(0);
    expect(next.nextXi.plan).toBe('enterprise');
  });
});
