---
name: ark-autopilot
description: End-to-end architecture co-pilot — setup, deep plan from real code, apply mechanical-safe fixes, design and apply judgment fixes when the user asks for full apply. CLI is a sensor; you remediate files.
---

# /ark-autopilot — Get to a sound architecture, end to end

Composes **setup + plan + loop**. Safe default: auto-apply only `mechanical-safe`;
when the user says full apply / “al mango” / apply everything, also execute
**judgment** fixes you design from reading source (still validate with ark-check,
never weaken the gate).


## Related onboarding

- **Greenfield:** `/ark-architect` or `ark-check --recommend` / `ark start`.
- **Brownfield:** `/ark-adopt` — match contract to reality; do not force a starter preset.
- **Default path:** `ark start` → `/ark-autopilot` → `ark-check --doctor`.

## Anti-wrapper rule (mandatory)

**Forbidden:** only printing `--plan` JSON or “4 safe / 4 judgment — approve?” without reading the violating files.

**Required:**
1. CLI sensor: `ark-check --plan --json`, coverage/doctor as needed.
2. **Open every file** in the plan’s `steps[]` (and its `target` if present) before classifying a fix.
3. **“Así te lo re-soluciono”** for each cluster of steps: exact moves (extract type, relocate file, invert dependency).
4. Apply → re-run ark-check → rollback on regression.

## Operating modes (detected, not picked)

- **Setup (Suggest):** no config → `ark start` / recommend shape.
- **Align (Adapt):** open debt or low honesty → drive loop; do not claim “guarded”.
- **Guard (Enforce):** `goal.met` and solid governed% → install/confirm gates and stop.

## Flow

1. **Setup if needed** — `ark start` if no `ark.config.json`.
2. **Origin report** — `ark-check --report ark-report.html` (do not `--reset-origin` unless asked).
3. **Plan + code read** — `--plan --json`; read each step’s source/target; group by edge.
4. **Concentrated edge?** — if one edge dominates, route to `/ark-contract` with a **source-based** diagnosis (not freeze).
5. **Worktree preferred** — discardable git worktree when possible.
6. **Mechanical-safe** — only kinds from `/ark-loop` table; one step, validate, rollback.
7. **Judgment** — default: propose with full “así te lo re-soluciono”. If user authorized full apply: implement the designed fix, validate, rollback on fail.
8. **Manifiesto** — if loose business rules surface (domain logic in UI/core), propose Domain placement + `intentPrefixes` / intents; apply config only via `/ark-contract` discipline (strict check after).
9. **Final report** — `--report` again; evolution vs origin; honest summary of auto vs judgment vs deferred.
10. **Strict check** — `ark-check --strict-config` (dead preset globs are advisory; real violations still fail).

## Never

- Disable rules, broaden allows, or baseline **new** debt to “finish”.
- Claim clean while judgment steps were skipped without user decision.
- Replace host Nest/DI with the runtime kernel unasked.

## Done criteria

- Every applied step validated by real `ark-check`.
- Final plan `goal.met` true **or** remaining steps listed with file-level proposals and why blocked.
- Report cites paths you changed and reports HTML paths.
