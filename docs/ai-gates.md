# Gating AI Agents with Structrail

**Structrail** (`structrail`) is the architecture co-pilot for AI TypeScript (write gate · CI · plan/loop).
On Claude Code and Grok Build, an installed and trusted PreToolUse hook can block matched writes
before they land on disk. Cursor and OpenAI Codex use advisory MCP validation at write time; CI is
their hard repository check. See the
[canonical host support matrix](../README.md#host-enforcement-support) before installing.

Everything below uses the same `structrail.config.json` as `structrail-check` (CI) — one
contract shared by every surface. Generate it once:

```bash
npx structrail-check --init
```

For guided setup with prompts, use:

```bash
npx structrail start
# or: npx structrail init
```

For non-interactive defaults, use:

```bash
npx structrail start --yes
# or: npx structrail init --yes
```

You can also generate only the starter gate files for common agent runtimes and CI:

```bash
npx structrail-check --install-agent-gates
```

The command writes templates for `.mcp.json`, Claude hooks, Cursor MCP/rules,
GitHub Actions, `AGENTS.md`, a Codex TOML snippet under `docs/`, and (when
selected) Grok Build project files under `.grok/`. It skips existing files unless
you pass `--force`, so review and commit only the templates that match your project.

**Doctor (W5):** `structrail-check --doctor --json` includes `doctor.writePath`
(`mode`: `repair` | `reject-only` | `mcp-only` | `none`, plus `prepareWrite` /
`autoPatch` flags), the supported profile for the active host, and the evidence actually found.
Supported capability and installed guarantee are deliberately separate.

If your project uses Codex or Grok, treat MCP registration as part of the default
setup, not an optional extra. Structrail works best when the agent can read `structrail://manifest`
before it writes code; that is the fast path to avoiding architecture drift during
generation.

## Claude Code — hook (recommended, hard block)

`structrail-mcp --hook` is a one-shot PreToolUse gate: it reads the hook payload from stdin, computes the **post-edit** file content, validates it, and exits `2` (block, violations on stderr) or `0` (allow). The agent sees the violations and self-corrects.

Like `structrail-check --baseline`, the hook ratchets: an edit is blocked only when it **adds**
violations relative to the file's current on-disk state, so files with pre-existing
(baselined) violations stay editable — they just can't get worse. New files block on
every violation.

### Opt-in repair payload (W4)

Default is **hard block with prose** on stderr. Hosts that can re-inject a fixed write
can enable a **machine-readable repair payload** (still exit `2` — **never** silent write):

| Enable | Effect on deny |
|--------|----------------|
| `--hook-repair` | Emit `STRUCTRAIL_REPAIR_JSON:…` and, when available, `STRUCTRAIL_AUTOPATCH_JSON:…` on stderr |
| `STRUCTRAIL_HOOK_REPAIR=1` | Same as `--hook-repair` (env, no template rewrite) |

`STRUCTRAIL_REPAIR_JSON` shape (stable additive):

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
`structrail_prepare_write` / judgment). Grok deny JSON also includes `autoPatch` + `"repair": true`
when repair mode is on.

