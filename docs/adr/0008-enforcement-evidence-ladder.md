# ADR 0008: Enforcement claims require boundary-specific evidence

- **Status:** Accepted
- **Date:** 2026-07-15
- **Owner:** ArkGate maintainers
- **Decision scope:** Doctor and hook enforcement claims

## Context

A hook file on disk, an MCP registration, and a CI workflow answer different questions. Treating
any one as “enforcement active” creates a false guarantee when the host did not load the hook, the
agent skipped MCP, or branch protection did not require the CI status.

## Decision

- `doctor.writePath.enforcementState` is the schema-backed contract for local hook, advisory MCP,
  and CI/merge boundaries. `enforcementLadder` remains a compatibility projection.
- Every boundary exposes supported, analyzed, configured, installed, active, bypassable, required,
  and structured evidence state. Configuration text never proves package installation.
- Doctor leaves runtime activity/trust and required merge status `unverified` when local files
  cannot prove them. Opt-in provider evidence targets the default branch, not the current branch.
- `hard: true` is valid only inside an observed trusted hook invocation whose operation matches the
  host's covered surface. Other tools, direct filesystem edits, and human writes still rely on CI.
- A complete Codex `apply_patch` event may be atomically preflighted, but the Codex host profile
  remains bypassable/non-hard because not every Code Mode write dispatches the project hook.
- MCP remains advisory unless a future host makes invocation non-bypassable.

## Consequences

- Senior users can audit why a claim exists from evidence fields; casual users still get one
  concise status and next action.
- Installing more adapter files never silently strengthens the active-host guarantee.
- CI is the final cross-host repository boundary, but merge blocking is claimed only when external
  required-status state is independently verified.

## Related

- Project hub: [AGENTS.md](../../AGENTS.md)
- Phase T plan: [change-integrity-loop](../plans/change-integrity-loop/README.md)
- Atomic preflight: [ADR 0005](0005-atomic-change-preflight.md)
- Explicit convergence candidate: [ADR 0007](0007-convergence-uses-explicit-candidate.md)
