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

const publisher = ark.publisher('Application.PlaceOrder');

await publisher.publish(OrderPlaced, { orderId: 'o1', amount: 99 }, {
  eventVersion: '1',
});
```

Agents should prefer `ark.publisher(sourceIntent).publish(...)` over direct
`eventBus.publish(...)`. Source-bound publishers stamp `metadata.source` internally and
reject attempts to override it with a different source.

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
import * as ts from 'typescript';

const gate = createAICodeGate({
  intents: registry.list(),
  enforceIntentAllowlist: true,
  architectureProfile: elevenLayerProfile,
  typescript: ts,
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

Passing the `typescript` module enables built-in AST checks for raw publish calls, missing
`metadata.source`, and source-layer mismatches. `ark-mcp` enables these checks
automatically when TypeScript is available.

Violation codes (from `createAICodeGate`): `RAW_EVENT_PUBLISH`, `PUBLISH_MISSING_SOURCE`, `PUBLISH_SOURCE_LAYER_MISMATCH`, `FORBIDDEN_PATTERN`, `FORBIDDEN_SUBSTRING`, `FORBIDDEN_IMPORT`, `POLICY_VIOLATION`, `UNKNOWN_INTENT`, `LAYER_REFERENCE_VIOLATION`, `EXTENSION_ERROR`, `AST_ANALYZER_ERROR`.

Use `ark-check` in CI for repository-level checks that need real file paths:

```bash
npx ark-check --root . --config ark.config.json
```

Agents can generate a config from the project's actual directory layout instead of inventing layer mappings:

```bash
npx ark-check --init
```

Or print the full 11-layer template to adapt manually:

```bash
npx ark-check --print-config eleven-layer
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
`tsconfig.json` — relative, path-alias (e.g. `@infra/db`), package imports, dynamic
`import()`, and `require()` — plus string intent references. It also flags raw
`publish()` calls, publish calls without `metadata.source`, and source intent literals
whose resolved layer differs from the publishing file layer. Pass `--tsconfig <path>` to point at a specific config
(otherwise the nearest `tsconfig.json` from `--root` is used). It resolves modules the way
your build does, but is intentionally not yet a full type-graph analyzer (cross-layer
type-only references beyond the import specifier are out of scope).

`ark-check --json` also reports `warnings` for incomplete governance coverage: missing
layers, unclassified included files, unmatched layer patterns, duplicate layers, and rules
that reference unknown layers. These are advisory by default. Use `--strict-config` once a
project is ready to fail CI on coverage gaps.

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
// trace[].type includes 'event.published', 'event.rawPublish', 'event.intercepted',
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

## Ports and Adapters

When generating adapter code, prefer ports with explicit ownership and allowlists:

```ts
const PaymentGateway = definePort<PaymentGatewayPort>('PaymentGateway', {
  ownerLayer: 'ApplicationOrchestration',
  intent: 'Application.Port.PaymentGateway',
  allowedAdapters: ['Adapter.Integration.StripePaymentGateway'],
});

createAdapter(PaymentGateway, stripeAdapter, {
  name: 'Adapter.Integration.StripePaymentGateway',
  layer: 'IntegrationAdapters',
  requiredKeys: ['charge'],
});
```

`createAdapter` rejects adapter names/intents not listed in `allowedAdapters`; use
`checkAdapterGovernance(adapter)` when a tool needs a non-throwing result.

Preset: `elevenLayerProfile` plus `defineArchitectureProfilePolicy()` forbids invalid declared dependencies across the 11-layer profile. `architecturalPolicies.cleanArchitectureMatrix()` remains available for the older four-prefix model.

## Write-Path Gate (MCP)

The strongest place to constrain an AI agent is the moment it writes a file, not after.
`ark-mcp` exposes Ark over MCP (zero dependencies, JSON-RPC over stdio) so a host can gate
the write path:

```bash
npx ark-mcp --root . --config ark.config.json [--manifest ark.manifest.json]
```

- **Resource `ark://manifest`** — contract discovery. Serve your exported
  `ark.manifest().toJSON()` via `--manifest`, or omit it to get the 11-layer profile
  (layers + rules) as the default contract.
- **Tool `validate_code`** — args `{ source, layer?, filePath? }`. Runs `createAICodeGate`
  against the profile and (when a manifest is provided) the registered intent allowlist.
  Returns `{ valid, violations, layer }`; `isError` is `true` when invalid. If `layer` is
  omitted it is inferred from `filePath` via the config's layer patterns.

For hook-based enforcement, `ark-mcp --hook` runs one-shot: it reads a PreToolUse payload
from stdin, validates the post-edit file content, and exits `2` with violations on stderr
to block the write (`0` to allow). Working Claude Code configuration
(`.claude/settings.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "npx ark-mcp --hook --root \"$CLAUDE_PROJECT_DIR\""
          }
        ]
      }
    ]
  }
}
```

Register the server itself in `.mcp.json` so the agent can read `ark://manifest` and call
`validate_code` on demand:

```json
{
  "mcpServers": {
    "ark": { "command": "npx", "args": ["ark-mcp", "--root", ".", "--config", "ark.config.json"] }
  }
}
```

This makes the manifest + AI gate an enforced checkpoint rather than a library the agent
must remember to call.

## Recommended Agent Workflow

1. **Read** manifest via `ark.manifest().toJSON()`
2. **Generate** code using registered intents, profiles, metadata, projections, and workflow definitions
3. **Validate snippets** with `createAICodeGate().validate(source, { layer })`
4. **Validate repository** with `ark-check --root . --config ark.config.json`
5. **Lint** with `ark-runtime-kernel/eslint` recommended rules
6. **Wire** relationships via `registry.define(..., { dependsOn, produces })`
7. **Register** event contracts before publishing in strict mode
8. **Observe** runtime via `bus.getTrace()`, `auditTrail.query()`, outbox records, projection checkpoints, and `ark.observability.report()`
