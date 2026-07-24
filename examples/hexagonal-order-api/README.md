# hexagonal-order-api

A tiny but real order API with a hexagonal architecture, governed by Ark's three gates:

- **ark-check** — CI gate: static import analysis between layers.
- **ark-mcp** — AI gate: the same rules, exposed to coding agents via MCP.
- **Ark kernel runtime** — strict event bus, intent registry, event contracts, projections.

No application framework: the API uses `node:http`, the `arkgate` gate package, and the separate
experimental `@arkgate/runtime` companion.

From **arkgate@4.0**, root forwarders `arkgate/runtime` / `arkgate/nestjs` are **removed**
(AR04). This fixture imports **`@arkgate/runtime`** directly. It opts into
`safety.allowInMemory: true` because the stock kernel wires an InMemory outbox for local
exercises — **not** a production pattern.


## Optional ArkRules (4.0)

This exercise emphasizes **layer** edges (domain / application / adapters). From **arkgate@4.0**
you may also opt into **ArkRules** for intra-layer structure and invariant catalogs on the same
enforcement plane. Absence of `arkRules` does not change inter-layer verdicts. Residual labels:
`[Layer]` vs `[ArkRules]`. See [examples README](../README.md).

## Layout

```
src/
  domain/               DomainModel        — Order entity, OrderRepository port, intent name
  application/          Application        — PlaceOrder use case (depends on ports only)
  adapters/persistence/ PersistenceAdapters — in-memory OrderRepository implementation
  adapters/http/        PresentationAdapters — minimal node:http handler
  main.ts               composition root   — wires kernel, adapters, and use case
```

`ark.config.json` maps each folder to a layer and blocks the imports hexagonal
architecture forbids (domain → adapters, application → adapters, adapter → adapter, ...).

## Run it

The companion is not currently published to npm, so this repository example installs the built
local source package. From the ArkGate repository root:

```bash
npm install
npm run build:runtime
cd examples/hexagonal-order-api
npm install
npm install --no-save ../../packages/runtime
npm start
```

Then, in another terminal:

```bash
curl -s -X POST http://localhost:3000/orders \
  -H 'content-type: application/json' \
  -d '{"sku":"ARK-001","quantity":2,"amount":49.9}'
# -> {"orderId":"..."}

curl -s http://localhost:3000/orders/<orderId>
# -> read model served from the Ark projection, not from the repository
```

What happens on each POST:

1. The `PlaceOrder` use case builds the `Order` (domain invariants) and saves it through the repository port.
2. It publishes `Domain.Order.OrderPlaced` through a source-bound publisher (`source: Application.PlaceOrder`). The strict kernel validates the payload against the registered event contract (v1 schema) and the producer→event layer flow.
3. The kernel applies the `Orders` projection automatically; `GET /orders/:id` reads that projection.

## Gate 1: CI check

```bash
npm run check      # = npx ark-check --root . --config ark.config.json --strict-config
# ✔ Ark check passed.
```

Exits 0 when every import respects the layer rules. Add it to CI as-is.

## Break it on purpose

Each edit below makes `npm run check` fail with the exact violation shown. Revert the edit and it passes again.

**1. Import persistence from the domain** — add to the top of `src/domain/order.ts`:

```ts
import { createInMemoryOrderRepository } from '../adapters/persistence/in-memory-order-repository.js';
```

```
✖ LAYER_IMPORT_VIOLATION  src/domain/order.ts:1
  DomainModel → PersistenceAdapters  (src/adapters/persistence/in-memory-order-repository.ts)
  DomainModel must not import PersistenceAdapters.
```

**2. Skip the use case: HTTP adapter talks to persistence directly** — add to the top of `src/adapters/http/server.ts`:

```ts
import { createInMemoryOrderRepository } from '../persistence/in-memory-order-repository.js';
```

```
✖ LAYER_IMPORT_VIOLATION  src/adapters/http/server.ts:1
  PresentationAdapters → PersistenceAdapters  (src/adapters/persistence/in-memory-order-repository.ts)
  PresentationAdapters must not import PersistenceAdapters.
```

**3. Bypass the intent creator with a raw string publish** — in `src/application/place-order.ts`, replace `deps.publisher.publish(deps.orderPlaced, ...)` with a raw intent string:

```ts
await deps.publisher.publish('Domain.Order.OrderPlaced' as never, payload, { source: PLACE_ORDER });
```

```
✖ RAW_EVENT_PUBLISH  src/application/place-order.ts:25
  Publish through a registered intent creator; raw event objects or intent strings bypass Ark contracts and tooling.
```

**Bonus (runtime gate):** the kernel is strict by default — drop `amount` from the publish payload in the use case and the running server rejects the POST with an event-contract violation; no bad event ever reaches the read model.

## Gate 2: AI agents (ark-mcp)

Expose the same rules to coding agents so illegal code is rejected *before* it is written:

```bash
npx ark-mcp --root . --config ark.config.json
```

Register it as an MCP server in your agent and bind the write gate:

```bash
# Claude / Cursor / Codex / Grok (and CI templates) in one shot:
npx ark-check --install-agent-gates --tools claude,cursor,codex,grok
# or Claude only: claude mcp add ark -- npx ark-mcp --root . --config ark.config.json
```

See the [AI gates guide](../../docs/ai-gates.md) (includes Grok Build `.grok/` layout).
