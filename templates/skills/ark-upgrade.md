---
name: ark-upgrade
description: Update arkgate to the latest published version, then refresh gates and /ark-* skills for every agent CLI and re-verify the architecture check. Autonomous.
---

# /ark-upgrade — Update ArkGate and refresh its gates

Update the `arkgate` dependency to the latest published version and
bring the repo's generated artifacts and gates in line with it. This skill
checks the registry itself — don't assume the copy in `node_modules` is current.

**Still on `ark-runtime-kernel`?** Migrate first (same product, new package name):

```bash
npm uninstall ark-runtime-kernel && npm install -D arkgate
npx arkgate-check --install-agent-gates --force
```

Guide: `docs/migrate-from-ark-runtime-kernel.md` in the package (or on GitHub).

**TypeScript 7 projects:** ArkGate falls back to a nested JS-API TypeScript when the
project's `typescript` main export is version-only (TS 7.0). After upgrade, point users at
`docs/typescript-support.md` if the gate or `ARK_DEBUG_TS=1` mentions fallback. Dual install
(TS6 JS API + TS7 CLI) is optional for tooling that still needs classic `tsc` APIs.

**MCP double-bin check (identity cutover):** after upgrade, open `.mcp.json` and
`.cursor/mcp.json`. `args` must contain **exactly one** of `arkgate-mcp` / `ark-mcp`
(prefer `arkgate-mcp`), never both. If both appear, run:

```
npx arkgate-check --install-agent-gates --migrate-commands
```

`ark upgrade` already runs migrate-commands; re-run it if an older 2.x left dual names.

**Adoption completeness:** run `npx arkgate-check --doctor` (or `--doctor --json`) and
read the **Adoption** section — host gaps, Codex home temp paths, optional-but-populated
core layers, missing origin snapshot, baseline policy. Fix commands are printed per gap.
HTML reports include the same Adoption card (separate from the 0–100 fitness score).

## Dual engine (mandatory)

| Engine | Role |
|--------|------|
| **Deterministic** | CLI / MCP / contract sensors — exit codes, plan kinds, coverage numbers, install status |
| **Exploratory** | You open **this** repo's real files and product surface before concluding |

The CLI is a **sensor**, never the whole job. Claiming done without the exploratory bar for this skill is **incomplete**.

## Fast path

One command does the whole flow — update the package, refresh gates + `/ark-*` skills
(and Codex home prompts), migrate command runners, and run the strict check:

```
arkgate upgrade
# (alias: ark upgrade)
```

Use it when the user just wants the update done. Run the detailed steps below instead when
you need to inspect the changelog first, handle a pnpm cooling-off window, or the one-liner
reports a problem to triage. Always refresh skills so agents pick up new `mechanical-safe`
kinds and TS guidance:

```
npx arkgate-check --install-agent-gates --skills-only --force
```

## Steps

