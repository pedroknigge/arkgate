---
name: ark-adopt
description: Onboard an existing codebase onto Ark — get the contract to reflect reality, classify ungoverned code, then freeze only genuine debt with a plan. Autonomous.
---

# /ark-adopt — Bring Ark into an existing codebase

You are onboarding this repository onto Ark. The goal is NOT "make the check
green" — it is to leave the project with a contract that reflects its real
architecture, most of the code actually governed, and only genuine debt frozen
with a plan to burn it down. A green check over a wrong contract or an ungoverned
tree is a FALSE green — worse than no gate, because it looks safe. Work autonomously.

Commands below are written as `ark-check` / `ark`; run each through the project's
package manager — `pnpm exec ark-check …` in a pnpm repo, `yarn ark-check …` in a
yarn repo, `npx ark-check …` under npm. Match the lockfile; never hardcode `npx` in
a pnpm/yarn repo (AGENTS.md shows the exact runner for this project).

## The guiding principle

**Ark protects the boundary AROUND a framework, not its internals.** If the repo
uses a DI/kernel framework (dcouplr, NestJS, a custom kernel), do NOT try to govern
its inside — declare its PUBLIC SURFACE (the entrypoints app code is meant to
import) as one layer and treat the rest as a black box. Governing the internals
duplicates the framework's own wiring and fights it.

## Steps

1. **Config** — if `ark.config.json` is missing, run `ark-check --init`. It detects
   the layer directories that exist, writes a config for them, and PROPOSES a layer
   for every ungoverned directory (sourced from the 11-layer profile + presets),
   flagging the ones it cannot place. If a config exists, keep it — don't regenerate
   unasked.

2. **Check + DIAGNOSE — before you freeze anything** — run
   `ark-check --root . --config ark.config.json --json` and read `summary`: it groups
   violations by edge, ranked. The critical signal is `summary.concentrated` /
   `dominantShare`: **when most violations are a single edge, the CONTRACT is almost
   always wrong, not the code.** (Real case: hundreds of API routes "violating"
   app→kernel because the framework's own `defineRoute` is the sanctioned entrypoint
   — false positives, not debt.) Investigate the dominant edge:
   - App-land reaching a framework/kernel through a legitimate entrypoint → fix the
     contract (step 3), do NOT freeze it.
   - Unrelated layers genuinely importing each other → real debt for the baseline.

3. **Make the contract reflect reality (via /ark-contract) BEFORE freezing:**
   - **Classify the ungoverned tree.** Run `ark-check --coverage --json`; read
     `governed.percent` and `suggestions`. If Ark governs a minority of the code, a
     green check means almost nothing. Add the proposed layers for the recognized
     directories; decide a layer for the ones flagged "unrecognized". Get `governed`
     high before trusting any check.
   - **Fix a concentrated edge at its source.** If the dominant edge is intended,
     either allow it or — better — split the target layer into a PUBLIC SURFACE (the
     entrypoints app code may import) and INTERNALS (denied). The breakdown's target
     subtrees show where the surface is. This facade split turns a wall of false
     positives into ~0 while still forbidding reach-arounds into internals.
   Re-run the check; the remainder should now be the genuine minority.

4. **Freeze the genuine debt** — run `ark-check --update-baseline`. If the set is
   still lopsided on one edge, Ark REFUSES and tells you the contract still looks
   wrong — heed it and return to step 3; do NOT `--force` past it just to get green.
   On success it writes `.ark-baseline.json`; tell the user to commit it (don't commit
   for them). From now `ark-check --baseline` fails only on NEW violations — the
   ratchet only moves toward zero (fixing a frozen violation shrinks the baseline).

5. **Gates + skills everywhere** — run `ark-check --install-agent-gates`. It
   auto-detects the agent CLIs in the repo and writes the write gate, rule files,
   package-manager-aware CI workflow, and the `/ark-*` skills for each (Kiro gets
   only its steering rule; Copilot only via `--tools copilot`). If a baseline was
   created, the generated CI already carries `--baseline`. For Codex, prompts load
   from `$CODEX_HOME/prompts`, not the repo — install there too with
   `ark-check --install-agent-gates --codex-home` (writes to their home dir; say so).

6. **Ratchet plan** — from `summary.edges` (ranked), write a short prioritized
   burn-down: which edge/cluster to fix first (biggest, or the one on the
   most actively-edited files per `git log`), that `/ark-fix` resolves each, and
   which items are real debt vs. deferred contract decisions.

## Operating rules

- Explain each step's WHY in one plain sentence — this is often the user's first
  contact with Ark. Define jargon inline ("baseline = the list of violations that
  existed before Ark, frozen so they don't block you while you fix them over time").
- Do NOT chase green by freezing false positives or loosening the contract blindly.
  The order is: contract reflects reality → classify → freeze only what's left.
  Getting to green the wrong way is the exact failure this skill exists to prevent.
- Don't overwrite customized files (`--force`) unless asked. Don't adopt the runtime
  kernel here (that's `/ark-runtime`) — a repo with its own DI framework should keep it.

## Verify and report

Finish with `ark-check --root . --config ark.config.json --strict-config
--baseline .ark-baseline.json` (omit `--baseline` if none) — it must pass. Report:
governed % before/after, files written, violations frozen (and how many false
positives you AVOIDED freezing by fixing the contract), the ratchet plan, and the
commands the team needs (`check`, `/ark-fix`, `/ark-coverage`).
