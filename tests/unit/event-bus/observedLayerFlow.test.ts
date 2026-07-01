import { describe, expect, it } from 'vitest';
import {
  ObservedLayerFlowViolationError,
  createAuditTrail,
  createDependencyGraph,
  createEventBus,
  createIntentRegistry,
  createStrictArkKernel,
  elevenLayerProfile,
  type ObservedLayerFlowMode,
} from '../../../src/index';

/**
 * Observed-flow layer enforcement checks the REAL producer→event flow
 * (metadata.source → intent) against the profile, not the declared model.
 * Persistence adapters must not drive Domain events (PersistenceAdapters → DomainModel
 * is forbidden), while Application → Domain is a healthy flow.
 */
function setup(mode: ObservedLayerFlowMode) {
  const registry = createIntentRegistry();
  const OrderPlaced = registry.define<'Domain.Order.Placed', { id: string }>(
    'Domain.Order.Placed'
  );
  registry.define('Application.PlaceOrder', { produces: ['Domain.Order.Placed'] });
  registry.define('Adapter.Persistence.OrderRepo');

  const auditTrail = createAuditTrail();
  const bus = createEventBus({
    intentRegistry: registry,
    architectureProfile: elevenLayerProfile,
    enforceObservedLayerFlow: mode,
    requireKnownSource: true,
    strictRegistry: true,
    auditTrail,
  });

  return { bus, auditTrail, OrderPlaced };
}

describe('Observed layer-flow enforcement', () => {
  it('hard mode rejects a persistence→domain flow before any side effect', async () => {
    const { bus, OrderPlaced } = setup('hard');
    let notified = 0;
    bus.subscribe(OrderPlaced, () => {
      notified += 1;
    });

    await expect(
      bus.publish(OrderPlaced, { id: 'o1' }, { source: 'Adapter.Persistence.OrderRepo' })
    ).rejects.toThrow(ObservedLayerFlowViolationError);

    // The illegal event never reached subscribers or history.
    expect(notified).toBe(0);
    expect(bus.getHistory()).toHaveLength(0);
  });

  it('hard mode carries the resolved layers on the thrown error', async () => {
    const { bus, OrderPlaced } = setup('hard');
    await bus
      .publish(OrderPlaced, { id: 'o1' }, { source: 'Adapter.Persistence.OrderRepo' })
      .then(
        () => {
          throw new Error('expected publish to reject');
        },
        (err: unknown) => {
          expect(err).toBeInstanceOf(ObservedLayerFlowViolationError);
          const violation = err as ObservedLayerFlowViolationError;
          expect(violation.fromLayer).toBe('PersistenceAdapters');
          expect(violation.toLayer).toBe('DomainModel');
          expect(violation.source).toBe('Adapter.Persistence.OrderRepo');
          expect(violation.intentName).toBe('Domain.Order.Placed');
        }
      );
  });

  it('soft mode records a layer.observedViolation trace + audit and still publishes', async () => {
    const { bus, auditTrail, OrderPlaced } = setup('soft');
    let notified = 0;
    bus.subscribe(OrderPlaced, () => {
      notified += 1;
    });

    await bus.publish(OrderPlaced, { id: 'o1' }, {
      source: 'Adapter.Persistence.OrderRepo',
    });

    expect(notified).toBe(1);
    expect(bus.getHistory()).toHaveLength(1);
    expect(bus.getTrace().some((t) => t.type === 'layer.observedViolation')).toBe(true);
    expect(await auditTrail.query({ type: 'layer.observedViolation' })).toHaveLength(1);
  });

  it('allows a healthy application→domain flow under hard mode', async () => {
    const { bus, OrderPlaced } = setup('hard');
    await bus.publish(OrderPlaced, { id: 'o1' }, { source: 'Application.PlaceOrder' });
    expect(bus.getHistory()).toHaveLength(1);
    expect(bus.getTrace().some((t) => t.type === 'layer.observedViolation')).toBe(false);
  });

  it('off mode ignores forbidden observed flows (backward compatible)', async () => {
    const { bus, OrderPlaced } = setup('off');
    await bus.publish(OrderPlaced, { id: 'o1' }, {
      source: 'Adapter.Persistence.OrderRepo',
    });
    expect(bus.getHistory()).toHaveLength(1);
    expect(bus.getTrace().some((t) => t.type === 'layer.observedViolation')).toBe(false);
  });

  it('hard mode leaves NO observed edge in the graph for a rejected flow', async () => {
    const registry = createIntentRegistry();
    const OrderPlaced = registry.define<'Domain.Order.Placed', { id: string }>(
      'Domain.Order.Placed'
    );
    registry.define('Adapter.Persistence.OrderRepo');
    const graph = createDependencyGraph();
    const bus = createEventBus({
      intentRegistry: registry,
      dependencyGraph: graph,
      architectureProfile: elevenLayerProfile,
      enforceObservedLayerFlow: 'hard',
      requireKnownSource: true,
      strictRegistry: true,
    });

    await expect(
      bus.publish(OrderPlaced, { id: 'o1' }, { source: 'Adapter.Persistence.OrderRepo' })
    ).rejects.toThrow(ObservedLayerFlowViolationError);

    // A rejected event must not pollute the dependency graph (drift/manifest source).
    const phantom = graph
      .getEdges()
      .some((e) => e.from === 'Adapter.Persistence.OrderRepo' && e.to === 'Domain.Order.Placed');
    expect(phantom).toBe(false);
  });

  it('createStrictArkKernel enforces observed layer flows (hard) by default', async () => {
    const ark = createStrictArkKernel();
    const OrderPlaced = ark.registry.define<'Domain.Order.Placed', { id: string }>(
      'Domain.Order.Placed'
    );
    ark.registry.define('Adapter.Persistence.OrderRepo');
    ark.eventContracts.register({
      intent: 'Domain.Order.Placed',
      version: '1',
      schema: { id: { type: 'string', required: true } },
    });

    await expect(
      ark.eventBus.publish(OrderPlaced, { id: 'o1' }, {
        source: 'Adapter.Persistence.OrderRepo',
        eventVersion: '1',
      })
    ).rejects.toThrow(ObservedLayerFlowViolationError);
  });
});
