# ADR 0021: ArkRun companion isolation

- **Status:** Accepted (`RN01`)
- **Date:** 2026-08-24
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase RN / RN01 — kernel package home vs gate extra
  ([plan](../plans/arkrun/README.md))
- **Clarifies:** [ADR 0004](0004-runtime-package-isolation.md) — isolation is **not**
  superseded

## Context

ADR 0004 keeps the optional runtime out of the stable `arkgate` tarball. Phase RN adds a
**gate extra** (`arkRun`) that talks about kernel usage. Those two labels must not collapse:
shipping buses, inspectors, or stores inside `arkgate` would invert the package wedge;
calling the extra “experimental” would hide a stable contract behind store-durability
honesty.

## Decisions

### D1 — Kernel implementation stays in `@arkgate/runtime`

`@arkgate/runtime` remains the only implementation home. `arkgate` does not bundle buses,
inspectors, stores, or kernel factories. Root `arkgate/runtime` / `arkgate/nestjs`
forwarders stay removed (AR04). The extra **requires** the companion when `mode` is
`enforced` (fail closed with `nextAction` to install / import from `@arkgate/runtime` —
never from a removed shim).

### D2 — Public brand ArkRun; import path and skill name unchanged

Public brand: **ArkRun**. Import path stays `@arkgate/runtime` (no new npm name in this
train). Skill name stays `/ark-runtime`. No new skill names (`/ark-run` is not a skill).
`/ark-place` and `/ark-adopt` may be deepened later (`RN15`); they still do not enforce.

### D3 — Per-instance factory; no process-wide singleton

`createStrictArkKernel` (and `createArkKernel` / `*FromConfig` siblings) stay the
admission factories. Each call creates an isolated instance. A process-wide `getKernel()`
singleton is forbidden.

### D4 — Stores remain reference-only; K01 stays parked

In-memory stores remain process-local references that lose state on restart. Production
durability still requires the [hardening checklist](../production-hardening.md) and is
**not** claimed by this train. `K01` stays parked. JSDoc and hardening docs keep that
honesty.

## Consequences

- ADR 0004 isolation continues: extra = stable contract (ADR 0020); stores = still not
  production-durable.
- Companion branding and public kernel DX are `RN09`+; they must not pull kernel code
  into the gate tarball.
- Docs must not treat “ArkRun shipped” as “durable kernel shipped.”

## Alternatives considered

| Option | Why not |
|--------|---------|
| Bundle the kernel into `arkgate` | Violates ADR 0004; inflates the gate tarball |
| New npm name (`arkrun`) this train | Splits identity; import and skill freeze |
| Process-wide kernel singleton | Breaks test isolation; hides ownership |

## Related

- Extra plane: [ADR 0020](0020-arkrun-gated-extra-plane.md)
- Package surface: [package-surface.md](../package-surface.md#experimental-opt-in-surfaces)