`--install-agent-gates` writes Claude/Grok PreToolUse commands with `--hook-repair` enabled.
Reject-only installs: drop `--hook-repair` (or unset `STRUCTRAIL_HOOK_REPAIR`).

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
            "command": "npx structrail-mcp --hook --hook-repair --root \"$CLAUDE_PROJECT_DIR\" --config structrail.config.json"
          }
        ]
      }
    ]
  }
}
```

That's the whole setup. Try asking the agent to import a persistence adapter from your domain layer:

```
Structrail architecture gate blocked this write to src/domain/order.ts (layer: DomainModel):
- [FORBIDDEN_PATTERN] Forbidden pattern matched: /from ['"].*\/(infra|adapters|persistence|db)/i (line 1)
- [FORBIDDEN_IMPORT] Forbidden import target: "../adapters/persistence/pg-order-repository". (line 1)
Fix the violations and retry. The architecture contract is available as the structrail://manifest MCP resource.
```

## Claude Code — SessionStart context injection (know the rules before the first token)

The write gate teaches by rejection; the SessionStart hook teaches up front.
`structrail-mcp --session-context` prints a compact contract summary — layers, forbidden
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
            "command": "npx structrail-mcp --session-context --root \"$CLAUDE_PROJECT_DIR\" --config structrail.config.json"
          }
        ]
      }
    ]
  }
}
```

What the agent sees:

```
Structrail architecture contract governs this project (structrail.config.json is authoritative).
Layers:
  - DomainModel: src/domain/** — forbidden globals: fetch, process, Date.now, Math.random
  - PersistenceAdapters: src/adapters/persistence/**
Rules: 10 denied layer edge(s). Full contract: structrail://manifest MCP resource.
Baseline: 3 frozen violation(s) — only NEW violations fail; do not add to them.
After edits run: npx structrail-check --root . --config structrail.config.json --strict
```

The hook belongs in the **project's** `.claude/settings.json` (that's what
`--install-agent-gates` generates). It is also safe by construction if you prefer it in
your global settings: without a `structrail.config.json` in the project, `--session-context`
prints nothing and exits 0, so non-Structrail projects are untouched.

## Claude Code — MCP server (contract discovery + on-demand validation)

The MCP server exposes a resource and tools agents can use proactively (not an exhaustive list — `tools/list` is authoritative):

- **`structrail://manifest`** (resource) — the machine-readable architecture contract (layers + rules), so the agent can read the architecture before generating code.
- **`validate_code`** (tool) — validates a snippet against the architecture on demand (the write-path gate). May return additive **`autoPatch`** (W1) for mechanical-safe import-type rewrites.
- **`structrail_prepare_write`** (tool) — **W2:** place + constrain + validate + optional autoPatch + judgmentBrief + contentHash in one call (composes `structrail_place` + write gate).
- **`structrail_place`** (tool) — given a target file path, returns its layer, forbidden globals, and which layers it may / must not import. Call it *before* writing a new file so generated code lands in a governed location.
- **`structrail_check`** (tool) — runs the full architecture check and returns structured violations (applies the baseline automatically when one exists).
- **`structrail_coverage`** (tool) — per-layer file counts, the full unclassified-file list, and layers whose patterns match nothing.

Tools appear in the agent's tool list automatically — no skill or doc-reading needed — so the agent can query the contract instead of shelling out and parsing.

```bash
claude mcp add structrail -- npx structrail-mcp --root . --config structrail.config.json
```

or in `.mcp.json`:

```json
{
  "mcpServers": {
    "structrail": {
      "type": "stdio",
      "command": "npx",
      "args": ["structrail-mcp", "--root", ".", "--config", "structrail.config.json"]
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
    "structrail": {
      "command": "npx",
      "args": ["structrail-mcp", "--root", ".", "--config", "structrail.config.json"]
    }
  }
}
```

Cursor has no pre-write hook, so the gate is advisory at write time — pair it with a rules file so the agent actually calls it. `.cursor/rules/structrail.mdc`:

```markdown
---
description: Structrail architecture contract
alwaysApply: true
---

Before writing or editing any TypeScript source file, call the `validate_code`
tool from the `structrail` MCP server with the full post-edit file content and its
path. If it reports violations, fix them before writing. The architecture
contract is available as the `structrail://manifest` resource.
```

Your repository backstop in Cursor is CI: `structrail-check` fails its check on anything that slips
through. It blocks the merge only when that status is required by repository policy.

## OpenAI Codex CLI

Recommended for Structrail projects.

Unlike Claude/Cursor (project-local MCP files), **Codex loads MCP servers only from
`$CODEX_HOME/config.toml`** (default `~/.codex/config.toml`) — a **global** home file.
Hand-editing with relative `--root .` is wrong: Codex does not use the project as cwd, so
`.` resolves against the launch directory. Prefer absolute paths, or let Structrail write them:

```bash
npx structrail-check --install-agent-gates --tools codex
# optional: install /structrail-* slash prompts into $CODEX_HOME/prompts
npx structrail-check --install-agent-gates --codex-home
```

Example shape (absolute paths — also what install writes):

```toml
[mcp_servers.structrail]
command = "npx"
args = ["structrail-mcp", "--root", "/absolute/path/to/project", "--config", "/absolute/path/to/project/structrail.config.json"]
```

Then **restart Codex** — it does not hot-load MCP servers. Expect resource `structrail://manifest`
and tools `validate_code`, `structrail_check`, `structrail_coverage`, `structrail_place`.

