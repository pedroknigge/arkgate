import { describe, expect, it } from 'vitest';
import {
  extractArkOrderBudgetLeaksFromSource,
  extractArkOrderGenericUpdatesFromSource,
  extractArkOrderIngestWritesXiFromSource,
  extractArkOrderXiFieldWritesFromSource,
  extractArkOrderXiTtlKeysFromSource,
} from '../../../src/domain/arkOrderFacts';

const REACT_VIEW = `
import { useState } from 'react';

export function ScheduleMilestoneTrialView(): void {
  const [tab, setTab] = useState('schedule');
  const order = new Map<string, string>();
  order.set('milestone', 'trial');
  const searchParams = new URLSearchParams();
  searchParams.set('tab', tab);
  setTab('done');
}
`;

describe('EOSF5-001 extractArkOrderGenericUpdatesFromSource', () => {
  it('stays silent on React/UI .set() without arkgate/order or plane callee', () => {
    expect(
      extractArkOrderGenericUpdatesFromSource(
        'src/application/schedule-milestone-trial-view.ts',
        REACT_VIEW
      )
    ).toEqual([]);
  });

  it('stays silent on plane / *Plane names with no ArkOrder evidence (clipPlane, controlPlane)', () => {
    const facts = extractArkOrderGenericUpdatesFromSource(
      'src/application/other.ts',
      `export function clip(clipPlane: { set(a: number, b: number): void }): void {
  clipPlane.set(1, 0);
}
export function scale(controlPlane: { update(x: object): void }, plane: { set(n: number): void }): void {
  controlPlane.update({ replicas: 3 });
  flightPlane.patch({ heading: 90 });
  plane.set(1);
}
`,
      { planeRoots: ['src/main.ts'] }
    );
    expect(facts).toEqual([]);
  });

  it('denies plane.set on a parameter annotated OrderPlane', () => {
    const facts = extractArkOrderGenericUpdatesFromSource(
      'src/application/boot.ts',
      `export function bump(plane: OrderPlane): void {
  (plane as any).set({ plan: 'pro' });
}
`
    );
    expect(facts).toEqual([{ file: 'src/application/boot.ts', line: 2, method: 'set' }]);
  });

  it('denies orderPlane.update in a file that imports arkgate/order', () => {
    const facts = extractArkOrderGenericUpdatesFromSource(
      'src/application/boot.ts',
      `import type { OrderPlane } from 'arkgate/order';
export function bump(orderPlane: { update(xi: object): void }): void {
  orderPlane.update({ plan: 'pro' });
}
`
    );
    expect(facts).toEqual([{ file: 'src/application/boot.ts', line: 3, method: 'update' }]);
  });

  it('stays silent on Map.set / prisma update inside the plane-root file', () => {
    const facts = extractArkOrderGenericUpdatesFromSource(
      'src/main.ts',
      `import { createOrderPlane } from 'arkgate/order';
import { PrismaClient } from '@prisma/client';
export function boot(): void {
  const plane = createOrderPlane({
    projector: () => ({ allowedKinds: ['InvoicePosted'], invalidated: [] }),
  });
  const order = new Map<string, string>();
  order.set('milestone', 'trial');
  void new PrismaClient().audit.update({ data: {} });
  void plane;
}
`
    );
    expect(facts).toEqual([]);
  });

  it('denies .set on an identifier bound to createOrderPlane in the same file', () => {
    const facts = extractArkOrderGenericUpdatesFromSource(
      'src/main.ts',
      `import { createOrderPlane } from 'arkgate/order';
const house = createOrderPlane({ projector: () => ({ allowedKinds: [], invalidated: [] }) });
(house as any).set({ plan: 'pro' });
`
    );
    expect(facts).toEqual([{ file: 'src/main.ts', line: 3, method: 'set' }]);
  });

  it('denies billingPlane.update and (billingPlane as T).update imported from a plane root', () => {
    const source = `import { billingPlane } from '../main';
export function bump(): void {
  billingPlane.update({ plan: 'pro' });
  (billingPlane as unknown as { update(xi: object): void }).update({ plan: 'pro' });
  billingPlane?.patch({ plan: 'pro' });
}
`;
    const facts = extractArkOrderGenericUpdatesFromSource('src/application/use.ts', source, {
      planeRoots: ['src/main.ts'],
    });
    expect(facts.map((fact) => [fact.line, fact.method])).toEqual([
      [3, 'update'],
      [4, 'update'],
      [5, 'patch'],
    ]);
    // Without the declared root the import is not evidence (no inference).
    expect(extractArkOrderGenericUpdatesFromSource('src/application/use.ts', source)).toEqual([]);
  });

  it('resolves aliased and .js-suffixed imports from a plane root; other imports stay silent', () => {
    const facts = extractArkOrderGenericUpdatesFromSource(
      'src/application/use.ts',
      `import { billingPlane as bp, cache } from '../order/index.js';
import { clipPlane } from '../scene';
bp.set({ plan: 'pro' });
cache.set('k', 1);
clipPlane.set(1, 0);
`,
      { planeRoots: ['src/order/**'] }
    );
    expect(facts).toEqual([{ file: 'src/application/use.ts', line: 3, method: 'set' }]);
  });

  it('does not treat a call result or the factory as a plane receiver', () => {
    const facts = extractArkOrderGenericUpdatesFromSource(
      'src/application/use.ts',
      `export function f(): void {
  getPlane(x).update({ plan: 'pro' });
  createOrderPlane.set(1);
}
`
    );
    expect(facts).toEqual([]);
  });
});

