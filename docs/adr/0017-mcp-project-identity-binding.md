# ADR 0017: MCP verdicts require explicit project identity

- **Status:** Accepted (`WI01`)
- **Date:** 2026-07-30
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** MCP project binding, runtime activation, Layers and ArkRules evidence
  ([plan](../plans/workspace-identity-activation-truth/README.md))

## Context

An MCP process keeps the root and architecture config it loaded at startup. Project-scoped host
configuration changes only the next process; it does not retarget one already running. Without a
caller-visible identity, a stale process can return valid-looking evidence from another project.
Paths outside its root then appear unclassified rather than mismatched.

Host workspace discovery is not a sufficient contract: hosts differ, explicit detached roots are
legitimate, and input-driven automatic retargeting would let an untrusted path select another
architecture policy.

## Decision

- Canonical project identity is the stable hash of the real project root and real config path.
  Contract hashes and process-specific runtime identity are separate fields.
- Every project-bound MCP tool success and error carries the same identity envelope.
- `ark_identity` verifies a caller's `expectedRoot` and optional `expectedProjectId`.
- The initial handshake requires the exact canonical project root. A contained descendant can
  become authoritative only when the caller also supplies the matching project id returned by a
  prior exact-root handshake.
- `ark_manifest` is the authoritative contract-discovery surface after binding.
- Standard MCP `resources/read` has no portable project-expectation field. The retained
  `ark://manifest` compatibility resource therefore always returns `unverified`,
  non-authoritative evidence, even if a client adds a non-standard project field.
- A matching expectation is required for an authoritative MCP verdict. Legacy calls remain
  callable but are explicitly `unverified` and non-authoritative.
- A mismatched expected root, project id, config outside root, or project-bound absolute path
  outside root fails before ArkGate returns golden-pattern, Layers, or ArkRules evidence.
- The server never retargets itself from tool input. Disjoint projects use disjoint processes.
- Symlinks are compared through canonical real paths.
- Runtime id and start time never enter deterministic policy, facts, candidate-tree, or project
  hashes.
- Absolute paths are local diagnostic evidence and are not telemetry fields.

## Consequences

- A stale project-A process cannot paint project B green or coach it using A's pattern.
- Generated host instructions must handshake before using project-bound MCP tools, read the
  contract through `ark_manifest`, and treat a missing identity/manifest tool as an old process
  that needs restart or local-CLI fallback.
- Codex remains advisory at write time. Identity proves which advisor answered, not that every
  write passed through it.
- Layers and ArkRules share this precondition; neither plane invents a separate identity rule.
- The new schema/tool and additive result envelope require a backward-compatible corrective minor.

## Related

- [ADR 0008 — enforcement evidence ladder](0008-enforcement-evidence-ladder.md)
- [ADR 0011 — resolved candidate facts](0011-resolved-candidate-facts-boundary.md)
- [Workspace identity plan](../plans/workspace-identity-activation-truth/README.md)
