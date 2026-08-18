# Gating AI Agents with ArkGate

**ArkGate** (`arkgate`) is the architecture co-pilot for AI TypeScript (write gate · CI · plan/loop).

This page is **develop** depth (install hooks/MCP/CI per host). Product path: [use.md](use.md) ·
overview: [develop.md](develop.md) · hub: [README.md](README.md).

### Host write honesty (fail-closed)

| Host | Write-time boundary | Hard merge boundary |
|------|---------------------|---------------------|
| **Claude Code** | Hard PreToolUse for listed ops when installed + trusted + (for `hard:true`) runtime-observed | Required `arkgate-check --strict-merge` status |
| **Grok Build** | Hard PreToolUse for listed ops when installed + trusted + (for `hard:true`) runtime-observed | Required `arkgate-check --strict-merge` status |
| **Google Antigravity** | Hard PreToolUse for listed write tools when installed + trusted + (for `hard:true`) runtime-observed | Required `arkgate-check --strict-merge` status |
| **Cursor** | Hard preToolUse for Write/StrReplace when installed + trusted + runtime-observed | Required CI status (same check) |
| **OpenAI Codex** | Hard PreToolUse for complete local `apply_patch` in CLI/Desktop when installed + trusted + runtime-observed | Required CI status (same check) |
| **OpenCode** | **Advisory / best-effort** (MCP + optional experimental plugin) — **not** a hard boundary | Required CI status (same check) |

