---
name: ark-adopt
description: Onboard an existing codebase onto Ark — config, gates for every agent CLI, a baseline that freezes current violations, and a burn-down plan. Autonomous.
---

# /ark-adopt — Bring Ark into an existing codebase

You are onboarding this repository onto Ark enforcement. The goal: enforcement
is live for NEW code today, existing violations are frozen (not blocking), and
there is a written plan to burn them down. Work autonomously.

## Steps

1. **Config** — if `ark.config.json` is missing, run `npx ark-check --init`.
   It detects existing layer directories and writes a config covering only what
   exists; undetected profile layers are printed as suggestions. If a config
   already exists, keep it — do not regenerate without being asked.
2. **First check** — run `npx ark-check --root . --config ark.config.json --json`
   and record the violation count. Zero violations: skip the baseline, you're done
   after step 4.
3. **Freeze** — run `npx ark-check --update-baseline`. This writes
   `.ark-baseline.json`; tell the user to commit it (don't commit on their
   behalf unless they ask). From now on
   `ark-check --baseline` fails only on NEW violations — the ratchet only moves
   toward zero (fixing a frozen violation permanently shrinks the baseline).
4. **Gates + skills everywhere** — run `npx ark-check --install-agent-gates`.
   It auto-detects the agent CLIs configured in the repo (Claude, Cursor, Codex,
   Windsurf, Cline, Kiro; Copilot only via `--tools copilot`) and writes the
   write gate, rule files, CI workflow, and the `/ark-*` skills for each — except
   Kiro, which has no command mechanism and gets only its steering rule file.
   Then tell the user to update the CI workflow / `check:architecture` script to
   pass `--baseline .ark-baseline.json` if a baseline was created.
   If you use Codex, its prompts load from `$CODEX_HOME/prompts` (`~/.codex/prompts`),
   not the repo, so install the skills there too so they work immediately:
   `npx ark-check --install-agent-gates --codex-home`. Tell the user — it writes to
   their home dir, not the repo.
5. **Ratchet plan** — group the frozen violations by root cause (same illegal
   edge, same file pair) and write a short prioritized burn-down list into the
   report: which cluster to fix first (biggest cluster or the one on the most
   actively-edited files per `git log`), and note that `/ark-fix` resolves each
   cluster.

## Operating rules

- Explain each step's WHY in one plain-language sentence as you report — this
  skill is often the user's first contact with Ark. No jargon without a
  definition ("baseline = the list of violations that existed before Ark, so
  they don't block you while you fix them over time").
- Do not overwrite existing files (`--force`) unless the user asked. Existing
  `AGENTS.md`/settings customizations are theirs.
- Stop only if generating the config would require choosing between genuinely
  ambiguous layer mappings the scan can't resolve — otherwise take the default
  and note it.

## Verify and report

Finish with `npx ark-check --root . --config ark.config.json --strict-config
--baseline .ark-baseline.json` (omit `--baseline` if none) — it must pass.
Report: files written, violation count frozen, ratchet plan, and the one-line
commands the team needs to know (`check`, `/ark-fix`, `/ark-coverage`).
