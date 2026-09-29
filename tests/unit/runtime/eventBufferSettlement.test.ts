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
  createLenientArkKernel,
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
    for (let i = 0; i < 5000; i += 1) {
      await ark.eventBus.publish(OrderPlaced, { id: String(i) }, { source });
    }
    expect(handled).toBe(5000);
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

  it('does not count in-flight records evicted and settled later as lost', async () => {
    const buffer = new InMemoryEventBuffer({ maxRecords: 2 });
    const event = (i: number) =>
      ({ intent: 'Domain.X', payload: i, metadata: { source: 'S' } }) as unknown as DomainEvent;
    const ids: string[] = [];
    for (let i = 0; i < 6; i += 1) ids.push((await buffer.enqueue(event(i))).id);
    expect(buffer.evictedPending).toBe(4);
    await buffer.markDispatched(ids[0]!);
    await buffer.markFailed(ids[1]!, new Error('handler'));
    expect(buffer.evictedPending).toBe(2);
    await buffer.markDispatched(ids[0]!);
    expect(buffer.evictedPending).toBe(2);
  });

  it('reports no evicted-pending loss for a fire-and-forget burst in the default kernel', async () => {
    const ark = createLenientArkKernel({ requireKnownSource: false, maxHistorySize: 10 });
    const Beat = ark.registry.define('Domain.Beat');
    ark.eventBus.subscribe(Beat, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    for (let i = 0; i < 100; i += 1) await ark.send(Beat, { i });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const buffer = ark.eventBuffer as InMemoryEventBuffer;
    expect(await buffer.list('pending')).toHaveLength(0);
    expect(buffer.evictedPending).toBe(0);
  });

  it('stays unbounded by default when constructed directly', async () => {
    const buffer = new InMemoryEventBuffer();
    for (let i = 0; i < 1500; i += 1) {
      await buffer.enqueue({ intent: 'Domain.X', payload: i, metadata: {} } as unknown as DomainEvent);
    }
    expect(await buffer.list()).toHaveLength(1500);
  });
});

describe('kernel from config: hard layer flow resolves layers', () => {
  const canonicalNoPrefixes: ArkKernelConfig = {
    include: ['src'],
    layers: [
      { name: 'DomainModel', patterns: ['src/domain/**'] },
      { name: 'ApplicationOrchestration', patterns: ['src/application/**'] },
    ],
    rules: [{ from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false }],
  };
  const customNoPrefixes: ArkKernelConfig = {
    include: ['src'],
    layers: [
      { name: 'Features', patterns: ['src/features/**'] },
      { name: 'App', patterns: ['src/app/**'] },
    ],
    rules: [{ from: 'Features', to: 'App', allowed: false }],
  };

  async function billedFromDomain(ark: ArkKernel) {
    const Billed = ark.registry.define('Application.Billed');
    ark.registry.define('Domain.Order.Handle', { produces: ['Application.Billed'] });
    return ark.send(Billed, {}, { source: 'Domain.Order.Handle', ephemeral: false });
  }

  it('gives canonical layer names their built-in prefixes and enforces hard flow', async () => {
    const strict = createStrictArkKernelFromConfig(canonicalNoPrefixes, {
      strictEventContracts: false,
    });
    await expect(billedFromDomain(strict)).rejects.toBeInstanceOf(
      ObservedLayerFlowViolationError
    );
    const byDefault = createArkKernelFromConfig(canonicalNoPrefixes, {
      strictEventContracts: false,
    });
    await expect(billedFromDomain(byDefault)).rejects.toBeInstanceOf(
      ObservedLayerFlowViolationError
    );
    expect(await strict.auditTrail.query({ type: 'layer.observedFlowUnresolvable' })).toEqual([]);
  });

  it('builds with implied hard mode and records unresolvable custom layers', async () => {
    const ark = createStrictArkKernelFromConfig(customNoPrefixes);
    await flush();
    const notices = await ark.auditTrail.query({ type: 'layer.observedFlowUnresolvable' });
    expect(notices).toHaveLength(1);
    expect((notices[0]?.details as { layers: string[] }).layers).toEqual(['App', 'Features']);
    expect(() => createArkKernelFromConfig(customNoPrefixes)).not.toThrow();
  });

  it('throws ArkKernelConfigError when hard is passed explicitly', () => {
    expect(() =>
      createStrictArkKernelFromConfig(customNoPrefixes, { enforceObservedLayerFlow: 'hard' })
    ).toThrow(ArkKernelConfigError);
    try {
      createArkKernelFromConfig(customNoPrefixes, { enforceObservedLayerFlow: 'hard' });
    } catch (error) {
      expect((error as ArkKernelConfigError).code).toBe('ARKRUN_LAYER_FLOW_UNRESOLVABLE');
      expect((error as ArkKernelConfigError).layers).toEqual(['App', 'Features']);
    }
    expect(() =>
      createStrictArkKernelFromConfig(canonicalNoPrefixes, { enforceObservedLayerFlow: 'hard' })
    ).not.toThrow();
    expect(() =>
      createStrictArkKernelFromConfig(customNoPrefixes, { enforceObservedLayerFlow: 'soft' })
    ).not.toThrow();
    expect(() => createLenientArkKernelFromConfig(customNoPrefixes)).not.toThrow();
  });

  it('does not reject same-layer flows for peerIsolation slice walls (names cannot place a slice)', async () => {
    const ark = createStrictArkKernelFromConfig(
      {
        ...canonicalNoPrefixes,
        rules: [
          ...canonicalNoPrefixes.rules!,
          {
            from: 'DomainModel',
            to: 'DomainModel',
            allowed: false,
            peerIsolation: true,
            sliceFolders: ['contexts'],
          },
        ],
      },
      { strictEventContracts: false }
    );
    const Placed = ark.registry.define('Domain.Order.Placed');
    ark.registry.define('Domain.Order.Handle', { produces: ['Domain.Order.Placed'] });
    await expect(
      ark.send(Placed, {}, { source: 'Domain.Order.Handle', ephemeral: false })
    ).resolves.toBeDefined();
  });
});

describe('runtime ids', () => {
  it('embeds a per-module nonce so duplicate module copies cannot collide', () => {
    const a = createStrictArkKernel();
    expect(a.instanceId).toMatch(/^ark-kernel-\d+-[0-9a-z]{10}-\d+$/);
  });
});
