# @arkgate/runtime

**ArkRun** kernel — optional companion for **ArkGate**.

This package is the ArkRun implementation: an in-process kernel you construct with
`createStrictArkKernel`. It is **not** the `arkgate` write/CI gate. The stable `arkgate`
tarball does not bundle this kernel ([ADR 0004](https://github.com/pedroknigge/arkgate/blob/main/docs/adr/0004-runtime-package-isolation.md),
clarified by [ADR 0021](https://github.com/pedroknigge/arkgate/blob/main/docs/adr/0021-arkrun-companion-isolation.md)).

The `arkRun` extra on `ark.config.json` is a *gate* contract (kernel usage + declarations).
This package is the *kernel* that extra talks about. Installing the companion is optional;
an `enforced` extra requires it. Branding ArkRun is **not** a production-durability claim.

This package is not required by the `arkgate` CLI, MCP server, ESLint plugin, hooks, or
GitHub Action.

## Factory (per instance — no process-wide singleton)

```ts
import { createStrictArkKernel } from '@arkgate/runtime';

const ark = createStrictArkKernel();
```

`createStrictArkKernel` is the preferred ArkRun factory (`createArkKernel` and the
`*FromConfig` siblings remain admission factories). Each call creates an isolated instance.
There is no process-wide `getKernel()` singleton — the caller owns the instance it created.

## Interaction declarations

Managed components declare `uses`, `reactsTo`, `raises`, and `sends` on the registration
handle. Optional `extendedInfo` is tooling-only (diagrams / inspector) and is **not** a
gate verdict input.

```ts
const handle = ark.register({
  id: 'Application.PlaceOrder',
  lifetime: 'singleton',
  uses: ['Domain.OrderRepository'],
  reactsTo: ['Domain.Order.Cancelled'],
  raises: ['Domain.Order.Placed'],
  sends: ['Adapter.NotifyWarehouse'],
  factory: () => createPlaceOrder(),
});

const snapshot = ark.getDependencyInformationPackage();
```

`getDependencyInformationPackage()` is a JSON-serializable snapshot of ids, lifetime, and
declarations. It never includes factories, live instances, or input DTOs. Declarations are
optional on the companion for local experiments; an enforced `arkRun` extra still requires
them on the write/CI gate.

## Transport ports

One `send()` site chooses `local` (default), `localBlocking`, or `broker`. `ephemeral` defaults
**true**: `send()` waits until the local bus has recorded the event, or until a bound
broker adapter has accepted it (safe for CLI, tests, and short-lived workers). That wait
is **not** a durability claim. `local` does not wait for subscriber completion;
`localBlocking` does. `ephemeral: false` is the explicit fire-and-forget-after-handoff
opt-in (broker adapter accept is not awaited).

Broker adapters are **ports you inject**. This package does **not** ship cloud SDKs.
When no adapter is bound, `transport: 'broker'` falls back to **in-process local**
delivery — not cloud portability.

## Dev inspector

Opt-in localhost inspector. Default host is `127.0.0.1`. It refuses
`NODE_ENV=production` and will not bind public addresses (`0.0.0.0`, `::`).
HTTP is loaded only when you start it. `GET /snapshot` is the information
package plus transport facts (kinds, broker bound, no shipped cloud SDKs).
`GET /events` is SSE of the same snapshot.

```ts
const handle = await ark.startInspector();
// http://127.0.0.1:<port>/snapshot
await handle.close();
```

```ts
const ark = createStrictArkKernel({
  broker: {
    send(event) {
      // Consumer-owned handoff. Accepting is not downstream completion.
    },
  },
});

await ark.publisher('Application.PlaceOrder').send(OrderPlaced, { id: 'o1' }, {
  transport: 'broker',
});
```

Nest adapter:

```ts
import { ArkModule, InjectArk } from '@arkgate/runtime/nestjs';
```

Root `arkgate/runtime` and `arkgate/nestjs` forwarders were removed in ArkGate 4 (AR04).
Never import those shims.

## Experimental — not production durability

This package is configured for publication under the `experimental` npm tag, but it is not
currently present in the npm registry. The stable root release workflow publishes `arkgate`;
it does not publish this companion automatically. Built-in stores are **in-memory reference
only** — they lose state on restart and are **not** production durability. `K01` (in-process
commit gaps) stays parked.

Before use, read the canonical
[experimental surface policy](https://github.com/pedroknigge/arkgate/blob/main/docs/package-surface.md#experimental-opt-in-surfaces)
and [production hardening guide](https://github.com/pedroknigge/arkgate/blob/main/docs/production-hardening.md).

For source-checkout evaluation, run `npm run build:runtime` at the ArkGate root, then install the
local `packages/runtime` folder into the target project. Verify npm availability separately with
`npm view @arkgate/runtime dist-tags --json` before using a registry install command.
