---
name: ark-coverage
description: Audit which Ark capabilities this project is NOT using, rank the gaps by value, and report the exact command or diff to close each one. Fully autonomous — reads the repo, decides, reports.
---

# /ark-coverage — What Ark can do for you that you're not using

You are auditing this project's use of the `ark-runtime-kernel` package. Work
autonomously: read everything from the repo, never ask questions you can answer
from files, and end with a ranked report.

## Operating rules

- Gather inputs yourself: `ark.config.json`, `package.json`, `.ark-baseline.json`,
  `.mcp.json`, `AGENTS.md`, agent config dirs (`.claude/`, `.cursor/`, `.codex/`,
  `.windsurf/`, `.clinerules/`, `.kiro/`, `.github/`), CI workflows, and the source tree.
- This skill makes no changes to project files by default: produce the report,
  then offer to apply the top recommendations. Do not modify files unless the
  user then says yes. (Running `ark-check` may write its own scan cache under
  `node_modules/.cache/` — that's fine; it never touches your source.)
- Explain each gap in plain language a developer new to architecture governance
  can follow — one sentence of "why this matters" per finding, no jargon without
  a one-line definition.

## Checklist to audit (compare repo reality against each capability)

1. **Config exists and is strict-clean** — is there an `ark.config.json`? Does
   `npx ark-check --root . --config ark.config.json --strict-config` pass? Run it.
2. **Baseline ratchet** — if the check reports violations, is `.ark-baseline.json`
   in use (`--baseline`)? An adopting codebase without a baseline blocks CI or,
   worse, runs without the gate.
3. **AI write gate per tool** — for every agent config dir that exists, is the Ark
   gate wired? Claude: `PreToolUse` hook calling `ark-mcp --hook` in
   `.claude/settings.json`. Cursor: `.cursor/mcp.json` + `.cursor/rules/ark.mdc`.
   Codex: MCP server registered. Windsurf/Cline/Copilot/Kiro: rule file present.
4. **Ark skills installed per tool** — do the detected tools have the `/ark-*`
   skills (`.claude/skills/ark-*`, `.cursor/commands/ark-*.md`, etc.)? If not:
   `npx ark-check --install-agent-gates`.
5. **CI gate** — `.github/workflows/ark-check.yml` (or equivalent) present and
   running `ark-check`? Is `--require-gates` used so missing gates fail CI?
6. **ESLint plugin** — is `ark-runtime-kernel/eslint` configured for in-editor
   feedback? (Check eslint config files.)
7. **Domain purity** — do domain-model layers declare `forbiddenGlobals`
   (e.g. `fetch`, `process`, `Date.now`, `Math.random`)? If domain code calls these
   directly, recommend adding the guard.
8. **Layer coverage** — compare `ark.config.json` layers against directories that
   actually exist under `include`. Directories with source files but no matching
   layer pattern are ungoverned code. Also surface `suggestedLayers` from the
   `ark://manifest` MCP resource (they map to existing dirs not yet adopted).
9. **Rule coverage** — layers with no `rules` edges at all can import anything;
   flag layer pairs with no explicit rule where the dependency direction is obvious
   (e.g. domain → adapters should be denied).
10. **Runtime kernel** — does the app hand-roll things the kernel ships? Grep for
    homemade event buses, outbox tables, audit logs, workflow/saga orchestration,
    projections. If found, point to the matching `ark-runtime-kernel` module
    (event-bus, outbox, audit, workflow, projections) and `/ark-runtime`.
11. **NestJS adapters** — if `@nestjs/common` is a dependency and
    `ark-runtime-kernel/nestjs` is unused, flag it.

## Output format

A ranked table (highest value first), then a one-paragraph summary:

| # | Unused capability | Evidence in this repo | How to enable (exact command or file) |

Close with: "Want me to apply the top N? I'll run the commands/diffs and finish
with a strict `ark-check`." Apply only what the user approves, then verify with
`npx ark-check --root . --config ark.config.json --strict-config` and report the
final state.
