# ADR 0013: Intra-layer structural sensors are resolver facts, not style lint

- **Status:** Accepted (`AR05`–`AR07`)
- **Date:** 2026-07-24
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase AR / AR05–AR07 — class-shape facts and closed sensor vocabulary
  ([plan](../plans/arkrules-evolution/README.md))
- **Refines:** [ADR 0011](0011-resolved-candidate-facts-boundary.md), [ADR 0012](0012-arkrules-contract-composition.md)

## Context

ArkRules structure sensors must block on deterministic evidence, not style opinion. Inference
(anemic-model heuristics) may advise forever but never promote to enforced.

## Decisions

### D1 — Class-shape facts extend resolved candidate facts (1.1)

Additive `classShapes[]` on resolved facts schema `1.0 → 1.1`: exported classes, public mutable
fields/setters, constructor/factory shape, mutating methods and whether they reference a
guard/publish symbol. Tooling extracts; Kernel classifies against the Effective Contract.

### D2 — Closed sensor vocabulary

| Sensor | Tier | Blocking when enforced |
|--------|------|------------------------|
| `aggregate-private-state` | 1 | Public mutable fields / public setters |
| `always-valid-factory` | 1 | Public ctor without static factory pattern |
| `domain-event-on-mutation` | 1 | Mutating method without guard/publish reference |
| `orchestration-only` | 1 | Application-layer domain branching (conservative) |
| `thin-adapter` | 1 | Adapter exceeds thin shape |
| `no-anemic-model` | 2 | Advisory only, never promotable |
| `invariant-coverage` | 1 | Catalog entry lacks coverage evidence |

### D3 — Direct evidence blocks; inference advises

Tier-1 sensors use class-shape / file facts. Tier-2 is advisory forever. Incomplete analysis
reports `partial` and never fakes green for enforced rules.

## Consequences

- Sensors emit `ARKRULE_STRUCTURE` (or sensor-specific codes) with `arkruleId` / `arkruleSource`.
- Core is not a general linter or executable rules engine (ADR 0016).
