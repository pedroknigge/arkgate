# How to install agent gates

```bash
npx arkgate-check --install-agent-gates
npx arkgate-check --install-agent-gates --tools claude,cursor,codex,grok
# aliases: ark-check …
```

Installs:

- Write-path configuration (Claude/Grok/Antigravity/Cursor hard PreToolUse when covered;
  Codex hard complete local `apply_patch`; OpenCode advisory)
  — PreToolUse / Cursor `preToolUse` uses **`--hook-repair`** (W4): on deny, stderr may include
  `ARK_REPAIR_JSON` / `ARK_AUTOPATCH_JSON` for hosts that re-inject a patch.
  Still exit 2 / hard block; never silent write. Drop `--hook-repair` for
  reject-only prose, or set `ARK_HOOK_REPAIR=0` and omit the flag.
- MCP server entry (`.mcp.json`, Cursor/Codex/Grok equivalents)
- `/ark-*` skills: five doors **`/ark-adopt`**, **`/ark-place`**, **`/ark-autopilot`**,
  **`/ark-explore`**, **`/ark-upgrade`** (other names are shortcuts)

| Host | Extra paths |
|------|-------------|
| Claude Code | `.claude/settings.json`, `.claude/skills/` |
| Cursor | `.cursor/mcp.json`, `.cursor/hooks.json`, `.cursor/rules/ark.mdc`, `.agents/skills/` |
| Codex | `.codex/hooks.json`, `.codex/config.toml`, `.agents/skills/` |
| **Grok Build** | `.grok/config.toml`, `.grok/hooks/`, `.grok/skills/` |

See the [canonical host support matrix](../../README.md#host-enforcement-support) for the exact
local, MCP, CI, and repair guarantees. The table above only lists installed paths.

## Session hint

`arkgate-mcp --session-context` appends when governed coverage is low:

```
New to Ark? /ark-adopt or: arkgate-check --doctor
```

## Verify gates

```bash
npx arkgate-check --doctor
npx arkgate-check --require-gates
```

`--require-gates` implies strict config validation. It verifies content, not filenames alone:
`AGENTS.md` must contain the Ark contract and strict check, MCP registration must launch one Ark
server with an explicit project root, compact Codex must contain valid project config plus
SessionStart/PreToolUse Ark hooks, and CI must execute a fail-closed Ark command. Included but
unclassified source files therefore remain red.

Doctor JSON includes `writePath.mode` plus `enforcementLadder`: support, installation, observed
evidence, covered operations, bypassability, and CI honesty. MCP registration stays advisory.

After upgrading the package, refresh skills so agents see the latest plan kinds:

```bash
npx arkgate-check --install-agent-gates --skills-only --force
```

Full copy-paste setups: [docs/ai-gates.md](../ai-gates.md).
