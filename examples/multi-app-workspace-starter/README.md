# multi-app-workspace-starter

**Archetype:** `multi-app-workspace` — several deployable units in one repository.

**Analogy:** A mall with separate shops sharing utilities — each app is a tenant; shared packages hold domain and use cases.

Phase-1 scaffold only. Launch is **N/A** until you add a real framework per app.

## Layout

```
apps/
  web/              PresentationAdapters — deployable UI or API surface
packages/
  domain/           DomainModel — shared business types
  application/      ApplicationOrchestration — shared use cases
```

## Phase 1 layers

| Layer | Put here when you build… |
|-------|--------------------------|
| DomainModel | Shared entities in `packages/*/src/domain/` |
| ApplicationOrchestration | Shared use cases in `packages/*/src/application/` |
| PresentationAdapters | App entrypoints under `apps/*/src/pages/` or `components/` |
| PersistenceAdapters | Per-app or shared `adapters/` when you add storage |

## Three rules for your AI agent

1. **Apps do not import another app's internal folders.** Share via `packages/`.
2. **Classify every new top-level directory** with `/structrail-contract` before codegen spreads files.
3. **Do not weaken `structrail.config.json` to pass.** Extend `include` and layer patterns instead.

## Verify

```bash
npm install
npm run check
```

## Next steps

```bash
structrail init --archetype multi-app-workspace --yes
structrail-check --coverage
```