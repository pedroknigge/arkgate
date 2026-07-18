# @arkgate/runtime

Experimental, optional runtime companion for **ArkGate**. It is not required by the `arkgate`
CLI, MCP server, ESLint plugin, hooks, or GitHub Action.

This package is configured for publication under the `experimental` npm tag, but it is not
currently present in the npm registry. The stable root release workflow publishes `arkgate`; it
does not publish this companion automatically. Its in-memory stores do not provide production
durability. Before use, read the canonical
[experimental surface policy](https://github.com/pedroknigge/arkgate/blob/main/docs/package-surface.md#experimental-opt-in-surfaces)
and [production hardening guide](https://github.com/pedroknigge/arkgate/blob/main/docs/production-hardening.md).

For source-checkout evaluation, run `npm run build:runtime` at the ArkGate root, then install the
local `packages/runtime` folder into the target project. Verify npm availability separately with
`npm view @arkgate/runtime dist-tags --json` before using a registry install command.

```ts
import { createStrictArkKernel } from '@arkgate/runtime';
```
