/**
 * Regression & adversarial tests for ArkRun Phases 1.1 (R-01..R-06),
 * 3.2 (bidirectional broker + error aggregation),
 * 3.3 (ComponentRegistry DI/overrides + dispose), and
 * 4.1 (ArkOrder <-> ArkRun wireOrderPlane bridge).
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as gate from '../../../src/gate';
import * as runtimeEntry from '../../../src/runtime/index';
import {
  DEFAULT_MAX_DECISION_TAPE_SIZE,
  EventContractViolationError,
  InMemoryEventBuffer,
  InMemoryWorkflowStore,
  InvalidIntentNameError,
  UnknownEventSourceError,
  UnregisteredIntentError,
  createArkKernel,
  createArkTestHarness,
  createLenientArkKernel,
  createLenientArkKernelFromConfig,
  createStrictArkKernel,
  definePolicy,
  wireOrderPlane,
  type ArkKernel,
  type ArkRunBrokerAdapter,
  type DomainEvent,
  type TraceRecord,
  type WorkflowSnapshot,
  type WorkflowStore,
} from '../../../src/index';
import { ArkOrderError, createOrderPlane } from '../../../src/kernel/order';

const disposables: ArkKernel[] = [];

function track<T extends ArkKernel>(kernel: T): T {
  disposables.push(kernel);
  return kernel;
}

afterEach(async () => {
  while (disposables.length > 0) {
    const kernel = disposables.pop();
    await kernel?.dispose();
  }
});

function setupOrder(ark: ArkKernel) {
  const OrderPlaced = ark.registry.define<'Domain.Order.Placed', { id: string }>(
    'Domain.Order.Placed'
  );
  ark.registry.define('Application.PlaceOrder', { produces: ['Domain.Order.Placed'] });
  return { OrderPlaced, source: 'Application.PlaceOrder' as const };
}

class PostgresWorkflowStore implements WorkflowStore {
  readonly saved: WorkflowSnapshot[] = [];

  save<P extends Record<string, unknown>>(snapshot: WorkflowSnapshot<P>): void {
    const version = (snapshot.version ?? 0) + 1;
    const copy: WorkflowSnapshot<P> = {
      ...snapshot,
      version,
      context: { ...snapshot.context },
    };
    snapshot.version = version;
    const idx = this.saved.findIndex((item) => item.id === snapshot.id);
    if (idx >= 0) this.saved[idx] = copy;
    else this.saved.push(copy);
  }

  get<P extends Record<string, unknown>>(id: string): WorkflowSnapshot<P> | undefined {
    return this.saved.find((item) => item.id === id) as WorkflowSnapshot<P> | undefined;
  }

  list(workflowName?: string): WorkflowSnapshot[] {
    return this.saved.filter((item) => !workflowName || item.workflowName === workflowName);
  }

  clear(): void {
    this.saved.length = 0;
  }
}

describe('Phase 1.1 — R-01: broker fallback honors ephemeral', () => {
  it('awaits 50ms async local subscribers when broker is absent and ephemeral is true', async () => {
    const ark = track(createStrictArkKernel({ strictEventContracts: false }));
    const { OrderPlaced, source } = setupOrder(ark);
    let completed = false;

    ark.eventBus.subscribe(OrderPlaced, async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      completed = true;
    });

    const plan = await ark.send(OrderPlaced, { id: 'r01-1' }, {
      source,
      transport: 'broker',
      ephemeral: true,
    });

    expect(plan.fallbackToLocal).toBe(true);
    expect(plan.deliveredVia).toBe('local');
    expect(plan.awaitHandlers).toBe(true);
    expect(completed).toBe(true);
  });

  it('does not await slow local subscriber on broker fallback when ephemeral is false', async () => {
    const ark = track(createStrictArkKernel({ strictEventContracts: false }));
    const { OrderPlaced, source } = setupOrder(ark);
    let completed = false;
    let release!: () => void;
    const gateHold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let doneResolve!: () => void;
    const done = new Promise<void>((resolve) => {
      doneResolve = resolve;
    });

    ark.eventBus.subscribe(OrderPlaced, async () => {
      await gateHold;
      completed = true;
      doneResolve();
    });

    const plan = await ark.send(OrderPlaced, { id: 'r01-2' }, {
      source,
      transport: 'broker',
      ephemeral: false,
    });

    expect(plan.fallbackToLocal).toBe(true);
    expect(plan.awaitHandlers).toBe(false);
    expect(completed).toBe(false);
    release();
    await done;
    expect(completed).toBe(true);
  });

  it('adversarial: malformed broker object without send falls back and awaits async handlers', async () => {
    const malformedBroker = {} as unknown as ArkRunBrokerAdapter;
    const ark = track(
      createStrictArkKernel({
        strictEventContracts: false,
        broker: malformedBroker,
        rethrowHandlerErrors: true,
      })
    );
    const { OrderPlaced, source } = setupOrder(ark);
    const order: string[] = [];

    ark.eventBus.subscribe(OrderPlaced, async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      order.push('a');
    });
    ark.eventBus.subscribe(OrderPlaced, async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
      order.push('b');
    });

    const plan = await ark.send(OrderPlaced, { id: 'r01-malformed' }, {
      source,
      transport: 'broker',
    });

    expect(plan.fallbackToLocal).toBe(true);
    expect(plan.awaitHandlers).toBe(true);
    expect(order).toEqual(['a', 'b']);
  });
});

describe('Phase 1.1 — R-02: createLenientArkKernel defaults', () => {
  it('publishes unregistered non-canonical intents without throwing', async () => {
    const ark = track(createLenientArkKernel());
    const received: DomainEvent[] = [];
    ark.eventBus.subscribe('Order.Created', (event) => {
      received.push(event);
    });

    await ark.eventBus.publish({
      intent: 'Order.Created',
      payload: { id: 'o-1' },
      metadata: { occurredAt: new Date().toISOString(), source: 'legacy-app' },
    });

    expect(received).toHaveLength(1);
    expect(received[0]?.intent).toBe('Order.Created');
  });

  it('allows omitted/unknown source in lenient kernel and lenient-from-config kernel', async () => {
    const lenient = track(createLenientArkKernel());
    await expect(
      lenient.eventBus.publish({
        intent: 'legacy_unregistered_event',
        payload: { ok: true },
        metadata: { occurredAt: new Date().toISOString(), source: 'unknown' },
      })
    ).resolves.toBeUndefined();

    const fromConfig = track(
      createLenientArkKernelFromConfig({
        include: ['src'],
        layers: [{ name: 'App', patterns: ['src/**'] }],
        rules: [],
      })
    );
    await expect(
      fromConfig.eventBus.publish({
        intent: 'Order.Created',
        payload: {},
        metadata: { occurredAt: new Date().toISOString(), source: 'unknown' },
      })
    ).resolves.toBeUndefined();
  });

  it('adversarial: explicit strict flags on lenient kernel still enforce and strict kernel stays strict', async () => {
    const withNaming = track(createLenientArkKernel({ validateIntentNaming: true }));
    await expect(
      withNaming.eventBus.publish({
        intent: 'Order.Created',
        payload: {},
        metadata: { occurredAt: new Date().toISOString(), source: 'legacy' },
      })
    ).rejects.toBeInstanceOf(InvalidIntentNameError);

    const withRegistry = track(createLenientArkKernel({ strictRegistry: true }));
    await expect(
      withRegistry.eventBus.publish({
        intent: 'Domain.Order.Created',
        payload: {},
        metadata: { occurredAt: new Date().toISOString(), source: 'legacy' },
      })
    ).rejects.toBeInstanceOf(UnregisteredIntentError);

    const withSource = track(createLenientArkKernel({ requireKnownSource: true }));
    await expect(
      withSource.eventBus.publish({
        intent: 'Order.Created',
        payload: {},
        metadata: { occurredAt: new Date().toISOString(), source: 'unknown' },
      })
    ).rejects.toBeInstanceOf(UnknownEventSourceError);

    const strict = track(createStrictArkKernel());
    await expect(
      strict.eventBus.publish({
        intent: 'Order.Created',
        payload: {},
        metadata: { occurredAt: new Date().toISOString(), source: 'legacy' },
      })
    ).rejects.toBeInstanceOf(InvalidIntentNameError);
  });
});

describe('Phase 1.1 — R-03: deprecated event contracts warn instead of failing', () => {
  it('passes valid events against deprecated contract in strict kernel and emits trace + audit', async () => {
    const ark = track(createStrictArkKernel());
    const { OrderPlaced, source } = setupOrder(ark);
    ark.eventContracts.register({
      intent: 'Domain.Order.Placed',
      version: '1',
      deprecated: 'Use v2',
      schema: { id: { type: 'string', required: true } },
    });

    const validation = ark.eventContracts.validate(
      OrderPlaced({ id: 'o-dep' })
    );
    expect(validation.ok).toBe(true);
    expect(validation.issues).toEqual([]);
    expect(validation.warnings).toHaveLength(1);
    expect(validation.warnings?.[0]?.message).toBe('Use v2');

    let delivered = 0;
    ark.eventBus.subscribe(OrderPlaced, () => {
      delivered += 1;
    });

    await ark.publisher(source).publish(OrderPlaced, { id: 'o-dep' }, { eventVersion: '1' });

    expect(delivered).toBe(1);
    const traces = ark.eventBus
      .getTrace()
      .filter((t) => t.type === 'event.contractDeprecated');
    expect(traces).toHaveLength(1);
    expect((traces[0]?.details as { message: string }).message).toBe('Use v2');

    const audits = await ark.auditTrail.query({ type: 'event.contractDeprecated' });
    expect(audits).toHaveLength(1);
    expect((audits[0]?.details as { message: string }).message).toBe('Use v2');
  });

  it('adversarial: invalid payload on deprecated contract still fails and interceptor does not duplicate warning', async () => {
    const ark = track(createStrictArkKernel());
    const { OrderPlaced, source } = setupOrder(ark);
    ark.eventContracts.register({
      intent: 'Domain.Order.Placed',
      version: '1',
      deprecated: true,
      schema: { id: { type: 'string', required: true } },
    });

    await expect(
      ark.publisher(source).publish(OrderPlaced, {} as { id: string }, { eventVersion: '1' })
    ).rejects.toBeInstanceOf(EventContractViolationError);
    expect(await ark.auditTrail.query({ type: 'event.contractDeprecated' })).toHaveLength(0);

    ark.eventBus.registerInterceptor(OrderPlaced, ({ intercept }) => {
      intercept({ enriched: true });
    });

    await ark.publisher(source).publish(OrderPlaced, { id: 'o-int' }, { eventVersion: '1' });
    const traces = ark.eventBus
      .getTrace()
      .filter((t) => t.type === 'event.contractDeprecated');
    expect(traces).toHaveLength(1);
    expect((traces[0]?.details as { message: string }).message).toBe(
      'Event contract is deprecated.'
    );
  });
});

describe('Phase 1.1 — R-04: actualType(null) and nullable fields', () => {
  it('rejects null for non-nullable object field and accepts null when nullable: true', () => {
    const ark = track(createStrictArkKernel());
    const EventA = ark.registry.define<'Domain.Meta.Strict', { meta: unknown }>(
      'Domain.Meta.Strict'
    );
    const EventB = ark.registry.define<'Domain.Meta.Nullable', { meta: unknown }>(
      'Domain.Meta.Nullable'
    );

    ark.eventContracts.register({
      intent: 'Domain.Meta.Strict',
      version: '1',
      schema: { meta: { type: 'object', required: true } },
    });
    ark.eventContracts.register({
      intent: 'Domain.Meta.Nullable',
      version: '1',
      schema: {
        meta: {
          type: 'object',
          required: true,
          nullable: true,
          fields: { city: { type: 'string', required: true } },
        },
      },
    });

    const rejected = ark.eventContracts.validate(EventA({ meta: null }));
    expect(rejected.ok).toBe(false);
    expect(rejected.issues[0]?.field).toBe('meta');
    expect(rejected.issues[0]?.message).toBe('Expected object, received null.');

    const accepted = ark.eventContracts.validate(EventB({ meta: null }));
    expect(accepted.ok).toBe(true);
    expect(accepted.issues).toEqual([]);
  });

  it('adversarial: required + nullable still rejects undefined; array items & explicit null type work', () => {
    const ark = track(createStrictArkKernel());
    const Complex = ark.registry.define<'Domain.Meta.Complex', Record<string, unknown>>(
      'Domain.Meta.Complex'
    );
    ark.eventContracts.register({
      intent: 'Domain.Meta.Complex',
      version: '1',
      schema: {
        reqNullable: { type: 'string', required: true, nullable: true },
        optNonNull: { type: 'object', required: false },
        explicitNull: { type: 'null' },
        tags: { type: 'array', items: { type: 'string' } },
        nullableTags: { type: 'array', items: { type: 'string', nullable: true } },
      },
    });

    const missingRequired = ark.eventContracts.validate(Complex({}));
    expect(missingRequired.ok).toBe(false);
    expect(missingRequired.issues[0]?.field).toBe('reqNullable');

    const badOptionalNull = ark.eventContracts.validate(
      Complex({ reqNullable: null, optNonNull: null })
    );
    expect(badOptionalNull.ok).toBe(false);
    expect(badOptionalNull.issues[0]?.field).toBe('optNonNull');

    const badArrayNull = ark.eventContracts.validate(
      Complex({ reqNullable: 'ok', tags: ['a', null], nullableTags: ['a', null] })
    );
    expect(badArrayNull.ok).toBe(false);
    expect(badArrayNull.issues.map((i) => i.field)).toEqual(['tags[1]']);

    const explicitNullOk = ark.eventContracts.validate(
      Complex({ reqNullable: null, explicitNull: null, nullableTags: [null] })
    );
    expect(explicitNullOk.ok).toBe(true);

    const explicitNullBad = ark.eventContracts.validate(
      Complex({ reqNullable: null, explicitNull: 'not-null' })
    );
    expect(explicitNullBad.ok).toBe(false);
    expect(explicitNullBad.issues[0]?.message).toBe('Expected null, received string.');

    // Array payload at top level must not pass object schema validation
    const arrayPayload = ark.eventContracts.validate(
      Complex([] as unknown as Record<string, unknown>)
    );
    expect(arrayPayload.ok).toBe(false);
  });
});

describe('Phase 1.1 — R-05: InMemoryEventBuffer.clear() resets evictedPendingCount', () => {
  it('resets evictedPending to 0 on clear() and resists negative underflow from late settles', async () => {
    const buffer = new InMemoryEventBuffer({ maxRecords: 1 });
    const makeEvent = (n: number): DomainEvent => ({
      intent: 'Domain.Test.Buffer',
      payload: { n },
      metadata: { occurredAt: new Date().toISOString(), source: 'Application.Test' },
    });

    const first = await buffer.enqueue(makeEvent(1));
    await buffer.enqueue(makeEvent(2));
    expect(buffer.evictedPending).toBe(1);

    await buffer.clear();
    expect(buffer.evictedPending).toBe(0);
    expect(await buffer.list()).toEqual([]);

    // Adversarial: late settle for an id evicted before clear() must not go negative
    await buffer.markDispatched(first.id);
    await buffer.markFailed(first.id, new Error('late'));
    expect(buffer.evictedPending).toBe(0);

    // Subsequent overflow counts cleanly from 1 again
    await buffer.enqueue(makeEvent(3));
    await buffer.enqueue(makeEvent(4));
    expect(buffer.evictedPending).toBe(1);
  });
});

describe('Phase 1.1 — R-06: createArkKernel wires workflowStore & hardening durability', () => {
  it('passes workflowStore to workflowEngine and reports durable in inspector hardening', async () => {
    const customStore = new PostgresWorkflowStore();
    const ark = track(createArkKernel({ workflowStore: customStore }));

    const stores = ark.getInspectorSnapshot().hardening.durability.stores;
    const workflowRow = stores.find((s) => s.role === 'workflow');
    expect(workflowRow).toEqual({
      role: 'workflow',
      id: 'PostgresWorkflowStore',
      kind: 'durable',
    });

    ark.workflowEngine.register({
      name: 'order-fulfill',
      steps: [{ name: 'reserve', execute: () => ({ reserved: true }) }],
    });
    const snap = await ark.workflowEngine.start('order-fulfill', { orderId: 'o1' });
    expect(snap.status).toBe('completed');
    expect(customStore.saved).toHaveLength(1);
    expect(customStore.saved[0]?.id).toBe(snap.id);
  });

  it('adversarial: explicit InMemoryWorkflowStore stays memory; plain/null-proto store reports durable', () => {
    const inMem = track(createArkKernel({ workflowStore: new InMemoryWorkflowStore() }));
    const inMemRow = inMem
      .getInspectorSnapshot()
      .hardening.durability.stores.find((s) => s.role === 'workflow');
    expect(inMemRow).toEqual({
      role: 'workflow',
      id: 'InMemoryWorkflowStore',
      kind: 'memory',
    });

    const nullProtoStore: WorkflowStore = Object.assign(Object.create(null) as object, {
      save: () => undefined,
      get: () => undefined,
      list: () => [],
      clear: () => undefined,
    });
    const durablePlain = track(createArkKernel({ workflowStore: nullProtoStore }));
    const plainRow = durablePlain
      .getInspectorSnapshot()
      .hardening.durability.stores.find((s) => s.role === 'workflow');
    expect(plainRow).toEqual({
      role: 'workflow',
      id: 'WorkflowStore',
      kind: 'durable',
    });
  });
});

describe('Phase 3.2 — Bidirectional broker + multi-handler error aggregation', () => {
  it('delivers inbound broker events through full EventBus pipeline without echoing back', async () => {
    let deliverInbound!: (event: DomainEvent) => Promise<void>;
    const outbound: DomainEvent[] = [];
    let unsubCalls = 0;

    const broker: ArkRunBrokerAdapter = {
      send(event) {
        outbound.push(event);
      },
      onInbound(deliver) {
        deliverInbound = deliver;
        return () => {
          unsubCalls += 1;
        };
      },
    };

    const ark = track(
      createStrictArkKernel({
        broker,
        policies: [
          definePolicy({
            name: 'NoNegativeAmount',
            severity: 'hard',
            check: (ctx: { event: DomainEvent }) => {
              const payload = ctx.event.payload as { amount?: number };
              return typeof payload?.amount === 'number' && payload.amount < 0
                ? { message: 'negative amount forbidden' }
                : true;
            },
          }),
        ],
      })
    );

    const OrderPlaced = ark.registry.define<
      'Domain.Order.Placed',
      { id: string; amount: number; tag?: string }
    >('Domain.Order.Placed');
    ark.registry.define('Application.PlaceOrder', { produces: ['Domain.Order.Placed'] });
    ark.eventContracts.register({
      intent: 'Domain.Order.Placed',
      version: '1',
      schema: {
        id: { type: 'string', required: true },
        amount: { type: 'number', required: true },
      },
    });

    ark.eventBus.registerInterceptor(OrderPlaced, ({ intercept }) => {
      intercept({ tag: 'inbound-enriched' });
    });

    ark.projections.register<string[]>({
      name: 'order-summary',
      sourceIntents: ['Domain.Order.Placed'],
      initialState: () => [],
      project: (event, state) => [...state, (event.payload as { id: string }).id],
    });

    const received: DomainEvent[] = [];
    ark.eventBus.subscribe(OrderPlaced, (event) => {
      received.push(event);
    });

    // Valid inbound event passes through contract, interceptor, policy, audit, projection
    await deliverInbound({
      intent: 'Domain.Order.Placed',
      payload: { id: 'in-1', amount: 42 },
      metadata: {
        occurredAt: new Date().toISOString(),
        source: 'Application.PlaceOrder',
        eventVersion: '1',
      },
    });

    expect(received).toHaveLength(1);
    expect((received[0]?.payload as { tag?: string }).tag).toBe('inbound-enriched');
    expect(await ark.projections.getState<string[]>('order-summary')).toEqual(['in-1']);
    expect(outbound).toHaveLength(0); // Never echoes back to broker!
    expect(await ark.auditTrail.query({ type: 'event.published' })).toHaveLength(1);

    // Adversarial: invalid contract payload on inbound is rejected
    await expect(
      deliverInbound({
        intent: 'Domain.Order.Placed',
        payload: { id: 123, amount: 10 },
        metadata: {
          occurredAt: new Date().toISOString(),
          source: 'Application.PlaceOrder',
          eventVersion: '1',
        },
      })
    ).rejects.toBeInstanceOf(EventContractViolationError);

    // Adversarial: hard policy violation on inbound is rejected
    await expect(
      deliverInbound({
        intent: 'Domain.Order.Placed',
        payload: { id: 'in-neg', amount: -5 },
        metadata: {
          occurredAt: new Date().toISOString(),
          source: 'Application.PlaceOrder',
          eventVersion: '1',
        },
      })
    ).rejects.toThrow(/Hard policy violation/);

    // Disposal unsubscribes and drops late rogue inbound deliveries
    await ark.dispose();
    expect(unsubCalls).toBe(1);
    await deliverInbound({
      intent: 'Domain.Order.Placed',
      payload: { id: 'after-dispose', amount: 1 },
      metadata: {
        occurredAt: new Date().toISOString(),
        source: 'Application.PlaceOrder',
        eventVersion: '1',
      },
    });
    expect(received).toHaveLength(1);
  });

  it('throws single error directly for 1 failing handler and AggregateError for >1 failing handlers', async () => {
    const singleKernel = track(
      createStrictArkKernel({
        strictEventContracts: false,
        rethrowHandlerErrors: true,
      })
    );
    const { OrderPlaced: SinglePlaced, source: singleSource } = setupOrder(singleKernel);
    const singleErr = new Error('only-one');
    singleKernel.eventBus.subscribe(SinglePlaced, () => {
      throw singleErr;
    });

    await expect(
      singleKernel.send(SinglePlaced, { id: 's1' }, {
        source: singleSource,
        transport: 'localBlocking',
      })
    ).rejects.toBe(singleErr);

    const multiKernel = track(
      createStrictArkKernel({
        strictEventContracts: false,
        rethrowHandlerErrors: true,
      })
    );
    const { OrderPlaced: MultiPlaced, source: multiSource } = setupOrder(multiKernel);
    const errA = new Error('boom-sync');
    const errB = new Error('boom-async');
    let survivorRan = false;

    multiKernel.eventBus.subscribe(MultiPlaced, () => {
      throw errA;
    });
    multiKernel.eventBus.subscribe(MultiPlaced, async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      survivorRan = true;
    });
    multiKernel.eventBus.subscribe(MultiPlaced, async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      throw errB;
    });

    let caught: unknown;
    try {
      await multiKernel.send(MultiPlaced, { id: 'm1' }, {
        source: multiSource,
        transport: 'localBlocking',
      });
    } catch (error) {
      caught = error;
    }

    expect(survivorRan).toBe(true);
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([errA, errB]);
    expect(
      multiKernel.eventBus.getTrace().filter((t) => t.type === 'handler.error')
    ).toHaveLength(2);
  });
});

describe('Phase 3.3 — ComponentRegistry (kernel, input), has/hasSingleton, overrides, dispose()', () => {
  it('passes (kernel, input) to factories, rejects input on singletons, and tracks has/hasSingleton', () => {
    const ark = track(createStrictArkKernel());
    ark.register({
      id: 'Domain.LegacyZeroArg',
      factory: () => ({ legacy: true }),
    });
    ark.register({
      id: 'Domain.Config',
      factory: (k) => ({ kernelId: k.instanceId }),
    });
    ark.register<{ kernelId: string; tenant: string }, { tenant: string }>({
      id: 'Application.TenantWorker',
      lifetime: 'transient',
      uses: ['Domain.Config'],
      factory: (k, input) => ({
        kernelId: k.resolve<{ kernelId: string }>('Domain.Config').kernelId,
        tenant: input.tenant,
      }),
    });

    expect(ark.has('Domain.Config')).toBe(true);
    expect(ark.has('Domain.Unknown')).toBe(false);
    expect(ark.hasSingleton('Domain.Config')).toBe(false);

    expect(ark.resolve<{ legacy: boolean }>('Domain.LegacyZeroArg')).toEqual({ legacy: true });
    expect(ark.resolve<{ kernelId: string }>('Domain.Config')).toEqual({
      kernelId: ark.instanceId,
    });
    expect(ark.hasSingleton('Domain.Config')).toBe(true);

    const w1 = ark.resolve<{ kernelId: string; tenant: string }, { tenant: string }>(
      'Application.TenantWorker',
      { tenant: 'acme' }
    );
    const w2 = ark.resolve<{ kernelId: string; tenant: string }, { tenant: string }>(
      'Application.TenantWorker',
      { tenant: 'globex' }
    );
    expect(w1).toEqual({ kernelId: ark.instanceId, tenant: 'acme' });
    expect(w2).toEqual({ kernelId: ark.instanceId, tenant: 'globex' });
    expect(ark.hasSingleton('Application.TenantWorker')).toBe(false);

    // Adversarial: passing input to a singleton must fail closed
    expect(() => ark.resolve('Domain.Config', { tenant: 'leak' })).toThrow(/singleton/);
    // Input must never leak into information package or inspector snapshot
    expect(JSON.stringify(ark.getDependencyInformationPackage())).not.toMatch(/acme|globex/);
    expect(JSON.stringify(ark.getInspectorSnapshot())).not.toMatch(/acme|globex/);
  });

  it('gates replaceForTest and harness.override strictly behind allowOverrides: true without global state', () => {
    const locked = track(createStrictArkKernel());
    locked.register({ id: 'Domain.Clock', factory: () => ({ now: 1 }) });
    const lockedHarness = createArkTestHarness(locked);

    expect(() => locked.replaceForTest('Domain.Clock', () => ({ now: 99 }))).toThrow(
      /allowOverrides: true/
    );
    expect(() => lockedHarness.override('Domain.Clock', () => ({ now: 99 }))).toThrow(
      /allowOverrides: true/
    );

    const testKernelA = track(createStrictArkKernel({ allowOverrides: true }));
    const testKernelB = track(createStrictArkKernel({ allowOverrides: true }));
    testKernelA.register({ id: 'Domain.Clock', uses: ['Domain.Base'], factory: () => ({ now: 1 }) });
    testKernelB.register({ id: 'Domain.Clock', uses: ['Domain.Base'], factory: () => ({ now: 2 }) });

    expect(testKernelA.resolve<{ now: number }>('Domain.Clock').now).toBe(1);
    expect(testKernelA.hasSingleton('Domain.Clock')).toBe(true);

    const harnessA = createArkTestHarness(testKernelA);
    harnessA.override('Domain.Clock', () => ({ now: 42 }));

    // Cached singleton is invalidated immediately
    expect(testKernelA.hasSingleton('Domain.Clock')).toBe(false);
    expect(testKernelA.resolve<{ now: number }>('Domain.Clock').now).toBe(42);
    expect(testKernelA.hasSingleton('Domain.Clock')).toBe(true);
    // Declaration metadata survives override
    expect(testKernelA.getDependencyInformationPackage().components[0]?.uses).toEqual([
      'Domain.Base',
    ]);
    // Other kernel instance is completely isolated (no global state)
    expect(testKernelB.resolve<{ now: number }>('Domain.Clock').now).toBe(2);

    // Adversarial: unregistered id and non-function factory fail closed
    expect(() => harnessA.override('Domain.Missing', () => ({}))).toThrow(/not registered/);
    expect(() =>
      harnessA.override('Domain.Clock', 'not-a-fn' as unknown as () => unknown)
    ).toThrow(/function/);
  });

  it('dispose() and close() stop inspector, clear traceSinks and bus subscriptions, and are idempotent', async () => {
    const traces: TraceRecord[] = [];
    let brokerUnsubCalled = 0;
    const ark = track(
      createStrictArkKernel({
        strictEventContracts: false,
        traceSinks: [(record) => traces.push(record)],
        broker: {
          send() {},
          onInbound() {
            return () => {
              brokerUnsubCalled += 1;
              throw new Error('flaky broker unsub');
            };
          },
        },
      })
    );
    const { OrderPlaced, source } = setupOrder(ark);
    let subHits = 0;
    ark.eventBus.subscribe(OrderPlaced, () => {
      subHits += 1;
    });
    const dynamicTraces: TraceRecord[] = [];
    ark.subscribeTrace((record) => dynamicTraces.push(record));

    const inspector = await ark.startInspector({ port: 0, sseIntervalMs: 0, nodeEnv: 'test' });
    const aliveRes = await fetch(inspector.snapshotUrl);
    expect(aliveRes.status).toBe(200);

    await ark.publisher(source).publish(OrderPlaced, { id: 'before' });
    expect(subHits).toBe(1);
    expect(traces.length).toBeGreaterThan(0);
    expect(dynamicTraces.length).toBeGreaterThan(0);

    const traceCountBefore = traces.length;
    const dynamicCountBefore = dynamicTraces.length;

    // dispose() must survive throwing broker unsubscribe and still close inspector + bus
    await ark.dispose();
    await ark.close(); // idempotent alias
    expect(brokerUnsubCalled).toBe(1);

    await expect(fetch(inspector.snapshotUrl)).rejects.toThrow();

    await ark.publisher(source).publish(OrderPlaced, { id: 'after' });
    expect(subHits).toBe(1);
    expect(traces.length).toBe(traceCountBefore);
    expect(dynamicTraces.length).toBe(dynamicCountBefore);
  });
});

describe('Phase 4.1 — wireOrderPlane (ArkOrder <-> ArkRun bridge)', () => {
  function makeOrderPlane() {
    return createOrderPlane({
      projector: (release) => {
        const tier = release.xi.tier;
        if (tier === 'pro') {
          return {
            allowedKinds: ['SeatAdded', 'FeatureEnabled'],
            invalidated: ['tier'],
          };
        }
        return {
          allowedKinds: ['SeatAdded'],
          invalidated: ['tier'],
        };
      },
      packs: [
        {
          id: 'seat-cap',
          capacity: [{ kind: 'SeatAdded', sigmaKey: 'maxSeats', payloadKey: 'seats', op: 'lte' }],
        },
        {
          id: 'scale-pack',
          escalateKinds: ['RegionFailover'],
          escalateTarget: 'scale',
        },
      ],
    });
  }

  it('keeps wireOrderPlane off src/gate.ts and exports it on runtime entries', () => {
    expect((gate as { wireOrderPlane?: unknown }).wireOrderPlane).toBeUndefined();
    expect(typeof runtimeEntry.wireOrderPlane).toBe('function');
    expect(DEFAULT_MAX_DECISION_TAPE_SIZE).toBe(500);
  });

  it('routes absorb via publisher.send, escalate_up(human) via raises, and ignores hold/non-human', async () => {
    const ark = track(createStrictArkKernel({ strictEventContracts: false }));
    const SeatApplied = ark.registry.define<'Domain.Order.SeatApplied', { seats: number }>(
      'Domain.Order.SeatApplied'
    );
    const HumanEscalated = ark.registry.define<
      'Domain.Order.HumanEscalated',
      { kind: string; reasonCode: string }
    >('Domain.Order.HumanEscalated');
    ark.registry.define('Application.OrderBridge', {
      produces: ['Domain.Order.SeatApplied', 'Domain.Order.HumanEscalated'],
    });

    const absorbedPayloads: Array<{ seats: number }> = [];
    const raisedPayloads: Array<{ kind: string; reasonCode: string }> = [];
    ark.eventBus.subscribe(SeatApplied, (e) => {
      absorbedPayloads.push(e.payload);
    });
    ark.eventBus.subscribe(HumanEscalated, (e) => {
      raisedPayloads.push(e.payload);
    });

    const plane = makeOrderPlane();
    plane.release({ tier: 'free' }, { maxSeats: 5 });

    const bridge = wireOrderPlane(ark, plane, {
      source: 'Application.OrderBridge',
      onAbsorb: (res) => ({
        intent: SeatApplied,
        payload: { seats: Number(res.event.payload?.seats ?? 0) },
        options: { transport: 'localBlocking' },
      }),
      onEscalate: (res, raise) =>
        raise(HumanEscalated, {
          kind: res.event.kind,
          reasonCode: res.reasonCode,
        }),
    });

    // 1. Absorb -> send
    const absorbed = await bridge.ingest({
      kind: 'SeatAdded',
      payload: { seats: 3, nestedSecret: { hidden: true } },
    });
    expect(absorbed.result.kind).toBe('absorb');
    expect(absorbed.travelAction).toBe('send');
    expect(absorbed.sendResult?.transport).toBe('localBlocking');
    expect(absorbedPayloads).toEqual([{ seats: 3 }]);

    // 2. Escalate (human) -> raises
    const escalated = await bridge.ingest({
      kind: 'FeatureEnabled',
      payload: { flag: 'ai' },
    });
    expect(escalated.result.kind).toBe('escalate_up');
    expect(escalated.travelAction).toBe('raises');
    expect(escalated.raised).toBe(true);
    expect(raisedPayloads).toEqual([{ kind: 'FeatureEnabled', reasonCode: 'not-in-pattern' }]);

    // 3. Hold (capacity exceeded) -> travelAction: 'none' (no send, no raise)
    const held = await bridge.ingest({ kind: 'SeatAdded', payload: { seats: 99 } });
    expect(held.result.kind).toBe('hold');
    expect(held.travelAction).toBe('none');
    expect(absorbedPayloads).toHaveLength(1);
    expect(raisedPayloads).toHaveLength(1);

    // 4. Escalate (target: 'scale') -> travelAction: 'none' (does not raise human)
    const scaled = await bridge.ingest({ kind: 'RegionFailover' });
    expect(scaled.result.kind).toBe('escalate_up');
    expect(scaled.travelAction).toBe('none');
    expect(raisedPayloads).toHaveLength(1);

    // Snapshot & package expose sanitized decisionTape (no nested objects!)
    const snapshot = ark.getInspectorSnapshot();
    const tape = snapshot.package.decisionTape;
    expect(tape).toHaveLength(4);
    expect(tape?.[0]?.event.payload).toEqual({ seats: 3 });
    expect(JSON.stringify(snapshot)).not.toMatch(/nestedSecret|hidden/);
  });

  it('bounds decisionTape with maxDecisionTapeSize eviction and defends against mutation', async () => {
    const ark = track(createStrictArkKernel({ strictEventContracts: false }));
    ark.registry.define('Application.OrderBridge');
    const plane = makeOrderPlane();
    plane.release({ tier: 'free' }, { maxSeats: 10 });

    const bridge = wireOrderPlane(ark, plane, {
      source: 'Application.OrderBridge',
      maxDecisionTapeSize: 3,
    });

    for (let i = 1; i <= 5; i += 1) {
      await bridge.ingest({ kind: 'SeatAdded', payload: { seats: i } });
    }

    const tape = bridge.getDecisionTape();
    expect(tape).toHaveLength(3);
    expect(tape.map((entry) => entry.event.payload?.seats)).toEqual([3, 4, 5]);
    expect(ark.getInspectorSnapshot().package.decisionTape).toEqual(tape);

    // Mutating returned array does not corrupt internal tape
    tape.pop();
    expect(bridge.getDecisionTape()).toHaveLength(3);

    // Adversarial: invalid maxDecisionTapeSize fails closed
    expect(() =>
      wireOrderPlane(ark, plane, {
        source: 'Application.OrderBridge',
        maxDecisionTapeSize: 0,
      })
    ).toThrow(RangeError);
    expect(() =>
      wireOrderPlane(ark, plane, {
        source: 'Application.OrderBridge',
        maxDecisionTapeSize: -5,
      })
    ).toThrow(RangeError);
    expect(() =>
      wireOrderPlane(ark, plane, {
        source: 'Application.OrderBridge',
        maxDecisionTapeSize: 1.5,
      })
    ).toThrow(RangeError);

    // Adversarial: unregistered source fails fast in strict mode
    expect(() =>
      wireOrderPlane(ark, plane, { source: 'Application.UnregisteredBridge' })
    ).toThrow(UnregisteredIntentError);
  });

  it('performs explicit audited restore() via proposeRelease -> apply and records audit + decisionTape', async () => {
    const ark = track(createStrictArkKernel({ strictEventContracts: false }));
    ark.registry.define('Application.OrderBridge');
    const plane = makeOrderPlane();

    const v1 = plane.release({ tier: 'free' }, { maxSeats: 5 });
    const upgrade = plane.proposeRelease({ tier: 'pro', rollout: 'canary' });
    const v2 = plane.apply(upgrade);
    expect(v2.xi).toEqual({ rollout: 'canary', tier: 'pro' });

    const bridge = wireOrderPlane(ark, plane, {
      source: 'Application.OrderBridge',
    });

    const restored = await bridge.restore(v1.xi, {
      reason: 'incident-rollback',
      actor: 'ops-oncall',
    });

    expect(restored.previousXiHash).toBe(v2.xiHash);
    expect(restored.previousVersion).toBe(2);
    expect(restored.release.version).toBe(3);
    expect(restored.release.xi).toEqual({ tier: 'free' }); // removed extra key `rollout` too!
    expect(restored.release.xiHash).toBe(v1.xiHash);
    expect(plane.current()?.xi).toEqual({ tier: 'free' });

    const audits = await ark.auditTrail.query({ type: 'order.restored' });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.actor).toBe('ops-oncall');
    expect(audits[0]?.details).toMatchObject({
      previousXiHash: v2.xiHash,
      previousVersion: 2,
      nextXiHash: v1.xiHash,
      nextVersion: 3,
      reason: 'incident-rollback',
    });

    const tape = ark.getInspectorSnapshot().package.decisionTape;
    expect(tape).toHaveLength(1);
    expect(tape?.[0]?.event.kind).toBe('order.restore');
    expect(tape?.[0]?.residual.reasonCode).toBe('restore');

    // Adversarial: restoring to the already-active xi fails closed (empty blast) without fake audit
    await expect(bridge.restore(v1.xi)).rejects.toBeInstanceOf(ArkOrderError);
    expect(await ark.auditTrail.query({ type: 'order.restored' })).toHaveLength(1);

    // Adversarial: restore on an unreleased plane fails closed
    const emptyPlane = makeOrderPlane();
    const emptyBridge = wireOrderPlane(ark, emptyPlane, {
      source: 'Application.OrderBridge',
    });
    await expect(emptyBridge.restore({ tier: 'free' })).rejects.toBeInstanceOf(ArkOrderError);
  });
});
