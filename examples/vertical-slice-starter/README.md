# vertical-slice-starter

**Archetype:** `vertical-slice-product` — organize by feature/use-case, not technical layer.

**Analogy:** Each dish (feature) is cooked end-to-end; shared utensils stay in the common drawer.

Phase-1 scaffold. Cross-feature imports are **blocked** by `peerIsolation` on the Features layer.

## Layout

```
src/
  features/
    auth/       one full feature slice
    greetings/  another slice (must not import auth)
  shared/       reusable primitives only
  lib/          infra clients (optional phase 2)
  app/          shell / routing (optional phase 2)
```

## Phase 1 layers

| Layer | Put here when you build… |
|-------|--------------------------|
| Features | Entire use-case (API, UI hooks, types) under `features/<name>/` |
| Shared | Buttons, formatters, types with no feature knowledge |
| Lib | DB/HTTP clients shared by many features |
| App | Routing and app shell |

## Three rules for your AI agent

1. **Never import `features/A` from `features/B`.** Extract to `shared/` or use events.
2. **Shared must not import Features.** Dependency points inward to shared/lib only.
3. **Do not weaken `ark.config.json` to pass.** Move or extract code instead.

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

Init elsewhere: `ark init --preset vertical-slice` or `ark init --archetype vertical-slice-product --yes`.
