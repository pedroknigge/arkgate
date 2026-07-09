---
name: ark-loop
description: Drive ark-check --plan to zero active violations. Auto-apply only mechanical-safe kinds; design judgment fixes from real source. CLI is the validator — you edit code.
---

# /ark-loop — Apply the plan safely

Read Ark’s classified **plan**, work toward **goal.met**, one small step at a time,
validating every change with `ark-check` and rolling back regressions.


## Related onboarding

- **Greenfield:** `/ark-architect` or `ark-check --recommend` / `ark start`.
- **Brownfield:** `/ark-adopt` — match contract to reality; do not force a starter preset.
- **Default path:** `ark start` → `/ark-autopilot` → `ark-check --doctor`.

## Anti-wrapper rule (mandatory)

**Forbidden:** re-printing plan JSON without opening sources, or inventing new “safe” kinds.

**Required:**
1. `--plan --json` as sensor.
2. For each step you touch: **read** `file` and `target` source.
3. **“Así te lo re-soluciono”** — exact edit before applying.
4. After each apply: full gate re-run; rollback if targeted violation remains or new ones appear.

## mechanical-safe only (auto)

| `remediationKind` | What to do |
|-------------------|------------|
| `type-only-import-move` | Move type to owning layer; re-export for back-compat |
| `pure-type-file-relocate` | Relocate pure-type file to owning layer (or rename out of false Domain globs) |
| `import-type-from-pure-type-module` | Convert value import of pure-type module to `import type` |
| `import-type-of-type-exports` | Convert value-syntax named import/export of type-only exports from a mixed module to `import type` / `export type` |

Never auto: value imports (including mixed bindings with values), dynamic import/require, forbidden globals, cycles, infra moves.

## Steps

1. **Plan** — `ark-check --plan --json` (+ `--baseline` if used). If `goal.met`, stop.
2. **Worktree** — prefer discardable git worktree.
3. **Apply mechanical-safe** one-by-one with validate/rollback.
4. **Judgment** — propose with source-based design; apply only if user approved (or parent autopilot said full apply).
5. **Re-plan** after each round until dry, `goal.met`, or only judgment left without approval.
6. **Report** — auto-applied / proposed / deferred with paths; never claim clean if skipped.

## Operating rules

- Never weaken the gate (no rule disables, no fresh baselining of new debt).
- Concentrated single edge → stop and hand to `/ark-contract` with code evidence.
- When unsure behavior preservation → judgment, not mechanical-safe.

## Done criteria

- Gate confirms each kept edit.
- Honest residual list with **Así te lo re-soluciono** for anything left.
- If residual steps hide domain/business rules in the wrong layer, call out **manifiesto** work (`intentPrefixes` / Domain placement) via `/ark-contract` or `/ark-adopt`.
