# ADR 0033: ArkOrder’s runtime half belongs to ArkRun

- **Status:** Accepted (`XP03`)
- **Date:** 2026-08-31
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase XP / XP03 — where shadow, replay, provenance, and
  compare live
- **Amends:** none. Refines [ADR 0028](0028-arkorder-companion-isolation.md)
  (no bus in v0) and [ADR 0024](0024-arkrun-transport-ports.md) (ArkRun already
  owns runtime evidence)
- **Does not amend:** ADR 0026 waist; ADR 0016 no user predicates; no new skill
  names (ADR 0015). Does **not** close `K01` / `Z09`

## Context

Two adopters designed a runtime for ArkOrder because they could not find
`docs/arkorder.md`. They asked for shadow, replay, provenance, freshness, and
degraded mode. Most of the *pattern* vocabulary already ships (`IngestEscalate`,
`Projector`, `ProposeResult`). The remaining asks mix two planes.

ArkOrder is a library plus static sensors. Nothing can be “down”. A degraded-mode
contract would defend against an outage that cannot happen.

## Decision

**D1 — Runtime evidence is ArkRun.** Shadow, replay, provenance, and compare
land on `arkgate/runtime` (information package, inspector, in-memory compare).
They do not grow a bus, outbox, or hosted replay on `arkgate/order`.

**D2 — ArkOrder stays declarative.** ξ, `release` / `project` / `ingest` /
`proposeRelease`, and the `ARKORDER_*` sensors stay on the order extra. No
process, no listen, no durability claim.

**D3 — Information budget and sigma freshness stay ArkOrder.** They bound
*what a scale may observe* and *that ξ does not TTL*. That is pattern, not
transport.

**D4 — Escalation target (`human`) stays on `IngestEscalate`.** Cheap, and it
makes escalate mean “a variable or an authority is missing”.

**D5 — Reject degraded mode.** ArkOrder is not a service.

## Consequences

- XP07 (shadow / replay / compare) is an ArkRun in-memory API. Not Postgres.
  Not a second event bus. `K01` stays parked.
- XP04–XP06 are ArkOrder Domain types + sensors.
- Docs: [arkorder.md](../arkorder.md#runtime-half).
