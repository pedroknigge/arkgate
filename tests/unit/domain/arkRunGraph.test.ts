import { describe, expect, it } from 'vitest';
import {
  ARK_RUN_GRAPH_DEFAULT_SLICE,
  ARK_RUN_GRAPH_EDGE_ORIGINS,
  ARK_RUN_GRAPH_SCHEMA_VERSION,
  ARK_RUN_GRAPH_SLICES,
  InvalidArkRunGraphQueryError,
  arkRunGraphQueryFromSearchParams,
  closeArkRunGraphQuery,
  formatArkRunGraphMermaid,
  requestArkRunGraph,
  type ArkRunGraphEdgeOrigin,
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
    const origins: ArkRunGraphEdgeOrigin[] = [...ARK_RUN_GRAPH_EDGE_ORIGINS];
    expect(origins).toEqual(['declared', 'observed', 'both']);
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
      {
        from: 'Application.PlaceOrder',
        to: 'Domain.Order.Placed',
        kind: 'raises',
        origin: 'declared',
      },
      {
        from: 'Application.PlaceOrder',
        to: 'Adapter.NotifyWarehouse',
        kind: 'sends',
        origin: 'declared',
      },
      {
        from: 'Domain.Order.Placed',
        to: 'Application.BillingWorker',
        kind: 'reactsTo',
        origin: 'declared',
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
        origin: 'declared',
      },
      {
        from: 'Application.PlaceOrder',
        to: 'Domain.OrderRepository',
        kind: 'uses',
        origin: 'declared',
      },
    ]);
    expect(graph.nodes.map((node) => node.id)).toEqual([
      'Application.BillingWorker',
      'Application.PlaceOrder',
      'Domain.OrderRepository',
    ]);
    expect(graph.edges.some((edge) => edge.kind === 'raises')).toBe(false);
  });

  it('keeps a nodeIds neighborhood using 0-1 BFS across interaction connectors', () => {
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
      'Application.BillingWorker',
      'Application.PlaceOrder',
      'Domain.Order.Placed',
    ]);

    const unbounded = requestArkRunGraph(PACKAGE, { nodeIds: [seed] });
    expect(unbounded.query.degreesOfSeparation).toBeNull();
    expect(unbounded.nodes.map((node) => node.id)).toEqual(one.nodes.map((node) => node.id));
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
    expect(process.mermaid).toContain('-->|raises: declared|');
    expect(process.mermaid).toContain('-->|reactsTo: declared|');
    expect(process.mermaid).toContain('subgraph');
    expect(process.mermaid).toContain('Place order');

    const technical = requestArkRunGraph(PACKAGE, { slice: 'technical' });
    expect(technical.mermaid.startsWith('flowchart TD')).toBe(true);
    expect(technical.mermaid).toContain('-->|uses: declared|');
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

