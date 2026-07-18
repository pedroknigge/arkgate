# Gating AI Agents with ArkGate

**ArkGate** (`arkgate`) is the architecture co-pilot for AI TypeScript (write gate · CI · plan/loop).
On Claude Code and Grok Build, an installed and trusted PreToolUse hook can block matched writes
before they land on disk. Cursor and OpenAI Codex use advisory MCP validation at write time; CI is
their hard repository check. Codex 0.123+ dispatches hooks for its native `apply_patch` handler,
but Code Mode hosts can execute deferred nested writes without that project hook event. See the
[canonical host support matrix](../README.md#host-enforcement-support) before installing. The
advisory-local / hard-CI split is a deliberate trade-off: local surfaces optimize feedback speed,
while a required merge status is the one boundary a repository can make every write path share.

Everything below uses the same `ark.config.json` as `arkgate-check` / `ark-check` (CI) — one
contract shared by every surface. Generate it once:

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
selected) Grok Build project files under `.grok/`. It skips existing files unless
you pass `--force`, so review and commit only the templates that match your project.

**Doctor (W5):** `ark-check --doctor --json` includes `doctor.writePath`
(`mode`: `repair` | `reject-only` | `mcp-only` | `none`, plus `prepareWrite` /
`autoPatch` flags), the supported profile for the active host, and the evidence actually found.
`writePath.enforcementLadder` separates `supported`, `installed`, `active`, and `bypassable` for
local hooks, advisory MCP, and CI. Doctor leaves hook trust and required-status policy
`unverified`; an actual covered PreToolUse denial can report operation-scoped activity. Codex
`apply_patch` can expose a complete patch to the shared atomic preflight, but the host remains
bypassable/advisory because some Code Mode paths do not dispatch the project hook.

**Design fitness (3.0.1+):** the same doctor JSON may include `doctor.designFitness` and
`doctor.designSmells[]` (path evidence). Edge-clean `operatingMode: enforce` can still set
`designFitness.designWeak: true` (**ENFORCE · design-weak**). That is Shape residual, not a
write-path failure. Companion plan JSON: `plan.patternBets[]` with `neverMechanicalSafe: true`
— never treat as write-boundary `autoPatch` / mechanical-safe. See
[package-surface.md](package-surface.md) and [brownfield-adoption.md](brownfield-adoption.md) §6.

If your project uses Codex or Grok, treat MCP registration as part of the default
setup, not an optional extra. Ark works best when the agent can read `ark://manifest`
before it writes code; that is the fast path to avoiding architecture drift during
generation.

## Claude Code — hook (recommended, hard block)

`ark-mcp --hook` is a one-shot PreToolUse gate: it reads the hook payload from stdin, computes the **post-edit** file content, validates it, and exits `2` (block, violations on stderr) or `0` (allow). The agent sees the violations and self-corrects.

