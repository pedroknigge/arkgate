---
name: ark-coverage
description: Audit which Ark capabilities this project isn't using and report how to close each gap, ranked by value. Autonomous — reads the repo, decides, reports.
---

# /ark-coverage — What Ark can do for you that you're not using

You are auditing this project's use of the `ark-runtime-kernel` package. Work
autonomously: read everything from the repo, never ask questions you can answer
from files, and end with a ranked report.

## Operating rules

- Gather inputs yourself: `ark.config.json`, `package.json`, `.ark-baseline.json`,
  `.mcp.json`, `AGENTS.md`, agent config dirs (`.claude/`, `.cursor/`, `.codex/`,
  `.windsurf/`, `.clinerules/`, `.kiro/`, `.github/`), CI workflows, and the source tree.
  Read files with the Read tool and use targeted commands — do NOT `cat` whole
  configs or dump the full source tree to the terminal; the report is the output,
  not the raw files. Keep discovery quiet so the run stays readable.
- This skill makes no changes to project files by default: produce the report,
  then offer to apply the top recommendations. Do not modify files unless the
  user then says yes. (Running `ark-check` may write its own scan cache under
  `node_modules/.cache/` — that's fine; it never touches your source.)
- Explain each gap in plain language a developer new to architecture governance
  can follow — one sentence of "why this matters" per finding, no jargon without
  a one-line definition.

## Checklist to audit (compare repo reality against each capability)

1. **Config exists and is strict-clean** — is there an `ark.config.json`? Does
   `ark-check --root . --config ark.config.json --strict-config` pass? Run it.
2. **Baseline ratchet** — if the check reports violations, is `.ark-baseline.json`
   in use (`--baseline`)? An adopting codebase without a baseline blocks CI or,
   worse, runs without the gate.
3. **AI write gate per tool** — for every agent config dir that exists, is the Ark
   gate wired? Claude: `PreToolUse` hook calling `ark-mcp --hook` in
   `.claude/settings.json`. Cursor: `.cursor/mcp.json` + `.cursor/rules/ark.mdc`.
   Codex: MCP server registered. Windsurf/Cline/Copilot/Kiro: rule file present.
4. **Ark skills installed per tool** — do the detected tools have the `/ark-*`
   skills (`.claude/skills/ark-*`, `.cursor/commands/ark-*.md`, etc.)? If not:
   `ark-check --install-agent-gates`.
5. **CI gate** — `.github/workflows/ark-check.yml` (or equivalent) present and
   running `ark-check`? Is `--require-gates` used so missing gates fail CI?
6. **ESLint plugin** — is `ark-runtime-kernel/eslint` configured for in-editor
   feedback? (Check eslint config files.)
7. **Domain purity** — do domain-model layers declare `forbiddenGlobals`
   (e.g. `fetch`, `process`, `Date.now`, `Math.random`)? If domain code calls these
   directly, recommend adding the guard.
8. **Governed fraction (the headline honesty number)** — call the **`ark_coverage`**
   MCP tool if the `ark` server is available, else run
   `ark-check --root . --config ark.config.json --coverage --json`. It returns
   `governed` (`{ classifiedFiles, totalFiles, percent }`), per-layer file counts, the
   FULL `unclassified` list, `emptyLayers` (patterns matching nothing — usually wrong
   globs, the #1 monorepo mistake), and `suggestions` (each ungoverned directory with a
   PROPOSED canonical layer, or flagged as unrecognized). Lead your report with
   `governed.percent`: **a green check over a low fraction is a false green — the
   codebase is mostly UNCHECKED, not clean.** For every ungoverned directory, give the
   `suggestions` layer as the fix ("classify `src/lib/repositories` → PersistenceAdapters
   via /ark-contract"); for `unrecognized` ones, say it's the user's call. Do NOT
   hand-roll this with `find`/`readdir`.
9. **Concentrated violations = a contract smell, not debt** — run a normal check
   (`ark-check … --json`) and read `summary`. If `summary.concentrated` is true (most
   violations on one edge), flag it: the contract is probably wrong, not the code — e.g.
   app-land reaching a framework/kernel through a sanctioned entrypoint. Recommend fixing
   the contract (allow the edge, or split the target layer into a public surface +
   internals — /ark-contract) over freezing the false positives.
10. **Rule coverage** — the `--coverage --json` output lists `layersWithoutRules`:
    layers with no rule edge at all can import anything. Flag those where the
    dependency direction is obvious (e.g. domain → adapters should be denied).
11. **Runtime kernel** — does the app hand-roll things the kernel ships? Grep for
    homemade event buses, outbox tables, audit logs, workflow/saga orchestration,
    projections. If found, point to the matching `ark-runtime-kernel` module
    (event-bus, outbox, audit, workflow, projections) and `/ark-runtime`. But if the
    repo already runs a DI/kernel framework (dcouplr, NestJS), do NOT recommend
    replacing it — Ark governs the border around it, it doesn't supplant it.
12. **NestJS adapters** — if `@nestjs/common` is a dependency and
    `ark-runtime-kernel/nestjs` is unused, flag it.

## Output format

A ranked table (highest value first), then a one-paragraph summary:

| # | Unused capability | Evidence in this repo | How to enable (exact command or file) |

Close with: "Want me to apply the top N? I'll run the commands/diffs and finish
with a strict `ark-check`." Apply only what the user approves, then verify with
`ark-check --root . --config ark.config.json --strict-config` and report the
final state.