On Claude Code, Grok Build, Google Antigravity, Cursor, and Codex, an installed and trusted
PreToolUse hook can block the listed local operation before it lands on disk. Codex’s claim is
intentionally narrow: Ark must reconstruct the complete `apply_patch`, and a fresh hook invocation
must prove the operation. Current Codex CLI and local ChatGPT Desktop/App Server send the patch in
`tool_input.command`; hosted tools, specialized opt-out paths, shell/direct writes, and incomplete
patches remain outside that local claim. OpenCode `tool.execute.before` plugins have known subagent
bypass holes. See
the [canonical host support matrix](../README.md#host-enforcement-support) before installing. The
advisory-local / hard-CI split is a deliberate trade-off: local surfaces optimize feedback speed,
while a required merge status is the one boundary a repository can make every write path share.
Prefer fail-closed honesty over fake hard guarantees on advisory hosts.

Everything below uses the same `ark.config.json` as `arkgate-check` / `ark-check` (CI) — one
contract shared by every surface. From **4.0**, optional **ArkRules** (`arkRules` map +
`arkrules/*.json`) ride the **same** write path, doctor, and CI adapter; absence of ArkRules
does not change inter-layer verdicts. Label residual **`[Layer]`** vs **`[ArkRules]`**. See
[configuration — ArkRules](configuration.md#arkrules-intra-layer-opt-in).

Generate the layer contract once:

```bash
npx arkgate-check --init
# aliases: ark-check --init, ark init
```

For guided setup with prompts, use:

```bash
npx arkgate start          # read-only preview
npx arkgate start --apply  # apply exactly the previewed setup
# or: npx ark init
```

`ark start` detects one active host and previews a compact setup (≤5 files / 25 KB). Nothing is
written until `--apply`, which rejects stale inputs. Select a host with `--tools <host>`; use the
broader installer below only for the full `/ark-*` inventory.

You can also generate only the starter gate files for common agent runtimes and CI:

```bash
npx arkgate-check --install-agent-gates
```

The command writes templates for `.mcp.json`, Claude hooks, Cursor MCP/rules,
GitHub Actions, `AGENTS.md`, Codex `.codex/hooks.json` plus a TOML snippet under `docs/`, and (when
selected) Grok Build project files under `.grok/`, Antigravity `.agents/hooks.json`, and OpenCode
`opencode.json` MCP registration. It skips existing files unless
you pass `--force`, so review and commit only the templates that match your project.

**Doctor (W5):** `ark-check --doctor --json` includes `doctor.writePath`
(`mode`: `repair` | `reject-only` | `mcp-only` | `none`, plus `prepareWrite` /
`autoPatch` flags), the supported profile for the active host, and the evidence actually found.
`writePath.enforcementState` separately reports `supported`, `analyzed`, `configured`, `installed`,
`runtimeObserved`, `operation`, `operationCoverage`, `active`, `bypassable`, `required`, and `hard`
with structured evidence for local hooks, advisory MCP, and CI. Its public schema is
`arkgate/schema/enforcement-state`; `enforcementLadder` remains a compatibility projection. Doctor
leaves hook trust and required-status policy `unverified` without runtime/provider evidence and
prints an explicit red flag for installed-but-unverified local hooks. Only a fresh covered
PreToolUse/provider observation can set operation-scoped `hard:true`. Codex
`apply_patch` can expose a complete patch to the shared atomic preflight, but the host remains
bypassable/advisory because some Code Mode paths do not dispatch the project hook.

**Design fitness (3.0.1+):** the same doctor JSON may include `doctor.designFitness` and
`doctor.designSmells[]` (path evidence). Edge-clean `operatingMode: enforce` can still set
`designFitness.designWeak: true` (**ENFORCE · design-weak**). That global inventory remains Shape
residual, not a write-path failure. Separately, Z10's opt-in design delta blocks only new/worsened
supported smells on touched paths. Companion plan JSON: `plan.patternBets[]` with `neverMechanicalSafe: true`
— never treat as write-boundary `autoPatch` / mechanical-safe. See
[package-surface.md](package-surface.md) and [brownfield-adoption.md](brownfield-adoption.md) §6.

If your project uses Codex or Grok, treat MCP registration as part of the default
setup, not an optional extra. Ark works best when the agent can call `ark_manifest`
before it writes code; that is the fast path to avoiding architecture drift during
generation. Registration on disk is not runtime proof: after the host starts the server, call
`ark_identity` with `project.expectedRoot` set to the exact project's absolute root and require
a `matched`, authoritative binding. Then call `ark_manifest` with that root plus the returned
project id before using project evidence.

## Claude Code — hook (recommended, hard block)

`ark-mcp --hook` is a one-shot PreToolUse gate: it reads the hook payload from stdin, computes the **post-edit** file content, validates it, and exits `2` (block, violations on stderr) or `0` (allow). The agent sees the violations and self-corrects.

Like `ark-check --baseline`, the hook ratchets: an edit is blocked only when it **adds**
violations relative to the file's current on-disk state, so files with pre-existing
(baselined) violations stay editable — they just can't get worse. New files block on
every violation.

### Opt-in resident hook pilot (Z07)

Set `ARK_RESIDENT_HOOK=1` on both `ark-mcp` and its hook command. The pilot reuses the
authoritative evaluator without caching decisions; stale inputs fall back one-shot.
It is off by default, and `ApplyPatch` always uses the atomic one-shot preflight.
With that MCP resident, `ark-check --doctor --json --resident` reuses canonical facts but
recomputes live doctor surfaces; an absent or invalid snapshot falls back to the cold CLI.

### Opt-in repair payload (W4)

Default is **hard block with prose** on stderr. Hosts that can re-inject a fixed write
can enable a **machine-readable repair payload** (still exit `2` — **never** silent write):

| Enable | Effect on deny |
|--------|----------------|
| `--hook-repair` | Emit `ARK_REPAIR_JSON:…` and, when available, `ARK_AUTOPATCH_JSON:…` on stderr |
| `ARK_HOOK_REPAIR=1` | Same as `--hook-repair` (env, no template rewrite) |

`ARK_REPAIR_JSON` shape (stable additive):

```json
{
  "schemaVersion": "1.3",
  "mode": "lexical-compatibility",
  "valid": false,
  "completeness": "partial",
  "completenessReasons": [{ "code": "LEXICAL_EVIDENCE_INCOMPLETE", "message": "…" }],
  "repair": true,
  "decision": "deny",
  "filePath": "src/domain/use.ts",
  "layer": "DomainModel",
  "autoPatch": {
    "source": "import type { Row } from '../infra/types-only';\n…",
    "remediationKind": "import-type-from-pure-type-module",
    "confidence": 0.85,
    "valid": false,
    "lexicalValid": true,
    "completeness": "partial"
  }
}
```

When no mechanical-safe patch applies, `autoPatch` is `null` (host still re-reasons or uses
`ark_prepare_write` / judgment). Grok deny JSON also includes `autoPatch` + `"repair": true`
when repair mode is on.

`--install-agent-gates` writes Claude/Grok/Codex PreToolUse commands with `--hook-repair` enabled.
Reject-only installs: drop `--hook-repair` (or unset `ARK_HOOK_REPAIR`).

Add to your project's `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "npx ark-mcp --hook --hook-repair --root . --root-env CLAUDE_PROJECT_DIR --config ark.config.json"
          }
        ]
      }
    ]
  }
}
```

That's the whole setup. Try asking the agent to import a persistence adapter from your domain layer:

```
Ark architecture gate blocked this write to src/domain/order.ts (layer: DomainModel):
- [FORBIDDEN_PATTERN] Forbidden pattern matched: /from ['"].*\/(infra|adapters|persistence|db)/i (line 1)
- [FORBIDDEN_IMPORT] Forbidden import target: "../adapters/persistence/pg-order-repository". (line 1)
Fix the violations and retry. After ark_identity matches, call ark_manifest with the same project expectation for the authoritative contract.
```

## Claude Code — SessionStart context injection (know the rules before the first token)

The write gate teaches by rejection; the SessionStart hook teaches up front.
`ark-mcp --session-context` prints a compact contract summary — layers, forbidden
globals, denied-edge count, baseline state, and the check command — which Claude Code
injects into the agent's context at session start:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx ark-mcp --session-context --root . --root-env CLAUDE_PROJECT_DIR --config ark.config.json"
          }
        ]
      }
    ]
  }
}
```

What the agent sees:

```
Ark architecture contract governs this project (ark.config.json is authoritative).
Layers:
  - DomainModel: src/domain/** — forbidden globals: fetch, process, Date.now, Math.random
  - PersistenceAdapters: src/adapters/persistence/**
Rules: 10 denied layer edge(s). Full authoritative contract: ark_manifest after ark_identity.
Baseline: 3 frozen violation(s) — only NEW violations fail; do not add to them.
After edits run: npx ark-check --root . --config ark.config.json --strict
```

The hook belongs in the **project's** `.claude/settings.json` (that's what
`--install-agent-gates` generates). It is also safe by construction if you prefer it in
your global settings: without an `ark.config.json` in the project, `--session-context`
prints nothing and exits 0, so non-Ark projects are untouched.

