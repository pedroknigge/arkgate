# How to install agent gates

```bash
npx arkgate-check --install-agent-gates
npx arkgate-check --install-agent-gates --tools claude,cursor,codex,grok
# aliases: ark-check …
```

Installs:

- Write-gate hook configuration (Claude / Grok PreToolUse; Cursor advisory + MCP)
  — PreToolUse uses **`--hook-repair`** (W4): on deny, stderr may include
  `ARK_REPAIR_JSON` / `ARK_AUTOPATCH_JSON` for hosts that re-inject a patch.
  Still exit 2 / hard block; never silent write. Drop `--hook-repair` for
  reject-only prose, or set `ARK_HOOK_REPAIR=0` and omit the flag.
- MCP server entry (`.mcp.json`, Cursor/Codex/Grok equivalents)
- `/ark-*` skills including **`/ark-architect`**, **`/ark-autopilot`**, **`/ark-loop`**
  (with current `mechanical-safe` remediation kinds)

| Host | Extra paths |
|------|-------------|
| Claude Code | `.claude/settings.json`, `.claude/skills/` |
| Cursor | `.cursor/mcp.json`, `.cursor/rules/ark.mdc`, `.cursor/commands/` |
| Codex | `docs/ark-codex-config.toml` + home MCP/prompts |
| **Grok Build** | `.grok/config.toml`, `.grok/hooks/`, `.grok/skills/` |

## Session hint

`arkgate-mcp --session-context` appends when governed coverage is low:

```
New to Ark? Run /ark-architect or: ark-check --recommend
```

## Verify gates

```bash
npx arkgate-check --doctor
npx arkgate-check --require-gates
```

After upgrading the package, refresh skills so agents see the latest plan kinds:

```bash
npx arkgate-check --install-agent-gates --skills-only --force
```

Full copy-paste setups: [docs/ai-gates.md](../ai-gates.md).