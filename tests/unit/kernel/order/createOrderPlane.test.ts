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
    const base = p.release({ plan: 'pro', cycle: 'monthly', tenancy: 'team' });
    try {
      p.apply({
        nextXi: { plan: 'pro', cycle: 'monthly', tenancy: 'team' },
        blastRadius: ['SeatAdded'],
        invalidations: [],
        baseXiHash: base.xiHash,
        baseVersion: base.version,
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
    // A denied pattern is never frozen: release() fails before persisting.
    try {
      p.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
      throw new Error('expected budget deny');
    } catch (error) {
      expect(error).toBeInstanceOf(ArkOrderError);
      expect((error as ArkOrderError).code).toBe('ARKORDER_INFORMATION_BUDGET');
    }
    expect(p.current()).toBeNull();
    // project() still re-checks a Release that arrived without the budget (store load).
    const store = createMemoryReleaseStore();
    createOrderPlane({ projector: billingProjector, store, clocks: { now: () => 1 } }).release({
      plan: 'free',
      cycle: 'monthly',
      tenancy: 'single',
    });
    const loaded = createOrderPlane({
      projector: billingProjector,
      store,
      informationBudget: { cannotObserve: ['InvoicePosted'] },
      clocks: { now: () => 1 },
    });
    expect(() => loaded.project()).toThrow(/informationBudget/);
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

  it('RESTORE-001: invalid and tampered objects fail closed; restore is not durability', () => {
    const p = plane();
    const frozen = plane().release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    const tamperedThaw = {
      ...frozen,
      xi: { ...frozen.xi, plan: 'enterprise' },
      sigma: { ...frozen.sigma },
    };
    expect(() => p.restore(tamperedThaw as Release)).toThrow(ArkOrderError);
    expect(() => p.restore(null as never)).toThrow(ArkOrderError);
    expect(() => p.restore({ ...frozen, version: 'x' } as never)).toThrow(ArkOrderError);
    expect(() =>
      p.restore({ ...frozen, xi: { ...frozen.xi, nested: { a: 1 } } } as never)
    ).toThrow(ArkOrderError);
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

  it('RESTORE-002: a JSON-deserialized Release restores as a frozen copy with the same hash', () => {
    const frozen = plane().release(
      { plan: 'pro', cycle: 'annual', tenancy: 'org' },
      { seatCap: 9 }
    );
    const wire = JSON.parse(JSON.stringify(frozen)) as Release;
    expect(Object.isFrozen(wire)).toBe(false);
    const target = plane();
    const installed = target.restore(wire);
    expect(installed.hash).toBe(frozen.hash);
    expect(Object.isFrozen(installed)).toBe(true);
    expect(Object.isFrozen(installed.xi)).toBe(true);
    expect(Object.isFrozen(installed.sigma)).toBe(true);
  });

  it('RESTORE-003: restore on a live plane never changes ξ and never rolls the version back', () => {
    const codeOf = (fn: () => unknown): string | undefined => {
      try {
        fn();
        return undefined;
      } catch (error) {
        return (error as ArkOrderError).code;
      }
    };
    const p = plane();
    const v1 = p.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' }, { seatCap: 1 });
    const v2 = p.apply(p.proposeRelease({ plan: 'pro' }));
    expect(v2.version).toBe(2);
    // Foreign ξ from another plane: the valve is proposeRelease -> apply.
    const foreign = plane().release({ plan: 'enterprise', cycle: 'monthly', tenancy: 'single' });
    expect(codeOf(() => p.restore(foreign))).toBe('ARKORDER_UNVALVED_RELEASE');
    // A ξ change apply() would reject as empty blast cannot sneak in either.
    const cycleOnly = plane().release({ plan: 'pro', cycle: 'annual', tenancy: 'single' });
    expect(codeOf(() => p.proposeRelease({ cycle: 'annual' }))).toBe('ARKORDER_EMPTY_BLAST');
    expect(codeOf(() => p.restore(cycleOnly))).toBe('ARKORDER_UNVALVED_RELEASE');
    // Rolling back to v1 is refused; the old version cannot be reused with another ξ.
    expect(codeOf(() => p.restore(v1))).toBe('ARKORDER_UNVALVED_RELEASE');
    expect(p.current()).toBe(v2);
    // Same ξ at an equal version with a different σ reinstalls.
    const sameXi = createOrderPlane({ projector: billingProjector, clocks: { now: () => 1 } });
    sameXi.restore(v2);
    const refreshed = sameXi.refreshSigma({ seatCap: 3 });
    const restored = p.restore(refreshed);
    expect(restored.version).toBe(2);
    expect(p.current()?.sigma.seatCap).toBe(3);
    expect(p.current()?.xiHash).toBe(v2.xiHash);
    // Version is not hashed: a jump past the next version is refused (no forged 999),
    // while the next version (what a same-ξ release() mints) reinstalls.
    const wire = JSON.parse(JSON.stringify(refreshed));
    expect(codeOf(() => p.restore({ ...wire, version: 999 }))).toBe('ARKORDER_UNVALVED_RELEASE');
    expect(p.current()?.version).toBe(2);
    expect(p.restore({ ...wire, version: 3 }).version).toBe(3);
    expect(p.release({ plan: 'pro', cycle: 'monthly', tenancy: 'single' }).version).toBe(4);
  });

  it('STORE-003: a freeze time after the plane clock fails closed (unhashed fields are bounded)', () => {
    let now = 100;
    const clocks = { now: () => now };
    const source = createOrderPlane({ projector: billingProjector, clocks, sigmaMaxAgeMs: 100 });
    const good = source.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    const wire = JSON.parse(JSON.stringify(good));
    const make = (loaded: unknown) =>
      createOrderPlane({
        projector: billingProjector,
        sigmaMaxAgeMs: 100,
        store: { load: () => loaded as Release, save() {} },
        clocks,
      });
    // Far-future releasedAt would switch σ staleness off: refused on load and restore.
    expect(() => make({ ...wire, releasedAt: 9e15 })).toThrow(/releasedAt/);
    expect(() => source.restore({ ...wire, releasedAt: 9e15 })).toThrow(/releasedAt/);
    // σ.releasedAt is hashed, but a recomputed hash is not a signature: bounded too.
    const futureSigma = createOrderPlane({ projector: billingProjector, clocks: { now: () => 50 } })
      .release({ plan: 'free', cycle: 'monthly', tenancy: 'single' }, { releasedAt: 9e15 });
    expect(() => make(JSON.parse(JSON.stringify(futureSigma)))).toThrow(/σ\.releasedAt/);
    // The untampered copy loads and goes stale on schedule.
    const loaded = make(wire);
    now = 100_000;
    expect(loaded.ingest({ kind: 'InvoicePosted' }).kind).toBe('hold');
  });

  it('STORE-001: ReleaseStore.load() output is validated; tampering fails closed at construction', () => {
    const good = plane().release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    const tampered = {
      ...JSON.parse(JSON.stringify(good)),
      xi: { plan: 'enterprise', cycle: 'monthly', tenancy: 'org' },
    };
    const make = (loaded: unknown) =>
      createOrderPlane({
        projector: billingProjector,
        store: { load: () => loaded as Release, save() {} },
        clocks: { now: () => 1 },
      });
    expect(() => make(tampered)).toThrow(ArkOrderError);
    expect(() => make({ ...good, version: 'x' })).toThrow(ArkOrderError);
    expect(() => make({ ...good, xi: { ...good.xi, a: { nested: true } } })).toThrow(ArkOrderError);
    expect(() => make('garbage')).toThrow(ArkOrderError);
    const fromJson = make(JSON.parse(JSON.stringify(good)));
    expect(fromJson.current()?.hash).toBe(good.hash);
    expect(Object.isFrozen(fromJson.current())).toBe(true);
  });

  it('STORE-002: the plane advances only after store.save() succeeds', () => {
    let fail = false;
    const saved: Release[] = [];
    const p = createOrderPlane({
      projector: billingProjector,
      store: {
        load: () => null,
        save(release) {
          if (fail) throw new Error('disk full');
          saved.push(release);
        },
      },
      clocks: { now: () => 1 },
    });
    const v1 = p.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    const proposal = p.proposeRelease({ plan: 'pro' });
    fail = true;
    expect(() => p.apply(proposal)).toThrow(/disk full/);
    expect(() => p.refreshSigma({ seatCap: 2 })).toThrow(/disk full/);
    expect(() => p.restore(v1)).toThrow(/disk full/);
    expect(p.current()).toBe(v1);
    expect(saved).toEqual([v1]);
    fail = false;
    const v2 = p.apply(proposal);
    expect(v2.version).toBe(2);
  });

  it('PROPOSAL-001: apply rejects stale, hand-built, and tampered proposals', () => {
    const codeOf = (fn: () => unknown): string | undefined => {
      try {
        fn();
        return undefined;
      } catch (error) {
        return (error as ArkOrderError).code;
      }
    };
    const p = plane();
    const base = p.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    const toPro = p.proposeRelease({ plan: 'pro' });
    const toEnterprise = p.proposeRelease({ plan: 'enterprise' });
    expect(toPro.baseXiHash).toBe(base.xiHash);
    expect(toPro.baseVersion).toBe(1);
    p.apply(toPro);
    // Computed against v1; v2 is current now.
    expect(codeOf(() => p.apply(toEnterprise))).toBe('ARKORDER_STALE_PROPOSAL');
    // Hand-built without a base.
    expect(
      codeOf(() =>
        p.apply({ nextXi: { plan: 'free' }, blastRadius: [], invalidations: [] } as never)
      )
    ).toBe('ARKORDER_STALE_PROPOSAL');
    // Correct base, but a blast radius nobody reviewed.
    const current = p.current()!;
    expect(
      codeOf(() =>
        p.apply({
          nextXi: { plan: 'pro', cycle: 'monthly', tenancy: 'team' },
          blastRadius: ['x'],
          invalidations: [],
          baseXiHash: current.xiHash,
          baseVersion: current.version,
        })
      )
    ).toBe('ARKORDER_STALE_PROPOSAL');
    expect(p.current()?.version).toBe(2);
    // The binding is data, not a capability: a hand-built proposal that states the
    // current base and the exact transition is the same proposal proposeRelease would
    // return, so it applies — the reviewed blast is still what commits (never empty).
    const exact = p.proposeRelease({ cycle: 'annual', tenancy: 'org' });
    const handBuilt = {
      nextXi: { ...exact.nextXi },
      blastRadius: [...exact.blastRadius],
      invalidations: [...exact.invalidations],
      baseXiHash: current.xiHash,
      baseVersion: current.version,
    };
    expect(handBuilt).toEqual({ ...exact });
    // A proposal survives JSON (human review) and still applies when it is current.
    const reviewed = JSON.parse(JSON.stringify(p.proposeRelease({ tenancy: 'team' })));
    expect(p.apply(reviewed).version).toBe(3);
  });

  it('BUDGET-001: proposeRelease / apply never offer or persist a denied pattern', () => {
    const saved: number[] = [];
    const p = createOrderPlane({
      projector: billingProjector,
      informationBudget: { cannotObserve: ['SeatAdded'] },
      store: { load: () => null, save: (release) => void saved.push(release.version) },
      clocks: { now: () => 1 },
    });
    const v1 = p.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' });
    expect(() => p.proposeRelease({ plan: 'pro' })).toThrow(/informationBudget/);
    expect(() =>
      p.apply({
        nextXi: { plan: 'pro', cycle: 'monthly', tenancy: 'single' },
        blastRadius: ['SeatAdded', 'excess-seats'],
        invalidations: [],
        baseXiHash: v1.xiHash,
        baseVersion: v1.version,
      })
    ).toThrow(/informationBudget/);
    expect(saved).toEqual([1]);
    expect(p.current()?.version).toBe(1);
    expect(p.project().allowedKinds).toEqual(['InvoicePosted']);
    expect(p.ingest({ kind: 'InvoicePosted' }).kind).toBe('absorb');
  });

  it('SIGMA-001: σ.freshUntil is honored without sigmaMaxAgeMs', () => {
    let now = 1000;
    const p = createOrderPlane({ projector: billingProjector, clocks: { now: () => now } });
    p.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' }, { freshUntil: 1500 });
    expect(p.ingest({ kind: 'InvoicePosted' }).kind).toBe('absorb');
    now = 999_999;
    const stale = p.ingest({ kind: 'InvoicePosted' });
    expect(stale.kind).toBe('hold');
    if (stale.kind === 'hold') expect(stale.reasonCode).toBe('stale-sigma');
    // Non-numeric freshUntil falls through to the (absent) age check: never stale.
    const loose = createOrderPlane({ projector: billingProjector, clocks: { now: () => now } });
    loose.release({ plan: 'free', cycle: 'monthly', tenancy: 'single' }, { freshUntil: 'soon' });
    expect(loose.ingest({ kind: 'InvoicePosted' }).kind).toBe('absorb');
  });

  it('XI-FINITE-001: NaN and ±Infinity are rejected on ξ and σ (no stable identity)', () => {
    const codeOf = (fn: () => unknown): string | undefined => {
      try {
        fn();
        return undefined;
      } catch (error) {
        return (error as ArkOrderError).code;
      }
    };
    const loose = () => createOrderPlane({ projector: billingProjector, clocks: { now: () => 1 } });
    expect(codeOf(() => loose().release({ plan: 'free', n: Number.NaN }))).toBe('ARKORDER_NESTED_XI');
    expect(codeOf(() => loose().release({ plan: 'free', n: Infinity }))).toBe('ARKORDER_NESTED_XI');
    expect(codeOf(() => loose().release({ plan: 'free' }, { cap: -Infinity }))).toBe(
      'ARKORDER_NESTED_XI'
    );
    const p = loose();
    p.release({ plan: 'free', n: null });
    expect(codeOf(() => p.release({ plan: 'free', n: Number.NaN }))).toBe('ARKORDER_NESTED_XI');
    expect(p.current()?.version).toBe(1);
  });
});
