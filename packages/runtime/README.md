# @arkgate/runtime

Experimental, optional runtime companion for **ArkGate**. It is not required by the `arkgate`
CLI, MCP server, ESLint plugin, hooks, or GitHub Action.

This package is intentionally published under the `experimental` npm tag. Its in-memory stores
do not provide production durability. See the canonical repository documentation before use.

```ts
import { createStrictArkKernel } from '@arkgate/runtime';
```
