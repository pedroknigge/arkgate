# Reference: archetypes and presets

Authoritative source: `templates/architecture-playbook.json` (shipped in the npm package).

## Archetypes (application shape)

| Id | Shape | Default preset |
|----|-------|----------------|
| `crud-product` | UI + stored data | `hexagonal` |
| `api-backend` | API server, no UI in repo | `hexagonal` |
| `frontend-surface` | UI-heavy; backend elsewhere | `layered` / `feature-sliced` |
| `library-sdk` | Publishable package | `layered` |
| `cli-utility` | Command-line tool | `layered` |
| `worker-pipeline` | Background jobs | `hexagonal` |
| `event-coordinator` | Multi-step processes | `hexagonal` |
| `integration-bridge` | System glue | `hexagonal` |
| `multi-app-workspace` | Monorepo | `monorepo` |
| `prototype-spike` | Quick experiment | `layered` |

## Named presets

| Preset | Policy pack |
|--------|-------------|
| `hexagonal` | `enthusiast-hexagonal` |
| `layered` | `enthusiast-layered` |
| `feature-sliced` | `enthusiast-feature-sliced` |
| `monorepo` | `enthusiast-monorepo` |

## Gallery mapping

| Archetype | Starter |
|-----------|---------|
| `crud-product` | `examples/crud-product-starter/` |
| `api-backend` | `examples/api-backend-starter/` |
| `worker-pipeline` | `examples/worker-pipeline-starter/` |
| `multi-app-workspace` | `examples/multi-app-workspace-starter/` |