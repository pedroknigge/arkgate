# How to install agent gates

```bash
npx structrail-check --install-agent-gates
npx structrail-check --install-agent-gates --tools claude,cursor,codex,grok
```

Installs:

- Write-path configuration (Claude/Grok hard PreToolUse; Cursor/Codex advisory MCP)
  — PreToolUse uses **`--hook-repair`** (W4): on deny, stderr may include
  `STRUCTRAIL_REPAIR_JSON` / `STRUCTRAIL_AUTOPATCH_JSON` for hosts that re-inject a patch.
  Still exit 2 / hard block; never silent write. Drop `--hook-repair` for
  reject-only prose, or set `STRUCTRAIL_HOOK_REPAIR=0` and omit the flag.
- MCP server entry (`.mcp.json`, Cursor/Codex/Grok equivalents)
- `/structrail-*` skills including **`/structrail-architect`**, **`/structrail-autopilot`**, **`/structrail-loop`**
  (with current `mechanical-safe` remediation kinds)

| Host | Extra paths |
|------|-------------|
| Claude Code | `.claude/settings.json`, `.claude/skills/` |
| Cursor | `.cursor/mcp.json`, `.cursor/rules/structrail.mdc`, `.cursor/commands/` |
| Codex | `docs/structrail-codex-config.toml` + home MCP/prompts |
| **Grok Build** | `.grok/config.toml`, `.grok/hooks/`, `.grok/skills/` |

See the [canonical host support matrix](../../README.md#host-enforcement-support) for the exact
local, MCP, CI, and repair guarantees. The table above only lists installed paths.

## Session hint

`structrail-mcp --session-context` appends when governed coverage is low:

```
New to Structrail? Run /structrail-architect or: structrail-check --recommend
```

## Verify gates

```bash
npx structrail-check --doctor
npx structrail-check --require-gates
```

Doctor JSON (`--doctor --json`) includes **`writePath`**: the active host's supported profile,
installed evidence, and whether PreToolUse is
`repair` (machine-readable autoPatch on deny), `reject-only`, `mcp-only`, or
`none` — plus `prepareWrite` / `autoPatch` booleans for leads.

After upgrading the package, refresh skills so agents see the latest plan kinds:

```bash
npx structrail-check --install-agent-gates --skills-only --force
```

Full copy-paste setups: [docs/ai-gates.md](../ai-gates.md).