Like `ark-check --baseline`, the hook ratchets: an edit is blocked only when it **adds**
violations relative to the file's current on-disk state, so files with pre-existing
(baselined) violations stay editable — they just can't get worse. New files block on
every violation.

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
  "mode": "repair",
  "decision": "deny",
  "filePath": "src/domain/use.ts",
  "layer": "DomainModel",
  "autoPatch": {
    "source": "import type { Row } from '../infra/types-only';\n…",
    "remediationKind": "import-type-from-pure-type-module",
    "confidence": 0.85,
    "valid": true
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
            "command": "npx ark-mcp --hook --hook-repair --root \"$CLAUDE_PROJECT_DIR\" --config ark.config.json"
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
Fix the violations and retry. The architecture contract is available as the ark://manifest MCP resource.
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
            "command": "npx ark-mcp --session-context --root \"$CLAUDE_PROJECT_DIR\" --config ark.config.json"
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
Rules: 10 denied layer edge(s). Full contract: ark://manifest MCP resource.
Baseline: 3 frozen violation(s) — only NEW violations fail; do not add to them.
After edits run: npx ark-check --root . --config ark.config.json --strict
```

The hook belongs in the **project's** `.claude/settings.json` (that's what
`--install-agent-gates` generates). It is also safe by construction if you prefer it in
your global settings: without an `ark.config.json` in the project, `--session-context`
prints nothing and exits 0, so non-Ark projects are untouched.

## Claude Code — MCP server (contract discovery + on-demand validation)

The MCP server exposes a resource and tools agents can use proactively (not an exhaustive list — `tools/list` is authoritative):

- **`ark://manifest`** (resource) — the machine-readable architecture contract (layers + rules), so the agent can read the architecture before generating code.
- **`validate_code`** (tool) — validates a snippet against the architecture on demand (the write-path gate). May return additive **`autoPatch`** (W1) for mechanical-safe import-type rewrites.
- **`ark_prepare_write`** (tool) — **W2:** place + constrain + validate + optional autoPatch + judgmentBrief + contentHash in one call (composes `ark_place` + write gate).
- **`ark_prepare_change`** (tool) — **T02–T05:** read-only atomic create/update/delete preflight with cross-file edge/cycle findings and candidate fingerprints. Optional `changeMap` accepts strict schema `1.0` intent and returns its hash plus satisfied/missing/contradictory/unplanned structural convergence; behavioral completion is not evaluated. Omission is supported. MCP registration remains advisory unless the host makes invocation non-bypassable.
- Blocking CLI/MCP/hook diagnostics include the same deterministic `nextAction`. `AGENTS.md`, skill
  catalogs, session prose, and live LLM calls are not inputs to the enforcement verdict.
- **`ark_place`** (tool) — given a target file path, returns its layer, forbidden globals, and which layers it may / must not import. Call it *before* writing a new file so generated code lands in a governed location.
- **`ark_check`** (tool) — runs the full architecture check and returns structured violations (applies the baseline automatically when one exists).
- **`ark_coverage`** (tool) — per-layer file counts, the full unclassified-file list, and layers whose patterns match nothing.

Tools appear in the agent's tool list automatically — no skill or doc-reading needed — so the agent can query the contract instead of shelling out and parsing.

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

Cursor supports MCP servers (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "ark": {
      "command": "npx",
      "args": ["ark-mcp", "--root", ".", "--config", "ark.config.json"]
    }
  }
}
```

Cursor has no pre-write hook, so the gate is advisory at write time — pair it with a rules file so the agent actually calls it. `.cursor/rules/ark.mdc`:

```markdown
---
description: Ark architecture contract
alwaysApply: true
---

Before writing or editing any TypeScript source file, call the `validate_code`
tool from the `ark` MCP server with the full post-edit file content and its
path. If it reports violations, fix them before writing. The architecture
contract is available as the `ark://manifest` resource.
```

Your repository backstop in Cursor is CI: `ark-check` fails its check on anything that slips
through. It blocks the merge only when that status is required by repository policy.

## OpenAI Codex CLI

Recommended for Ark projects.

Codex 0.123+ dispatches `PreToolUse` for the native `apply_patch` handler. Ark installs
`.codex/hooks.json` with `ApplyPatch|apply_patch|Write|Edit|MultiEdit` aliases and reconstructs
every added or updated file in a multi-file patch before allowing it. The hook root uses
`${CODEX_PROJECT_DIR:-${PWD:-.}}`; it must not use Claude-only `CLAUDE_PROJECT_DIR`.

This hook is best-effort in Codex Code Mode: some hosts execute deferred nested `apply_patch`
calls without dispatching the project `PreToolUse` event. ArkGate therefore does not treat the
presence of `.codex/hooks.json` as a universal hard-write guarantee; MCP remains advisory and the
required CI status is the hard repository boundary.

```bash
npx ark-check --install-agent-gates --tools codex
```

The generated hook includes `--hook-repair`, so a rejected patch carries the same structured
repair envelope as Claude and Grok. Codex still needs hook trust enabled for the project.

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

Then **restart Codex** — it does not hot-load MCP servers. Expect resource `ark://manifest`
and tools `validate_code`, `ark_check`, `ark_coverage`, `ark_place`.

Codex uses the best-effort local patch hook plus advisory MCP for discovery/validation and
`ark-check` as the hard merge backstop. Register all three as soon as the repo is adopted.

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

