---
name: ark-loop
description: Drive Ark's remediation plan to a clean architecture — a safe, reversible apply loop. Auto-applies only the changes Ark classes mechanical-safe (validating each with ark-check and rolling back regressions), proposes the judgment ones for your decision, and never weakens the gate. Autonomous within those limits.
---

# /ark-loop — Drive the plan to a clean architecture (safely)

This is the co-pilot's **loop** primitive: read Ark's classified **plan**, work toward the
**goal** (zero active violations without weakening the contract), one small step at a time,
validating every change with `ark-check` and rolling back anything that fails or regresses.

**The rule that makes this safe:** you (the agent) make edits; **Ark decides whether they're
allowed to land.** Only changes Ark classed `mechanical-safe` are auto-applied. Everything
`judgment` is PROPOSED for a human decision — never applied silently. Code only: never touch
DB schemas, migrations, or generated files.

If Ark isn't set up yet, run `ark start` (or `ark-check --recommend` then `ark init`) first.

## Steps

1. **Read the plan.** Run `ark-check --plan --json` (add `--baseline .ark-baseline.json` if the
   repo uses a baseline). It returns `goal` (with `met`, `activeViolations`, `autoApplicable`,
   `needsDecision`, `deferred`) and `steps[]`, each tagged `class` (`mechanical-safe` /
   `judgment` / `deferred`) with a `confidence` and a plain-language `rationale`. If
   `goal.met` is already true, report "nothing to do" and stop.

2. **Work in a discardable git worktree.** Create one (`git worktree add`) so the entire run is
   reversible and never disturbs the user's working tree. Do all edits there. Nothing is
   permanent until the user reviews the final diff.

3. **Apply the `mechanical-safe` steps, one at a time, validated.** For each such step
   (e.g. a type-only import moved to the layer that owns it + a re-export for back-compat):
   - Record the current active-violation count from the plan.
   - Make the edit at the SOURCE (fix the placement; don't add an `ark-*-disable` or edit the
     baseline/config to hide it).
   - Re-run the gate: `ark-check --root . --config ark.config.json --strict-config`
     (or `ark-check --baseline` in ratchet repos). **Keep** the change only if the targeted
     violation is gone AND no NEW violation appeared. Otherwise **roll it back**
     (`git checkout -- <files>`) and mark the step deferred with a one-line reason.

4. **Propose the `judgment` steps — do not auto-apply.** For each, present in plain language:
   what it is, the `rationale`, and a concrete proposed approach (e.g. "move this data access
   into a repository," "inject a Clock port"). Apply only the ones the user approves, each with
   the same validate-or-rollback discipline. Repository organization and cross-module refactors
   are the user's call.

5. **Loop until dry.** Re-read `ark-check --plan --json` after a round — fixing one edge can
   change others. Repeat step 3 while new `mechanical-safe` steps appear and progress is being
   made. Stop when `goal.met` is true, or when a round applies nothing new (no-progress), or
   when only `judgment`/`deferred` steps remain.

6. **Report honestly.** Show the final diff and a summary: what was AUTO-APPLIED (validated),
   what is PROPOSED (awaiting your decision), and what was DEFERRED (and why). Never report a
   clean/green result while steps were skipped. Only merge the worktree back after the user
   reviews.

## Operating rules

- Never weaken the gate to make the loop finish: no disabling rules, editing
  `ark.config.json` to allow a bad edge, or baselining a fresh violation. Fix the code, or
  propose a contract change via `/ark-contract` with its before/after impact.
- If most violations concentrate on one edge, that's a contract smell, not N fixes — stop the
  loop and hand off to `/ark-contract` (a broad `--plan` will show the concentration).
- `mechanical-safe` is deliberately narrow. When unsure whether a change preserves behavior,
  treat it as `judgment` and propose it. A wrong auto-apply costs more than an extra click.
- Verify with the gate, not by eye: a step counts as done only when `ark-check` confirms it.
