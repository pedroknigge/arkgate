# Host hooks

`--install-agent-gates` writes the hook file for each host you name.

## Sub-features

- `claude` writes `.claude/settings.json` with `--hook`.
- `cursor` writes `.cursor/hooks.json` with `--hook` and `"failClosed": true`.
- `codex` writes `.codex/hooks.json` with `--hook`.
- `grok` writes `.grok/hooks/ark-write-gate.json` with `--hook`.
- `antigravity` writes `.agents/hooks.json` with `--hook`.
- `opencode` writes `opencode.json` with `arkgate-mcp` and without `--hook`.

## How to get to it (user POV)

- `npx arkgate-check --install-agent-gates --tools claude,cursor,codex,grok,antigravity,opencode`
- After install, the host runs that hook on the write tools named in its file.

## Driving it with verify.mjs

Preconditions:

- Doctor prints `doctor ok`.
- The command runs in a temp copy of `eval/cases/domain-forbidden-global`, not in this checkout.

- **Install.** Run `node bin/ark-check.mjs --root <copy> --install-agent-gates --tools claude,cursor,codex,grok,antigravity,opencode --force`. Exit code `0`. Output contains `Agent gates for:`.
- **Hook files.** Read the six paths in Sub-features. Five contain `--hook`. `opencode.json` contains `arkgate-mcp` and does not contain `--hook`. Cursor's file contains `"failClosed": true`.
- **Proof.** `node .cursor/skills/verify-arkgate/verify.mjs --only host-hooks`.

## Gotchas

- OpenCode is advisory MCP. A missing `--hook` there is the expected file, not a failed install.
- Installing into this checkout rewrites `.cursor`, `.claude`, `.grok`, and `AGENTS.md`. Use the temp copy.
