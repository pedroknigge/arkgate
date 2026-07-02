import { describe, expect, it } from 'vitest';
import {
  EventContractViolationError,
  SourceMetadataOverrideError,
  UnknownEventSourceError,
  createArkKernel,
  createLenientArkKernel,
  createStrictArkKernel,
} from '../../src/index';

describe('Strict Ark kernel phase hardening', () => {
  it('uses strict runtime defaults in createArkKernel', async () => {
    const ark = createArkKernel();
    const OrderPlaced = ark.registry.define<'Domain.Order.Placed', { id: string }>(
      'Domain.Order.Placed'
    );
    ark.registry.define<'Application.PlaceOrder', { id: string }>(
      'Application.PlaceOrder',
      { produces: ['Domain.Order.Placed'] }
    );

    await expect(
      ark.eventBus.publish(OrderPlaced, { id: 'o1' }, { source: 'Application.PlaceOrder' })
    ).rejects.toThrow(EventContractViolationError);
  });

  it('keeps the legacy relaxed path explicit through createLenientArkKernel', async () => {
    const ark = createLenientArkKernel();
    const OrderPlaced = ark.registry.define<'Domain.Order.Placed', { id: string }>(
      'Domain.Order.Placed'
    );
    ark.registry.define<'Application.PlaceOrder', { id: string }>(
      'Application.PlaceOrder',
      { produces: ['Domain.Order.Placed'] }
    );

    await ark.eventBus.publish(OrderPlaced, { id: 'o1' }, { source: 'Application.PlaceOrder' });
    expect(ark.eventBus.getHistory()).toHaveLength(1);
  });

  it('rejects events without contracts and requires known source metadata', async () => {
    const ark = createStrictArkKernel();
    const OrderPlaced = ark.registry.define<'Domain.Order.Placed', { id: string }>(
      'Domain.Order.Placed'
    );
    ark.registry.define<'Application.PlaceOrder', { id: string }>(
      'Application.PlaceOrder',
      { produces: ['Domain.Order.Placed'] }
    );

    await expect(
      ark.eventBus.publish(OrderPlaced, { id: 'o1' }, { source: 'Application.PlaceOrder' })
    ).rejects.toThrow(EventContractViolationError);

    ark.eventContracts.register({
      intent: 'Domain.Order.Placed',
      version: '1',
      schema: { id: { type: 'string', required: true } },
    });

    await expect(
      ark.eventBus.publish(OrderPlaced, { id: 'o1' })
    ).rejects.toThrow(UnknownEventSourceError);

    await expect(
      ark.eventBus.publish(OrderPlaced, { id: 'o1' }, {
        source: 'Application.Unknown',
        eventVersion: '1',
      })
    ).rejects.toThrow(UnknownEventSourceError);

    await ark.eventBus.publish(OrderPlaced, { id: 'o1' }, {
      source: 'Application.PlaceOrder',
      eventVersion: '1',
    });

    expect(await ark.outbox.list('pending')).toHaveLength(1);
    expect(await ark.auditTrail.query({ type: 'event.published' })).toHaveLength(1);
    expect(ark.manifest().toJSON().eventContracts).toHaveLength(1);
  });

  it('exposes source-bound publishers from the strict kernel', async () => {
    const ark = createArkKernel();
    const OrderPlaced = ark.registry.define<'Domain.Order.Placed', { id: string }>(
      'Domain.Order.Placed'
    );
    ark.registry.define('Application.PlaceOrder', {
      produces: ['Domain.Order.Placed'],
    });
    ark.registry.define('Application.OtherUseCase');
    ark.eventContracts.register({
      intent: 'Domain.Order.Placed',
      version: '1',
      schema: { id: { type: 'string', required: true } },
    });

    const publisher = ark.publisher('Application.PlaceOrder');
    await publisher.publish(OrderPlaced, { id: 'o1' }, { eventVersion: '1' });

    expect(ark.eventBus.getHistory()[0].event.metadata.source).toBe(
      'Application.PlaceOrder'
    );

    await expect(
      publisher.publish(OrderPlaced, { id: 'o2' }, {
        eventVersion: '1',
        source: 'Application.OtherUseCase',
      })
    ).rejects.toThrow(SourceMetadataOverrideError);
  });
});
