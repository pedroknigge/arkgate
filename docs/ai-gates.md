# Gating AI Agents with ArkGate

**ArkGate** (`arkgate`) is the architecture co-pilot for AI TypeScript (write gate · CI · plan/loop).
The write-path gate is what makes it different from every other architecture linter:
generated code is validated against your architecture **before it lands on disk**, not
after the PR is red.

Everything below uses the same `ark.config.json` as `arkgate-check` / `ark-check` (CI) — one
contract, enforced everywhere. Generate it once:

```bash
npx arkgate-check --init
# aliases: ark-check, ark init, arkgate start
```

For guided setup with prompts, use:

```bash
npx arkgate start
# or: npx ark init
```

For non-interactive defaults, use:

```bash
npx arkgate start --yes
# or: npx ark init --yes
```

You can also generate only the starter gate files for common agent runtimes and CI:

```bash
npx arkgate-check --install-agent-gates
```

The command writes templates for `.mcp.json`, Claude hooks, Cursor MCP/rules,
GitHub Actions, `AGENTS.md`, a Codex TOML snippet under `docs/`, and (when
selected) Grok Build project files under `.grok/`. It skips existing files unless
you pass `--force`, so review and commit only the templates that match your project.

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
            "command": "npx ark-mcp --hook --root \"$CLAUDE_PROJECT_DIR\" --config ark.config.json"
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
After edits run: npx ark-check --root . --config ark.config.json --strict-config
```

The hook belongs in the **project's** `.claude/settings.json` (that's what
`--install-agent-gates` generates). It is also safe by construction if you prefer it in
your global settings: without an `ark.config.json` in the project, `--session-context`
prints nothing and exits 0, so non-Ark projects are untouched.

## Claude Code — MCP server (contract discovery + on-demand validation)

The MCP server exposes a resource and four tools agents can use proactively:

- **`ark://manifest`** (resource) — the machine-readable architecture contract (layers + rules), so the agent can read the architecture before generating code.
- **`validate_code`** (tool) — validates a snippet against the architecture on demand (the write-path gate).
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

Your hard backstop in Cursor is CI: `ark-check` fails the PR on anything that slips through.

## OpenAI Codex CLI

Recommended for Ark projects.

`~/.codex/config.toml`:

```toml
[mcp_servers.ark]
command = "npx"
args = ["ark-mcp", "--root", ".", "--config", "ark.config.json"]
```

Same model as Cursor: MCP for discovery/validation, `ark-check` in CI as the hard gate.
For Ark projects, register the MCP server as soon as the repo is adopted so the agent
has the contract available from the first edit.

`ark-check --install-agent-gates --tools codex` auto-merges absolute paths into
`~/.codex/config.toml` and can install `/ark-*` prompts with `--codex-home`.

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

Then restart Grok or refresh via `/mcps`. Pair with CI `ark-check` as the hard merge gate.

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
write) — keep `ark-check` in CI as the hard gate.

## Any other agent runtime with shell hooks

If your runtime can run a shell command before file writes and pass the tool payload on stdin (Claude Code or Grok PreToolUse contracts), `ark-mcp --hook` works as-is. The contract:

- stdin (Claude): JSON `{ "tool_name": "Write|Edit|MultiEdit", "tool_input": { "file_path": ..., ... } }`
- stdin (Grok): JSON `{ "toolName": "write|search_replace|…", "toolInput": { "file_path": ..., ... } }` (also accepts Claude names)
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
  // no-raw-event-publish + require-publish-source → runtime event hygiene
];
```

**Parity notes (2.5+):**

- Relative imports are resolved to on-disk TS/JS targets; package bare imports are left to CI/TS.
- Type-only and value forbidden edges both error (same pass/fail as `arkgate-check`).
- `no-forbidden-globals` only applies when the file’s layer declares `forbiddenGlobals` (or you pass a `globals` option). Layers without a purity list are not inventively restricted.
- Without `ark.config.json`, `no-domain-infra-imports` falls back to a domain→infra path heuristic.

Rule ids are `ark/<kebab-name>`. Individual rules are also on `ark.rules` if you wire them by hand.
Prefer keeping editor + CI on the same `ark.config.json` — do not maintain a parallel globals list unless you intentionally override.

## CI backstop

Whatever the agent side does, gate the merge:

```yaml
- run: npx ark-check --root . --config ark.config.json --strict-config
```

Adopting Ark on an existing codebase with violations? Freeze them once and ratchet down:

```bash
npx ark-check --update-baseline   # writes .ark-baseline.json — commit it
npx ark-check --baseline          # only NEW violations fail
```
