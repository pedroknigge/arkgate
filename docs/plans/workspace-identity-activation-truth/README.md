# Workspace identity and activation truth

> **Plan, not implementation authority.** Code and executable schemas decide whether a claim is
> true. Hub: [AGENTS.md](../../../AGENTS.md) · [Roadmap](../../../ROADMAP.md) ·
> [MCP reference](../../agent-guide.md)

**Status:** Shipped in 4.2.0 (published)
**Slug:** `workspace-identity-activation-truth`
**Kind:** epic
**Owners:** ArkGate maintainers
**Last updated:** 2026-08-08
**Code paths:** `bin/ark-mcp-runtime.mjs`, `src/domain/`, `bin/lib/`, `templates/`, `tests/`

## Problem

ArkGate's MCP process binds one root and config at startup but does not prove that identity to
the caller. After a project switch without a host restart, Codex can receive valid-looking hashes,
placement guidance, Layers results, and ArkRules inventory from another project. An absolute path
outside the bound root becomes an unclassified `../other-project/...` path instead of a project
identity error. Project-scoped configuration on disk does not prove which process is active.
Separately, repositories pinned to different ArkGate versions share one optional Codex home skill
catalog: the last installer could downgrade it, while routine local upgrades rewrote identical
skill bodies just to refresh a version stamp.

## Outcome

Every MCP response identifies the canonical project and runtime that produced it. Generated host
integrations verify the active workspace before trusting a verdict. A mismatched root or config
fails before contract, golden-pattern, Layers, or ArkRules evidence can escape. Installer and
doctor copy distinguish configured files from a verified active runtime. Repository skill
catalogs stay isolated and content-addressed; the optional shared home catalog advances
monotonically across ArkGate 4.2.0+ installers. Pre-4.2 binaries cannot honor the new protocol
and must be upgraded before writing the optional home catalog.

## Users and success

- **Primary users:** teams using ArkGate from Codex or another MCP host across multiple projects.
- **Success:** a server for project A cannot return an authoritative result for project B.
- **Success:** a stale pre-identity server is detected as unsupported/stale, not silently trusted.
- **Success:** `graphOk`, coverage, analysis completeness, gate activation, and overall verdict are
  separate facts.
- **Success:** updating multiple repos on one machine does not rewrite unchanged skills, and a
  4.2.0+ installer cannot apply an older bundle over a newer shared home catalog.
- **Success:** the identity and multi-repo install contracts pass on Linux, macOS, and Windows;
  identity is stable per canonical local checkout, not promised to match across operating systems.
- **Non-goals:** automatic project switching; hard-write claims for Codex; runtime-kernel changes;
  proving arbitrary application behavior.

## Scope

| In 4.2.0 | Later / out |
|---|---|
| Stable project-identity schema and package export | Cross-machine or remote workspace identity |
| `ark_identity` exact-root handshake, project-bound `ark_manifest`, and identity envelopes | Automatic MCP `roots/list` retargeting |
| Canonical root/config containment and cross-project errors | General filesystem sandboxing |
| Honest check verdict and Codex activation/restart states | Claiming advisory MCP is a hard write gate |
| Safe compact Codex install/remove and partial-install recovery | Destructive rollback of customized host files |
| Repo-local skill idempotence and monotonic shared Codex skills | Automatic cross-repo dependency alignment |
| Layer-aware ArkRules inventory eligibility | New sensor families or automatic Shape refactors |
| Packed two-project regression and release evidence | Functional application testing |
| Linux/macOS/Windows portability smoke | Cross-machine identity equivalence |

## Public contract

```json
{
  "projectIdentity": {
    "schemaVersion": "1.0",
    "projectId": "sha256:<canonical-root+canonical-config>",
    "resolvedRoot": "/absolute/project",
    "resolvedConfigPath": "/absolute/project/ark.config.json",
    "arkgateVersion": "4.2.0",
    "contractHash": "stable-contract-hash",
    "contractSource": "project",
    "runtimeId": "process-specific-id",
    "processStartedAt": "2026-07-30T00:00:00.000Z"
  },
  "binding": {
    "status": "matched",
    "authoritative": true
  }
}
```

`projectId` is stable across process restarts and contract edits. `runtimeId` and
`processStartedAt` never enter deterministic policy/facts hashes.

MCP tools accept an additive shared input:

```json
{
  "project": {
    "expectedRoot": "/absolute/exact-project-root",
    "expectedProjectId": "optional"
  }
}
```

Mismatch returns `PROJECT_ROOT_MISMATCH` before project evidence. Calls without an expectation
remain callable for compatibility but return `binding.status = "unverified"` and
`authoritative = false`. The initial handshake requires the exact project root. A contained
descendant can become authoritative only on a later call that also supplies the project id from
that exact-root handshake.

