# ADR 0032: Persistence writes go through an aggregate

- **Status:** Accepted (`AW01`)
- **Date:** 2026-08-30
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Patch **4.8.3** — one closed ArkRules structure sensor
- **Amends:** [ADR 0013](0013-arkrules-structural-sensors.md) D2 (closed sensor list)
- **Does not amend:** ADR 0009 capability ids; ADR 0016 no executable predicates;
  no new skill names (ADR 0015)

## Context

Layers stop Domain importing Infrastructure. ArkRun stops `new` of managed types.
Neither stops an Application / Feature file that imports Prisma/pg/Supabase and
calls `.insert()` / `.update()` / `INSERT INTO`. That write skips the aggregate.

Field demand: consumer frontier language (composition roots, adapters, aggregate-only
writes) without copying that app’s folder names.

## Decisions

### D1 — Closed sensor `writes-via-aggregate`

Additive to the ArkRules structure vocabulary. Default **advisory**. Promotable to
enforced (tier-1) like `thin-adapter`. Absence of the rule is silent.

### D2 — Direct evidence only

A governed file matches when **both** are present in that file:

1. Persistence driver/client import (same closed module family as capability
   `persistence` / existing IO hints).
2. A write token: `.insert(` / `.update(` / `.upsert(` / `.delete(` / `.create(` /
   `.createMany(` / `INSERT INTO` / `UPDATE … SET` / `DELETE FROM`.

No filename religion (`*.adapter.ts`, `Externals/`, `admission.ts`). No vendor
rename. Inference (“this looks like an aggregate”) never blocks.

### D3 — Scope is the layer that declared the rule

Templates enable it on **Application** (and **Features** in the vertical-slice
pack). Persistence-role layers do not declare it — adapters *are* the write
edge. Domain remains covered by import edges and `pure` / capability walls.

### D4 — Product sentence

Application use cases call a Domain aggregate. The aggregate uses a persistence
**port**. The adapter implements the port. A use-case that talks to the driver
is the skip.

## Consequences

- Starter `arkrules/ApplicationOrchestration.json` and vertical-slice
  `Features.json` ship the rule advisory.
- Skills `/ark-place` `/ark-adopt` `/ark-contract` name the skip; they never
  enforce. No `/ark-aggregate`.
- Does not close `Z09` / `K01`. Does not copy dcouplr layout.