1. **Check the registry, then update.** Compare the installed version
   (`node_modules/arkgate/package.json`) against the latest published:
   `npm view arkgate version`. If a newer version exists, update it —
   `npm install -D arkgate@latest` (or the project's package manager:
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
2. **Changelog triage** — read `node_modules/arkgate/CHANGELOG.md`
   (shipped in the package) for the versions between old and new, and pick out
   only entries that affect THIS repo (new flags, changed defaults, new gate
   templates, new skills). Summarize each in one sentence with what, if
   anything, the repo must do about it. If the file is absent (older releases
   didn't ship it), fall back to `npm view arkgate@<version> ...` or
   the GitHub release notes — say which source you used.
3. **Refresh templates** — run `ark-check --install-agent-gates`. Without
   `--force` it only writes missing files (new skills, new tool templates) and
   skips existing ones. To pick up NEW versions of the `/ark-*` skills that a
   package update shipped, run `ark-check --install-agent-gates --skills-only
   --force`: `--skills-only` scopes the overwrite to the canonical skills and
   leaves the gate files alone. Do NOT run a bare `--install-agent-gates --force`
   to refresh skills — it also overwrites `AGENTS.md` (often customized with the
   project's real layer table), `.claude/settings.json` (hooks/permissions), and
   `.github/workflows/ark-check.yml` (CI) with the generic templates, silently
   losing customizations. If the changelog says a GATE file changed, report the
   diff and let the user decide; never rewrite settings/CI/AGENTS.md without
   explicit approval.
   If you use Codex, its prompts live in `$CODEX_HOME/prompts` (`~/.codex/prompts`),
   not the repo, so a repo refresh never updates them. Refresh them there too:
   `ark-check --install-agent-gates --skills-only --codex-home --force`. Keep
   `--skills-only` — without it, `--force` also rewrites customized gate files
   (AGENTS.md, CI, settings). This writes to the user's home dir — say so. (A normal
   `ark-check` now flags stale Codex-home skills when copies exist, so you don't have
   to remember.)
   **Migrate stale command runners.** The package-manager-aware command templates
   (`pnpm exec` / `yarn` / `npx`) only apply to NEWLY written files, so a repo that adopted
   Ark before they shipped keeps a stale `npx` in its EXISTING gate files
   (`.claude/settings.json` hooks, `.mcp.json`, `AGENTS.md`, the `check:architecture` script).
   In a pnpm/yarn repo that means the write gate runs on a command the repo forbids. Run
   `ark-check --install-agent-gates --migrate-commands`: it rewrites ONLY the command runner
   in those files, preserving every customization (no `--force` clobber). A normal `ark-check`
   also flags this when it detects the mismatch.
4. **Re-verify** — `ark-check --root . --config ark.config.json
   --strict-config` (with `--baseline .ark-baseline.json` if present). A new
   version may detect violations the old one missed: if new violations appear,
   **STOP — do not continue this skill as complete.** **STOP — bulk residual debt: invoke /ark-loop or /ark-autopilot**
   (or `/ark-fix` for a small set). If they are too numerous to fix
   now, freezing them in the baseline (`--update-baseline`) is a valid stopgap
   but it silences NEW violations, so it requires explicit user approval first
   — never regenerate the baseline on your own to get a green check.

## Operating rules

- Cover EVERY detected agent CLI (`.claude/`, `.cursor/`, `.codex/`,
  `.windsurf/`, `.clinerules/`, `.kiro/`), not just the one running this skill —
  gates and skills must stay in sync across tools or the weakest tool becomes
  the hole in the fence.
- Never run `--force` blindly; customized files are the user's.
- Stop only if the changelog documents a breaking config change with two valid
  migration paths — then present both with a recommendation.

## Related onboarding

- After upgrade, re-run `ark-check --doctor` — `/ark-architect` and `ark-check --recommend` ship
  with the package for **greenfield** shape adoption.
- **Brownfield** repos: point users to `/ark-adopt` and `docs/brownfield-adoption.md`, not
  `/ark-architect`. Demo: `docs/demos/02-brownfield-baseline-adoption.md`.
- Refresh gates: `ark-check --install-agent-gates --force --skills-only` if skills are stale.

## Verify and report

End with a passing check. Report: latest published version, old → new version
(or "already latest"), changelog entries that mattered here (plain language),
files written/refreshed per tool, skipped customized files needing a manual
look, and the final check status.

## Completion contract (skill incomplete if missing)

End with **exactly** these headings (markdown `###`):

### Completion
- **Sensor:** commands/tools run
- **Opened:** real paths read (or `n/a` only if pure install/upgrade with no source analysis)
- **Result:** one-line outcome
- **Handoff:** `/ark-…` / CLI / `none`
- **Incomplete?** `no` | `yes — <what is missing>`

If a **STOP** handoff applies and you continued as if done, set **Incomplete?** to `yes`.
**Skill incomplete if missing** any of the bullets above.
