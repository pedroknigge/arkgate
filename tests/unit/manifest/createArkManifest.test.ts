import { describe, it, expect } from 'vitest';
import {
  createIntentRegistry,
  createDependencyGraph,
  createMetadataRegistry,
  PolicyEngine,
  definePolicy,
  syncRegistryToGraph,
  createArkManifest,
} from '../../../src/index';

describe('createArkManifest', () => {
  it('exports a complete machine-readable snapshot', () => {
    const registry = createIntentRegistry();
    registry.define<'Domain.Order.Placed', { id: string }>('Domain.Order.Placed');
    registry.define<'Application.PlaceOrder', { id: string }>('Application.PlaceOrder', {
      dependsOn: ['Domain.Order.Placed'],
      produces: ['Domain.Order.Placed'],
    });

    const graph = createDependencyGraph();
    syncRegistryToGraph(registry, graph);

    const metadata = createMetadataRegistry();
    metadata.entity('Order', { fields: { id: { type: 'string', identity: true } } });

    const policyEngine = new PolicyEngine([
      definePolicy({ name: 'positive-amount', severity: 'hard', check: () => true }),
    ]);

    const manifest = createArkManifest({
      registry,
      policyEngine,
      metadata,
      graph,
    });

    const json = manifest.toJSON();

    expect(json.schemaVersion).toBe('1.0');
    expect(json.version).toBe('0.8.0');
    expect(json.intents).toHaveLength(2);
    expect(json.policies[0].id).toBe('positive-amount');
    expect(json.links).toBeDefined();
    expect(json.intents.find((i) => i.name === 'Application.PlaceOrder')?.productions).toContain(
      'Domain.Order.Placed'
    );
    expect(json.relationships.some((r) => r.kind === 'produces')).toBe(true);
    expect(json.policies).toHaveLength(1);
    expect(json.entities).toHaveLength(1);
    expect(json.graph.edges.length).toBeGreaterThan(0);
    expect(typeof json.exportedAt).toBe('string');
  });
});
