# ADR 0026: The gate waist is facts in, one verdict out

- **Status:** Accepted (`WH01`)
- **Date:** 2026-08-27
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** what may grow inside the `arkgate` checker versus what stays at
  the agent edge
- **Refines:** [ADR 0002](0002-analysis-engine-ownership.md),
  [ADR 0011](0011-resolved-candidate-facts-boundary.md),
  [ADR 0016](0016-arkrules-no-executable-core.md)
- **Does not supersede:** [ADR 0020](0020-arkrun-gated-extra-plane.md)–[0024](0024-arkrun-transport-ports.md);
  [ADR 0021](0021-arkrun-companion-isolation.md) D4 (`K01` stays parked)

## Context

The product invariant is already: same tree + same candidate + same policy → same
verdict on every parity-capable adapter. That waist is small on purpose: versioned
config and resolved-candidate-facts in; one analysis-result out. Host adapters,
doctor, and skills sit around it.

The failure mode is treating those surroundings as a reason to grow a second
intelligence inside the checker — new advisory planes, invented residual so an
agent need not open a door, a second engine, or an LLM pass/fail. That fattening
is how the write/CI path stops being one check.

## Decision

### D1 — Named waist

The parity-capable gate waist is:

1. `ark.config.json` (optional extras stay silent when absent)
2. versioned resolved-candidate-facts ([ADR 0011](0011-resolved-candidate-facts-boundary.md))
3. `analyzeResolvedProject` / preflight → analysis-result (one `valid`)

CLI, MCP, hook, ESLint, and CI are adapters around that waist, not additional
verdict authorities.

### D2 — Advisory is projection, not a second check

Doctor, status, and report advisory surfaces (compass, coach, smells, cohesion,
ArkRun residual, and anything like them) must project facts the engine already
has. They stay `notAScore`, never flip `valid` / strict-merge / `goal.met`, and
are not a reason to add a new skill name or a new sensor vocabulary.

A new advisory section requires an existing evidence source. It must not be added
to compensate for an agent skipping a door or skill.

### D3 — Intelligence stays at the edge

Skills and the five doors remain the place for design judgment. The CLI is a
sensor plus the gate. This ADR does **not** move shipped doctor sections out of
the binary (the 30-day explore/compass freeze still holds). It forbids *new*
verdict-like intelligence in the checker as a substitute for those edges.

### D4 — A second implementation is not this item

The schemas are the protocol. A second independent checker is out of scope until
field demand exists. Conformance fixtures for facts→verdict are a later item, not
`WH01`.

## Consequences

- ROADMAP freeze: do not start an epic whose primary deliverable is a new doctor
  advisory plane or a second analysis engine.
- `K01` / ArkRun durability remains parked (ADR 0021 D4). This ADR does not
  authorize a smarter kernel.
- Package-surface names the waist in one short box. Product voice restates that
  advisory projects facts and is not the check.

## Alternatives considered

| Option | Why not |
|--------|---------|
| Second checker now | No field demand; one reference implementation is enough until then |
| Move compass/coach out of doctor | Violates the explore/compass freeze; shipped surface |
| Leave the waist implicit | The next epic will fatten doctor because “the agent will not open the skill” |