## Claude Code — MCP server (contract discovery + on-demand validation)

The MCP server exposes tools plus one compatibility resource that agents can use proactively
(not an exhaustive list — `tools/list` is authoritative):

- **`ark_identity`** (tool) — returns the canonical project/config identity and this live MCP
  runtime identity. Call it first with
  `{ "project": { "expectedRoot": "/absolute/exact-project-root" } }`, then reuse the same root
  and returned `projectIdentity.projectId` as `project.expectedProjectId` on later calls. A
  descendant path is authoritative only when that matching id is also supplied.
- **`ark_manifest`** (tool) — returns the authoritative machine-readable architecture contract
  (layers + rules) after the identity handshake. Call it with the same project expectation before
  generating code.
- **`ark://manifest`** (resource) — compatibility-only discovery for standard MCP
  `resources/read`. Because that request has no portable project-expectation field, this resource
  is always `unverified` and non-authoritative.
- **`validate_code`** (tool) — validates a snippet against the architecture on demand (the write-path gate). May return additive **`autoPatch`** (W1) for mechanical-safe import-type rewrites.
- **`ark_prepare_write`** (tool) — **W2:** place + constrain + validate + optional autoPatch + judgmentBrief + contentHash in one call (composes `ark_place` + write gate).
- **`ark_prepare_change`** (tool) — **T02–T05:** read-only atomic create/update/delete preflight with cross-file edge/cycle findings and candidate fingerprints. Optional `changeMap` accepts strict schema `1.0` intent and returns its hash plus satisfied/missing/contradictory/unplanned structural convergence; behavioral completion is not evaluated. Omission is supported. MCP registration remains advisory unless the host makes invocation non-bypassable.
- **3.7.0 corrective boundary:** the compiler-free candidate graph can miss aliases/workspace
  edges that final TypeScript-backed CI resolves. Keep the strict CI backstop mandatory while
  [Phase Z](https://github.com/pedroknigge/arkgate/blob/main/docs/plans/enforcement-truth-at-speed/README.md)
  restores differential parity.
- Blocking CLI/MCP/hook diagnostics include the same deterministic `nextAction`. `AGENTS.md`, skill
  catalogs, session prose, and live LLM calls are not inputs to the enforcement verdict.
- **`ark_place`** (tool) — given a target file path, returns its layer, forbidden globals, and which layers it may / must not import. Call it *before* writing a new file so generated code lands in a governed location.
- **`ark_check`** (tool) — runs the full architecture check and returns structured violations (applies the baseline automatically when one exists).
- **`ark_coverage`** (tool) — per-layer file counts, the full unclassified-file list, and layers whose patterns match nothing.

Every Ark tool accepts the additive `project` expectation. Project-bound tool successes and
errors carry `projectIdentity`, `binding`, and `authoritative`. A legacy call with no expectation
stays callable but returns `binding.status: "unverified"` and `authoritative: false`; a wrong
root/id returns a mismatch before project evidence. Absolute project paths and
config/manifest/tsconfig inputs are real-path contained inside the server root. The process never
switches projects from input. The compatibility resource carries the same identity envelope but
is always unverified/non-authoritative.

`ark_check.verdict` keeps `identity`, `completeness`, `graph`, `coverage`, and `gates` separate.
Only `overallOk` combines them; a graph-clean result cannot paint an unverified binding,
incomplete analysis, empty/partial coverage, or inactive gates green.

Tools appear in the agent's tool list automatically — no skill or doc-reading needed — so the
agent can query the contract instead of shelling out and parsing.

```bash
claude mcp add ark -- npx ark-mcp --root . --config ark.config.json
```

or in `.mcp.json`:

```json
{
  "mcpServers": {
    "ark": {
      "type": "stdio",
      "command": "npx",
      "args": ["ark-mcp", "--root", ".", "--config", "ark.config.json"]
    }
  }
}
```

Use both: the MCP server for discovery, the hook for enforcement.

## Cursor

Cursor supports MCP servers (`.cursor/mcp.json`) and project hooks (`.cursor/hooks.json`):

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "command": "npx arkgate-mcp --hook --hook-repair --fail-on-new-smells --root . --root-env CURSOR_PROJECT_DIR --config ark.config.json",
        "matcher": "Write|StrReplace",
        "failClosed": true,
        "timeout": 30
      }
    ]
  }
}
```

When that hook is installed and trusted, Cursor **hard-blocks** agent `Write` / `StrReplace`
for governed TypeScript sources (exit 2 or `permission: "deny"`). Repair envelopes may emit;
Cursor does **not** guarantee Write `updated_input` reinjection — the agent must fix and retry
from `agent_message`. Shell, Tab, and human edits still rely on CI.

Pair with MCP + a rules file so the agent also calls advisory tools. `.cursor/rules/ark.mdc`:

```markdown
---
description: Ark architecture contract
alwaysApply: true
---

