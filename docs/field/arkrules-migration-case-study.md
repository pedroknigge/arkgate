# ArkRules migration case study (AR16 / AR18)

> **Anonymized field pilot.** Adopter never named. Evidence shape only.

## Scenario

A consented brownfield TypeScript API had business validation in controllers, magic
constants for pricing floors, and several data-only entity classes. Inter-layer ArkGate
was already green (imports/capabilities). Intra-layer rules were invisible.

## Path executed

1. **Inventory** — `ark-check --rules-inventory --json` on the corpus reproduced:
   - validation-in-controller candidates (direct-evidence)
   - magic-business-constant candidates (heuristic)
   - anemic-entity candidates (heuristic)
2. **One extraction** — pilotLoop card moved the first validation into Domain +
   `arkrules/DomainModel.json` invariant `INV-EXTRACT-1` with a covering test title.
3. **Promotion** — after coverage evidence, mode `advisory → enforced` (strengthening
   policy-delta; no ack required).
4. **Residual** — remaining inventory candidates stayed inventoried; none frozen unless
   the team opted into `.ark-baseline.json`. Doctor reported honest counts:
   `inventoried / under-contract / frozen` (not a score).

## Outcome

- Gate green with residual reported honestly.
- No codemod; no new skill names; same MCP/CLI/hook plane.
- Executable predicate engine not used (ADR 0016).

## Reproduce (fixture shape)

See unit fixtures in `tests/unit/domain/rulesInventory.test.ts` and
`tests/unit/domain/invariantCoverage.test.ts` for deterministic sensors/coverage.