Same model as Cursor for enforcement: advisory MCP for discovery/validation and `structrail-check` as
the hard CI check. It becomes a merge block only when the status is required. Register the MCP
server as soon as the repo is adopted.

### Multi-project Codex (home config last-wins)

`[mcp_servers.structrail]` is a **single primary** binding. If project A is already registered and
you install gates for project B **without** `--force`, Structrail does **not** silently steal
primary A. It writes a **scoped secondary** table:

```toml
[mcp_servers.structrail]            # primary — still project A
# ...

[mcp_servers.structrail_proj-b_a1b2c3d4]  # secondary — basename + path hash (no slug collisions)
# absolute --root for B
```

| Goal | Command |
|------|---------|
| Add B without moving primary | `structrail-check --install-agent-gates --tools codex` (no `--force`) |
| Make B the primary binding | `structrail-check --install-agent-gates --tools codex --force` |
| Doctor: primary points at another permanent project | gap id `codex-home-multi-project` (warn if no secondary yet and session host is unknown/Codex; **info + `deferred`** when the session host is known and not Codex — e.g. Grok/Claude/Cursor; info if a scoped secondary is already present) |
| When using Codex: refresh home skills/MCP | `structrail-check --install-agent-gates --skills-only --codex-home --force` |

`structrail-check --doctor` surfaces the multi-project state so you are not left thinking B owns
`structrail://manifest` when only a secondary table exists. **Deferred (fix when using Codex):**
non-temp Codex-home gaps (`codex-home-multi-project`, stale `$CODEX_HOME/prompts`) are
severity **info**, marked `deferred: true`, and omitted from Top actions when the session
host is known and not Codex — `/structrail-upgrade` on Grok/Claude is not Incomplete because of
them. **Temp/upgrade primary roots** stay fail-closed urgent (rewritten, not multi-project).

## Grok Build (xAI)

Grok reads project rules from **`AGENTS.md`**, project MCP from **`.grok/config.toml`**
(and repo-root `.mcp.json`), skills from **`.grok/skills/<name>/SKILL.md`**, and
hooks from **`.grok/hooks/*.json`**.

Install everything Structrail needs for Grok:

```bash
npx structrail-check --install-agent-gates --tools grok
```

That writes:

| Path | Role |
|------|------|
| `.grok/config.toml` | `[mcp_servers.structrail]` → `structrail-mcp` (relative `--root .`) |
| `.grok/hooks/structrail-write-gate.json` | SessionStart context + PreToolUse write gate |
| `.grok/skills/structrail-*/SKILL.md` | All `/structrail-*` skills (slash-invocable) |
| `AGENTS.md` + `.mcp.json` + CI | Shared with other hosts |

Grok also loads Claude/Cursor MCP and skill paths when compat is enabled, so a repo
already wired for Claude often “just works” in Grok — but the native `.grok/*` layout
is the supported, commit-friendly path.

**Write gate:** Grok’s PreToolUse uses camelCase payloads (`toolName` / `toolInput`)
and may call `write` / `search_replace`. `structrail-mcp --hook` accepts both Claude and Grok
shapes and returns a Grok-compatible `{ "decision": "deny", "reason": "…" }` on stdout
when it blocks.

**Trust:** the first time you open a project with hooks, run `/hooks-trust` (or
`grok --trust`) so project hooks and local MCP are allowed.

Manual MCP only:

```toml
# .grok/config.toml  (or: grok mcp add --scope project structrail -- npx structrail-mcp --root . --config structrail.config.json)
[mcp_servers.structrail]
command = "npx"
args = ["structrail-mcp", "--root", ".", "--config", "structrail.config.json"]
```

Then restart Grok or refresh via `/mcps`. Pair with CI `structrail-check`; require that status if it
must block merges.