describe('ARKORDER_INGEST_WRITES_XI precision', () => {
  const lines = (source: string) =>
    extractArkOrderIngestWritesXiFromSource('src/main.ts', source).map((fact) => fact.line);

  it('flags whole-word ξ holders and property writes', () => {
    expect(
      lines(`const release = plane.ingest(e);
let xi = plane.ingest(e);
store.xi = plane.ingest(e);
store.current = plane.ingest(e);
release.xi[k] = plane.ingest(e);
const current: Release = plane.ingest(e);
`)
    ).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('stays silent on prefixed names and comparisons', () => {
    expect(
      lines(`const currentResidual = plane.ingest(e);
const patternResult = plane.ingest(e);
const houseKeepingOutcome = plane.ingest(e);
const releaseDate = importer.ingest(x);
if (currentStatus === plane.ingest(e).kind) {}
if (release == plane.ingest(e)) {}
const taxi = plane.ingest(e);
const xiaomi = plane.ingest(e);
`)
    ).toEqual([]);
  });

  it('flags camelCase ξ / Release holders (xi head, Xi / Release / Pattern tail)', () => {
    expect(
      lines(`xiNext = plane.ingest(e);
this.nextXi = plane.ingest(e);
this.currentRelease = plane.ingest(e);
const frozenPattern = plane.ingest(e);
`)
    ).toEqual([1, 2, 3, 4]);
  });

  it('documents the trade-off: a release/current *prefix* alone is not evidence', () => {
    // ADR 0013 prefers false negatives: `releaseState` reads like a ξ holder but so does
    // `releaseDate`; neither name is direct evidence, so both stay silent.
    expect(
      lines(`this.releaseState = plane.ingest(e);
const currentStatus = plane.ingest(e);
`)
    ).toEqual([]);
  });
});

describe('ARKORDER_XI_FIELD_WRITE receivers', () => {
  const keys = ['plan'];
  const facts = (source: string) =>
    extractArkOrderXiFieldWritesFromSource('src/application/save.ts', source, keys);

  it('flags the README inline client and a renamed client', () => {
    expect(
      facts(`import { PrismaClient } from '@prisma/client';
await new PrismaClient().billing.update({ data: { plan: 'pro' } });
`)
    ).toHaveLength(1);
    expect(
      facts(`import { PrismaClient } from '@prisma/client';
const orm = new PrismaClient();
await orm.billing.update({ where: { id }, data: { plan: 'pro' } });
`)
    ).toHaveLength(1);
    expect(
      facts(`import { drizzle } from 'drizzle-orm/node-postgres';
const store = drizzle(pool);
await store.update(billing).set({ plan: 'pro' });
`)
    ).toHaveLength(1);
  });

  it('flags class-field, constructor-injected, and locally imported clients', () => {
    expect(
      facts(`import { PrismaClient } from '@prisma/client';
export class S {
  private orm = new PrismaClient();
  async f() { await this.orm.billing.update({ data: { plan: 'pro' } }); }
}
`)
    ).toHaveLength(1);
    expect(
      facts(`import { PrismaClient } from '@prisma/client';
export class S {
  constructor(private readonly orm: PrismaClient) {}
  async f() { await this.orm.billing.update({ data: { plan: 'pro' } }); }
}
`)
    ).toHaveLength(1);
    expect(
      facts(`import { orm } from '../infra/orm';
await orm.billing.update({ data: { plan: 'pro' } });
`)
    ).toHaveLength(1);
    expect(
      facts(`import { PrismaClient } from '@prisma/client';
await new PrismaClient({ log: levels() }).billing.update({ data: { plan: 'pro' } });
`)
    ).toHaveLength(1);
  });

  it('stays silent on a repository receiver', () => {
    expect(
      facts(`import { PrismaClient } from '@prisma/client';
export async function save(repo: { update(x: object): Promise<void> }): Promise<void> {
  await repo.update({ plan: 'pro' });
}
`)
    ).toEqual([]);
  });
});

describe('ARKORDER_XI_TTL / ARKORDER_INFORMATION_BUDGET static facts', () => {
  it('flags freshness keys in the ξ literal of plane.release / proposeRelease', () => {
    const facts = extractArkOrderXiTtlKeysFromSource(
      'src/main.ts',
      `import type { OrderPlane } from 'arkgate/order';
const plane = createOrderPlane({ projector });
plane.release({ plan: 'free', ttl: 30 });
billingPlane.proposeRelease({ 'maxAge': 5 });
plane.release({ plan, freshUntil });
`
    );
    expect(facts).toEqual([
      { file: 'src/main.ts', line: 3, key: 'ttl' },
      { file: 'src/main.ts', line: 4, key: 'maxAge' },
      { file: 'src/main.ts', line: 5, key: 'freshUntil' },
    ]);
  });

  it('stays silent on σ freshness and non-plane release()', () => {
    expect(
      extractArkOrderXiTtlKeysFromSource(
        'src/main.ts',
        `plane.release({ plan: 'free' }, { freshUntil: 1500 });
lock.release({ ttl: 5 });
`
      )
    ).toEqual([]);
  });

  it('flags a literal allowedKinds entry that a literal cannotObserve denies', () => {
    const facts = extractArkOrderBudgetLeaksFromSource(
      'src/main.ts',
      `const plane = createOrderPlane({
  projector: (r) => (r.xi.plan === 'pro'
    ? { allowedKinds: ['Invoice', 'Seat'], invalidated: [] }
    : { allowedKinds: ['Invoice'], invalidated: [] }),
  informationBudget: { cannotObserve: ['Seat'] },
});
`
    );
    expect(facts).toEqual([{ file: 'src/main.ts', line: 3, kind: 'Seat' }]);
  });

  it('stays silent without a literal budget or without a plane', () => {
    expect(
      extractArkOrderBudgetLeaksFromSource(
        'src/main.ts',
        `createOrderPlane({ projector: () => ({ allowedKinds: ['Seat'], invalidated: [] }), informationBudget });`
      )
    ).toEqual([]);
    expect(
      extractArkOrderBudgetLeaksFromSource(
        'src/other.ts',
        `const a = { allowedKinds: ['Seat'] }; const b = { cannotObserve: ['Seat'] };`
      )
    ).toEqual([]);
  });
});
