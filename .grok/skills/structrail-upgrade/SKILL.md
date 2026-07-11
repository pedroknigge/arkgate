---
name: structrail-upgrade
description: Update structrail to the latest published version, then refresh gates and /structrail-* skills for the active agent host (defer inactive hosts like Codex when not in use) and re-verify the architecture check. Autonomous.
structrailVersion: 3.0.0
---

# /structrail-upgrade — Update Structrail and refresh its gates

Update the `structrail` dependency to the latest published version and
bring the repo's generated artifacts and gates in line with it. This skill
checks the registry itself — don't assume the copy in `node_modules` is current.

**Still on `ark-runtime-kernel`?** Migrate first (legacy package, same product lineage):

```bash
npm uninstall ark-runtime-kernel && npm install -D structrail
npx structrail-check --install-agent-gates --force
```

Guide: `docs/migrate-from-ark-runtime-kernel.md` in the package (or on GitHub).

**TypeScript 7 projects:** Structrail falls back to a nested JS-API TypeScript when the
project's `typescript` main export is version-only (TS 7.0). After upgrade, point users at
`docs/typescript-support.md` if the gate or `STRUCTRAIL_DEBUG_TS=1` mentions fallback. Dual install
(TS6 JS API + TS7 CLI) is optional for tooling that still needs classic `tsc` APIs.

**MCP double-bin check (identity cutover):** after upgrade, open `.mcp.json` and
`.cursor/mcp.json`. `args` must contain exactly one MCP bin: prefer `structrail-mcp`;
`arkgate-mcp` and `ark-mcp` are v3 compatibility inputs only. If multiple appear, run:

```
npx structrail-check --install-agent-gates --migrate-commands
```

`structrail upgrade` already runs migrate-commands; re-run it if an older 2.x left dual names.

**Adoption completeness:** run `npx structrail-check --doctor` (or `--doctor --json`) and
read the **Adoption** section — host gaps, Codex home temp paths, optional-but-populated
core layers, missing origin snapshot, baseline policy. Fix commands are printed per gap.
HTML reports include the same Adoption card (separate from the 0–100 fitness score).

**Active host vs deferred hosts:** green the **session host** (Grok, Claude, Cursor, …)
and repo gates first. Codex home (`$CODEX_HOME` prompts + `config.toml` MCP multi-project)
is **deferred** unless this session is Codex or the user asked to fix Codex. Doctor marks
those gaps `deferred` / info and does not put them in Top actions. A temp/upgrade MCP
`--root` stays urgent (fail-closed rewrite). Never set **Incomplete?** because of deferred
Codex debt.

## Dual engine (mandatory)

| Engine | Role |
|--------|------|
| **Deterministic** | CLI / MCP / contract sensors — exit codes, plan kinds, coverage numbers, install status |
| **Exploratory** | You open **this** repo's real files and product surface before concluding |

The CLI is a **sensor**, never the whole job. Claiming done without the exploratory bar for this skill is **incomplete**.


## Subagent fan-out (optional, host-dependent)

If the host supports **parallel subagents** and the task splits cleanly (e.g. multiple
dirs to sample), fan out read-only scouts; otherwise **fall back to sequential**.
Parent merges and still emits the **### Completion** contract. Never parallel-write
the same files or weaken the gate.

## Fast path

One command does the whole flow — update the package, refresh gates + `/structrail-*` skills
(and best-effort Codex home prompts when `~/.codex` exists), migrate command runners,
and run the strict check:

```
structrail upgrade
# (v3 aliases: arkgate upgrade / ark upgrade)
```

Use it when the user just wants the update done. Run the detailed steps below instead when
you need to inspect the changelog first, handle a pnpm cooling-off window, or the one-liner
reports a problem to triage. Always refresh skills so agents pick up new `mechanical-safe`
kinds and TS guidance:

```
npx structrail-check --install-agent-gates --skills-only --force
```

## Steps

1. **Check the registry, then update.** Compare the installed version
   (`node_modules/structrail/package.json`) against the latest published:
   `npm view structrail version`. If a newer version exists, update it —
   `npm install -D structrail@latest` (or the project's package manager:
   `pnpm add -D` / `yarn add -D`) — so the lockfile moves too; a pinned lockfile
   is exactly why "just re-run install" often stays on the old version. If the
   installed version already equals the latest, say so and still run steps 3-4
   (a prior version may have shipped skills/gates this repo never installed).
   Do NOT report "no update available" from the `node_modules` version alone —
   that reads stale.
   **pnpm cooling-off:** if the repo enforces a pnpm `minimumReleaseAge` and the new
   version was published inside that window (common for a freshly-cut release), a plain
   `pnpm add` in loose mode can leave a lockfile that `pnpm install --frozen-lockfile` (what
   CI runs) then REJECTS. Do it cleanly: add the exact `<pkg>@<version>` to
   `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` FIRST, bump the dependency spec, then
   run a plain `pnpm install`, and verify with `pnpm install --frozen-lockfile` before moving
   on. Only exclude a first-party package you trust.
