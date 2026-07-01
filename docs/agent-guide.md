# Ark — Agent Integration Guide

This guide describes how AI agents and codegen tools can safely interact with Ark.

## Contract Discovery

Prefer `createStrictArkKernel()` for strict projects. It wires the registry, graph,
policies, event bus, audit trail, event contracts, outbox, observability,
projections, metadata, workflow engine, and 11-layer architecture profile:

```ts
import {
  createStrictArkKernel,
} from 'ark-runtime-kernel';

const ark = createStrictArkKernel();
// ... define intents, event contracts, metadata, projections, and workflows through ark.*

const contract = ark.manifest().toJSON();
// contract.intents, policies, entities, graph, architecture, eventContracts,
// contract.observability, projections
```

Agents should read `contract` and `ark.observability.report()` before generating or modifying code.

## Naming Conventions

| Prefix | Layer | Example |
|--------|-------|---------|
| `Domain.*` | Domain events & entities | `Domain.Order.OrderPlaced` |
| `Application.*` | Use cases / orchestration | `Application.PlaceOrder` |
| `Adapter.Persistence.*` | Persistence adapters | `Adapter.Persistence.OrderRepo` |
| `Adapter.Integration.*` | External integrations | `Adapter.Integration.PaymentGateway.Charge` |
| `Workflow.*` | Sagas / long-running processes | `Workflow.OrderFulfillment` |
| `Job.*` | Background jobs / scheduling | `Job.InventoryRebuild` |
| `Presentation.*` | UI/API adapters | `Presentation.Api.PlaceOrder` |
| `Reporting.*` | Read models / projections | `Reporting.OrderSummary` |
| `Metadata.*` | Metadata and extension contracts | `Metadata.OrderSchema` |
| `Security.*`, `Audit.*`, `Observability.*` | Cross-cutting concerns | `Audit.OrderHistory` |
| `Kernel.*` | Ark-owned governance signals | `Kernel.PolicyViolation` |

Declare relationships at definition time:

```ts
registry.define('Application.PlaceOrder', {
  dependsOn: ['Domain.Order.OrderPlaced'],
  produces: ['Domain.Order.OrderPlaced'],
});
```

Strict kernels also enforce the **observed** producer→event layer flow at publish time
(`enforceObservedLayerFlow: 'hard'` by default). If a published event's real source and
intent cross a forbidden layer boundary — e.g. a `Adapter.Persistence.*` source producing
a `Domain.*` event — the publish throws `ObservedLayerFlowViolationError` before the event
reaches history, outbox, or subscribers. Use `'soft'` to record `layer.observedViolation`
trace/audit records without blocking, or `'off'` to disable. Agents should name the event's
`source` honestly: it is checked against the layer matrix, not just the intent name.

Strict kernels also require published events to have a registered source intent
and a matching event contract:

```ts
const OrderPlaced = registry.define<
  'Domain.Order.OrderPlaced',
  { orderId: string; amount: number }
>('Domain.Order.OrderPlaced');

registry.define('Application.PlaceOrder', {
  produces: ['Domain.Order.OrderPlaced'],
});

ark.eventContracts.register({
  intent: 'Domain.Order.OrderPlaced',
  version: '1',
  allowAdditionalFields: false,
  schema: {
    orderId: { type: 'string', required: true },
    amount: { type: 'number', required: true },
  },
});

await ark.eventBus.publish(OrderPlaced, { orderId: 'o1', amount: 99 }, {
  source: 'Application.PlaceOrder',
  eventVersion: '1',
});
```

Interceptors may enrich event payloads, but they must remain add-only:

```ts
ark.eventBus.registerInterceptor(OrderPlaced, ({ intercept }) => {
  intercept({ auditTag: 'checkout' });
}, 'audit-tag');
```

If an interceptor overwrites an existing field or violates the registered event
contract, Ark records `interceptor.error` and keeps delivering the original event.

## Code Generation Validation

Use `createAICodeGate()` before merging agent-generated source snippets:

```ts
const gate = createAICodeGate({
  intents: registry.list(),
  enforceIntentAllowlist: true,
  architectureProfile: elevenLayerProfile,
  extensions: [/* optional external AST analyzers implementing AIGateExtension */],
});

const result = gate.validate(generatedSource, {
  filePath: 'src/domain/order.ts',
  agentId: 'agent-1',
  layer: 'DomainModel',
});
if (!result.valid) {
  for (const v of result.violations) {
    console.log(v.code, v.message, v.suggestion);
  }
}
```

