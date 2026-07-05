---
name: ark-upgrade
description: After updating the ark-runtime-kernel package, refresh gates and /ark-* skills for every detected agent CLI, surface relevant changelog entries, and re-verify the architecture check. Autonomous.
---

# /ark-upgrade — Refresh Ark after a package update

The `ark-runtime-kernel` dependency was (or should be) updated. Bring the
repo's generated artifacts and gates in line with the installed version.

## Steps

1. **Version delta** — compare the installed version
   (`node_modules/ark-runtime-kernel/package.json`) against the last one this
   repo was generated for (git history of `AGENTS.md` / lockfile). If the user
   asked you to update too, run the package manager's update command first.
2. **Changelog triage** — read
   `node_modules/ark-runtime-kernel/CHANGELOG.md` for the versions in between
   and pick out only entries that affect THIS repo (new flags, changed
   defaults, new gate templates, new skills). Summarize each in one sentence
   with what, if anything, the repo must do about it.
3. **Refresh templates** — run `npx ark-check --install-agent-gates`. Without
   `--force` it only writes missing files (new skills, new tool templates) and
   skips existing ones. For files it skipped that the changelog says CHANGED,
   report the diff and let the user decide — do NOT rewrite them yourself.
   Never regenerate `.claude/settings.json` (hooks/permissions),
   `.github/workflows/ark-check.yml` (CI), or any host settings file without
   explicit user approval: those define how the agent itself is gated, so
   silently overwriting them removes the guard. Auto-rewriting is limited to
   `--force`, which is the user's call.
   If Codex is among the tools and any `.codex/prompts/*.md` were added or
   changed, they only take effect once copied to `~/.codex/prompts` (Codex reads
   prompts from there, not the repo). Offer to copy them yourself —
   `mkdir -p ~/.codex/prompts && cp .codex/prompts/*.md ~/.codex/prompts/` — and
   tell the user (it writes to their home dir, not the repo).
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

End with a passing check. Report: old → new version, changelog entries that
mattered here (plain language), files written/refreshed per tool, skipped
customized files needing a manual look, and the final check status.