Before trusting Ark MCP evidence, call `ark_identity` with `project.expectedRoot`
set to the exact project root. Then call `ark_manifest`. Before writing TypeScript,
prefer MCP `ark_prepare_write` / `validate_code` when available; the project
`.cursor/hooks.json` hard gate still blocks invalid Write/StrReplace.
```

Your repository backstop remains CI: `ark-check` fails its check on anything that slips
through (Shell bypass, Tab, incomplete coverage). It blocks the merge only when that status
is required by repository policy.

## OpenAI Codex CLI and local Desktop

Recommended for Ark projects.

Platform authority: [Codex Hooks](https://developers.openai.com/codex/hooks) ·
[Advanced configuration](https://developers.openai.com/codex/config-advanced) ·
[App Server](https://developers.openai.com/codex/app-server). Project-local hooks run only after
the project and exact hook definition are trusted.

Codex 0.123+ dispatches `PreToolUse` for the native `apply_patch` handler. Ark installs
`.codex/hooks.json` with `ApplyPatch|apply_patch|Write|Edit|MultiEdit` aliases and reconstructs
every added or updated file in a multi-file patch before allowing it. The hook passes
`--root . --root-env CODEX_PROJECT_DIR`: ArkGate reads the environment directly without
POSIX shell expansion and safely falls back to the hook working directory.

The trusted hook is a hard boundary for the covered local operation, not a universal Codex
guarantee. ArkGate claims `hard:true` only while processing a complete runtime-observed
`apply_patch`; `.codex/hooks.json` on disk is merely configured/unverified. Hosted tools,
specialized opt-out paths, shell/direct writes, and incomplete reconstruction remain CI-backed.

```bash
npx ark-check --install-agent-gates --tools codex
```

The generated hook includes `--hook-repair`, so a rejected patch **may emit** a structured
repair envelope (same JSON shape as Claude/Grok). **Reinjection is not guaranteed** on Codex:
the host must re-apply any fix. Exit `2` is the supported deny, and required CI remains the
all-path hard merge boundary. Codex still needs hook trust enabled for the project.

Modern Codex resolves MCP servers from the active project's `.codex/config.toml`. Ark writes
that file with relative paths, so every repository owns its primary `ark` binding without
competing for a global slot:

```bash
npx ark-check --install-agent-gates --tools codex
# optional: install /ark-* skills and a legacy global MCP fallback under $CODEX_HOME
npx ark-check --install-agent-gates --codex-home
```

Project-scoped shape:

```toml
[mcp_servers.ark]
command = "npx"
args = ["arkgate-mcp", "--root", ".", "--config", "ark.config.json"]
```

This file means **configured on disk**, not active. Install and compact
`ark start --tools codex --json` therefore report the setup-time state explicitly:

```json
{
  "runtimeActivation": {
    "configuredOnDisk": true,
    "restartRequired": true,
    "runtimeObserved": false,
    "identityMatch": "unverified",
    "active": false
  }
}
```

Then **restart Codex** — it does not hot-load MCP servers — and call:

```json
{
  "tool": "ark_identity",
  "arguments": {
    "project": {
      "expectedRoot": "/absolute/exact-project-root"
    }
  }
}
```

The live response must say `binding.status: "matched"` and `authoritative: true`. Reuse its
`projectIdentity.projectId` with the same root on every subsequent Ark call, starting with
`ark_manifest`. A missing `ark_identity` or `ark_manifest` means the process is from an older
ArkGate build; restart the host and use the workspace-local CLI until the new server answers. A
mismatch means Codex is connected to another project's process; do not use its contract,
placement, Layers, ArkRules, or check evidence.

Setup-time `runtimeActivation` remains intentionally conservative: the installer/doctor cannot
observe a later MCP conversation from files alone. The matched `ark_identity` response is the
runtime observation for that caller and live process; it does not mutate the setup JSON.
`.codex/config.toml` by itself never upgrades `runtimeObserved` or `active`.

Codex uses an operation-scoped hard local patch hook plus advisory MCP for discovery/validation
and `ark-check` as the all-path hard merge backstop. Register all three as soon as the repo is
adopted.

### Legacy Codex home fallback

`$CODEX_HOME/config.toml` remains supported for older clients or an explicit global binding.
Because it is global, its `[mcp_servers.ark]` is a single primary. If project A is already
registered and you run `--codex-home` for project B without `--force`, Ark preserves A and
writes a scoped secondary table:

```toml
[mcp_servers.ark]            # primary — still project A
# ...

