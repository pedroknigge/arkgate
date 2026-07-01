import { describe, it, expect } from 'vitest';
import { createIntentRegistry } from '../../../src/index';

describe('IntentRegistry (Iteration 1)', () => {
  it('supports define + get + list', () => {
    const registry = createIntentRegistry();

    const OrderCreated = registry.define<'Domain.Order.Created', { id: string }>('Domain.Order.Created');

    expect(registry.get('Domain.Order.Created')).toBe(OrderCreated);
    expect(registry.list().length).toBe(1);
    expect(registry.has('Domain.Order.Created')).toBe(true);
  });

  it('supports declareDependency and retrieval', () => {
    const registry = createIntentRegistry();

    registry.define<'Application.ConfirmOrder', { orderId: string }>('Application.ConfirmOrder');
    registry.declareDependency('Application.ConfirmOrder', 'Domain.Order.Created');

    const deps = registry.getDependencies('Application.ConfirmOrder');
    expect(deps).toContain('Domain.Order.Created');
  });

  it('supports initial relationships via options in define', () => {
    const registry = createIntentRegistry();

    registry.define<'Domain.Order.Placed', { id: string }>('Domain.Order.Placed');
    const confirm = registry.define<'Application.ConfirmOrder', { orderId: string }>(
      'Application.ConfirmOrder',
      { dependsOn: ['Domain.Order.Placed'] }
    );

    expect(registry.getDependencies('Application.ConfirmOrder')).toContain('Domain.Order.Placed');
  });

  it('getAllRelationships returns declared edges', () => {
    const registry = createIntentRegistry();

    registry.define<'Domain.A', {}>('Domain.A');
    registry.define<'Application.B', {}>('Application.B', { dependsOn: ['Domain.A'] });

    const rels = registry.getAllRelationships();
    expect(rels.some((r) => r.from === 'Application.B' && r.to === 'Domain.A' && r.kind === 'dependsOn')).toBe(true);
  });

  it('produces is modeled separately from dependsOn', () => {
    const registry = createIntentRegistry();

    registry.define<'Domain.Order.Placed', {}>('Domain.Order.Placed');
    registry.define<'Application.PlaceOrder', {}>('Application.PlaceOrder', {
      dependsOn: ['Domain.Order.Placed'],
      produces: ['Domain.Order.Placed'],
    });

    expect(registry.getDependencies('Application.PlaceOrder')).toContain('Domain.Order.Placed');
    expect(registry.getProductions('Application.PlaceOrder')).toContain('Domain.Order.Placed');

    const rels = registry.getAllRelationships();
    expect(rels.filter((r) => r.kind === 'dependsOn')).toHaveLength(1);
    expect(rels.filter((r) => r.kind === 'produces')).toHaveLength(1);
  });

  it('clear() empties the registry', () => {
    const registry = createIntentRegistry();
    registry.define<'Domain.Test.Clear', {}>('Domain.Test.Clear');

    registry.clear();

    expect(registry.list().length).toBe(0);
    expect(registry.has('Domain.Test.Clear')).toBe(false);
  });
});
