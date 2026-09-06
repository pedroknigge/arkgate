# ArkGate examples

**Write. Check. Ship.** When the agent writes a bad import, the write doesn’t land.

Copy a starter that matches what you are building — not your framework. Each one has
folders, a rules file, and a passing check. Stuck? Run status (`npx arkgate-check --doctor`)
and do action **#1**.

Contain the write. Guide the next step. Order leftover mess. That is **Contener · Guiar · Ordenar**.

## Starters

| Example | Shape | What it is |
|---------|-------|------------|
| [crud-product-starter](crud-product-starter/) | `crud-product` | Product with UI and stored data |
| [api-backend-starter](api-backend-starter/) | `api-backend` | API server without UI in this repo |
| [worker-pipeline-starter](worker-pipeline-starter/) | `worker-pipeline` | Background jobs, cron, queue workers |
| [multi-app-workspace-starter](multi-app-workspace-starter/) | `multi-app-workspace` | Several apps and shared packages in one repo |
| [vertical-slice-starter](vertical-slice-starter/) | `vertical-slice-product` | Feature-first slices (`features/*` + shared) |
| [ddd-context-starter](ddd-context-starter/) | `ddd-bounded-contexts` | Several product areas plus shared code |

Pick the closest, copy the folder, then:

```bash
npm install --save-dev arkgate@latest
npm pkg set scripts.check="ark-check --root . --config ark.config.json --strict-config"
npm run check
npx arkgate-check --doctor
```

The six starters are self-contained. CI copies each one outside this checkout and
checks it with npm, pnpm, and Yarn.

**Layers** stop a bad import. **ArkRules** is optional shape *inside* a folder — off
unless you turn it on.

## ArkOrder billing (optional extra — not a starter)

Not in the npm tarball. This is the proof demo for the optional ArkOrder extra:
the few big product choices (billing plan, not seat counts). Change those through
a valve — not a generic update.

| Example | What you see |
|---------|--------------|
| [arkorder-billing](arkorder-billing/) | `plan` / `cycle` / `tenancy` freeze; invoices and seats still flow; later plan change is `proposeRelease` then `apply` |

Clone the repo (or open the [GitHub tree](https://github.com/pedroknigge/arkgate/tree/main/examples/arkorder-billing)), copy the folder, rename the three keys to *your* product. Turn the extra on with `/ark-adopt`. Wire one candidate with `/ark-order`. Details: [ArkOrder](../docs/arkorder.md).

## Deeper demos (not starters)

**[hexagonal-order-api](hexagonal-order-api/)** — a runnable order API you can break on
purpose. New apps use `arkgate/runtime`. This folder still installs the leftover
local companion for the exercise.

**[basic/](basic/)** — maintainer demo of several kernel features together. Not a starter.

```bash
npx tsx examples/basic/index.ts
```
