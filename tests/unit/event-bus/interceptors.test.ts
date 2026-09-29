import { describe, expect, it } from 'vitest';
import {
  createStrictArkKernel,
} from '../../../src/index';

function registerOrderFlow() {
  const ark = createStrictArkKernel({ instanceId: 'kernel-test' });
  const OrderPlaced = ark.registry.define<
    'Domain.Order.Placed',
    { id: string; provider?: string }
  >('Domain.Order.Placed');
  ark.registry.define<'Application.PlaceOrder', { id: string }>(
    'Application.PlaceOrder',
    { produces: ['Domain.Order.Placed'] }
  );
  ark.eventContracts.register({
    intent: 'Domain.Order.Placed',
    version: '1',
    allowAdditionalFields: false,
    schema: {
      id: { type: 'string', required: true },
      provider: { type: 'string' },
    },
  });
  return { ark, OrderPlaced };
}

describe('EventBus interceptors', () => {
  it('applies add-only payload enrichment before handlers, audit, and outbox', async () => {
    const { ark, OrderPlaced } = registerOrderFlow();
    const seen: Array<{ id: string; provider?: string }> = [];

    ark.eventBus.registerInterceptor(
      OrderPlaced,
      ({ intercept }) => {
        intercept({ provider: 'stripe' });
      },
      'provider-tag'
    );
    ark.eventBus.subscribe(OrderPlaced, (event) => {
      seen.push(event.payload);
    });

    await ark.eventBus.publish(OrderPlaced, { id: 'o1' }, {
      source: 'Application.PlaceOrder',
      eventVersion: '1',
    });

    expect(seen).toEqual([{ id: 'o1', provider: 'stripe' }]);
    expect(ark.eventBus.getHistory()[0].event.payload).toEqual({
      id: 'o1',
      provider: 'stripe',
    });
    expect(ark.eventBus.getHistory()[0].event.metadata.kernelInstanceId).toBe('kernel-test');
    expect(ark.eventBus.getHistory()[0].event.metadata.interceptions).toEqual([
      expect.objectContaining({ interceptorId: 'provider-tag' }),
    ]);
    expect(ark.eventBus.getTrace().map((record) => record.type)).toContain('event.intercepted');
    expect(await ark.auditTrail.query({ type: 'event.intercepted' })).toHaveLength(1);
    expect((await ark.outbox.list('dispatched'))[0].event.payload).toEqual({
      id: 'o1',
      provider: 'stripe',
    });
    expect(ark.eventBus.listInterceptors('Domain.Order.Placed')[0].lastInterceptedAt).toBeDefined();
  });

  it('records interceptor errors and keeps delivering the original event', async () => {
    const { ark, OrderPlaced } = registerOrderFlow();

    ark.eventBus.registerInterceptor(
      OrderPlaced,
      ({ intercept }) => {
        intercept({ id: 'overwritten' });
      },
      'bad-overwrite'
    );

    await ark.eventBus.publish(OrderPlaced, { id: 'o1' }, {
      source: 'Application.PlaceOrder',
      eventVersion: '1',
    });

    expect(ark.eventBus.getHistory()[0].event.payload).toEqual({ id: 'o1' });
    expect(ark.eventBus.getTrace().map((record) => record.type)).toContain('interceptor.error');
    expect(await ark.auditTrail.query({ type: 'interceptor.error' })).toHaveLength(1);
  });

  it('skips interceptors when metadata disables interception', async () => {
    const { ark, OrderPlaced } = registerOrderFlow();
    ark.eventBus.registerInterceptor(OrderPlaced, ({ intercept }) => {
      intercept({ provider: 'stripe' });
    });

    await ark.eventBus.publish(OrderPlaced, { id: 'o1' }, {
      source: 'Application.PlaceOrder',
      eventVersion: '1',
      allowInterception: false,
    });

    expect(ark.eventBus.getHistory()[0].event.payload).toEqual({ id: 'o1' });
    expect(ark.eventBus.getTrace().map((record) => record.type)).not.toContain('event.intercepted');
  });
});