When a valid project `.codex/config.toml` exists, doctor treats it as the effective binding and
does not report an unrelated home primary. Without a project binding, doctor surfaces the
legacy multi-project state. **Deferred (fix when using Codex):**
non-temp Codex-home gaps (`codex-home-multi-project`, stale `$CODEX_HOME/skills`) are
severity **info**, marked `deferred: true`, and omitted from Top actions when the session
host is known and not Codex — `/ark-upgrade` on Grok/Claude is not Incomplete because of
them. **Temp/upgrade primary roots** stay fail-closed urgent (rewritten, not multi-project).

### Codex skill catalog (SKILL.md, not flat prompts)

Codex discovers skills as directories containing `SKILL.md` (Agent Skills standard):

| Scope | Path |
|-------|------|
| **Repo** (written by `--tools codex`) | `.agents/skills/<name>/SKILL.md` |
| **Home** (optional `--codex-home`) | `$CODEX_HOME/skills/<name>/SKILL.md` |

Flat `.codex/prompts/*.md` files are **not** the invocable skill catalog. Install writes the
repo catalog above so AGENTS.md `/ark-*` references match what Codex can load. After install,
Ark verifies those references against each selected host catalog.

**Parity & honesty (doctor / install):**

- Doctor distinguishes **missing / stale / legacy-prompts-only** for repo (`.agents/skills`) and
  home (`$CODEX_HOME/skills`). Home debt is **deferred** when the session host is not Codex.
- Legacy flat prompts alone are reported as non-loadable skill debt with a
  `--skills-only --tools codex --force` (repo) or `--codex-home --force` (home) fix.
- Codex **write path is advisory**: MCP + best-effort `.codex/hooks.json` is **not** a hard
  write boundary and is **not** equivalent to Claude/Grok PreToolUse hard-write + repair.
  The hard merge backstop is CI `--strict-merge` (or `--strict`) plus a required status check.
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
- exit `0` → allow; exit `2` → block, human-readable violations on stderr
- Grok payloads also get `{ "decision": "deny", "reason": "…" }` on stdout when blocked
- plumbing problems (no stdin, non-source files, files outside `--root`) never block

## ESLint (editor feedback) — same contract as CI

For in-editor red squiggles that match **`arkgate-check`**, add the ESLint plugin.
Layer imports and purity globals are driven by **`ark.config.json`** (walk-up from the
linted file): same layer globs, specificity, `exclude`, and `rules[]` edges as the CI gate.

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

**Parity notes (2.5+):**

- Relative imports are resolved to on-disk TS/JS targets; package bare imports are left to CI/TS.
- Type-only and value forbidden edges both error (same pass/fail as `arkgate-check`).
- `no-forbidden-globals` applies from the file layer’s `forbiddenGlobals`; the `globals` option is only a standalone fallback when no project config applies, never an override that weakens the project contract. Layers without either surface are not inventively restricted. `process` also owns exact value imports of `process` / `node:process`; type-only forms, subpaths, and `child_process` stay excluded. If the same layer also denies the `process` capability, this rule is the single `FORBIDDEN_GLOBAL` voice.
- Without `ark.config.json`, `no-domain-infra-imports` falls back to a domain→infra path heuristic.

Rule ids are `ark/<kebab-name>`. Individual rules are also on `ark.rules` if you wire them by hand.
Prefer keeping editor + CI on the same `ark.config.json`. Use the rule-local `globals` list only
for standalone linting where no project contract applies.

## CI backstop

Whatever the agent side does, run the merge profile in CI:

```yaml
- run: npx ark-check --root . --config ark.config.json --strict-merge
```

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

ArkGate uses the TypeScript compiler API for the governed source files. The repository scanner
and `createAICodeGate({ typescript })` recognize these dependency forms:

- `import ... from 'literal'`, side-effect imports, and `export ... from 'literal'`;
- TypeScript `import x = require('literal')` external-module references;
- direct `import('literal')` and direct `require('literal')` calls; and
- relative, tsconfig path-alias, package, and installed workspace-package targets that resolve
  to source inside the project root. Third-party or escaped targets are deliberately not governed.

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
