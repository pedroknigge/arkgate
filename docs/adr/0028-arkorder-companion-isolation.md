# ADR 0028: ArkOrder plane isolation

- **Status:** Accepted (`OR01`); npm identity amended by [ADR 0030](0030-opt-in-extras-same-npm-package.md)
- **Date:** 2026-08-29
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase OR / OR01 — plane home vs gate extra vs ArkRun
  ([plan](../plans/arkorder/README.md))
- **Follows:** [ADR 0030](0030-opt-in-extras-same-npm-package.md) (one npm package),
  [ADR 0004](0004-runtime-package-isolation.md) (durability honesty; root export is gate)

## Context

ArkOrder must not collapse into the gate root or into ArkRun’s factory. It must also
not be a second npm package. Isolation here means **export path and factory**, not a
second tarball.

## Decisions

### D1 — Plane lives at `arkgate/order` inside package `arkgate`

Implementation compiles from `src/kernel/order/` into this package’s `dist/order`.
Public import:

```ts
import { createOrderPlane } from 'arkgate/order';
```

There is no `@arkgate/order` package and no `packages/order` publish. Enforced
`arkOrder` nextAction is “import and call `createOrderPlane` in `planeRoots`,” not
`npm i`.

Factory: `createOrderPlane`. Each call creates an isolated instance. A process-wide
`getPlane()` singleton is forbidden.

### D2 — Public brand ArkOrder; no new skill name

Public brand: **ArkOrder**. Import path: `arkgate/order`. Skill names stay the current
catalog; deepen `/ark-place`, `/ark-adopt`, `/ark-contract`. `/ark-order` is not a skill.

### D3 — Four verbs; no bus on this subpath

The subpath exports the operational-pattern plane:

- `release(xi, sigma)` — freeze, version, hash
- `project(release)` — derive allowed microstate + invalidations
- `ingest(event)` — absorb or escalate; never returns a new Release
- `proposeRelease(delta)` — blast radius; empty blast is a domain error

There is **no** `update()` / `patch()` / `set()` on the plane. v0 does **not** ship an
event bus, outbox, saga engine, inspector HTTP, Nest adapter, or cloud SDK. Those remain
ArkRun’s job (`arkgate/runtime` once PK restores it; residual `@arkgate/runtime` until then).

ξ schema is consumer-supplied. The plane does not know billing, construction, or any
industry pack.

### D4 — Instances remain reference-only; K01 stays parked

In-memory plane state is process-local and lost on restart. This train does not claim
production durability. `K01` stays parked.

### D5 — Domain stays plane-free

Domain-role layers must not import `arkgate/order`. `planeRoots` is an explicit
allowlist for `createOrderPlane` call sites (same shape as ArkRun `kernelRoots`).

## Consequences

- Isolation smoke (`OR02`) must prove: `import from 'arkgate'` exposes `createAICodeGate`
  and does **not** expose `createOrderPlane`. `import from 'arkgate/order'` does.
- Docs must not treat “ArkOrder seeded” as “durable pattern store shipped.”

## Alternatives considered

| Option | Why not |
|--------|---------|
| `@arkgate/order` companion package | Second org / second install — forbidden by ADR 0030 |
| Put Order inside `arkgate/runtime` | Collapses two jobs; hexagonal-order-api is a bus example |
| Export `createOrderPlane` from `arkgate` root | Opt-in becomes invisible; Domain imports get easier to get wrong |
| New skill `/ark-order` | Skill-name freeze; doors already exist |
| Process-wide `getPlane()` | Breaks test isolation; hides ownership |

## Related

- Extra plane: [ADR 0027](0027-arkorder-gated-extra-plane.md)
- Same-package extras: [ADR 0030](0030-opt-in-extras-same-npm-package.md)
- Anti-skip facts: [ADR 0029](0029-arkorder-anti-skip-facts.md)
