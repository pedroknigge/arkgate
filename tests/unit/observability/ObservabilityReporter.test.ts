import { describe, expect, it } from 'vitest';
import { createArkKernel } from '../../../src/index';

describe('ObservabilityReporter', () => {
  it('reports declared vs observed production flows and never-observed intents', async () => {
    const ark = createArkKernel({ strictEventContracts: false });
    const OrderPlaced = ark.registry.define<'Domain.Order.Placed', { id: string }>(
      'Domain.Order.Placed'
    );
    ark.registry.define('Domain.Order.Cancelled');
    ark.registry.define('Application.PlaceOrder', {
      produces: ['Domain.Order.Placed', 'Domain.Order.Cancelled'],
    });

    await ark.eventBus.publish(OrderPlaced, { id: 'o1' }, {
      source: 'Application.PlaceOrder',
    });

    const report = ark.observability.report();
    const placed = { from: 'Application.PlaceOrder', to: 'Domain.Order.Placed' };
    const cancelled = { from: 'Application.PlaceOrder', to: 'Domain.Order.Cancelled' };

    expect(report.declaredProductions).toContainEqual(placed);
    expect(report.declaredProductions).toContainEqual(cancelled);
    expect(report.observedProductions).toEqual([placed]);
    expect(report.declaredButUnobserved).toEqual([cancelled]);
    expect(report.observedButUndeclared).toEqual([]);
    expect(report.registeredButNeverObserved).toContain('Domain.Order.Cancelled');
    expect(report.registeredButNeverObserved).not.toContain('Domain.Order.Placed');
  });

  it('reports an empty drift when nothing is registered or published', () => {
    const ark = createArkKernel();
    const report = ark.observability.report();
    expect(report.declaredProductions).toEqual([]);
    expect(report.observedProductions).toEqual([]);
    expect(report.declaredButUnobserved).toEqual([]);
    expect(report.observedButUndeclared).toEqual([]);
  });
});
