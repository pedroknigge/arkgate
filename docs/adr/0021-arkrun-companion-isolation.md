# ADR 0021: ArkRun companion isolation

- **Status:** Accepted (`RN01`)
- **Date:** 2026-08-24
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase RN / RN01 — kernel package home vs gate extra
  ([plan](../plans/arkrun/README.md))
- **Clarifies:** [ADR 0004](0004-runtime-package-isolation.md) — factory, brand, no
  singleton; durability honesty
- **Npm identity:** D1 import/`@arkgate/runtime` **package** is superseded by
  [ADR 0030](0030-opt-in-extras-same-npm-package.md). Target import is `arkgate/runtime`.

## Context

ADR 0004 keeps kernel **factories off the gate root export**. Phase RN adds a
**gate extra** (`arkRun`) that talks about kernel usage. Those two labels must not
collapse: putting `createStrictArkKernel` on `import from 'arkgate'` would hide opt-in;
calling the extra “experimental” would hide a stable contract behind store-durability
honesty. Npm identity is one package ([ADR 0030](0030-opt-in-extras-same-npm-package.md)).

## Decisions

### D1 — Kernel implementation stays off the gate **root** export

Target import is `arkgate/runtime` inside package `arkgate` ([ADR 0030](0030-opt-in-extras-same-npm-package.md)).
The extra does **not** nextAction `npm i @arkgate/runtime`. Root `import from 'arkgate'`
still must not export kernel factories. `@arkgate/runtime` as a second published package
is residual until the packaging-correction item ships.

### D2 — Public brand ArkRun; import path and skill name unchanged

Public brand: **ArkRun**. Target import path is `arkgate/runtime` ([ADR 0030](0030-opt-in-extras-same-npm-package.md)).
Skill name stays `/ark-runtime`. No new skill names (`/ark-run` is not a skill).
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
