# How to install agent gates

```bash
npx ark-check --install-agent-gates
npx ark-check --install-agent-gates --tools claude,cursor,codex,grok
```

Installs:

- Write-gate hook configuration (Claude / Grok PreToolUse; Cursor advisory + MCP)
- MCP server entry (`.mcp.json`, Cursor/Codex/Grok equivalents)
- `/ark-*` skills including **`/ark-architect`** and **`/ark-autopilot`**

| Host | Extra paths |
|------|-------------|
| Claude Code | `.claude/settings.json`, `.claude/skills/` |
| Cursor | `.cursor/mcp.json`, `.cursor/rules/ark.mdc`, `.cursor/commands/` |
| Codex | `docs/ark-codex-config.toml` + home MCP/prompts |
| **Grok Build** | `.grok/config.toml`, `.grok/hooks/`, `.grok/skills/` |

## Session hint

`ark-mcp --session-context` appends when governed coverage is low:

```
New to Ark? Run /ark-architect or: ark-check --recommend
```

## Verify gates

```bash
npx ark-check --doctor
npx ark-check --require-gates
```

Full copy-paste setups: [docs/ai-gates.md](../ai-gates.md).