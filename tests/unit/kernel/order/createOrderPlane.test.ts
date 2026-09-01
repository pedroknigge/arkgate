import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ArkOrderError } from '../../../../src/domain/arkOrderError';
import {
  createOrderPlane,
  hashOf,
  hashReleasePayload,
  type Projector,
} from '../../../../src/kernel/order';
import { createMemoryReleaseStore } from '../../../../src/kernel/order/releaseStore';
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
    const absorbed = p.ingest({ kind: 'InvoicePosted' });
    expect(absorbed.kind).toBe('absorb');
    expect(absorbed.xiHash).toBe(release.xiHash);
    expect(absorbed.eventId.length).toBeGreaterThan(0);
    expect('proposed_patch' in absorbed).toBe(false);
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
    expect(result.kind).toBe('escalate_up');
    if (result.kind === 'escalate_up') {
      expect(result.reasonCode).toBe('not-in-pattern');
      expect(result.target).toBe('human');
      expect(result.xiHash).toBe(p.current()?.xiHash);
      expect(result.proposed_patch).toBeUndefined();
    }
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

  it('apply freezes ProposeResult; unvalved second release of different ξ fails (LV02)', () => {
    const p = plane();
    const first = p.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    expect(first.version).toBe(1);
    const proposal = p.proposeRelease({ plan: 'pro', tenancy: 'team' });
    const applied = p.apply(proposal);
    expect(applied.xi.plan).toBe('pro');
    expect(applied.version).toBe(2);
    expect(p.current()?.xi.plan).toBe('pro');
    try {
      p.release({ plan: 'enterprise', cycle: 'monthly', tenancy: 'org' });
      throw new Error('expected unvalved deny');
    } catch (error) {
      expect(error).toBeInstanceOf(ArkOrderError);
      expect((error as ArkOrderError).code).toBe('ARKORDER_UNVALVED_RELEASE');
    }
    expect(p.current()?.xi.plan).toBe('pro');
  });

  it('first release remains the freeze; same-ξ release is not unvalved (LV02)', () => {
    const p = plane();
    p.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' }, { graceDays: 0 });
    const again = p.release(
      { plan: 'free', cycle: 'monthly', tenancy: 'single' },
      { graceDays: 1 }
    );
    expect(again.xi.plan).toBe('free');
    expect(again.sigma.graceDays).toBe(1);
  });

  it('apply of a no-op proposal fails empty blast (LV02)', () => {
    const p = plane();
    p.release({ plan: 'pro', cycle: 'monthly', tenancy: 'team' });
    try {
      p.apply({
        nextXi: { plan: 'pro', cycle: 'monthly', tenancy: 'team' },
        blastRadius: ['SeatAdded'],
        invalidations: [],
      });
      throw new Error('expected empty blast');
    } catch (error) {
      expect(error).toBeInstanceOf(ArkOrderError);
      expect((error as ArkOrderError).code).toBe('ARKORDER_EMPTY_BLAST');
    }
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
    const stale = aged.ingest({ kind: 'InvoicePosted' });
    expect(stale.kind).toBe('hold');
    if (stale.kind === 'hold') {
      expect(stale.reasonCode).toBe('stale-sigma');
      expect(stale.xiHash).toBe(aged.current()?.xiHash);
    }

    let now = 1;
    const fromReleaseClock = createOrderPlane({
      projector: billingProjector,
      sigmaMaxAgeMs: 10,
      clocks: { now: () => now },
    });
    fromReleaseClock.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    now = 20;
    const staleFromClock = fromReleaseClock.ingest({ kind: 'InvoicePosted' });
    expect(staleFromClock.kind).toBe('hold');
    if (staleFromClock.kind === 'hold') expect(staleFromClock.reasonCode).toBe('stale-sigma');
  });

  it('refreshSigma does not change xiHash (LV03)', () => {
    const p = plane();
    const first = p.release(
      { plan: 'free', cycle: 'monthly', tenancy: 'single' },
      { graceDays: 0, seatCap: 5 }
    );
    expect(first.xiHash).not.toBe(first.sigmaHash);
    expect(first.hash).not.toBe(first.xiHash);
    const refreshed = p.refreshSigma({ graceDays: 14, seatCap: 5 });
    expect(refreshed.xiHash).toBe(first.xiHash);
    expect(refreshed.sigmaHash).not.toBe(first.sigmaHash);
    expect(refreshed.hash).not.toBe(first.hash);
    expect(refreshed.version).toBe(first.version);
    expect(refreshed.xi.plan).toBe('free');
    expect(refreshed.sigma.graceDays).toBe(14);
  });

  it('escalate names a human target by default (XP06)', () => {
    const p = plane();
    p.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    const result = p.ingest({ kind: 'SeatAdded' });
    expect(result.kind).toBe('escalate_up');
    if (result.kind === 'escalate_up') expect(result.target).toBe('human');
  });

  it('capacity pack holds over-cap SeatAdded without a homemade kind (LV05)', () => {
    const p = createOrderPlane({
      projector: billingProjector,
      packs: [
        {
          id: 'seats',
          capacity: [{ kind: 'SeatAdded', sigmaKey: 'seatCap', payloadKey: 'seats', op: 'lte' }],
        },
      ],
      clocks: { now: () => 1 },
    });
    p.release({ plan: 'pro', cycle: 'monthly', tenancy: 'team' }, { seatCap: 5 });
    expect(p.ingest({ kind: 'SeatAdded', payload: { seats: 5 } }).kind).toBe('absorb');
    const over = p.ingest({ kind: 'SeatAdded', payload: { seats: 6 } });
    expect(over.kind).toBe('hold');
    if (over.kind === 'hold') expect(over.reasonCode).toBe('capacity');
  });

  it('capacity pack with a function is pack residual, not a predicate (LV05)', () => {
    const p = createOrderPlane({
      projector: billingProjector,
      packs: [
        {
          id: 'bad',
          capacity: [
            {
              kind: 'SeatAdded',
              sigmaKey: 'seatCap',
              payloadKey: 'seats',
              op: 'lte',
              pred: () => true,
            } as never,
          ],
        },
      ],
      clocks: { now: () => 1 },
    });
    p.release({ plan: 'pro', cycle: 'monthly', tenancy: 'team' }, { seatCap: 5 });
    const result = p.ingest({ kind: 'SeatAdded', payload: { seats: 1 } });
    expect(result.kind).toBe('hold');
    if (result.kind === 'hold') expect(result.reasonCode).toBe('pack');
  });

  it('injects ReleaseStore; in-memory default is not durable (LV08)', () => {
    const store = createMemoryReleaseStore();
    const first = createOrderPlane({
      projector: billingProjector,
      store,
      clocks: { now: () => 1 },
    });
    first.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    const second = createOrderPlane({
      projector: billingProjector,
      store,
      clocks: { now: () => 2 },
    });
    expect(second.current()?.xi.plan).toBe('free');
    expect(second.current()?.hash).toBe(store.load()?.hash);
  });

  it('catalog digest keyed by catalogReleaseId enters xiHash; SKU set does not (LV08)', () => {
    const without = plane();
    const a = without.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    const ignored = createOrderPlane({
      projector: billingProjector,
      catalogDigest: 'digest-sku-set-must-not-enter',
      clocks: { now: () => 1 },
    });
    const b = ignored.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    expect(b.hash).toBe(a.hash);
    expect(b.xiHash).toBe(a.xiHash);
    const keyed = createOrderPlane({
      projector: billingProjector,
      catalogDigest: 'digest-of-catalog-id',
      clocks: { now: () => 1 },
    });
    const c = keyed.release({
      plan: 'free',
      cycle: 'monthly',
      tenancy: 'single',
      catalogReleaseId: 'cat-1',
    });
    const other = createOrderPlane({
      projector: billingProjector,
      catalogDigest: 'other-digest',
      clocks: { now: () => 1 },
    });
    const d = other.release({
      plan: 'free',
      cycle: 'monthly',
      tenancy: 'single',
      catalogReleaseId: 'cat-1',
    });
    expect(c.xiHash).not.toBe(d.xiHash);
    expect(c.hash).not.toBe(d.hash);
  });

  it('has no update/patch/set on the plane', () => {
    const p = plane();
    p.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    const mutable = p as unknown as { update?: unknown; patch?: unknown; set?: unknown };
    expect(() => (mutable.update as () => void)()).toThrow(/not a Haken operation/);
    expect(() => (mutable.patch as () => void)()).toThrow(/not a Haken operation/);
    expect(() => (mutable.set as () => void)()).toThrow(/not a Haken operation/);
  });

  it('RESTORE-001: restore installs a frozen Release; next version increments from it', () => {
    const source = plane();
    const frozen = source.release(
      { plan: 'pro', cycle: 'annual', tenancy: 'org' },
      { seatCap: 9 }
    );
    expect(frozen.version).toBe(1);
    const target = plane();
    const installed = target.restore(frozen);
    expect(installed.hash).toBe(frozen.hash);
    expect(target.current()?.version).toBe(1);
    expect(target.current()?.xi.plan).toBe('pro');
    expect(target.current()?.sigma.seatCap).toBe(9);
    const next = target.release(
      { plan: 'pro', cycle: 'annual', tenancy: 'org' },
      { seatCap: 10 }
    );
    expect(next.version).toBe(2);
    expect(next.xiHash).toBe(frozen.xiHash);
    expect(next.sigma.seatCap).toBe(10);
  });

  it('RESTORE-001: invalid and unfrozen objects fail closed; restore is not durability', () => {
    const p = plane();
    const frozen = plane().release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    const thawed = {
      ...frozen,
      xi: { ...frozen.xi },
      sigma: { ...frozen.sigma },
    };
    expect(Object.isFrozen(thawed)).toBe(false);
    expect(() => p.restore(thawed as Release)).toThrow(ArkOrderError);
    expect(() => p.restore(null as never)).toThrow(ArkOrderError);
    const wrongHash = Object.freeze({
      ...frozen,
      hash: 'tampered',
      xi: frozen.xi,
      sigma: frozen.sigma,
    });
    expect(Object.isFrozen(wrongHash)).toBe(true);
    expect(() => p.restore(wrongHash as Release)).toThrow(ArkOrderError);
    expect(p.current()).toBeNull();
  });

  it('CLOCK-001: omitted clocks yields releasedAt > 0; injected clocks still win', () => {
    const omitted = createOrderPlane({ projector: billingProjector });
    const before = Date.now();
    const released = omitted.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    const after = Date.now();
    expect(released.releasedAt).toBeGreaterThan(0);
    expect(released.releasedAt).toBeGreaterThanOrEqual(before);
    expect(released.releasedAt).toBeLessThanOrEqual(after);

    const injected = createOrderPlane({
      projector: billingProjector,
      clocks: { now: () => 42 },
    });
    expect(
      injected.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' }).releasedAt
    ).toBe(42);
  });

  it('HASH-001: hashOf from arkgate/order equals Release.hash without a second freeze', () => {
    const p = plane();
    const xi = { plan: 'free' as const, cycle: 'monthly' as const, tenancy: 'single' as const };
    const sigma = { graceDays: 0 };
    const expected = hashOf(xi, sigma);
    expect(expected).toBe(hashReleasePayload(xi, sigma));
    const release = p.release(xi, sigma);
    expect(hashOf(release.xi, release.sigma)).toBe(release.hash);
    expect(hashReleasePayload(release.xi, release.sigma)).toBe(release.hash);
    expect(expected).toBe(release.hash);
    expect(p.current()?.version).toBe(1);
  });

  it('DTS-001: vocabulary header must not tell published .d.ts there is no runtime', () => {
    const typesPath = path.join(process.cwd(), 'src/domain/arkOrderTypes.ts');
    const header = readFileSync(typesPath, 'utf8').slice(0, 400);
    expect(header).not.toMatch(/Declarations only — no runtime/);
  });

  it('INGEST-001: payload-dependent escalation is documented as projector, not a pack predicate', () => {
    const docs = readFileSync(path.join(process.cwd(), 'docs/arkorder.md'), 'utf8');
    expect(docs).toMatch(/second week failing a goal/);
    expect(docs).toMatch(/not a pack predicate/);
    expect(docs).toMatch(/https:\/\/github\.com\/pedroknigge\/arkgate\/tree\/main\/examples\/arkorder-billing/);
    expect(docs).not.toMatch(/^# copy examples\/arkorder-billing\//m);
  });
});