## Instruction-tier agents: Windsurf, Cline, Copilot, Kiro, Roo Code, Continue, Gemini CLI

Agents without MCP or hook support still follow the contract through an always-on
project rule file. `structrail-check --install-agent-gates` generates them (auto-detected
from `.windsurf/`, `.clinerules/`, `.kiro/`, `.roo/`, `.continue/`, `.gemini/`;
Copilot is explicit-only):

```bash
npx structrail-check --install-agent-gates --tools windsurf,cline,copilot,kiro,roo,continue,gemini
```

| Tool | File written |
|------|--------------|
| Windsurf | `.windsurf/rules/structrail.md` |
| Cline | `.clinerules/structrail.md` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Kiro | `.kiro/steering/structrail.md` |
| Roo Code | `.roo/rules/structrail.md` |
| Continue | `.continue/rules/structrail.md` |
| Gemini CLI | `GEMINI.md` (its primary context file; also reads `AGENTS.md`) |

All of them derive from the same contract as `AGENTS.md` and the Cursor rule, so the
steps cannot drift. These are advisory (the agent reads rules; nothing blocks the
write). Keep `structrail-check` in CI and require its status when it must block merges.

## Any other agent runtime with shell hooks

If your runtime can run a shell command before file writes and pass the tool payload on stdin (Claude Code or Grok PreToolUse contracts), `structrail-mcp --hook` works as-is. The contract:

- stdin (Claude): JSON `{ "tool_name": "Write|Edit|MultiEdit", "tool_input": { "file_path": ..., ... } }`
- stdin (Grok): JSON `{ "toolName": "write|search_replace|…", "toolInput": { "file_path": ..., ... } }` (also accepts Claude names)
- exit `0` → allow; exit `2` → block, human-readable violations on stderr
- Grok payloads also get `{ "decision": "deny", "reason": "…" }` on stdout when blocked
- plumbing problems (no stdin, non-source files, files outside `--root`) never block

## ESLint (editor feedback) — same contract as CI

For in-editor red squiggles that match **`structrail-check`**, add the ESLint plugin.
Layer imports and purity globals are driven by **`structrail.config.json`** (walk-up from the
linted file): same layer globs, specificity, `exclude`, and `rules[]` edges as the CI gate.

```js
// eslint.config.js  (flat config)
import structrail from 'structrail/eslint';

export default [
  structrail.configs.recommended,
  // no-domain-infra-imports  → config-driven layer edges (type-only + value)
  // no-forbidden-globals     → layer.forbiddenGlobals from structrail.config.json
  // no-raw-event-publish + require-publish-source → runtime event hygiene
];
```

**Parity notes (2.5+):**

- Relative imports are resolved to on-disk TS/JS targets; package bare imports are left to CI/TS.
- Type-only and value forbidden edges both error (same pass/fail as `structrail-check`).
- `no-forbidden-globals` only applies when the file’s layer declares `forbiddenGlobals` (or you pass a `globals` option). Layers without a purity list are not inventively restricted.
- Without `structrail.config.json`, `no-domain-infra-imports` falls back to a domain→infra path heuristic.

Rule ids are `structrail/<kebab-name>`. Individual rules are also on `structrail.rules` if you wire them by hand.
Prefer keeping editor + CI on the same `structrail.config.json` — do not maintain a parallel globals list unless you intentionally override.

## CI backstop

Whatever the agent side does, run the merge profile in CI:

```yaml
- run: npx structrail-check --root . --config structrail.config.json --strict-merge
```

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

`structrail-check --doctor --json` reports counts under `doctor.safety`. An `any` cast is
reported as lost static assurance; it does not imply that a runtime schema was bypassed.

### Scanner soundness envelope

Structrail uses the TypeScript compiler API for the governed source files. The repository scanner
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
fallback and does not claim symbol-aware parity; the shipped `structrail-mcp` path supplies TypeScript.

Adopting Structrail on an existing codebase with violations? Freeze them once and ratchet down:

```bash
npx structrail-check --update-baseline   # writes .ark-baseline.json — commit it
npx structrail-check --baseline          # only NEW violations fail
```
