# ADR 0018: Shared skill catalogs are monotonic

- **Status:** Accepted (`WI01`)
- **Date:** 2026-07-30
- **Owner:** ArkGate maintainers
- **Decision scope:** multi-repository skill installation on one machine
  ([plan](../plans/workspace-identity-activation-truth/README.md))

## Context

One machine can contain repositories pinned to different ArkGate versions. Repository skill
catalogs are isolated by path, but the optional Codex home catalog is shared by every repository.
Two unsafe or noisy outcomes were possible:

1. a routine upgrade rewrote repository skills when only the generated ArkGate version stamp
   changed, even though the executable skill body was identical; and
2. an older repository using `--codex-home --force` could replace a newer managed home skill with
   its older bundled copy.

The package version that happened to run last must not decide the shared catalog's capability.
Conversely, a global catalog must not silently make a repository use another repository's MCP
root or architecture contract.

## Decision

- Repository catalogs remain repository-owned. Each repo may use the skill bodies bundled with
  its locally installed ArkGate version without changing another repo.
- Managed upgrade compares normalized skill content, not the generated ArkGate version stamp.
  An unchanged body is a no-op; metadata-only version changes do not rewrite the file.
- `$CODEX_HOME/skills` is one shared catalog. ArkGate installation is monotonic there: an older
  bundled skill cannot replace a newer managed skill, including when the caller passes `--force`.
- `$CODEX_HOME/skills/.arkgate-catalog.json` records the highest installed ArkGate version,
  Ark-managed names, and normalized content identities. The adjacent install lock serializes
  concurrent repositories.
- Before any shared skill write or retirement, ArkGate durably replaces
  `.arkgate-catalog.pending.json` with the incoming version and an ownership token. That pending
  version is a monotonic floor until the final catalog commits and the same installer
  ownership-safely removes the journal.
- Reinstalling identical content is idempotent. Customized files remain preserved unless the
  normal explicit force-replacement contract applies and the bundled source is not older.
- A newer catalog may remove a retired skill only when its bytes still match the prior
  Ark-managed identity. Customized retired skills are preserved and released from Ark ownership.
- Invalid catalog or pending-journal metadata fails safe and blocks shared-catalog mutation until
  repaired; it never becomes permission to downgrade or overwrite.
- A skill selects a workflow, not a project. Project-specific evidence still requires the
  `ark_identity` root/project-id handshake from ADR 0017.
- Version metadata remains diagnostic provenance; it is not, by itself, evidence that skill
  behavior is stale.

## Consequences

- Updating several repositories on one computer no longer causes stamp-only churn in every repo.
- Running an older project cannot downgrade the optional shared Codex skill catalog.
- If a process stops after changing skills but before committing the catalog, the durable journal
  keeps older repositories blocked. A same-version or newer rerun completes the catalog and
  removes only the journal token it owns.
- A newer package can still advance the shared catalog, and each repository can still retain its
  locally pinned catalog.
- `--force` is not a downgrade switch. A future explicit rollback feature would need a separately
  named, high-friction contract and tests.
- The installer must report scope, source/installed versions, and the reason when it skips a
  shared skill so users can distinguish idempotence, customization, and downgrade prevention.
- The metadata and lock are ArkGate-owned implementation state, not invocable skills.

## Related

- [ADR 0017 — MCP verdicts require explicit project identity](0017-mcp-project-identity-binding.md)
- [Workspace identity and activation truth](../plans/workspace-identity-activation-truth/README.md)
- [AI gates — Codex skill catalog](../ai-gates.md#codex-skill-catalog-skillmd-not-flat-prompts)
