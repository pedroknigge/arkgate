# api-backend-starter

**Archetype:** `api-backend` — a server that exposes an API; no UI in this repository.

**Analogy:** A kitchen that only serves through a window — rules and coordination inside, orders in and out through adapters.

Phase-1 scaffold only. Launch is **N/A** until you wire a real HTTP server.

## Layout

```
src/
  domain/         DomainModel — entities and repository ports
  application/    ApplicationOrchestration — use cases
  http/           PresentationAdapters — routes and controllers
  adapters/       PersistenceAdapters — database implementations
```

## Phase 1 layers

| Layer | Put here when you build… |
|-------|--------------------------|
| DomainModel | Entities, invariants, repository interfaces |
| ApplicationOrchestration | Use cases (get user, place order, …) |
| PresentationAdapters | Route handlers, controllers, OpenAPI glue |
| PersistenceAdapters | ORM, SQL client, external API clients |

## Three rules for your AI agent

1. **Route handlers do not import the database.** Call a use case instead.
2. **Domain code must not know HTTP status codes.** Keep that in presentation.
3. **Do not weaken `structrail.config.json` to pass.** Move code to the correct layer.

## Verify

```bash
npm install
npm run check
```

## Next steps

```bash
structrail init --archetype api-backend --yes
structrail-check --doctor
```