After matching identity, callers read the authoritative contract with `ark_manifest` using the
same root + project id expectation. Standard MCP `resources/read` has no portable expectation
field, so `ark://manifest` remains compatibility-only and always unverified/non-authoritative.
Generated ArkGate instructions require this identity → manifest sequence.

## Engineering checklist

- [ ] Define and export the stable identity schema from the root package.
- [ ] Canonicalize root/config with real paths and reject config outside root.
- [ ] Add `ark_identity` and project-bound `ark_manifest`; include identity and binding on
  successful tools and errors. Keep `ark://manifest` compatibility reads always unverified.
- [ ] Reject cross-root file/change paths before placement, golden pattern, Layers, or ArkRules.
- [ ] Keep non-Ark external hook operations compatible; detect a distinct Ark root as mismatch.
- [ ] Split check output into identity, completeness, graph, coverage, gates, and overall verdict.
- [ ] Report Codex config as configured/restart-required until the live handshake matches.
- [ ] Make compact install/remove own `.codex/config.toml` safely and report partial installs.
- [ ] Keep repo skill catalogs isolated, skip stamp-only rewrites, and make the optional Codex
  home catalog monotonic across repositories whose writers use ArkGate 4.2.0+.
- [ ] Feed actual layer classification into rules inventory eligibility and suppress false
  controller/magic-constant pilots in Domain or technical contexts.
- [ ] Add source, generated-artifact, packed-consumer, symlink, monorepo, and stale-process tests.
- [ ] Run focused MCP identity and multi-repo installer tests on Linux, macOS, and Windows CI.
- [ ] Synchronize MCP/host docs, package surface, changelog, release notes, and version stamps.
- [ ] Pass the full release confidence, artifact, compatibility, security, and architecture gates.

## Acceptance

1. Server A plus `expectedRoot: B` returns `PROJECT_ROOT_MISMATCH` and no A contract evidence.
2. Project B paths sent to server A never become merely `governed:false`.
3. `--root A --config B/ark.config.json` is rejected.
4. Missing `ark_identity` in a stale process produces a restart/local-CLI instruction.
5. After restart, `ark_manifest`, check, placement, write preparation, and ArkRules expose the
   same project identity and a new runtime identity; `ark://manifest` remains non-authoritative.
6. An incomplete analysis, insufficient coverage, or unverified binding cannot produce an
   authoritative overall green verdict.
7. Codex install output says configured, not active, and gives the handshake as the next action.
8. Removing Codex integration deletes only an exact ArkGate-owned project binding and preserves
   customized TOML.
9. Rules inventory uses the governed layer as evidence; a Domain filename containing `handler`
   is not treated as a controller by name alone.
10. Installing the same skill body from a newer package leaves repo-local bytes unchanged; a
    4.2.0+ installer cannot apply an older package source over a newer managed
    `$CODEX_HOME/skills` entry, even with `--force`. Pre-4.2 writers are an explicit compatibility
    limit and emit an upgrade warning when the new installer owns the operation.
11. Native separator, canonical-root, and shared-home cases pass on Linux, macOS, and Windows.
12. The packed npm candidate reproduces all A/B cases under supported TypeScript versions.

## Compatibility and kill switch

- Inputs are additive; existing clients remain callable but unverified until they send identity.
- Canonical comparisons use `realpath`; the initial handshake requires the exact project root.
  Descendants inside that root require the matching project id, and disjoint roots are rejected.
- Absolute paths stay in local MCP output and are not telemetry fields.
- If a legitimate detached-root client cannot migrate immediately, it may opt into an explicitly
  named compatibility flag. Generated configurations never enable that flag.
- **Kill switch:** stop the release if any supported adapter can return project-specific evidence
  before the binding guard, or if the packed two-project fixture diverges from the source fixture.

## Promotion

When 4.2.0 is published, mark this plan `Shipped`, keep it as decision/evidence history, and make
[agent-guide.md](../../agent-guide.md) plus the exported schema the ongoing public authorities.

## Related

- Roadmap: [`WI01`](../../../ROADMAP.md#phase-wi--workspace-identity-and-activation-truth-420-corrective-minor)
- Decision: [ADR 0017](../../adr/0017-mcp-project-identity-binding.md)
- Shared catalog decision: [ADR 0018](../../adr/0018-shared-skill-catalogs-are-monotonic.md)
- Prior evidence work: [enforcement evidence and docs truth](../enforcement-evidence-and-docs-truth/README.md)
- Host setup: [AI gates](../../ai-gates.md)
- Package contract: [package surface](../../package-surface.md)
