/**
 * Kernel event-buffer lifecycle: bounded default buffer, local-delivery
 * settlement, broker handoff outcome recording, and hard layer-flow from config.
 */
import { describe, expect, it } from 'vitest';
import {
  ArkKernelConfigError,
  InMemoryEventBuffer,
  ObservedLayerFlowViolationError,
  createArkKernelFromConfig,
  createLenientArkKernelFromConfig,
  createStrictArkKernel,
  createStrictArkKernelFromConfig,
  type ArkKernel,
  type ArkKernelConfig,
  type DomainEvent,
} from '../../../src/index';

function setupOrder(ark: ArkKernel) {
  const OrderPlaced = ark.registry.define<'Domain.Order.Placed', { id: string }>(
    'Domain.Order.Placed'
  );
  ark.registry.define('Application.PlaceOrder', { produces: ['Domain.Order.Placed'] });
  return { OrderPlaced, source: 'Application.PlaceOrder' as const };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('default event buffer is bounded and settled by local delivery', () => {
  it('caps the default buffer at maxHistorySize and never reports a stuck backlog', async () => {
    const ark = createStrictArkKernel({ strictEventContracts: false, maxHistorySize: 10 });
    const { OrderPlaced, source } = setupOrder(ark);
    let handled = 0;
    ark.eventBus.subscribe(OrderPlaced, () => {
      handled += 1;
    });
    for (let i = 0; i < 500; i += 1) {
      await ark.eventBus.publish(OrderPlaced, { id: String(i) }, { source });
    }
    expect(handled).toBe(500);
    const all = await ark.eventBuffer.list();
    expect(all.length).toBeLessThanOrEqual(10);
    expect(await ark.eventBuffer.list('pending')).toHaveLength(0);
    expect((await ark.eventBuffer.list('dispatched')).length).toBe(all.length);

    const handle = await ark.startInspector({ port: 0 });
    try {
      const outbox = (await (await fetch(`${handle.url}outbox`)).json()) as {
        pendingCount: number;
      };
      expect(outbox.pendingCount).toBe(0);
    } finally {
      await handle.close();
    }
  });

  it('settles ArkRun local sends too (awaited and fire-and-forget)', async () => {
    const ark = createStrictArkKernel({ strictEventContracts: false });
    const { OrderPlaced, source } = setupOrder(ark);
    await ark.send(OrderPlaced, { id: 'a' }, { source, ephemeral: false });
    await ark.send(OrderPlaced, { id: 'b' }, { source });
    await flush();
    expect(await ark.eventBuffer.list('pending')).toHaveLength(0);
    expect(await ark.eventBuffer.list('dispatched')).toHaveLength(2);
  });

  it('leaves an injected buffer relay-owned (records stay pending)', async () => {
    const eventBuffer = new InMemoryEventBuffer();
    const ark = createStrictArkKernel({ strictEventContracts: false, eventBuffer });
    const { OrderPlaced, source } = setupOrder(ark);
    await ark.eventBus.publish(OrderPlaced, { id: 'x' }, { source });
    expect(await eventBuffer.list('pending')).toHaveLength(1);
  });
});

describe('broker handoff outcome is recorded', () => {
  function brokerKernel(send: (event: DomainEvent) => void | Promise<void>) {
    const ark = createStrictArkKernel({
      strictEventContracts: false,
      broker: { send },
    });
    return { ark, ...setupOrder(ark) };
  }

  it('marks the record dispatched after a successful awaited handoff', async () => {
    const { ark, OrderPlaced, source } = brokerKernel(async () => undefined);
    await ark.send(OrderPlaced, { id: '1' }, { source, transport: 'broker' });
    expect(await ark.eventBuffer.list('dispatched')).toHaveLength(1);
    expect(await ark.eventBuffer.list('pending')).toHaveLength(0);
  });

  it('marks failed + audits event.handoffFailed when an awaited handoff rejects', async () => {
    const { ark, OrderPlaced, source } = brokerKernel(async () => {
      throw new Error('broker down');
    });
    await expect(
      ark.send(OrderPlaced, { id: '1' }, { source, transport: 'broker' })
    ).rejects.toThrow('broker down');
    const failed = await ark.eventBuffer.list('failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]?.error).toBe('broker down');
    const audit = await ark.auditTrail.query({ type: 'event.handoffFailed' });
    expect(audit).toHaveLength(1);
    expect(ark.eventBus.getTrace().some((t) => t.type === 'event.handoffFailed')).toBe(true);
  });

  it('records a detached (fire-and-forget) handoff failure instead of swallowing it', async () => {
    const { ark, OrderPlaced, source } = brokerKernel(() => {
      throw new Error('broker down');
    });
    const plan = await ark.send(OrderPlaced, { id: '2' }, { source, transport: 'broker', ephemeral: false });
    expect(plan.awaitHandoff).toBe(false);
    await flush();
    expect(await ark.eventBuffer.list('failed')).toHaveLength(1);
    expect(await ark.auditTrail.query({ type: 'event.handoffFailed' })).toHaveLength(1);
  });
});

describe('InMemoryEventBuffer maxRecords', () => {
  it('evicts settled records first and counts evicted pending records', async () => {
    const buffer = new InMemoryEventBuffer({ maxRecords: 2 });
    const event = (i: number) =>
      ({ intent: 'Domain.X', payload: i, metadata: { source: 'S' } }) as unknown as DomainEvent;
    const a = await buffer.enqueue(event(1));
    await buffer.enqueue(event(2));
    await buffer.markDispatched(a.id);
    await buffer.enqueue(event(3));
    expect((await buffer.list()).map((r) => r.event.payload)).toEqual([2, 3]);
    expect(buffer.evictedPending).toBe(0);
    await buffer.enqueue(event(4));
    expect((await buffer.list()).map((r) => r.event.payload)).toEqual([3, 4]);
    expect(buffer.evictedPending).toBe(1);
  });

  it('stays unbounded by default when constructed directly', async () => {
    const buffer = new InMemoryEventBuffer();
    for (let i = 0; i < 1500; i += 1) {
      await buffer.enqueue({ intent: 'Domain.X', payload: i, metadata: {} } as unknown as DomainEvent);
    }
    expect(await buffer.list()).toHaveLength(1500);
  });
});

describe('kernel from config: hard layer flow needs intentPrefixes', () => {
  const rules = [
    { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
  ];
  const noPrefixes: ArkKernelConfig = {
    include: ['src'],
    layers: [
      { name: 'DomainModel', patterns: ['src/domain/**'] },
      { name: 'ApplicationOrchestration', patterns: ['src/application/**'] },
    ],
    rules,
  };
  const withPrefixes: ArkKernelConfig = {
    include: ['src'],
    layers: [
      { name: 'DomainModel', patterns: ['src/domain/**'], intentPrefixes: ['Domain.'] },
      {
        name: 'ApplicationOrchestration',
        patterns: ['src/application/**'],
        intentPrefixes: ['Application.'],
      },
    ],
    rules,
  };

  it('throws ArkKernelConfigError instead of silently enforcing nothing', () => {
    expect(() => createStrictArkKernelFromConfig(noPrefixes)).toThrow(ArkKernelConfigError);
    expect(() => createArkKernelFromConfig(noPrefixes)).toThrow(ArkKernelConfigError);
    try {
      createStrictArkKernelFromConfig(noPrefixes);
    } catch (error) {
      expect((error as ArkKernelConfigError).code).toBe('ARKRUN_LAYER_FLOW_UNRESOLVABLE');
      expect((error as ArkKernelConfigError).layers).toEqual([
        'ApplicationOrchestration',
        'DomainModel',
      ]);
    }
  });

  it('builds when the caller explicitly opts out of hard mode', () => {
    expect(() =>
      createStrictArkKernelFromConfig(noPrefixes, { enforceObservedLayerFlow: 'off' })
    ).not.toThrow();
    expect(() =>
      createStrictArkKernelFromConfig(noPrefixes, { enforceObservedLayerFlow: 'soft' })
    ).not.toThrow();
    expect(() => createLenientArkKernelFromConfig(noPrefixes)).not.toThrow();
  });

  it('rejects the forbidden flow when prefixes are declared', async () => {
    const ark = createStrictArkKernelFromConfig(withPrefixes, {
      strictEventContracts: false,
    });
    const Billed = ark.registry.define('Application.Billed');
    ark.registry.define('Domain.Order.Handle', { produces: ['Application.Billed'] });
    await expect(
      ark.send(Billed, {}, { source: 'Domain.Order.Handle', ephemeral: false })
    ).rejects.toBeInstanceOf(ObservedLayerFlowViolationError);
  });
});

describe('runtime ids', () => {
  it('embeds a per-module nonce so duplicate module copies cannot collide', () => {
    const a = createStrictArkKernel();
    expect(a.instanceId).toMatch(/^ark-kernel-\d+-[0-9a-z]{10}-\d+$/);
  });
});
