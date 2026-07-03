# Gating AI Agents with Ark

The write-path gate is what makes Ark different from every other architecture linter: generated code is validated against your architecture **before it lands on disk**, not after the PR is red.

Everything below uses the same `ark.config.json` as `ark-check` (CI) — one contract, enforced everywhere. Generate it once:

```bash
npx ark-check --init
```

For guided setup with prompts, use:

```bash
npx ark init
```

For non-interactive defaults, use:

```bash
npx ark init --yes
```

You can also generate only the starter gate files for common agent runtimes and CI:

```bash
npx ark-check --install-agent-gates
```

The command writes templates for `.mcp.json`, Claude hooks, Cursor MCP/rules,
GitHub Actions, `AGENTS.md`, and a Codex TOML snippet under `docs/`. It skips
existing files unless you pass `--force`, so review and commit only the templates
that match your project.

## Claude Code — hook (recommended, hard block)

`ark-mcp --hook` is a one-shot PreToolUse gate: it reads the hook payload from stdin, computes the **post-edit** file content, validates it, and exits `2` (block, violations on stderr) or `0` (allow). The agent sees the violations and self-corrects.

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

## Claude Code — MCP server (contract discovery + on-demand validation)

The MCP server exposes two things agents can use proactively:

- **`ark://manifest`** (resource) — the machine-readable architecture contract (layers + rules), so the agent can read the architecture before generating code.
- **`validate_code`** (tool) — validates a snippet against the architecture on demand.

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

`~/.codex/config.toml`:

```toml
[mcp_servers.ark]
command = "npx"
args = ["ark-mcp", "--root", ".", "--config", "ark.config.json"]
```

Same model as Cursor: MCP for discovery/validation, `ark-check` in CI as the hard gate.

## Any other agent runtime with shell hooks

If your runtime can run a shell command before file writes and pass the tool payload on stdin (Claude Code's PreToolUse contract), `ark-mcp --hook` works as-is. The contract:

- stdin: JSON `{ "tool_name": "Write|Edit|MultiEdit", "tool_input": { "file_path": ..., ... } }`
- exit `0` → allow; exit `2` → block, human-readable violations on stderr
- plumbing problems (no stdin, non-source files, files outside `--root`) never block

## ESLint (editor feedback)

For in-editor red squiggles on layer violations, add the ESLint plugin:

```js
// eslint.config.js
import ark from 'ark-runtime-kernel/eslint';

export default [ark.configs.recommended];
```

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
