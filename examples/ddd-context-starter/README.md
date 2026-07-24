# ddd-context-starter

**Archetype:** `ddd-bounded-contexts` — multiple business domains with a thin shared kernel.

**Analogy:** Separate city districts with a shared square; no tunnels between private basements.

Phase-1 scaffold. **Any import across bounded contexts is blocked** via `peerIsolation`
(same technical layer *and* cross-layer, e.g. billing application → identity domain).
Only SharedKernel and events/integration patterns may connect contexts.

## Layout

```
src/
  contexts/
    billing/
      domain/
      application/
    identity/
      domain/
      application/
  shared/
    kernel/
```

## Phase 1 layers

| Layer | Put here when you build… |
|-------|--------------------------|
| DomainModel | Entities and invariants under `contexts/<name>/domain` |
| ApplicationOrchestration | Use cases under `contexts/<name>/application` |
| SharedKernel | Truly shared types only (`shared/kernel`) |
| PersistenceAdapters / PresentationAdapters | Phase 2 per context |

## Three rules for your AI agent

1. **Contexts do not import each other** (any layer pair) — extract to shared kernel or use events.
2. **Domain must not use fetch/process/Date.now** — inject ports.
3. **Do not weaken `ark.config.json` to pass.** Integrate via events or shared kernel.

## Optional ArkRules (4.0)

This starter teaches **layers** (inter-layer edges). You may add opt-in **ArkRules**
(`arkRules` in `ark.config.json` + `arkrules/<Layer>.json`) for structure sensors and
domain invariants *inside* a layer. Start advisory; promote only with coverage.
Label residual `[Layer]` vs `[ArkRules]`. See [examples README](../README.md) and
[configuration — ArkRules](../../docs/configuration.md#arkrules-intra-layer-opt-in).

## Verify

```bash
npm install
npm run check
```

Init: `ark init --preset ddd-bounded-contexts` or `ark init --archetype ddd-bounded-contexts --yes`.
