# ADR 0019 — Codex hard write is operation-scoped

- **Status:** Accepted
- **Date:** 2026-08-18
- **Supersedes:** the Codex write-time classification in [ADR 0017](0017-mcp-project-identity-binding.md)

## Context

ArkGate historically classified OpenAI Codex as advisory at write time. That was accurate while
Codex hooks did not cover the native patch handler and while the project could not prove that a
candidate passed through `PreToolUse`.

Current Codex documentation defines lifecycle hooks as a stable local surface. `PreToolUse`
receives local `apply_patch` calls with the patch body in `tool_input.command` and can stop the
tool before execution through `permissionDecision: "deny"`, legacy `decision: "block"`, or exit
code `2`. Codex CLI and local ChatGPT Desktop/App Server share this local hook engine.

The same documentation keeps an explicit limit: hosted tools do not use the local function-tool
hook path, and specialized paths may opt out. Project hooks also require project trust plus trust
for the exact hook definition.

## Decision

ArkGate treats a Codex `apply_patch` as a hard local write boundary only when all of these facts
hold:

1. the installed ArkGate package is resolvable from the project;
2. the project hook is trusted by Codex;
3. the current invocation is a runtime-observed `PreToolUse` `apply_patch`;
4. ArkGate reconstructs the complete multi-file candidate; and
5. ArkGate returns before disk mutation, using exit `2` on deny.

Hook files on disk remain `configured/unverified`, never `hard:true`. Incomplete reconstruction
fails open locally and relies on the required CI status. Hosted tools, specialized opt-out paths,
shell/direct filesystem writes, and human edits do not inherit the `apply_patch` claim.

Repair envelopes remain separate from enforcement. ArkGate may emit repair JSON, but it does not
claim that Codex reinjects rewritten input.

## Consequences

- Host support, doctor, status, install validation, onboarding matrices, and public docs classify
  Codex as hard-capable for complete local `apply_patch`.
- Current payload support uses `tool_input.command`; historical patch/input/content fields stay
  compatible.
- MCP remains advisory because the agent must call it.
- A required `arkgate-check --strict-merge` status remains the only boundary shared by every write
  path.