Violation codes: `FORBIDDEN_PATTERN`, `FORBIDDEN_SUBSTRING`, `POLICY_VIOLATION`, `UNKNOWN_INTENT`, `LAYER_REFERENCE_VIOLATION`, `EXTENSION_ERROR`.

Use `ark-check` in CI for repository-level checks that need real file paths:

```bash
npx ark-check --root . --config ark.config.json
```

Example config:

```json
{
  "include": ["src"],
  "layers": [
    {
      "name": "DomainModel",
      "patterns": ["src/domain/**"],
      "intentPrefixes": ["Domain."]
    },
    {
      "name": "PersistenceAdapters",
      "patterns": ["src/adapters/persistence/**"],
      "intentPrefixes": ["Adapter.Persistence."]
    },
    {
      "name": "ApplicationOrchestration",
      "patterns": ["src/application/**"],
      "intentPrefixes": ["Application."]
    }
  ],
  "rules": [
    {
      "from": "DomainModel",
      "to": "PersistenceAdapters",
      "allowed": false
    }
  ]
}
```

`ark-check` resolves imports through the TypeScript module resolver against your
`tsconfig.json` — relative, path-alias (e.g. `@infra/db`), and package imports — plus
string intent references. Pass `--tsconfig <path>` to point at a specific config
(otherwise the nearest `tsconfig.json` from `--root` is used). It resolves modules the way
your build does, but is intentionally not yet a full type-graph analyzer (cross-layer
type-only references beyond the import specifier are out of scope).

Use the optional ESLint plugin for fast local feedback:

```js
import ark from 'ark-runtime-kernel/eslint';

export default [
  ark.configs.recommended,
];
```

Rules: `ark/no-domain-infra-imports`, `ark/no-raw-event-publish`, and
`ark/require-publish-source`.

## Runtime Observability

The event bus exposes a standard trace format:

```ts
const bus = createEventBus({
  maxHistorySize: 1000,
  auditTrail,
  traceSinks: [(record) => otelBridge(record)],
  onSoftViolation: (result, event) => { /* advisory policies */ },
  onHandlerError: (err, event, intent) => { /* subscriber failures */ },
});

await bus.publish(intent, payload);
const trace = bus.getTrace();
// trace[].type includes 'event.published', 'event.intercepted',
// 'interceptor.error', 'policy.hardViolation', 'policy.softViolation', 'handler.error'
```

Native audit records are available through `auditTrail.query()`. Projection
state and checkpoints are available through `ProjectionRegistry`.

`ark.observability.report()` compares declared productions with observed runtime
flows. Use `observedButUndeclared` as a high-signal review queue for hidden coupling.

For tests, use `createArkTestHarness(ark)` to inspect events, traces, audit,
outbox, and observability snapshots without reaching into private internals.

## Extension Points (External Layers)

Implement these interfaces in **external** packages — not inside the Ark core:

| Interface | Purpose |
|-----------|---------|
| `AIGateExtension` | Plug in AST/semantic analyzers for codegen validation |
| `Policy` | Custom architectural rules via `definePolicy()` |
| `LayerFlowRule` | Layer isolation via `defineLayerPolicy()` |
| `WorkflowStore` | Persist workflow snapshots outside memory |
| `ReadModelStore` | Persist projection/read-model state outside memory |
| `AuditStore` | Persist audit records outside memory |
| `OutboxStore` | Persist event outbox records outside memory |
| `EventInterceptor` | Add-only event enrichment before delivery |

Preset: `elevenLayerProfile` plus `defineArchitectureProfilePolicy()` forbids invalid declared dependencies across the 11-layer profile. `architecturalPolicies.cleanArchitectureMatrix()` remains available for the older four-prefix model.

## Recommended Agent Workflow

1. **Read** manifest via `ark.manifest().toJSON()`
2. **Generate** code using registered intents, profiles, metadata, projections, and workflow definitions
3. **Validate snippets** with `createAICodeGate().validate(source, { layer })`
4. **Validate repository** with `ark-check --root . --config ark.config.json`
5. **Lint** with `ark-runtime-kernel/eslint` recommended rules
6. **Wire** relationships via `registry.define(..., { dependsOn, produces })`
7. **Register** event contracts before publishing in strict mode
8. **Observe** runtime via `bus.getTrace()`, `auditTrail.query()`, outbox records, projection checkpoints, and `ark.observability.report()`
