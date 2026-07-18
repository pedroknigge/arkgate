# ADR 0005: Atomic change preflight is a distinct read-only operation

- **Status:** Accepted
- **Date:** 2026-07-15
- **Owner:** ArkGate maintainers
- **Decision scope:** Kernel change transaction, CLI/MCP adapter contract

> **Refined by [ADR 0011](0011-resolved-candidate-facts-boundary.md):** atomicity, read-only
> behavior, hashes, and adapter names remain unchanged. `preflightChange` becomes the lexical
> compatibility operation; `preflightResolvedChange` evaluates validated base/candidate facts and
> is the parity-capable Kernel surface used by shipped CLI/MCP adapters.

## Context

`ark_prepare_write` validates one proposed source file. A real architecture source change may create,
update, and delete several files whose forbidden edge or cycle exists only when the whole set is
considered. Extending the single-file tool with an optional batch mode would give one name two
different commit and evidence contracts.

## Decision

ArkGate exposes one distinct atomic preflight over the canonical in-memory engine:

- Kernel `preflightChange(...)` accepts the supplied base files plus the complete
  `{ path, content } | { path, delete: true }` set.
- CLI `ark preflight --changes <change-set.json> --json` and MCP `ark_prepare_change` are adapters
  over the generated bundle of that same function.
- The operation normalizes paths, rejects duplicate paths, missing delete targets, lexical escapes,
  symlink escapes, and paths outside the configured governed production-source scope, then
  evaluates the complete candidate graph once.
- The result is schema `1.0`, always declares `readOnly: true`, and returns policy/compiler/base-tree/
  candidate-tree fingerprints plus before/candidate content fingerprints per changed file.
- A rejected operation writes no project file. The host may apply the whole candidate only after a
  valid result; the normal strict `ark-check` remains the final merge authority.

The fingerprints use the portable deterministic identity algorithm already defined by ADR 0002;
they detect stale or mismatched candidates but are not presented as cryptographic signatures.

## Consequences

- Single-file preparation remains backwards-compatible and optimized for placement/autopatch.
- MCP-only availability remains advisory because calling the tool is a host behavior, not a trusted
  write boundary.
- CLI, MCP, and package consumers receive the same operation classification, graph findings, and
  fingerprints from one Kernel source and its checked generated artifact.
- Future change-map input can compose with this batch operation without making planning mandatory.
