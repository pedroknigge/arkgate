# How to install agent gates

```bash
npx ark-check --install-agent-gates
npx ark-check --install-agent-gates --tools claude,cursor,codex
```

Installs:

- Write-gate hook configuration
- MCP server entry (`.mcp.json` or equivalent)
- `/ark-*` skills including **`/ark-architect`**

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