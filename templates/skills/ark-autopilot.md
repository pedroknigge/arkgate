---
name: ark-autopilot
description: The end-to-end architecture co-pilot for non-developers. One flow: look at the project, set up the guardrails, then drive the plan to a clean architecture — auto-applying the safe fixes and proposing the rest, always validated by ark-check, never weakening the gate. Composes setup + plan + the apply loop. Autonomous within those limits.
---

# /ark-autopilot — Get to a sound architecture, end to end

This is the co-pilot's top-level flow. It composes the three primitives — **plan** (Phase F),
the guided setup (Phase G), and the **loop** (Phase H) — into one experience that takes a
non-developer from "I have a project" to "governed, cleaned up, and enforced from now on."

**The rule that keeps it safe:** you (the agent) make edits; **Ark decides what may land.** Only
`mechanical-safe` changes are auto-applied (validated, with rollback); everything `judgment` is
PROPOSED for a human decision. Code only — never DB/schema, never weakening the gate.

## Two entry styles, three operating modes, one contract

**Who is driving** (entry style):

- **Newbie (default here):** run the WHOLE flow with plain-language explanations and an
  approval prompt before anything non-trivial. The user never needs to know a preset or a rule
  name. This skill is that flow.
- **Expert:** skip the autopilot and use the pieces directly — `ark init` / `/ark-contract` to
  shape the contract, `ark-check --plan` to see the work, `/ark-fix` for targeted fixes,
  `ark-check --strict-config` as the gate. Point them there and stop.

**What Ark is doing right now** (operating mode — read from `ark start` / `--plan` / `--coverage`):

- **Suggest** — thin or greenfield project: propose an application shape and install a starter contract.
- **Adapt** — brownfield or low `governed%`: match the contract to the real layout, raise coverage,
  freeze only real debt. A clean plan with ~0% governed is **not** done — route to `--coverage` / `/ark-adopt`.
- **Enforce** — `goal.met` is true *and* governed coverage is meaningful: write gate + CI hold the line.

Never tell a user "your architecture is guarded" while `--plan` reports `goal.met: false` or
`governedPercent` is low.

## Flow (newbie tier)

1. **Set up if needed.** If there's no `ark.config.json`, run the guided setup: `ark start`
   (which itself uses `ark-check --recommend` to suggest a shape in plain language, then writes
   the config + agent/CI gates, and captures the **origin** architecture report under
   `.ark/reports/`). On an established codebase it adopts the real structure. If
   Ark is already set up, skip to step 2.

2. **Freeze / confirm the starting picture.** Always run once before changing code:

   ```bash
   npx ark-check --root . --config ark.config.json --report ark-report.html
   ```

   - If `.ark/reports/origin.json` did not exist, this **creates the origin snapshot** (day-one
     baseline). Do **not** pass `--reset-origin` unless the user explicitly wants a new baseline.
   - Open / point the user at `ark-report.html` (and `.ark/reports/origin.html` when first created).
   - This is the “before” picture the autopilot will improve against.

3. **Contract adopt first when coverage is empty or thin.** Run `ark-check --plan --json`.
   If `goal.emptyScope` is true, `goal.met` is false with low `governedPercent`, or
   `totalFiles` is 0 — **do not** treat the tree as done. Run:
   ```bash
   npx ark-check --suggest-include --json
   npx ark-check --adopt-contract --write   # expands include + UI patterns; never weakens rules
   npx ark-check --coverage
   ```
   Only after in-scope files are non-zero and governed% is meaningful, continue.

4. **Show the plan.** Run `ark-check --plan` and explain it in outcome terms: how many fixes are
   _safe to auto-apply_ vs _need your decision_ vs _deferred_, and what the goal is (a clean,
   enforced architecture). Safe auto steps are only the three `mechanical-safe` kinds:
   type-only type move, pure-type **file** relocate, and converting static imports of pure-type
   modules to `import type` (see `/ark-loop`). Confirm before changing anything.

5. **Drive the loop.** Hand off to **`/ark-loop`**: in a discardable git worktree, auto-apply
   the `mechanical-safe` steps one at a time (match each `remediationKind`; validate with
   `ark-check`, roll back regressions), and PROPOSE each `judgment` step in plain language for
   a yes/no. Loop until the plan's `goal.met` is true or a round makes no progress.

6. **Confirm it stays clean.** Verify the gates are installed and active so the architecture is
   enforced from now on (in CI, and at write time if the MCP hook is wired) — the
   "and stays that way" half of the promise. Run the final `ark-check --strict-config`.

7. **Close with the after report + evolution.** Run again:

   ```bash
   npx ark-check --root . --config ark.config.json --report ark-report.html
   ```

   The HTML now includes **Evolution vs origin** (score, governed%, violations, files per layer)
   when origin already existed. Point the user at:
   - `ark-report.html` / `.ark/reports/latest.html` — **after**
   - `.ark/reports/origin.html` — **before** (frozen)
   - `.ark/reports/history/` — optional JSON trail

8. **Report honestly, in plain language.** Summarize what was auto-applied, what you proposed
   and the user decided, and what's deferred (and why). Tie the narrative to the before/after
   report numbers. Show the diff. Only merge the worktree back after the user reviews. Never
   report "done / clean" while steps were skipped or while `goal.emptyScope` / low governed%.

## Operating rules

- Never weaken the gate to finish: no disabling rules, editing `ark.config.json` to allow a bad
  edge, or baselining a fresh violation. Fix the code, or propose a contract change via
  `/ark-contract` with its before/after impact.
- If most violations concentrate on one edge, that's a contract smell — stop and route to
  `/ark-contract`, don't grind N fixes.
- Bias to proposing: when unsure a change preserves behavior, treat it as `judgment`.
- Everything traces to Ark's own outputs (`ark-check --plan --json`, `--recommend`) — never
  invent architecture advice.
