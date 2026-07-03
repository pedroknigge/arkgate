# Ark Examples

## hexagonal-order-api/

Clonable order API with a real hexagonal layout (`domain` / `application` / `adapters`) governed by all three Ark gates: `ark-check` in CI, `ark-mcp` for agents, and the strict kernel runtime (intents, event contract, projection) at runtime. Has its own `package.json`; see [hexagonal-order-api/README.md](hexagonal-order-api/README.md).

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
