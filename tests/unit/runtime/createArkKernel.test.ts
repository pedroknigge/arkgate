import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_HISTORY_SIZE,
  createLenientArkKernel,
  createStrictArkKernel,
} from '../../../src/index';

describe('createArkKernel presets', () => {
  it('strict kernel rejects a publish whose contract validation fails', async () => {
    const ark = createStrictArkKernel();
    const OrderPlaced = ark.registry.define<'Domain.Order.Placed', { id: string }>(
      'Domain.Order.Placed'
    );
    ark.registry.define('Application.PlaceOrder', { produces: ['Domain.Order.Placed'] });
    ark.eventContracts.register({
      intent: 'Domain.Order.Placed',
      version: '1',
      schema: { id: { type: 'string', required: true } },
    });

    await expect(
      ark.eventBus.publish(OrderPlaced, {} as { id: string }, {
        source: 'Application.PlaceOrder',
        eventVersion: '1',
      })
    ).rejects.toThrow();
  });

  it('lenient kernel accepts a publish without a registered contract', async () => {
    const ark = createLenientArkKernel({ requireKnownSource: false });
    const OrderPlaced = ark.registry.define<'Domain.Order.Placed', { id: string }>(
      'Domain.Order.Placed'
    );
    ark.registry.define('Application.PlaceOrder', { produces: ['Domain.Order.Placed'] });

    await ark.eventBus.publish(OrderPlaced, { id: 'o1' }, { source: 'Application.PlaceOrder' });
    expect(ark.eventBus.getHistory()).toHaveLength(1);
  });

  it('caps history and audit at DEFAULT_MAX_HISTORY_SIZE by default', async () => {
    const ark = createLenientArkKernel({ requireKnownSource: false });
    const OrderPlaced = ark.registry.define<'Domain.Order.Placed', { n: number }>(
      'Domain.Order.Placed'
    );
    ark.registry.define('Application.PlaceOrder', { produces: ['Domain.Order.Placed'] });

    for (let n = 0; n < DEFAULT_MAX_HISTORY_SIZE + 5; n++) {
      await ark.eventBus.publish(OrderPlaced, { n }, { source: 'Application.PlaceOrder' });
    }

    const history = ark.eventBus.getHistory();
    expect(history).toHaveLength(DEFAULT_MAX_HISTORY_SIZE);
    // oldest records evicted first
    expect((history[0].event.payload as { n: number }).n).toBe(5);
    expect(await ark.auditTrail.query()).toHaveLength(DEFAULT_MAX_HISTORY_SIZE);
  });

  it('maxHistorySize: Infinity opts back into unbounded history', async () => {
    const ark = createLenientArkKernel({
      requireKnownSource: false,
      maxHistorySize: Infinity,
    });
    const OrderPlaced = ark.registry.define<'Domain.Order.Placed', { n: number }>(
      'Domain.Order.Placed'
    );
    ark.registry.define('Application.PlaceOrder', { produces: ['Domain.Order.Placed'] });

    for (let n = 0; n < DEFAULT_MAX_HISTORY_SIZE + 5; n++) {
      await ark.eventBus.publish(OrderPlaced, { n }, { source: 'Application.PlaceOrder' });
    }

    expect(ark.eventBus.getHistory()).toHaveLength(DEFAULT_MAX_HISTORY_SIZE + 5);
  });

  it('kernels get unique instance ids and the 11-layer profile by default', () => {
    const a = createStrictArkKernel();
    const b = createStrictArkKernel();
    expect(a.instanceId).not.toBe(b.instanceId);
    expect(a.profile.layers).toHaveLength(11);
  });
});
