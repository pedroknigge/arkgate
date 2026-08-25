# ADR 0023: ArkRun mandatory declarations

- **Status:** Accepted (`RN01`)
- **Date:** 2026-08-24
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase RN / RN01 — interaction declarations required by the gate
  ([plan](../plans/arkrun/README.md))
- **Refines:** [ADR 0020](0020-arkrun-gated-extra-plane.md),
  [ADR 0022](0022-arkrun-anti-skip-facts.md)

## Context

Runtime delivery can succeed without a complete declare-what-you-do list. Agents then emit,
handle, and resolve names that never appear on the registration handle. Drift between
`defineIntent` / observed calls and declared interactions stays a runtime-only concern
unless the **gate** requires the list.

## Decisions

### D1 — Four declaration fields; names locked

Every managed component declares `uses`, `reactsTo`, `raises`, `sends`. Those names are
locked in the schema. Runtime delivery may work without them; **the gate does not** when
ArkRun is enforced (`requireDeclarations: true` in the extra; default true when the extra
is present unless a later schema item records otherwise).

### D2 — Call-site names are a subset of the declaration

Call-site literals and `defineIntent` names must be a subset of the matching declaration.
Undeclared emit / handle / depend fails when enforced (`arkrun-undeclared-emit` /
`arkrun-undeclared-handle` / `arkrun-undeclared-depend`). Extra declared names with no
call site are not a blocker in v1 (honesty of unused declarations is doctor residual, not
merge teeth).

### D3 — `extendedInfo` is tooling-only

Optional `extendedInfo` (`label`, `architectureKind`, `tags`, `group`, `metadata`) is
**not** required for the verdict. It is tooling data for diagrams, graph slices, and the
serializable information package (`RN10` / `RN13`). Absence of `extendedInfo` changes no
gate result.

### D4 — Information package must not leak factories

When the companion later exposes `getDependencyInformationPackage()` (`RN10`), the snapshot
is serializable ids, lifetime, and declarations — **no** factories, live instances, or
input DTOs. That companion API does not replace this gate rule.

### D5 — Mechanical-safe exception is declaration-list only

Adding a missing declaration string is mechanical-safe **only** when the call-site literal
already exists and the edit is the declaration list. Inventing a new emit/handle/depend, or
rewiring construction, remains `judgment` / `neverMechanicalSafe`.

## Consequences

- Sensors in ADR 0022 consume these fields; catalog copy (`RN05`) points at the matching
  declaration.
- Companion kernel DX (`RN10`) may accept registrations without declarations for local
  experiments; enforced ArkRun on the gate still fails those files.
- No executable user predicates in the gate (ADR 0016).

## Alternatives considered

| Option | Why not |
|--------|---------|
| Runtime-only drift reporter | Agents skip it; the write gate stays green |
| Require `extendedInfo` for the verdict | Diagram labels are not architecture evidence |
| Infer declarations from call sites | Silent contract; freeze keys would churn |

## Related

- Anti-skip facts: [ADR 0022](0022-arkrun-anti-skip-facts.md)
- No executable core: [ADR 0016](0016-arkrules-no-executable-core.md)
