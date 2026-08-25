import { describe, expect, it } from 'vitest';
import {
  ARK_RUN_GRAPH_DEFAULT_SLICE,
  ARK_RUN_GRAPH_SCHEMA_VERSION,
  ARK_RUN_GRAPH_SLICES,
  InvalidArkRunGraphQueryError,
  arkRunGraphQueryFromSearchParams,
  closeArkRunGraphQuery,
  formatArkRunGraphMermaid,
  requestArkRunGraph,
} from '../../../src/domain/arkRunGraph';

const factory = () => ({ secret: true });

const PACKAGE = {
  kernelInstanceId: 'kernel-rn13',
  components: [
    {
      id: 'Application.PlaceOrder',
      lifetime: 'singleton',
      uses: ['Domain.OrderRepository'],
      reactsTo: [],
      raises: ['Domain.Order.Placed'],
      sends: ['Adapter.NotifyWarehouse'],
      factory,
      instance: { secret: true },
      extendedInfo: {
        label: 'Place order',
        architectureKind: 'use-case',
        tags: ['orders'],
        group: 'sales',
      },
    },
    {
      id: 'Application.BillingWorker',
      lifetime: 'transient',
      uses: ['Domain.OrderRepository'],
      reactsTo: ['Domain.Order.Placed'],
      raises: [],
      sends: [],
      factory,
      extendedInfo: {
        label: 'Billing worker',
        group: 'billing',
        tags: ['orders'],
      },
    },
    {
      id: 'Domain.OrderRepository',
      lifetime: 'singleton',
      uses: [],
      reactsTo: [],
      raises: [],
      sends: [],
      factory,
      extendedInfo: { architectureKind: 'repository', group: 'domain' },
    },
  ],
};

function ownKeys(value: object): string[] {
  return [
    ...Object.getOwnPropertyNames(value),
    ...Object.getOwnPropertySymbols(value).map(String),
  ];
}

function assertNoLeakage(value: unknown): void {
  const visit = (node: unknown, path: string): void => {
    expect(typeof node, path).not.toBe('function');
    if (node === null || typeof node !== 'object') return;
    for (const key of ownKeys(node)) {
      expect(key, path).not.toMatch(/^(factory|factories|instance|instances|input|dto|payload)$/i);
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      visit(child, `${path}.${key}`);
    }
  };
  visit(value, '$');
}

