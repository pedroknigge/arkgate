# ADR 0016: Executable evaluator stays out of core

- **Status:** Accepted (`AR18`)
- **Date:** 2026-07-24
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase AR / AR18 — hard line against executable predicates in core
  ([plan](../plans/arkrules-evolution/README.md))

## Decision

A minimal pure predicate evaluator (if ever) is a companion/experimental surface behind
ADR 0004. Core enforcement mechanisms remain:

1. Structural sensors (closed vocabulary, class-shape facts)
2. Declared invariant catalogs
3. Test-coverage / symbol evidence

No LLM pass/fail; no arbitrary user code execution in the gate path.

## Consequences

- Docs lanes (configuration, agent-guide, brownfield) describe ArkRules as data + sensors.
- Case studies publish migration progress as honest counts (inventoried / under contract / frozen).
