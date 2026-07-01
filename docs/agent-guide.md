# Ark — Agent Integration Guide

This guide describes how AI agents and codegen tools can safely interact with Ark.

## Contract Discovery

Use `createArkManifest()` to export the full architectural contract as JSON:

```ts
import {
  createArkManifest,
  createIntentRegistry,
  createDependencyGraph,
  syncRegistryToGraph,
  createMetadataRegistry,
  PolicyEngine,
} from 'ark';

const registry = createIntentRegistry();
// ... define intents with defineIntent via registry.define()

const graph = createDependencyGraph();
syncRegistryToGraph(registry, graph);

const manifest = createArkManifest({
  registry,
  graph,
  policyEngine: new PolicyEngine([/* policies */]),
  metadata: createMetadataRegistry(),
});

const contract = manifest.toJSON();
// contract.intents, contract.relationships, contract.policies, contract.entities, contract.graph
```

Agents should read `contract` before generating or modifying code.

## Naming Conventions

| Prefix | Layer | Example |
|--------|-------|---------|
| `Domain.*` | Domain events & entities | `Domain.Order.OrderPlaced` |
| `Application.*` | Use cases / orchestration | `Application.PlaceOrder` |
| `Adapter.*` | External integrations | `Adapter.PaymentGateway.Charge` |
| `Workflow.*` | Sagas / long-running processes | `Workflow.OrderFulfillment` |

Declare relationships at definition time:

```ts
registry.define('Application.PlaceOrder', {
  dependsOn: ['Domain.Order.OrderPlaced'],
  produces: ['Domain.Order.OrderPlaced'],
});
```

## Code Generation Validation

Use `createAICodeGate()` before merging agent-generated code:

```ts
const gate = createAICodeGate({
  intents: registry.list(),
  enforceIntentAllowlist: true,
  extensions: [/* optional external AST analyzers implementing AIGateExtension */],
});

const result = gate.validate(generatedSource, { filePath: 'src/order.ts', agentId: 'agent-1' });
if (!result.valid) {
  for (const v of result.violations) {
    console.log(v.code, v.message, v.suggestion);
  }
}
```

Violation codes: `FORBIDDEN_PATTERN`, `FORBIDDEN_SUBSTRING`, `POLICY_VIOLATION`, `UNKNOWN_INTENT`, `EXTENSION_ERROR`.

## Runtime Observability

The event bus exposes a standard trace format:

```ts
const bus = createEventBus({
  maxHistorySize: 1000,
  onSoftViolation: (result, event) => { /* advisory policies */ },
  onHandlerError: (err, event, intent) => { /* subscriber failures */ },
});

await bus.publish(intent, payload);
const trace = bus.getTrace();
// trace[].type: 'event.published' | 'policy.softViolation' | 'handler.error'
```

## Extension Points (External Layers)

Implement these interfaces in **external** packages — not inside the Ark core:

| Interface | Purpose |
|-----------|---------|
| `AIGateExtension` | Plug in AST/semantic analyzers for codegen validation |
| `Policy` | Custom architectural rules via `definePolicy()` |
| `LayerFlowRule` | Layer isolation via `defineLayerPolicy()` |

Preset: `architecturalPolicies.cleanArchitectureMatrix()` forbids invalid declared dependencies such as Domain→Adapter, Domain→Application, Adapter→Application, and Adapter→Domain. `layerIsolation()` is kept as a compatibility alias.

## Recommended Agent Workflow

1. **Read** manifest via `createArkManifest().toJSON()`
2. **Generate** code using intent creators and naming conventions
3. **Validate** with `createAICodeGate().validate()`
4. **Wire** relationships via `syncRegistryToGraph()`
5. **Observe** runtime via `bus.getTrace()` and `bus.getHistory()`
