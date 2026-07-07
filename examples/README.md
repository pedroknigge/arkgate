# Ark Examples

Clone a starter that matches your **application shape** (archetype), not your framework.
Each gallery starter is a phase-1 scaffold with an enthusiast README, `ark.config.json`, and a
passing `ark-check --strict-config`. For deep teaching exercises, use `hexagonal-order-api`.

## Gallery starters (by archetype)

| Example | Archetype | What it is |
|---------|-----------|------------|
| [crud-product-starter](crud-product-starter/) | `crud-product` | Product with UI and stored data |
| [api-backend-starter](api-backend-starter/) | `api-backend` | API server without UI in this repo |
| [worker-pipeline-starter](worker-pipeline-starter/) | `worker-pipeline` | Background jobs, cron, queue workers |
| [multi-app-workspace-starter](multi-app-workspace-starter/) | `multi-app-workspace` | Several apps and shared packages in one repo |

Pick the closest shape, copy the directory, then run:

```bash
npm install      # installs ark-runtime-kernel → ark-check
npm run check    # inside the starter — must stay green
ark-check --doctor
```

`/ark-architect` points here in step 7 after it scaffolds phase-1 layers.

## hexagonal-order-api/

Clonable order API with a real hexagonal layout (`domain` / `application` / `adapters`) governed by all three Ark gates: `ark-check` in CI, `ark-mcp` for agents, and the strict kernel runtime (intents, event contract, projection) at runtime. Has its own `package.json`; see [hexagonal-order-api/README.md](hexagonal-order-api/README.md).

Use this when you need a **runnable** API and intentional “break it on purpose” exercises — not a minimal scaffold.

## basic/

Runnable demo that exercises multiple core features together:

- Intents
- Event Bus + attached policy enforcement
- Dependency Graph (Mermaid + edges)
- Metadata registry

To run (tsx recommended; examples are not emitted by the build):

```bash
npx tsx examples/basic/index.ts
```