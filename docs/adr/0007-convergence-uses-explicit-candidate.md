# ADR 0007: Structural convergence uses the explicit preflight candidate

- **Status:** Accepted
- **Date:** 2026-07-14
- **Owner:** ArkGate maintainers
- **Decision scope:** Change-map convergence base, candidate, and completion semantics

## Context

Convergence needs a deterministic definition of “actual change.” Inferring a Git ref, working-tree
diff, task state, or natural-language completion would make the result environment-dependent and
would duplicate the atomic preflight scanner.

## Decision

- Map-enabled `preflightChange(...)` compares the map with the same complete create/update/delete
  candidate already evaluated by atomic preflight.
- Programmatic callers supply base files explicitly. CLI and MCP adapters use the governed project
  tree at invocation time as that base. No Git ref or implicit working-tree diff is consulted.
- The canonical base and candidate analysis IR provides dependency edges; adapters contain no
  separate convergence scanner or verdict logic.
- Results classify every declared file/edge and relevant actual impact as `satisfied`, `missing`,
  `contradictory`, or `unplanned`. Missing, contradictory, or unplanned findings invalidate the
  preflight even when architecture rules otherwise pass.
- The result is always `readOnly: true` and `behavioralCompletion: "not-evaluated"`. Structural
  convergence never means that requirements or acceptance tests passed.
- Omitting the map preserves the T02 preflight result and requires no project artifact.

## Consequences

- The map hash, policy hash, base/candidate tree hashes, and findings reproduce one verdict without
  prompt context or an LLM.
- Callers that need another baseline must supply that tree as programmatic input or invoke the
  adapter against that project state; ArkGate does not guess a revision.
- Applying the candidate remains the host's responsibility after a green read-only result.

## Related

- Project hub: [AGENTS.md](../../AGENTS.md)
- Phase T plan: [change-integrity-loop](../plans/change-integrity-loop/README.md)
- Atomic preflight: [ADR 0005](0005-atomic-change-preflight.md)
- Optional change map: [ADR 0006](0006-optional-architecture-change-map.md)