describe('Phase 3.1 ArkRun unified graph, 0-1 BFS, and Mermaid safety', () => {
  it('crosses interaction nodes at cost 0 without pulling dangling boundary events', () => {
    const chain = {
      kernelInstanceId: 'kernel-bfs',
      components: [
        { id: 'OrderService', raises: ['Domain.OrderCreated'] },
        {
          id: 'BillingService',
          reactsTo: ['Domain.OrderCreated'],
          raises: ['Domain.InvoiceSent'],
        },
        {
          id: 'NotificationService',
          reactsTo: ['Domain.InvoiceSent'],
        },
      ],
    };

    const d0 = requestArkRunGraph(chain, {
      nodeIds: ['OrderService'],
      degreesOfSeparation: 0,
    });
    expect(d0.nodes.map((n) => n.id)).toEqual(['OrderService']);

    const d1 = requestArkRunGraph(chain, {
      nodeIds: ['OrderService'],
      degreesOfSeparation: 1,
    });
    expect(d1.nodes.map((n) => n.id)).toEqual([
      'BillingService',
      'Domain.OrderCreated',
      'OrderService',
    ]);
    expect(d1.nodes.map((n) => n.id)).not.toContain('Domain.InvoiceSent');
    expect(d1.nodes.map((n) => n.id)).not.toContain('NotificationService');

    const d2 = requestArkRunGraph(chain, {
      nodeIds: ['OrderService'],
      degreesOfSeparation: 2,
    });
    expect(d2.nodes.map((n) => n.id)).toEqual([
      'BillingService',
      'Domain.InvoiceSent',
      'Domain.OrderCreated',
      'NotificationService',
      'OrderService',
    ]);
  });

  it('handles 0-1 BFS adversarial graphs: interaction cycles, shortcuts, and interaction seeds', () => {
    const diamond = {
      kernelInstanceId: 'kernel-bfs-adv',
      components: [
        { id: 'Alpha', sends: ['Mid'], raises: ['Domain.Shortcut'] },
        { id: 'Mid', sends: ['Target'] },
        { id: 'Target', reactsTo: ['Domain.Shortcut'] },
      ],
    };
    // Alpha -> Mid (cost 1) -> Target (cost 2) vs Alpha -> Domain.Shortcut (0) -> Target (1).
    const oneHop = requestArkRunGraph(diamond, {
      nodeIds: ['Alpha'],
      degreesOfSeparation: 1,
    });
    expect(oneHop.nodes.map((n) => n.id)).toEqual([
      'Alpha',
      'Domain.Shortcut',
      'Mid',
      'Target',
    ]);

    // Interaction-only cycle must terminate cleanly without infinite loop.
    const cyclic = requestArkRunGraph(
      {
        kernelInstanceId: 'kernel-cycle',
        components: [{ id: 'Root', raises: ['Event.A'] }],
      },
      { nodeIds: ['Root'], degreesOfSeparation: 1 },
      {
        observedEdges: [
          { from: 'Event.A', to: 'Event.B', kind: 'sends' },
          { from: 'Event.B', to: 'Event.A', kind: 'sends' },
        ],
      }
    );
    expect(cyclic.nodes.map((n) => n.id)).toEqual(['Event.A', 'Event.B', 'Root']);

    // Starting from an interaction seed at degree 1 reaches both sides only.
    const fromEvent = requestArkRunGraph(
      {
        kernelInstanceId: 'kernel-seed-event',
        components: [
          { id: 'OrderService', raises: ['Domain.OrderCreated'] },
          {
            id: 'BillingService',
            reactsTo: ['Domain.OrderCreated'],
            raises: ['Domain.InvoiceSent'],
          },
          { id: 'AuditService', reactsTo: ['Domain.InvoiceSent'] },
        ],
      },
      { nodeIds: ['Domain.OrderCreated'], degreesOfSeparation: 1 }
    );
    expect(fromEvent.nodes.map((n) => n.id)).toEqual([
      'BillingService',
      'Domain.OrderCreated',
      'OrderService',
    ]);
  });

  it('unifies declared and runtime observed edges with origin tags and Mermaid drift styling', () => {
    const graph = requestArkRunGraph(
      PACKAGE,
      { slice: 'process' },
      {
        dependencyGraph: {
          getEdges: () => [
            // Matches static raises -> upgrades to 'both'
            { from: 'Application.PlaceOrder', to: 'Domain.Order.Placed', kind: 'observed' },
            // Undeclared runtime producer -> 'observed' drift
            { from: 'GhostWorker', to: 'Domain.Order.Placed', kind: 'observed' },
            // Declared-only intent relationship -> 'declared'
            { from: 'Application.PlaceOrder', to: 'Domain.Audit.Logged', kind: 'produces' },
          ],
        },
        eventBus: {
          getHistory: () => [
            {
              event: {
                intent: 'Domain.Order.Placed',
                metadata: { source: 'Application.PlaceOrder' },
              },
            },
          ],
          getSubscribers: () => [
            // Matches static reactsTo -> upgrades to 'both'
            { intent: 'Domain.Order.Placed', subscriber: 'Application.BillingWorker' },
            // Undeclared runtime subscriber -> 'observed' drift
            { intent: 'Domain.Order.Placed', subscriber: 'ShadowMetrics' },
          ],
        },
        observability: {
          report: () => ({
            declaredProductions: [
              { from: 'Application.PlaceOrder', to: 'Domain.Order.Placed' },
            ],
            observedProductions: [
              { from: 'GhostWorker', to: 'Domain.Order.Placed' },
            ],
          }),
        },
      }
    );

    const findEdge = (from: string, kind: string, to: string) =>
      graph.edges.find((e) => e.from === from && e.kind === kind && e.to === to);

    // Confirmed declared + observed
    expect(findEdge('Application.PlaceOrder', 'raises', 'Domain.Order.Placed')?.origin).toBe('both');
    expect(
      findEdge('Domain.Order.Placed', 'reactsTo', 'Application.BillingWorker')?.origin
    ).toBe('both');
    // Declared but never observed
    expect(
      findEdge('Application.PlaceOrder', 'sends', 'Adapter.NotifyWarehouse')?.origin
    ).toBe('declared');
    expect(findEdge('Application.PlaceOrder', 'raises', 'Domain.Audit.Logged')?.origin).toBe(
      'declared'
    );
    // Observed but undeclared drift
    expect(findEdge('GhostWorker', 'raises', 'Domain.Order.Placed')?.origin).toBe('observed');
    expect(findEdge('Domain.Order.Placed', 'reactsTo', 'ShadowMetrics')?.origin).toBe('observed');

    // Deduplicated: GhostWorker -> Domain.Order.Placed appears once even though in 2 sources.
    expect(
      graph.edges.filter((e) => e.from === 'GhostWorker' && e.to === 'Domain.Order.Placed')
    ).toHaveLength(1);

    // Drift visible in Mermaid with distinct arrows + labels
    expect(graph.mermaid).toContain('==>|raises: both|');
    expect(graph.mermaid).toContain('==>|reactsTo: both|');
    expect(graph.mermaid).toContain('-->|sends: declared|');
    expect(graph.mermaid).toContain('-.->|raises: observed|');
    expect(graph.mermaid).toContain('-.->|reactsTo: observed|');
    assertNoLeakage(graph);
  });

  it('tolerates malformed runtime source entries and unifies technical uses drift', () => {
    const technical = requestArkRunGraph(
      PACKAGE,
      { slice: 'technical' },
      {
        dependencyGraph: {
          getEdges: () => [
            { from: 'Application.PlaceOrder', to: 'Domain.OrderRepository', kind: 'declared' },
            { from: '', to: 'Ignored', kind: 'declared' },
            { from: '   ', to: 'Ignored2', kind: 'declared' },
            // Process edge ignored in technical slice
            { from: 'Ghost', to: 'Domain.Order.Placed', kind: 'observed' },
          ],
        },
        observedEdges: [
          { from: 'Application.PlaceOrder', to: 'Domain.OrderRepository', kind: 'uses' },
          { from: 'Application.BillingWorker', to: 'Infra.Cache', kind: 'uses' },
          { from: 'Ghost', to: 'Domain.Order.Placed', kind: 'raises' },
        ],
      }
    );

    expect(
      technical.edges.find(
        (e) => e.from === 'Application.PlaceOrder' && e.to === 'Domain.OrderRepository'
      )?.origin
    ).toBe('both');
    expect(
      technical.edges.find(
        (e) => e.from === 'Application.BillingWorker' && e.to === 'Infra.Cache'
      )?.origin
    ).toBe('observed');
    expect(
      technical.edges.find(
        (e) => e.from === 'Application.BillingWorker' && e.to === 'Domain.OrderRepository'
      )?.origin
    ).toBe('declared');
    expect(technical.edges.every((e) => e.kind === 'uses')).toBe(true);
    expect(technical.mermaid).toContain('==>|uses: both|');
    expect(technical.mermaid).toContain('-.->|uses: observed|');
    expect(technical.mermaid).toContain('-->|uses: declared|');
  });

  it('escapes Mermaid reserved keywords (case-insensitive) and avoids id/group collisions', () => {
    const reserved = [
      'end',
      'END',
      'subgraph',
      'SubGraph',
      'graph',
      'flowchart',
      'class',
      'style',
      'click',
      'direction',
      'n_end',
      'group_sales',
    ];
    const graph = requestArkRunGraph({
      kernelInstanceId: 'kernel-mermaid',
      components: reserved.map((id, index) => ({
        id,
        raises: index === 0 ? ['END'] : [],
        extendedInfo:
          index === 0
            ? { label: 'Line 1\n"quoted"]', group: 'sales' }
            : undefined,
      })),
    });

    const lines = graph.mermaid.split('\n');
    // No node definition line may start with a bare reserved keyword id.
    const nodeLines = lines.filter((line) => /\["/.test(line) && !line.trim().startsWith('subgraph '));
    for (const line of nodeLines) {
      const id = line.trim().split('[')[0]!;
      expect(id.toLowerCase()).not.toMatch(
        /^(end|subgraph|graph|flowchart|class|classdef|style|linkstyle|click|direction)$/
      );
    }

    // Specific collision checks: 'end' and 'n_end' get distinct ids.
    expect(graph.mermaid).toContain('n_end["Line 1 #quot;quoted#quot;#93;"]');
    expect(graph.mermaid).toContain('n_end_2["n_end"]');
    expect(graph.mermaid).toContain('n_END["END"]');
    expect(graph.mermaid).toContain('n_subgraph["subgraph"]');
    expect(graph.mermaid).toContain('n_SubGraph["SubGraph"]');
    expect(graph.mermaid).toContain('n_class["class"]');
    expect(graph.mermaid).toContain('n_direction["direction"]');
    // Subgraph id does not collide with literal node 'group_sales'
    expect(graph.mermaid).toContain('subgraph group_sales_2["sales"]');
    // Multiline label sanitized onto one line
    expect(graph.mermaid).not.toContain('Line 1\n');
  });
});
