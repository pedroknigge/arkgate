import { describe, expect, it } from 'vitest';
import * as gate from '../../../src/gate';
import {
  InvalidArkRunGraphQueryError,
  createStrictArkKernel,
} from '../../../src/index';

function assertNoLeakage(value: unknown): void {
  const visit = (node: unknown, path: string): void => {
    expect(typeof node, path).not.toBe('function');
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      expect(key, path).not.toMatch(/^(factory|factories|instance|instances|input|dto|payload)$/i);
      visit(child, `${path}.${key}`);
    }
  };
  visit(value, '$');
}

describe('RN13 ArkRun requestGraph (kernel)', () => {
  it('keeps requestGraph off the stable gate root', () => {
    expect((gate as { requestGraph?: unknown }).requestGraph).toBeUndefined();
    expect((gate as { requestArkRunGraph?: unknown }).requestArkRunGraph).toBeUndefined();
    expect(
      (gate as { formatArkRunGraphMermaid?: unknown }).formatArkRunGraphMermaid
    ).toBeUndefined();
  });

  it('slices the live information package per kernel instance', () => {
    const ark = createStrictArkKernel({ instanceId: 'kernel-rn13-live' });
    ark.register({
      id: 'Application.PlaceOrder',
      uses: ['Domain.OrderRepository'],
      raises: ['Domain.Order.Placed'],
      sends: ['Adapter.NotifyWarehouse'],
      factory: () => ({ leaked: true }),
      extendedInfo: { label: 'Place order', group: 'sales' },
    });
    ark.register({
      id: 'Application.BillingWorker',
      uses: ['Domain.OrderRepository'],
      reactsTo: ['Domain.Order.Placed'],
      factory: () => ({ leaked: true }),
    });
    ark.register({
      id: 'Domain.OrderRepository',
      factory: () => ({ leaked: true }),
    });

    const process = ark.requestGraph({ slice: 'process' });
    expect(process.kernelInstanceId).toBe('kernel-rn13-live');
    expect(process.edges.map((edge) => edge.kind).sort()).toEqual([
      'raises',
      'reactsTo',
      'sends',
    ]);
    expect(process.mermaid).toContain('flowchart LR');
    assertNoLeakage(process);
    expect(JSON.stringify(process)).not.toMatch(/leaked/);

    const technical = ark.requestGraph({
      slice: 'technical',
      nodeIds: ['Application.PlaceOrder'],
      degreesOfSeparation: 1,
    });
    expect(technical.nodes.map((node) => node.id)).toEqual([
      'Application.PlaceOrder',
      'Domain.OrderRepository',
    ]);
    expect(technical.mermaid).toContain('flowchart TD');

    const other = createStrictArkKernel();
    expect(other.requestGraph().nodes).toEqual([]);
    expect(() => ark.requestGraph({ slice: 'bus' as 'process' })).toThrow(
      InvalidArkRunGraphQueryError
    );
  });
});
