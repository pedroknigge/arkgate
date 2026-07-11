# crud-product-starter

**Archetype:** `crud-product` — a product with UI and stored data (todo app, booking site, admin panel).

**Analogy:** A restaurant — recipes (domain), kitchen coordinator (application), waiters (presentation), suppliers (adapters).

This is a **phase-1 scaffold only**. For a runnable API with intentional break exercises, see [hexagonal-order-api](../hexagonal-order-api/).

## Layout

```
src/
  domain/         DomainModel — rules and repository ports (no database imports)
  application/    ApplicationOrchestration — use cases
  presentation/   PresentationAdapters — UI or page entrypoints
  adapters/       PersistenceAdapters — database or file implementations
```

## Phase 1 layers

| Layer | Put here when you build… |
|-------|--------------------------|
| DomainModel | Business rules, entity types, repository *interfaces* |
| ApplicationOrchestration | Use cases that coordinate the domain |
| PresentationAdapters | Pages, components, route handlers |
| PersistenceAdapters | SQL, ORM, file store — implements ports |

## Three rules for your AI agent

1. **No database or HTTP imports inside `domain/`.** Business rules stay pure.
2. **UI calls use cases, not repositories.** Presentation → application only.
3. **Do not weaken `structrail.config.json` to pass.** Fix imports or move files instead.

## Verify

After copying this folder to your project:

```bash
npm install
npm run check
# ✔ Structrail check passed.
```

`structrail` supplies the `structrail-check` CLI via `devDependencies`.

## Next steps

```bash
structrail init --archetype crud-product --yes    # if starting from an empty repo
structrail-check --doctor
structrail-check --install-agent-gates            # when using AI coding tools
```

Launch is **N/A** by design — add your framework (Next, Vite, etc.) in the presentation layer when ready.