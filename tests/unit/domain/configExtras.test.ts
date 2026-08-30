import { describe, expect, it } from 'vitest';
import {
  defaultedArkOrder,
  defaultedArkRun,
  validateArkOrderExtra,
  validateArkRunExtra,
} from '../../../src/domain/configExtras';
import type { ArkConfigIssue } from '../../../src/domain/configTypes';

describe('configExtras (opt-in arkRun / arkOrder)', () => {
  it('defaults missing extra fields and leaves non-objects alone', () => {
    expect(defaultedArkRun(null)).toBeNull();
    expect(defaultedArkOrder('nope')).toBe('nope');
    const run = defaultedArkRun({}) as Record<string, unknown>;
    expect(run.mode).toBe('advisory');
    expect(run.compositionRoots).toEqual([]);
    expect(run.requireDeclarations).toBe(true);
    const order = defaultedArkOrder({ maxXiKeys: 0 });
    expect(order.mode).toBe('advisory');
    expect(order.planeRoots).toEqual([]);
    expect(order.maxXiKeys).toBe(7);
  });

  it('keeps explicit kernelRoots and maxXiKeys', () => {
    const run = defaultedArkRun({
      kernelRoots: ['src/main.ts'],
      ignoreDirectNewForErrors: false,
    }) as Record<string, unknown>;
    expect(run.kernelRoots).toEqual(['src/main.ts']);
    expect(run.ignoreDirectNewForErrors).toBe(false);
    expect(defaultedArkOrder({ maxXiKeys: 3 }).maxXiKeys).toBe(3);
  });

  it('is silent when the extra is absent', () => {
    const issues: ArkConfigIssue[] = [];
    validateArkRunExtra({ layers: [] }, issues);
    validateArkOrderExtra({ layers: [] }, issues);
    expect(issues).toEqual([]);
  });

  it('fails closed on unknown managed layers and empty enforced roots', () => {
    const layers = [{ name: 'DomainModel' }];
    const runIssues: ArkConfigIssue[] = [];
    validateArkRunExtra(
      {
        layers,
        arkRun: { mode: 'enforced', compositionRoots: [], managedLayers: ['Nope'] },
      },
      runIssues
    );
    expect(runIssues.some((i) => i.path.includes('managedLayers'))).toBe(true);
    expect(runIssues.some((i) => String(i.message).includes('ARKRUN_MISSING_ROOT'))).toBe(true);

    const orderIssues: ArkConfigIssue[] = [];
    validateArkOrderExtra(
      {
        layers,
        arkOrder: { mode: 'enforced', planeRoots: [], managedLayers: [] },
      },
      orderIssues
    );
    expect(orderIssues.some((i) => String(i.message).includes('ARKORDER_MISSING_PLANE'))).toBe(
      true
    );
    expect(orderIssues.some((i) => i.path === '$.arkOrder.managedLayers')).toBe(true);
  });
});
