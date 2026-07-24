# ADR 0015: Migration workflows route through existing skills

- **Status:** Accepted (`AR14`)
- **Date:** 2026-07-24
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase AR / AR14 — brownfield rules migration skill routing
  ([plan](../plans/arkrules-evolution/README.md))

## Decision

Honor the skill-name freeze: **deepen, don't mint**. Vision workflows map onto existing skills:

| Vision | Routed to |
|--------|-----------|
| `/ark-migrate-inventory` | `ark-adopt` (+ coverage reporting) |
| `/ark-extract-rule` | `ark-fix` / `ark-loop` |
| `/ark-promote-rule` | `ark-contract` |
| `/ark-domain-richness` | `ark-architect` (+ `ark-explain`) |

Skills propose and guide; the gate's verdict is always the deterministic engine.
Extraction cards ride the existing `pilotLoop` (one pilot at a time, judgment-only).