[mcp_servers.ark_proj-b_a1b2c3d4]  # secondary — basename + path hash (no slug collisions)
# absolute --root for B
```

| Goal | Command |
|------|---------|
| Install the normal project binding | `ark-check --install-agent-gates --tools codex` |
| Add B to the legacy home fallback | `ark-check --install-agent-gates --codex-home` |
| Make B the legacy home primary | `ark-check --install-agent-gates --codex-home --force` |
| Doctor: primary points at another permanent project | gap id `codex-home-multi-project` (warn if no secondary yet and session host is unknown/Codex; **info + `deferred`** when the session host is known and not Codex — e.g. Grok/Claude/Cursor; info if a scoped secondary is already present) |
| When using Codex: refresh home skills | `ark-check --install-agent-gates --skills-only --codex-home --force` |

When a valid project `.codex/config.toml` exists, it is the expected binding, but files alone
cannot prove which already-running process answered. Doctor therefore keeps an unrelated home
primary as collision evidence until the live `ark_identity` matches; it does not label that home
entry as the active project. Without a project binding, doctor surfaces the legacy multi-project
state directly. **Deferred (fix when using Codex):**
non-temp Codex-home gaps (`codex-home-multi-project`, stale `$CODEX_HOME/skills`) are
severity **info**, marked `deferred: true`, and omitted from doctor **Primary next action** /
**Also** list (formerly “Top actions”) when the session host is known and not Codex —
`/ark-upgrade` on Grok/Claude is not Incomplete because of them. **Temp/upgrade primary roots**
stay fail-closed urgent (rewritten, not multi-project).

### Shared Claude / Grok home skills {#shared-claude--grok-home-skills}

Project catalogs follow that checkout’s ArkGate pin (they may lag). Shared user-home catalogs
are the **machine floor**:

| Scope | Path | Flag |
|-------|------|------|
| Claude home | `$CLAUDE_HOME/skills` (default `~/.claude/skills`) | `--claude-home` |
| Grok home | `$GROK_HOME/skills` (default `~/.grok/skills`) | `--grok-home` |
| All three + Codex | same monotonic protocol | `--agent-homes` |

Doctor reports `agentHomeGaps` only when those catalogs already contain `ark-*` skills and
lag the installed package. Temp/upgrade `--root` never mutates default user homes. Cursor
sessions treat a stale Claude home as urgent because Cursor loads `~/.claude/skills`.

```bash
npx arkgate-check --install-agent-gates --skills-only --agent-homes --force
```

### Codex skill catalog (SKILL.md, not flat prompts)

Codex discovers skills as directories containing `SKILL.md` (Agent Skills standard):

| Scope | Path |
|-------|------|
| **Repo** (written by `--tools codex`) | `.agents/skills/<name>/SKILL.md` |
| **Home** (optional `--codex-home`) | `$CODEX_HOME/skills/<name>/SKILL.md` |

Flat `.codex/prompts/*.md` files are **not** the invocable skill catalog. Install writes the
repo catalog above so AGENTS.md `/ark-*` references match what Codex can load. After install,
Ark verifies those references against each selected host catalog.

**Several repos on one machine:** repo catalogs are independent and follow each repository's
locally installed ArkGate package. A managed upgrade rewrites a repo skill only when its normalized
body changes; a package-version stamp alone is a no-op. The optional home catalog is shared, so
ArkGate 4.2.0+ installation is monotonic there: an older bundled source cannot replace a newer
managed home skill, even with `--force`. A pre-4.2 binary ignores the catalog/lock protocol and
can still overwrite those files, so upgrade every legacy repo before it runs `--codex-home`
(especially with `--force`). Identical content is idempotent, and preserved customization still
follows the explicit force contract. The shared skill only routes the workflow; project evidence remains
bound to the repo through `ark_identity`. Ark records the shared catalog in
`$CODEX_HOME/skills/.arkgate-catalog.json`, writes a durable
`.arkgate-catalog.pending.json` floor before mutations, and serializes concurrent installs.
Doctor suppresses home refresh gaps only when the maximum valid committed/pending floor is newer
than the repo package; an equal pending version remains actionable for recovery, and corrupt
metadata never counts as a floor. When a newer package retires a skill, Ark removes it only if the
bytes still match the prior managed identity; customized retired content is preserved and
released from Ark ownership.

**Parity & honesty (doctor / install):**

- Doctor distinguishes **missing / stale / legacy-prompts-only** for repo (`.agents/skills`) and
  home (`$CODEX_HOME/skills`). Home debt is **deferred** when the session host is not Codex.
- Legacy flat prompts alone are reported as non-loadable skill debt with a
  `--skills-only --tools codex --force` (repo) or `--codex-home --force` (home) fix.
- Codex **complete local `apply_patch` is hard** when `.codex/hooks.json` is trusted and the
  invocation is runtime-observed. MCP remains advisory; incomplete, hosted, specialized, shell,
  and direct-write paths rely on CI `--strict-merge` (or `--strict`) as a **required GitHub status
  context** (not “workflow file present”).
- CI workflows that run ark-check without the fail-closed profile (or with only
  `--strict-config`) surface gap `enforcement-ci-not-fail-closed`.

## Grok Build (xAI)

Grok reads project rules from **`AGENTS.md`**, project MCP from **`.grok/config.toml`**
(and repo-root `.mcp.json`), skills from **`.grok/skills/<name>/SKILL.md`**, and
hooks from **`.grok/hooks/*.json`**.

Install everything Ark needs for Grok:

```bash
npx ark-check --install-agent-gates --tools grok
```

That writes:

| Path | Role |
|------|------|
| `.grok/config.toml` | `[mcp_servers.ark]` → `ark-mcp` (relative `--root .`) |
| `.grok/hooks/ark-write-gate.json` | SessionStart context + PreToolUse write gate |
| `.grok/skills/ark-*/SKILL.md` | All `/ark-*` skills (slash-invocable) |
| `AGENTS.md` + `.mcp.json` + CI | Shared with other hosts |

Grok also loads Claude/Cursor MCP and skill paths when compat is enabled, so a repo
already wired for Claude often “just works” in Grok — but the native `.grok/*` layout
is the supported, commit-friendly path.

**Write gate:** Grok’s PreToolUse uses camelCase payloads (`toolName` / `toolInput`)
and may call `write` / `search_replace`. `ark-mcp --hook` accepts both Claude and Grok
shapes and returns a Grok-compatible `{ "decision": "deny", "reason": "…" }` on stdout
when it blocks.

**Trust:** the first time you open a project with hooks, run `/hooks-trust` (or
`grok --trust`) so project hooks and local MCP are allowed.

Manual MCP only:

```toml
# .grok/config.toml  (or: grok mcp add --scope project ark -- npx ark-mcp --root . --config ark.config.json)
[mcp_servers.ark]
command = "npx"
args = ["ark-mcp", "--root", ".", "--config", "ark.config.json"]
```

Then restart Grok or refresh via `/mcps`. Pair with CI `ark-check`; require that status if it
must block merges.

## Google Antigravity (`antigravity` / `agy`)

Antigravity loads project hooks from **`.agents/hooks.json`** (also
`~/.gemini/config/hooks.json` for user-global). Official PreToolUse **`decision: "deny"`** is a
hard block for matched tools.

Install:

```bash
npx ark-check --install-agent-gates --tools antigravity
# alias:
npx ark-check --install-agent-gates --tools agy
```

| File | Role |
|------|------|
| `.agents/hooks.json` | Named hook `ark-write-gate` with PreToolUse on write tools |
| `GEMINI.md` | Instruction rule for Gemini CLI / legacy consumers sharing the tree |
| `.agents/skills/*/SKILL.md` | Agent Skills catalog (shared path with Codex) |
| `AGENTS.md` + `.mcp.json` + CI | Shared with other hosts |

**Write tools covered:** `write_to_file`, `replace_file_content`, `multi_replace_file_content`.
`ark-mcp --hook` accepts the Antigravity stdin shape (`toolCall.name` / `toolCall.args` with
PascalCase fields such as `TargetFile`, `CodeContent`, `TargetContent`, `ReplacementContent`,
`ReplacementChunks`). **Gating is stdout `decision`** (official PreToolUse contract): allow →
`{ "decision": "allow" }` on stdout (exit 0); deny → `{ "decision": "deny", "reason": "…" }` on
stdout (exit 2). Exit codes are secondary/plumbing for hosts that also honor them.

**Honesty:** hard for listed ops when installed + trusted, and for `hard:true` only with
runtime-observed covered PreToolUse evidence (same ladder as Claude/Grok). Alternate tools,
`run_command` shell writes, and human edits still rely on required CI. Doctor reports installed
evidence under host `antigravity`.

**Do not** confuse with the instruction-tier `gemini` tool id (GEMINI.md only) — selecting
`antigravity` also refreshes `GEMINI.md` for shared consumers without removing the separate
`gemini` install path.

## OpenCode

OpenCode is first-class for MCP (`opencode.json` / `~/.config/opencode/opencode.json`) and supports
plugin hooks such as `tool.execute.before`. Plugin coverage is **not** a complete write boundary
(subagent and alternate tool paths may bypass).

Install:

```bash
npx ark-check --install-agent-gates --tools opencode
```

| File | Role |
|------|------|
| `opencode.json` | Merges local MCP server `ark` (`type: "local"`, command argv) |
| `.opencode/skills/*/SKILL.md` | Optional skill catalog when skills are installed |
| `AGENTS.md` + CI | Shared with other hosts |

**Write path (honest):** advisory MCP only. An optional experimental plugin template lives at
`templates/hooks/opencode-ark-write-gate.mjs` (copy into `.opencode/plugins/` if you want
best-effort `tool.execute.before` → `ark-mcp --hook`). Never claim hard write for OpenCode.
Pair with required CI `--strict-merge`.

Doctor detects `opencode.json` / `opencode.jsonc` MCP registration as advisory-write evidence for
host `opencode`.

## Instruction-tier agents: Windsurf, Cline, Copilot, Kiro, Roo Code, Continue, Gemini CLI

Agents without MCP or hook support still follow the contract through an always-on
project rule file. `ark-check --install-agent-gates` generates them (auto-detected
from `.windsurf/`, `.clinerules/`, `.kiro/`, `.roo/`, `.continue/`, `.gemini/`;
Copilot is explicit-only):

```bash
npx ark-check --install-agent-gates --tools windsurf,cline,copilot,kiro,roo,continue,gemini
```

| Tool | File written |
|------|--------------|
| Windsurf | `.windsurf/rules/ark.md` |
| Cline | `.clinerules/ark.md` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Kiro | `.kiro/steering/ark.md` |
| Roo Code | `.roo/rules/ark.md` |
| Continue | `.continue/rules/ark.md` |
| Gemini CLI | `GEMINI.md` (its primary context file; also reads `AGENTS.md`) |

All of them derive from the same contract as `AGENTS.md` and the Cursor rule, so the
steps cannot drift. These are advisory (the agent reads rules; nothing blocks the
write). Keep `ark-check` in CI and require its status when it must block merges.

## Any other agent runtime with shell hooks

If your runtime can run a shell command before file writes and pass the tool payload on stdin, `ark-mcp --hook` works as-is. The contract:

- stdin (Claude): JSON `{ "tool_name": "Write|Edit|MultiEdit", "tool_input": { "file_path": ..., ... } }`
- stdin (Grok): JSON `{ "toolName": "write|search_replace|…", "toolInput": { "file_path": ..., ... } }` (also accepts Claude names)
- stdin (Codex): JSON `{ "tool_name": "apply_patch", "tool_input": { "patch": "*** Begin Patch…" } }`
- stdin (Antigravity): JSON `{ "toolCall": { "name": "write_to_file|…", "args": { "TargetFile": …, … } } }`
- exit `0` → allow; exit `2` → block, human-readable violations on stderr
- Grok: `{ "decision": "deny", "reason": "…" }` on stdout when blocked
- Antigravity: **stdout `decision` is required** — allow → `{ "decision": "allow" }`; deny →
  `{ "decision": "deny", "reason": "…" }` (exit 2 still set on deny)
- plumbing problems (no stdin, non-source files, files outside `--root`) never block; Antigravity
  still emits `{ "decision": "allow" }` on those fail-open paths

## ESLint (editor feedback) — bounded parity envelope

For fast in-editor red squiggles, add the ESLint plugin.
Layer imports and purity globals are driven by **`ark.config.json`** (walk-up from the
linted file).

```js
// eslint.config.js  (flat config)
import ark from 'arkgate/eslint';

export default [
  ark.configs.recommended,
  // no-domain-infra-imports  → config-driven layer edges (type-only + value)
  // no-forbidden-globals     → layer.forbiddenGlobals from ark.config.json
  // ark/no-denied-capabilities → layer.capabilities.deny / layer.pure
  // no-raw-event-publish + require-publish-source → runtime event hygiene
];
```

**Exact layer-edge parity envelope:** the linted production source is on disk, inside
`include`, outside configured/generated exclusions, parse-clean, and uses a static
`import`/`export` with a **relative** or **tsconfig `paths` / `baseUrl` alias** (e.g. `@/*`)
literal whose target is also on disk. Inside that envelope, ESLint uses the same layer glob
specificity, rule decision, rule id, and evidence as the resolved CLI. It reloads
`ark.config.json` when its content changes and never invents a not-yet-created target.

**Path-alias residual (honest):** simple `paths` + `baseUrl` (including one level of relative
`extends`) are resolved. Not claimed: TypeScript project references, multi-target path arrays
beyond the first entry, catch-all `*` mappings, package/workspace bare imports, or symlink
hops. Those stay CI / preflight / write-gate truth.

Outside that envelope—packages/workspaces, symlinks, CommonJS, `import = require`, dynamic
imports, virtual creates/deletes, unresolved targets, or complete cross-file candidates—ESLint
emits no layer-parity verdict. Use `ark preflight`, `ark_prepare_change`, the complete
ApplyPatch hook, or final strict CI; those paths consume the canonical resolved facts.

Additional rule notes:

- Relative and tsconfig-aliased imports resolve only to existing on-disk TS/JS targets; package bare imports are left to CI/TS.
- Value forbidden edges error (same pass/fail as `arkgate-check`). Type-only forbidden edges are **placement debt** (reported with `typeOnly`); merge blocking prefers value edges — align with doctor `typeEdgePolicy`.
- `no-forbidden-globals` applies from the file layer’s `forbiddenGlobals`; the `globals` option is only a standalone fallback when no project config applies, never an override that weakens the project contract. Layers without either surface are not inventively restricted. `process` also owns exact value imports of `process` / `node:process`; type-only forms, subpaths, and `child_process` stay excluded. If the same layer also denies the `process` capability, this rule is the single `FORBIDDEN_GLOBAL` voice.
- Without `ark.config.json`, `no-domain-infra-imports` emits no contract verdict.

Rule ids are `ark/<kebab-name>`. Individual rules are also on `ark.rules` if you wire them by hand.
Prefer keeping editor + CI on the same `ark.config.json`. Use the rule-local `globals` list only
for standalone linting where no project contract applies.

## CI backstop

Whatever the agent side does, run the merge profile in CI:

```yaml
# EH04: first push may have all-zero github.event.before — only pass --base-ref when resolvable.
- name: Ark architecture check
  env:
    ARK_POLICY_BASE_REF: ${{ github.event.pull_request.base.sha || github.event.before }}
  run: |
    set -euo pipefail
    BASE_REF="${ARK_POLICY_BASE_REF:-}"
    if [[ "$BASE_REF" =~ ^0{40,64}$ ]]; then BASE_REF=""; fi
    if [ -n "$BASE_REF" ] && git cat-file -e "${BASE_REF}^{commit}" 2>/dev/null; then
      export ARK_POLICY_BASE_REF="$BASE_REF"
      npx ark-check --root . --config ark.config.json --strict-merge \
        --fail-on-new-smells --base-ref "$BASE_REF"
    else
      export ARK_POLICY_BASE_REF=""
      npx ark-check --root . --config ark.config.json --strict-merge
    fi
```

This explicit brownfield ratchet records schema `1.0` identities, touched paths, and stable
evidence; missing base with `--fail-on-new-smells` exits `2`, so the generated workflow skips the
delta when the SHA is all-zero or unresolvable while keeping the full merge gate. Its first
semantic smell is `domain-logic-in-ui`; residual, path-only moves, and unrelated work stay green.
Generated Claude/Grok hooks share the delta and golden-pattern repair hint. MCP exposes the result
but stays advisory.

**CLI vs required status:** `arkgate-check --strict-merge` / `ark-check --strict-merge` is the
**command**. The hard merge boundary is making that job a **required GitHub status context** —
not “workflow file present.”

Or use the repository's composite Action at a pinned release or commit:

```yaml
- uses: pedroknigge/arkgate@v3.7.0
  with:
    root: .
    config: ark.config.json
    strict-config: 'true'
    baseline: ''
    version: ''
    github-token: ${{ github.token }}
```

| Action input | Default | Meaning |
|--------------|---------|---------|
| `root` | `.` | Project root to check. |
| `config` | `ark.config.json` | Config path relative to `root`. |
| `strict-config` | `true` | On the current Action revision, run the fail-closed `--strict` profile; an explicit older `version` uses its compatibility `--strict-config` path. |
| `baseline` | empty | Optional frozen-violation baseline; empty disables baseline mode. |
| `version` | empty | Optional exact npm version override; empty runs the code from the pinned Action revision. |
| `github-token` | empty | Token for a pull-request failure comment; empty skips the comment. |

For an additional local human-commit check, copy the shipped hook template:

```bash
cp node_modules/arkgate/templates/hooks/pre-commit-ark .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

The template runs the project's architecture check before a commit. It is optional and local;
it does not replace the CI job or repository policy that makes the CI status required for merges.

`--strict-merge` requires strict config plus the shared gate files (`AGENTS.md`, MCP config,
and CI workflow) and fails on safety diagnostics. `--strict` is a compatibility alias. Neither
profile requires an editor hook; add `--require-write-hook claude|grok` only when CI must verify
that host-specific local boundary too. Configure reviewed exceptions explicitly:

```json
{
  "dynamicImportAllowlist": ["src/plugins/loader.ts"],
  "safety": {
    "maxTsSuppressions": 0,
    "maxAnyCasts": 0,
    "allowInMemory": false,
    "allowDisabledPeerIsolation": false
  }
}
```

`ark-check --doctor --json` reports counts under `doctor.safety`. An `any` cast is
reported as lost static assurance; it does not imply that a runtime schema was bypassed.

### Scanner soundness envelope

ArkGate uses the TypeScript compiler API for the governed source files. The resolved candidate
scanner used by CLI/preflight/MCP/complete-patch hooks recognizes these dependency forms:

- `import ... from 'literal'`, side-effect imports, and `export ... from 'literal'`;
- TypeScript `import x = require('literal')` external-module references;
- direct `import('literal')` and direct `require('literal')` calls; and
- relative, tsconfig path-alias, package, and installed workspace-package targets that resolve
  to source inside the project root. Third-party or escaped targets are deliberately not governed.

`createAICodeGate({ typescript })` recognizes the same syntax lexically, but it does not discover a
project resolver by itself. Its result is explicitly `mode: "lexical-compatibility"`,
`completeness: "partial"`, and `valid:false`; `lexicalValid` records whether those bounded checks
passed. A caller-supplied target resolver can improve feedback but does not turn the snippet into a
parity-capable complete-candidate verdict.

Direct `import(expr)` emits `DYNAMIC_IMPORT_NOT_ALLOWLISTED`; direct `require(expr)` emits
`DYNAMIC_REQUIRE_NOT_ALLOWLISTED`. They are warnings in the default reporting profile and fail
`--strict-config` / `--strict-merge`. The existing `dynamicImportAllowlist` name is retained for
compatibility and is the reviewed file-level exception for both forms. Aliased loaders (for
example `const load = require; load(expr)`) and runtime-computed module maps are not resolved.

Forbidden globals use single-file TypeScript binding: parameters, variables, functions, classes,
and imports declared in the file shadow ambient names. Bare ambient value references are reported
even when assigned to an alias, and static dotted access through `globalThis` is normalized (for
example `globalThis.Date.now()`). This is not whole-program data-flow analysis: computed property
names, aliases of dotted members, and cross-file symbol provenance are outside the current
envelope. When callers omit the `typescript` option, AICodeGate retains its conservative literal
fallback and does not claim symbol-aware parity; the shipped `ark-mcp` path supplies TypeScript.

Adopting Ark on an existing codebase with violations? Freeze them once and ratchet down:

```bash
npx ark-check --update-baseline   # writes .ark-baseline.json — commit it
npx ark-check --baseline          # only NEW violations fail
```