describe('RN13 ArkRun graph slices (pure)', () => {
  it('locks closed slices and defaults to process', () => {
    expect(ARK_RUN_GRAPH_SCHEMA_VERSION).toBe('1.0');
    expect([...ARK_RUN_GRAPH_SLICES]).toEqual(['process', 'technical']);
    expect(ARK_RUN_GRAPH_DEFAULT_SLICE).toBe('process');
    expect(closeArkRunGraphQuery().slice).toBe('process');
    expect(closeArkRunGraphQuery().degreesOfSeparation).toBeNull();
  });

  it('builds a process slice of raises / reactsTo / sends without factories', () => {
    const graph = requestArkRunGraph(PACKAGE);
    expect(graph.slice).toBe('process');
    expect(graph.kernelInstanceId).toBe('kernel-rn13');
    expect(graph.nodes.map((node) => node.id)).toEqual([
      'Adapter.NotifyWarehouse',
      'Application.BillingWorker',
      'Application.PlaceOrder',
      'Domain.Order.Placed',
      'Domain.OrderRepository',
    ]);
    expect(graph.nodes.find((node) => node.id === 'Domain.Order.Placed')?.kind).toBe(
      'interaction'
    );
    expect(graph.edges).toEqual([
      { from: 'Application.PlaceOrder', to: 'Domain.Order.Placed', kind: 'raises' },
      {
        from: 'Application.PlaceOrder',
        to: 'Adapter.NotifyWarehouse',
        kind: 'sends',
      },
      {
        from: 'Domain.Order.Placed',
        to: 'Application.BillingWorker',
        kind: 'reactsTo',
      },
    ]);
    expect(graph.edges.some((edge) => edge.kind === 'uses')).toBe(false);
    assertNoLeakage(graph);
    expect(JSON.parse(JSON.stringify(graph))).toEqual(graph);
    expect(JSON.stringify(graph)).not.toMatch(/secret/);
  });

  it('builds a technical uses slice', () => {
    const graph = requestArkRunGraph(PACKAGE, { slice: 'technical' });
    expect(graph.slice).toBe('technical');
    expect(graph.edges).toEqual([
      {
        from: 'Application.BillingWorker',
        to: 'Domain.OrderRepository',
        kind: 'uses',
      },
      {
        from: 'Application.PlaceOrder',
        to: 'Domain.OrderRepository',
        kind: 'uses',
      },
    ]);
    expect(graph.nodes.map((node) => node.id)).toEqual([
      'Application.BillingWorker',
      'Application.PlaceOrder',
      'Domain.OrderRepository',
    ]);
    expect(graph.edges.some((edge) => edge.kind === 'raises')).toBe(false);
  });

  it('keeps a nodeIds neighborhood at the requested degrees of separation', () => {
    const seed = 'Application.PlaceOrder';
    const zero = requestArkRunGraph(PACKAGE, {
      slice: 'process',
      nodeIds: [seed],
      degreesOfSeparation: 0,
    });
    expect(zero.nodes.map((node) => node.id)).toEqual([seed]);
    expect(zero.edges).toEqual([]);

    const one = requestArkRunGraph(PACKAGE, {
      slice: 'process',
      nodeIds: [seed],
      degreesOfSeparation: 1,
    });
    expect(one.nodes.map((node) => node.id)).toEqual([
      'Adapter.NotifyWarehouse',
      'Application.PlaceOrder',
      'Domain.Order.Placed',
    ]);
    expect(one.nodes.some((node) => node.id === 'Application.BillingWorker')).toBe(false);

    const two = requestArkRunGraph(PACKAGE, {
      slice: 'process',
      nodeIds: [seed],
      degreesOfSeparation: 2,
    });
    expect(two.nodes.map((node) => node.id)).toContain('Application.BillingWorker');

    const unbounded = requestArkRunGraph(PACKAGE, { nodeIds: [seed] });
    expect(unbounded.query.degreesOfSeparation).toBeNull();
    expect(unbounded.nodes.map((node) => node.id)).toEqual(two.nodes.map((node) => node.id));
  });

  it('applies include / exclude query tokens and field filters', () => {
    const sales = requestArkRunGraph(PACKAGE, { include: { groups: ['sales'] } });
    expect(sales.nodes.map((node) => node.id)).toEqual(['Application.PlaceOrder']);

    const glob = requestArkRunGraph(PACKAGE, { include: 'Application.*' });
    expect(glob.nodes.map((node) => node.id)).toEqual([
      'Application.BillingWorker',
      'Application.PlaceOrder',
    ]);

    const excluded = requestArkRunGraph(PACKAGE, {
      slice: 'technical',
      exclude: { architectureKinds: ['repository'] },
    });
    expect(excluded.nodes.map((node) => node.id)).toEqual([
      'Application.BillingWorker',
      'Application.PlaceOrder',
    ]);
    expect(excluded.edges).toEqual([]);
  });

  it('renders mermaid that matches the helper and names the slice direction', () => {
    const process = requestArkRunGraph(PACKAGE, { slice: 'process' });
    expect(process.mermaid).toBe(formatArkRunGraphMermaid(process));
    expect(process.mermaid.startsWith('flowchart LR')).toBe(true);
    expect(process.mermaid).toContain('-->|raises|');
    expect(process.mermaid).toContain('-->|reactsTo|');
    expect(process.mermaid).toContain('subgraph');
    expect(process.mermaid).toContain('Place order');

    const technical = requestArkRunGraph(PACKAGE, { slice: 'technical' });
    expect(technical.mermaid.startsWith('flowchart TD')).toBe(true);
    expect(technical.mermaid).toContain('-->|uses|');
    expect(technical.mermaid).not.toMatch(/secret|factory/);
  });

  it('fail-closes invalid slice, degrees, and unknown include keys', () => {
    expect(() => requestArkRunGraph(PACKAGE, { slice: 'both' })).toThrow(
      InvalidArkRunGraphQueryError
    );
    expect(() =>
      requestArkRunGraph(PACKAGE, { degreesOfSeparation: -1 })
    ).toThrow(InvalidArkRunGraphQueryError);
    expect(() =>
      requestArkRunGraph(PACKAGE, { include: { group: 'sales' } })
    ).toThrow(InvalidArkRunGraphQueryError);
    expect(() => requestArkRunGraph(PACKAGE, 'process')).toThrow(
      InvalidArkRunGraphQueryError
    );
    expect(() => requestArkRunGraph(PACKAGE, { factory: true })).toThrow(
      InvalidArkRunGraphQueryError
    );
  });

  it('parses inspector search params into a closed query', () => {
    const query = arkRunGraphQueryFromSearchParams({
      slice: 'technical',
      nodeIds: 'Application.PlaceOrder,Domain.OrderRepository',
      degreesOfSeparation: '1',
      include: 'sales',
      exclude: 'infra',
    });
    expect(query).toEqual({
      slice: 'technical',
      nodeIds: ['Application.PlaceOrder', 'Domain.OrderRepository'],
      degreesOfSeparation: 1,
      include: ['sales'],
      exclude: ['infra'],
    });
    expect(arkRunGraphQueryFromSearchParams({})).toEqual({});
  });
});
