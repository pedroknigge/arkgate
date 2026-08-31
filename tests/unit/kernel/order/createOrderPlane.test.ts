import { describe, expect, it } from 'vitest';
import { ArkOrderError } from '../../../../src/domain/arkOrderError';
import {
  createOrderPlane,
  type Projector,
} from '../../../../src/kernel/order/createOrderPlane';
import type { Release } from '../../../../src/domain/arkOrderTypes';

/** Consumer physics — not in the core. */
const billingProjector: Projector = (release: Release) => {
  const plan = release.xi.plan;
  const tenancy = release.xi.tenancy;
  const allowed = ['InvoicePosted'];
  if (plan === 'pro' || plan === 'enterprise') allowed.push('SeatAdded');
  if (tenancy === 'team' || tenancy === 'org') allowed.push('MemberInvited');
  if (plan === 'enterprise' && tenancy === 'org') allowed.push('SsoEnabled');
  const invalidated: string[] = [];
  if (plan === 'free') invalidated.push('excess-seats');
  return { allowedKinds: allowed, invalidated };
};

function plane() {
  return createOrderPlane({
    projector: billingProjector,
    maxXiKeys: 7,
    xiSchema: {
      additionalProperties: false,
      properties: {
        plan: { type: 'string', enum: ['free', 'pro', 'enterprise'] },
        cycle: { type: 'string', enum: ['monthly', 'annual'] },
        tenancy: { type: 'string', enum: ['single', 'team', 'org'] },
      },
    },
    clocks: { now: () => 1 },
  });
}

describe('createOrderPlane (Haken slaving)', () => {
  it('freezes ξ and derives allowed field kinds from h(ξ)', () => {
    const p = plane();
    const release = p.release(
      { plan: 'free', cycle: 'monthly', tenancy: 'single' },
      { graceDays: 0 }
    );
    expect(release.xi.plan).toBe('free');
    expect(Object.isFrozen(release.xi)).toBe(true);
    expect(p.project().allowedKinds).toEqual(['InvoicePosted']);
    expect(p.ingest({ kind: 'InvoicePosted' }).kind).toBe('absorb');
  });

  it('ingest never returns a new Release', () => {
    const p = plane();
    p.release({ plan: 'pro', cycle: 'monthly', tenancy: 'team' });
    const result = p.ingest({ kind: 'SeatAdded' });
    expect(result).not.toHaveProperty('hash');
    expect(result).not.toHaveProperty('xi');
    expect(result.kind).toBe('absorb');
    expect(p.current()?.version).toBe(1);
  });

  it('escalates field events that h(ξ) does not allow', () => {
    const p = plane();
    p.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    const result = p.ingest({ kind: 'SeatAdded' });
    expect(result.kind).toBe('escalate');
  });

  it('proposeRelease with empty blast fails closed', () => {
    const p = plane();
    p.release({ plan: 'pro', cycle: 'monthly', tenancy: 'team' });
    expect(() => p.proposeRelease({})).toThrow(ArkOrderError);
    try {
      p.proposeRelease({});
    } catch (error) {
      expect(error).toBeInstanceOf(ArkOrderError);
      expect((error as ArkOrderError).code).toBe('ARKORDER_EMPTY_BLAST');
    }
  });

  it('proposeRelease of a real pattern change returns a non-empty blast', () => {
    const p = plane();
    p.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    const proposal = p.proposeRelease({ plan: 'pro', tenancy: 'team' });
    expect(proposal.blastRadius.length).toBeGreaterThan(0);
    expect(proposal.nextXi.plan).toBe('pro');
    expect(p.current()?.xi.plan).toBe('free');
  });

  it('ξ key cap fails closed', () => {
    const p = createOrderPlane({
      projector: billingProjector,
      maxXiKeys: 3,
      clocks: { now: () => 0 },
    });
    expect(() =>
      p.release({ a: 1, b: 2, c: 3, d: 4 })
    ).toThrow(/maxXiKeys/);
  });

  it('rejects nested ξ as smuggled microstate', () => {
    const p = plane();
    expect(() =>
      p.release({ plan: 'free', nested: { seats: 1 } as unknown as string })
    ).toThrow(/microstate/);
  });

  it('informationBudget denies a kind the projector tried to allow (XP04)', () => {
    const p = createOrderPlane({
      projector: billingProjector,
      informationBudget: { cannotObserve: ['InvoicePosted'] },
      clocks: { now: () => 1 },
    });
    p.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    try {
      p.project();
      throw new Error('expected budget deny');
    } catch (error) {
      expect(error).toBeInstanceOf(ArkOrderError);
      expect((error as ArkOrderError).code).toBe('ARKORDER_INFORMATION_BUDGET');
    }
  });

  it('rejects ttl on ξ and freshness on σ (XP05)', () => {
    const p = plane();
    try {
      p.release({ plan: 'free', ttl: 1 });
      throw new Error('expected xi ttl deny');
    } catch (error) {
      expect(error).toBeInstanceOf(ArkOrderError);
      expect((error as ArkOrderError).code).toBe('ARKORDER_XI_TTL');
    }
    const aged = createOrderPlane({
      projector: billingProjector,
      sigmaMaxAgeMs: 10,
      clocks: { now: () => 100 },
    });
    aged.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' }, { freshUntil: 50 });
    try {
      aged.ingest({ kind: 'InvoicePosted' });
      throw new Error('expected stale sigma');
    } catch (error) {
      expect(error).toBeInstanceOf(ArkOrderError);
      expect((error as ArkOrderError).code).toBe('ARKORDER_STALE_SIGMA');
    }
  });

  it('escalate names a human target by default (XP06)', () => {
    const p = plane();
    p.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    const result = p.ingest({ kind: 'SeatAdded' });
    expect(result.kind).toBe('escalate');
    if (result.kind === 'escalate') expect(result.target).toBe('human');
  });

  it('has no update/patch/set on the plane', () => {
    const p = plane();
    p.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    const mutable = p as unknown as { update?: unknown; patch?: unknown; set?: unknown };
    expect(() => (mutable.update as () => void)()).toThrow(/not a Haken operation/);
    expect(() => (mutable.patch as () => void)()).toThrow(/not a Haken operation/);
    expect(() => (mutable.set as () => void)()).toThrow(/not a Haken operation/);
  });
});
