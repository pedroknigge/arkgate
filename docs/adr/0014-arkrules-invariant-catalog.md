# ADR 0014: Invariant catalog, coverage evidence, and rule modes

- **Status:** Accepted (`AR09`–`AR11`)
- **Date:** 2026-07-24
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase AR / AR09–AR11 — Domain invariant catalog, coverage evidence,
  promotion ladder ([plan](../plans/arkrules-evolution/README.md))
- **Refines:** [ADR 0012](0012-arkrules-contract-composition.md)

## Decisions

### D1 — Invariants are contract data, never executable code

Domain ArkRules may declare `{ id, description, aggregate?, coverage?, mode }`. Catalog
entries are declarative; core does not evaluate arbitrary predicates.

### D2 — Coverage evidence order

1. Test title contains the invariant ID (project test globs).
2. Deterministic symbol match (`coverage.symbol`, e.g. `Order.ensureInvariants`).
Missing test globs → analysis `partial`, never covered. Uncovered → `INVARIANT_UNCOVERED`
(advisory by default; failsStrict only when mode is enforced).

### D3 — Rule modes and promotion

`mode: advisory | enforced` (default advisory). Advisory→enforced is strengthening;
enforced→advisory or delete is weakening (hash-bound ack). Promoting an uncovered invariant
is refused deterministically when the promotion gate is used.

### D4 — Freeze interop

ArkRule violations reuse `baselineKey(ruleId, file, …)` with stable arkrule ids.
