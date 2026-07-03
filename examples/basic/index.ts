/**
 * Basic full demo example for Ark (rich output for verification).
 *
 * Exercises core APIs including H1–H7 improvements.
 */

import {
  createIntentRegistry,
  createEventBus,
  definePolicy,
  createDependencyGraph,
  syncRegistryToGraph,
  createMetadataRegistry,
  createArkManifest,
  definePort,
  createAdapter,
  checkContract,
  createSaga,
  createAICodeGate,
  architecturalPolicies,
  // cleanArchitectureMatrix covers the older four-prefix model; the full 11-layer preset is elevenLayerProfile
  PolicyEngine,
} from '../../src/index';

async function main() {
  console.log('=== Ark Basic Demo ===');

  const registry = createIntentRegistry();
  const OrderPlaced = registry.define<
    'Domain.Order.OrderPlaced',
    { orderId: string; amount: number }
  >('Domain.Order.OrderPlaced');
  registry.define<'Application.PlaceOrder', { orderId: string }>(
    'Application.PlaceOrder',
    { dependsOn: ['Domain.Order.OrderPlaced'], produces: ['Domain.Order.OrderPlaced'] }
  );

  const graph = createDependencyGraph();
  syncRegistryToGraph(registry, graph);
  graph.registerEventFlow('Domain.Order.OrderPlaced', 'Application.Confirm');

  const metadata = createMetadataRegistry();
  metadata.entity('Order', { fields: { id: { type: 'string', identity: true } } });

  const policyEngine = new PolicyEngine([
    definePolicy({
      name: 'amt>0',
      severity: 'hard',
      check: (c: { event: { payload: { amount: number } } }) =>
        c.event.payload.amount >= 0,
    }),
    architecturalPolicies.cleanArchitectureMatrix(),
  ]);

  const bus = createEventBus({
    policyEngine,
    intentRegistry: registry,
    dependencyGraph: graph,
    maxHistorySize: 100,
    strictRegistry: true,
  });

  const received: Array<{ orderId: string }> = [];
  bus.subscribe(OrderPlaced, (e) => {
    received.push(e.payload);
  });

  await bus.publish(OrderPlaced, { orderId: 'o-100', amount: 42 }, { source: 'Demo.Basic' });

  interface R {
    find(id: string): { id: string };
  }
  const port = definePort<R>('R');
  createAdapter(port, { find: (id: string) => ({ id }) }, ['find']);
  const chk = checkContract({ find: (x: string) => ({ id: x }) }, ['find']);

  const saga = createSaga(
    {
      name: 'Demo',
      steps: [{ name: 's1', execute: async () => ({ saga: 'done' }) }],
    },
    bus
  );
  await saga.run({});

  const manifest = createArkManifest({
    registry,
    policyEngine,
    metadata,
    graph,
  });
  const manifestJson = manifest.toJSON();

  const gate = createAICodeGate({ intents: registry.list() });
  const gateResult = gate.validate(
    `await bus.publish('Domain.Order.OrderPlaced', { orderId: 'x', amount: 1 });`
  );

  const trace = bus.getTrace();

  console.log(
    'events=' +
      received.length +
      ' history=' +
      bus.getHistory().length +
      ' trace=' +
      trace.length +
      ' manifest=' +
      manifestJson.intents.length +
      ' gate=' +
      (gateResult.valid ? 'ok' : 'fail') +
      ' layerPolicy=' +
      manifestJson.policies.length +
      ' mermaidSample=' +
      graph.toMermaid().slice(0, 120).replace(/\n/g, ' ') +
      ' adapters=' +
      (chk.ok ? 'ok' : 'fail') +
      ' meta=' +
      metadata.listEntities().length
  );

  console.log('Demo completed successfully.');
}

main().catch(console.error);