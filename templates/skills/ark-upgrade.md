---
name: ark-upgrade
description: Update ark-runtime-kernel to the latest published version, then refresh gates and /ark-* skills for every agent CLI and re-verify the architecture check. Autonomous.
---

# /ark-upgrade — Update Ark and refresh its gates

Update the `ark-runtime-kernel` dependency to the latest published version and
bring the repo's generated artifacts and gates in line with it. This skill
checks the registry itself — don't assume the copy in `node_modules` is current.

## Steps

1. **Check the registry, then update.** Compare the installed version
   (`node_modules/ark-runtime-kernel/package.json`) against the latest published:
   `npm view ark-runtime-kernel version`. If a newer version exists, update it —
   `npm install -D ark-runtime-kernel@latest` (or the project's package manager:
   `pnpm add -D` / `yarn add -D`) — so the lockfile moves too; a pinned lockfile
   is exactly why "just re-run install" often stays on the old version. If the
   installed version already equals the latest, say so and still run steps 3-4
   (a prior version may have shipped skills/gates this repo never installed).
   Do NOT report "no update available" from the `node_modules` version alone —
   that reads stale.
2. **Changelog triage** — read `node_modules/ark-runtime-kernel/CHANGELOG.md`
   (shipped in the package) for the versions between old and new, and pick out
   only entries that affect THIS repo (new flags, changed defaults, new gate
   templates, new skills). Summarize each in one sentence with what, if
   anything, the repo must do about it. If the file is absent (older releases
   didn't ship it), fall back to `npm view ark-runtime-kernel@<version> ...` or
   the GitHub release notes — say which source you used.
3. **Refresh templates** — run `npx ark-check --install-agent-gates`. Without
   `--force` it only writes missing files (new skills, new tool templates) and
   skips existing ones. To pick up NEW versions of the `/ark-*` skills that a
   package update shipped, run `npx ark-check --install-agent-gates --skills-only
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
   `npx ark-check --install-agent-gates --skills-only --codex-home --force`. Keep
   `--skills-only` — without it, `--force` also rewrites customized gate files
   (AGENTS.md, CI, settings). This writes to the user's home dir — say so. (A normal
   `ark-check` now flags stale Codex-home skills when copies exist, so you don't have
   to remember.)
4. **Re-verify** — `npx ark-check --root . --config ark.config.json
   --strict-config` (with `--baseline .ark-baseline.json` if present). A new
   version may detect violations the old one missed: if new violations appear,
   apply `/ark-fix` reasoning to resolve them. If they are too numerous to fix
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

## Verify and report

End with a passing check. Report: latest published version, old → new version
(or "already latest"), changelog entries that mattered here (plain language),
files written/refreshed per tool, skipped customized files needing a manual
look, and the final check status.
