import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEventBus,
  createIntentRegistry,
  defineIntent,
  definePolicy,
  createDependencyGraph,
  syncRegistryToGraph,
  architecturalPolicies,
  definePublishPolicy,
  createAuditTrail,
} from '../../../src/index';
import type { DomainEvent } from '../../../src/index';

describe('Event Bus core (Iteration 3)', () => {
  const OrderPlaced = defineIntent<
    'Domain.Order.OrderPlaced',
    { orderId: string; amount: number }
  >('Domain.Order.OrderPlaced');

  beforeEach(() => {
    // fresh bus per test via factory
  });

  it('publishes and notifies subscribers using intent creator', async () => {
    const bus = createEventBus();
    const received: DomainEvent[] = [];

    bus.subscribe(OrderPlaced, (e) => {
      received.push(e);
    });

    await bus.publish(OrderPlaced({ orderId: 'o1', amount: 100 }));

    expect(received).toHaveLength(1);
    expect(received[0].intent).toBe('Domain.Order.OrderPlaced');
    expect(received[0].payload.orderId).toBe('o1');
  });

  it('supports multiple subscribers and returns unsubscribe', async () => {
    const bus = createEventBus();
    const a: any[] = [];
    const b: any[] = [];

    const unsubA = bus.subscribe(OrderPlaced, (e) => a.push(e));
    bus.subscribe(OrderPlaced, (e) => b.push(e));

    await bus.publish(OrderPlaced({ orderId: 'o2', amount: 50 }));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);

    unsubA();
    await bus.publish(OrderPlaced({ orderId: 'o3', amount: 25 }));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(2);
  });

  it('removes unsubscribed handlers from the intent index', async () => {
    const bus = createEventBus();
    const received: string[] = [];

    const unsubA = bus.subscribe(OrderPlaced, () => received.push('a'));
    bus.subscribe(OrderPlaced, () => received.push('b'));

    unsubA();
    await bus.publish(OrderPlaced({ orderId: 'indexed', amount: 1 }));

    expect(received).toEqual(['b']);
  });

  it('enriches metadata and keeps history', async () => {
    const bus = createEventBus();

    await bus.publish(OrderPlaced({ orderId: 'o4', amount: 10 }), {
      source: 'Application.OrderService',
      correlationId: 'corr-123',
    });

    const history = bus.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].event.metadata.source).toBe('Application.OrderService');
    expect(history[0].event.metadata.correlationId).toBe('corr-123');
    expect(history[0].subscribersNotified).toBe(0);
  });

  it('supports direct creator + payload form without polluting metadata', async () => {
    const bus = createEventBus();
    const OrderP = defineIntent<'Domain.Test.P', { foo: string; bar: number }>('Domain.Test.P');

    // This form was buggy: payload keys leaked into metadata
    await bus.publish(OrderP, { foo: 'hello', bar: 42 });

    const history = bus.getHistory();
    expect(history.length).toBe(1);
    const meta = history[0].event.metadata as any;
    expect(meta.foo).toBeUndefined(); // must not pollute
    expect(meta.bar).toBeUndefined();
    expect(history[0].event.payload).toEqual({ foo: 'hello', bar: 42 });
    expect(typeof meta.occurredAt).toBe('string');
  });

  it('clearHistory works', async () => {
    const bus = createEventBus();
    await bus.publish(OrderPlaced({ orderId: 'o5', amount: 5 }));
    expect(bus.getHistory().length).toBe(1);
    bus.clearHistory();
    expect(bus.getHistory().length).toBe(0);
  });

  it('supports onPublish hook', async () => {
    const seen: DomainEvent[] = [];
    const bus = createEventBus({
      onPublish: (e) => {
        seen.push(e);
      },
    });

    await bus.publish(OrderPlaced({ orderId: 'o6', amount: 99 }));
    expect(seen).toHaveLength(1);
  });

  it('allows subscribing by intent name string', async () => {
    const bus = createEventBus();
    const received: any[] = [];

    bus.subscribe('Domain.Order.OrderPlaced', (e) => received.push(e));

    await bus.publish(OrderPlaced({ orderId: 'o7', amount: 33 }));
    expect(received).toHaveLength(1);
  });

  it('surfaces soft policy violations via hook and trace', async () => {
    const softPolicy = definePolicy({
      name: 'Advisory',
      severity: 'soft',
      check: () => ({ message: 'Consider refactoring' }),
    });

    const softSeen: string[] = [];
    const bus = createEventBus({
      policies: [softPolicy],
      getPolicyContext: (event) => ({ event }),
      onSoftViolation: (result) => {
        softSeen.push(result.softViolations[0].message);
      },
    });

    await bus.publish(OrderPlaced({ orderId: 'soft', amount: 1 }));

    expect(softSeen).toContain('Consider refactoring');
    expect(bus.getTrace().some((t) => t.type === 'policy.softViolation')).toBe(true);
  });

  it('does not notify subscribers registered during onSoftViolation for the same publish', async () => {
    // Pre-R8 snapshot order: matching handlers are fixed before policy hooks run.
    const late: DomainEvent[] = [];
    const early: DomainEvent[] = [];
    const softPolicy = definePolicy({
      name: 'Advisory',
      severity: 'soft',
      check: () => ({ message: 'late-sub' }),
    });

    const bus = createEventBus({
      policies: [softPolicy],
      getPolicyContext: (event) => ({ event }),
      onSoftViolation: () => {
        bus.subscribe(OrderPlaced, (e) => late.push(e));
      },
    });
    bus.subscribe(OrderPlaced, (e) => early.push(e));

    await bus.publish(OrderPlaced({ orderId: 'snap', amount: 1 }));

    expect(early).toHaveLength(1);
    expect(late).toHaveLength(0);

    // Next publish notifies both (late was registered after snapshot).
    await bus.publish(OrderPlaced({ orderId: 'snap2', amount: 2 }));
    expect(early).toHaveLength(2);
    expect(late).toHaveLength(1);
  });

  it('calls onHandlerError when subscriber fails', async () => {
    const errors: unknown[] = [];
    const bus = createEventBus({
      onHandlerError: (err) => {
        errors.push(err);
      },
    });

    bus.subscribe(OrderPlaced, () => {
      throw new Error('handler boom');
    });

    await bus.publish(OrderPlaced({ orderId: 'err', amount: 1 }));

    expect(errors).toHaveLength(1);
    expect(bus.getTrace().some((t) => t.type === 'handler.error')).toBe(true);
  });

  it('rethrows handler errors when rethrowHandlerErrors is true', async () => {
    const bus = createEventBus({ rethrowHandlerErrors: true });

    bus.subscribe(OrderPlaced, () => {
      throw new Error('handler boom');
    });

    await expect(
      bus.publish(OrderPlaced({ orderId: 'rethrow', amount: 1 }))
    ).rejects.toThrow('handler boom');
  });

  it('does not abort publish when onSoftViolation hook throws', async () => {
    const softPolicy = definePolicy({
      name: 'Advisory',
      severity: 'soft',
      check: () => ({ message: 'warn' }),
    });

    const received: DomainEvent[] = [];
    const bus = createEventBus({
      policies: [softPolicy],
      getPolicyContext: (event) => ({ event }),
      onSoftViolation: () => {
        throw new Error('hook failed');
      },
    });

    bus.subscribe(OrderPlaced, (e) => received.push(e));
    await bus.publish(OrderPlaced({ orderId: 'hook-err', amount: 1 }));

    expect(received).toHaveLength(1);
    expect(bus.getTrace().some((t) => t.type === 'hook.error')).toBe(true);
  });

  it('feeds intentRegistry into policy context for layer policies', async () => {
    const registry = createIntentRegistry();
    registry.define<'Domain.Order.OrderPlaced', { orderId: string; amount: number }>(
      'Domain.Order.OrderPlaced'
    );
    registry.define<'Domain.X', {}>('Domain.X');
    registry.declareDependency('Domain.X', 'Adapter.Y');

    const graph = createDependencyGraph();
    syncRegistryToGraph(registry, graph);

    const bus = createEventBus({
      intentRegistry: registry,
      dependencyGraph: graph,
      policies: [architecturalPolicies.cleanArchitectureMatrix()],
    });

    await expect(
      bus.publish(OrderPlaced({ orderId: 'layer', amount: 1 }))
    ).rejects.toThrow(/Hard policy violation/);
  });

  it('respects maxHistorySize', async () => {
    const bus = createEventBus({ maxHistorySize: 2 });

    await bus.publish(OrderPlaced({ orderId: 'a', amount: 1 }));
    await bus.publish(OrderPlaced({ orderId: 'b', amount: 2 }));
    await bus.publish(OrderPlaced({ orderId: 'c', amount: 3 }));

    expect(bus.getHistory()).toHaveLength(2);
    expect(bus.getHistory()[0].event.payload.orderId).toBe('b');
  });

  it('evaluates attached policies on publish (hard policies throw)', async () => {
    const badPolicy = definePolicy({
      name: 'No negative amounts',
      severity: 'hard',
      check: (ctx: { event: DomainEvent }) => {
        const payload = (ctx.event as any).payload;
        if (payload && payload.amount < 0) {
          return { message: 'Negative amounts forbidden' };
        }
        return true;
      },
    });

    const bus = createEventBus({
      policies: [badPolicy],
      getPolicyContext: (event) => ({ event }),
    });

    // good publish
    await bus.publish(OrderPlaced({ orderId: 'ok', amount: 10 }));

    // bad should throw
    await expect(
      bus.publish(OrderPlaced({ orderId: 'bad', amount: -5 }))
    ).rejects.toThrow(/Hard policy violation/);
  });

  it('supports typed publish policy helper', async () => {
    const bus = createEventBus({
      policies: [
        definePublishPolicy({
          name: 'Publish source required',
          severity: 'hard',
          check: (ctx) =>
            ctx.event.metadata.source === 'Application.OrderService'
              ? true
              : { message: 'source must identify the application service' },
        }),
      ],
    });

    await expect(
      bus.publish(OrderPlaced({ orderId: 'source', amount: 1 }), {
        source: 'Application.OrderService',
      })
    ).resolves.toBeUndefined();

    await expect(
      bus.publish(OrderPlaced({ orderId: 'bad-source', amount: 1 }), {
        source: 'unknown',
      })
    ).rejects.toThrow(/source must identify/);
  });

  it('records native audit entries and emits trace sink records', async () => {
    const auditTrail = createAuditTrail();
    const traces: string[] = [];
    const bus = createEventBus({
      auditTrail,
      traceSinks: [(record) => traces.push(record.type)],
    });

    await bus.publish(OrderPlaced, { orderId: 'audit', amount: 1 }, {
      source: 'Application.OrderService',
      correlationId: 'corr-audit',
      traceId: 'trace-audit',
    });

    expect(traces).toContain('event.published');
    const auditRecords = await auditTrail.query({ type: 'event.published' });
    expect(auditRecords).toHaveLength(1);
    expect(auditRecords[0].correlationId).toBe('corr-audit');
  });
});
