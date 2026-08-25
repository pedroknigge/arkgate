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
