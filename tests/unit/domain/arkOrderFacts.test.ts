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

  it('denies plane.set without an arkgate/order import', () => {
    const facts = extractArkOrderGenericUpdatesFromSource(
      'src/application/boot.ts',
      `export function bump(plane: { set(xi: object): void }): void {
  plane.set({ plan: 'pro' });
}
`
    );
    expect(facts).toEqual([{ file: 'src/application/boot.ts', line: 2, method: 'set' }]);
  });

  it('denies orderPlane.update', () => {
    const facts = extractArkOrderGenericUpdatesFromSource(
      'src/application/boot.ts',
      `export function bump(orderPlane: { update(xi: object): void }): void {
  orderPlane.update({ plan: 'pro' });
}
`
    );
    expect(facts).toEqual([{ file: 'src/application/boot.ts', line: 2, method: 'update' }]);
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

  it('denies billingPlane.update and (billingPlane as T).update in another file', () => {
    const facts = extractArkOrderGenericUpdatesFromSource(
      'src/application/use.ts',
      `import { billingPlane } from '../main';
export function bump(): void {
  billingPlane.update({ plan: 'pro' });
  (billingPlane as unknown as { update(xi: object): void }).update({ plan: 'pro' });
  billingPlane?.patch({ plan: 'pro' });
}
`
    );
    expect(facts.map((fact) => [fact.line, fact.method])).toEqual([
      [3, 'update'],
      [4, 'update'],
      [5, 'patch'],
    ]);
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
      `const plane = createOrderPlane({ projector });
plane.release({ plan: 'free', ttl: 30 });
billingPlane.proposeRelease({ 'maxAge': 5 });
`
    );
    expect(facts).toEqual([
      { file: 'src/main.ts', line: 2, key: 'ttl' },
      { file: 'src/main.ts', line: 3, key: 'maxAge' },
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