2. **Changelog triage** — read `node_modules/structrail/CHANGELOG.md`
   (shipped in the package) for the versions between old and new, and pick out
   only entries that affect THIS repo (new flags, changed defaults, new gate
   templates, new skills). Summarize each in one sentence with what, if
   anything, the repo must do about it. If the file is absent (older releases
   didn't ship it), fall back to `npm view structrail@<version> ...` or
   the GitHub release notes — say which source you used.
3. **Refresh templates** — run `structrail-check --install-agent-gates`. Without
   `--force` it only writes missing files (new skills, new tool templates) and
   skips existing ones. To pick up NEW versions of the `/structrail-*` skills that a
   package update shipped, run `structrail-check --install-agent-gates --skills-only
   --force`: `--skills-only` scopes the overwrite to the canonical skills and
   leaves the gate files alone. Do NOT run a bare `--install-agent-gates --force`
   to refresh skills — it also overwrites `AGENTS.md` (often customized with the
   project's real layer table), `.claude/settings.json` (hooks/permissions), and
   `.github/workflows/structrail-check.yml` (CI) with the generic templates, silently
   losing customizations. If the changelog says a GATE file changed, report the
   diff and let the user decide; never rewrite settings/CI/AGENTS.md without
   explicit approval.
   **Active host first.** Refresh skills for the host running this skill (e.g.
   `.grok/skills/`, `.claude/skills/`, `.cursor/commands/`). Repo-local copies for
   other detected hosts are fine to refresh in the same pass when cheap.
   **Codex is deferred when you are not on Codex.** Prompts live in
   `$CODEX_HOME/prompts` (`~/.codex/prompts`), not the repo. `structrail upgrade` may
   best-effort refresh that home when it exists; still list Codex under
   **Deferred hosts** and do **not** chase MCP multi-project / stale home skills
   until the user is on Codex (or asks). Fix command when needed:
   `structrail-check --install-agent-gates --skills-only --codex-home --force`
   (and `--tools codex` / `--force` for primary MCP rebind). Exception: temp or
   `structrail-upgrade` MCP `--root` paths — leave fail-closed rewrite to the CLI; do not
   block completion on multi-project noise.
   **Migrate stale command runners.** The package-manager-aware command templates
   (`pnpm exec` / `yarn` / `npx`) only apply to NEWLY written files, so a repo that adopted
   Structrail before they shipped keeps a stale `npx` in its EXISTING gate files
   (`.claude/settings.json` hooks, `.mcp.json`, `AGENTS.md`, the `check:architecture` script).
   In a pnpm/yarn repo that means the write gate runs on a command the repo forbids. Run
   `structrail-check --install-agent-gates --migrate-commands`: it rewrites ONLY the command runner
   in those files, preserving every customization (no `--force` clobber). A normal `structrail-check`
   also flags this when it detects the mismatch.
4. **Re-verify** — `structrail-check --root . --config structrail.config.json
   --strict-config` (with `--baseline .ark-baseline.json` if present). A new
   version may detect violations the old one missed: if new violations appear,
   **STOP — do not continue this skill as complete.** **STOP — bulk residual debt: invoke /structrail-loop or /structrail-autopilot**
   (or `/structrail-fix` for a small set). If they are too numerous to fix
   now, freezing them in the baseline (`--update-baseline`) is a valid stopgap
   but it silences NEW violations, so it requires explicit user approval first
   — never regenerate the baseline on your own to get a green check.

## Operating rules

- **Must green:** the **active session host** (skills + gates that host uses) and
  shared repo surfaces (`.mcp.json` dual-bin, command runners, architecture check).
- **May defer:** other hosts not used in this session. Always list them under
  **Deferred hosts** with the fix command — do not treat them as Incomplete.
  Codex home (global `$CODEX_HOME`) is the common case on Grok/Claude.
- **Optional sync:** if other repo-local tool dirs already exist (`.cursor/`,
  `.claude/`, …), refreshing their `/structrail-*` skills is good hygiene when cheap;
  it is not a reason to fail the skill when the active host is already current.
- Never run `--force` blindly; customized files are the user's.
- Stop only if the changelog documents a breaking config change with two valid
  migration paths — then present both with a recommendation.

## Related onboarding

- After upgrade, re-run `structrail-check --doctor` — `/structrail-architect` and `structrail-check --recommend` ship
  with the package for **greenfield** shape adoption.
- **Brownfield** repos: point users to `/structrail-adopt` and `docs/brownfield-adoption.md`, not
  `/structrail-architect`. Demo: `docs/demos/02-brownfield-baseline-adoption.md`.
- Refresh gates: `structrail-check --install-agent-gates --force --skills-only` if skills are stale.

## Verify and report

End with a passing check. Report: latest published version, old → new version
(or "already latest"), changelog entries that mattered here (plain language),
files written/refreshed for the **active host**, deferred hosts (if any),
skipped customized files needing a manual look, and the final check status.

## Completion contract (skill incomplete if missing)

End with **exactly** these headings (markdown `###`):

### Completion
- **Sensor:** commands/tools run
- **Opened:** real paths read (or `n/a` only if pure install/upgrade with no source analysis)
- **Active host:** e.g. `grok` / `claude` / `cursor` / `codex` (skills/gates OK or note)
- **Deferred hosts:** `none` | e.g. `codex — home MCP/prompts; fix when using Codex`
- **Result:** one-line outcome
- **Handoff:** `/structrail-…` / CLI / `none`
- **Incomplete?** `no` | `yes — <what is missing>`

If a **STOP** handoff applies and you continued as if done, set **Incomplete?** to `yes`.
**Deferred hosts (including Codex when not on Codex) never make Incomplete? yes.**
**Skill incomplete if missing** any of the bullets above (use `none` for Deferred hosts when empty).
