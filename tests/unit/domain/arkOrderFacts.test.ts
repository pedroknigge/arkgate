import { describe, expect, it } from 'vitest';
import { extractArkOrderGenericUpdatesFromSource } from '../../../src/domain/arkOrderFacts';

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

  it('denies generic .set when createOrderPlane is in the file', () => {
    const facts = extractArkOrderGenericUpdatesFromSource(
      'src/main.ts',
      `import { createOrderPlane } from 'arkgate/order';
export function boot(): void {
  const plane = createOrderPlane({
    projector: () => ({ allowedKinds: ['InvoicePosted'], invalidated: [] }),
  });
  const order = new Map<string, string>();
  order.set('milestone', 'trial');
}
`
    );
    expect(facts.some((fact) => fact.method === 'set')).toBe(true);
  });
});
