---
name: ark-autopilot
description: End-to-end architecture co-pilot — exploratory map of the real project, then setup, deep plan from source, mechanical-safe fixes, and judgment design. CLI is a sensor; you read and remediate files.
arkVersion: 2.9.1
---

# /ark-autopilot — Get to a sound architecture, end to end

Composes **explore + setup + plan + loop**. Safe default: auto-apply only `mechanical-safe`;
when the user says full apply / “al mango” / apply everything, also execute
**judgment** fixes you design from reading source (still validate with ark-check,
never weaken the gate).


## Related onboarding

- **Greenfield:** `/ark-architect` or `ark-check --recommend` / `ark start`.
- **Brownfield:** `/ark-adopt` — match contract to reality; do not force a starter preset.
- **Deep map only:** `/ark-explore` — reconnaissance without applying fixes.
- **Default path:** `ark start` → `/ark-autopilot` → `ark-check --doctor`.

## Dual engine (mandatory)

| Engine | Role |
|--------|------|
| **Deterministic** | `ark-check` plan/coverage/doctor, mechanical-safe kinds, write/CI gates, exit codes |
| **Exploratory** | You map **this** product’s real tree: entry points, packages, coupling, false greens, opportunities |

**Forbidden:** only printing `--plan` JSON or “4 safe / 4 judgment — approve?” without reading the violating files **and** without a short product map.

**Required:**
1. **Explore pass** (below) before claiming a loop strategy.
2. CLI sensor: `ark-check --plan --json`, coverage/doctor as needed.
3. **Open every file** in the plan’s `steps[]` (and its `target` if present) before classifying a fix.
4. **“Así te lo re-soluciono”** for each cluster: exact moves (extract type, relocate file, invert dependency).
5. Apply → re-run ark-check → rollback on regression.

## Explore pass (before grinding the plan)

Do this even if the plan is non-empty — plan lists *violations*, not *product reality*.

1. **Product one-liner** — README + main package(s) + what the user gets.
2. **Entry points** — apps, APIs, CLIs, workers (min paths named).
3. **Lived layout** — which dirs are really Domain / Application / I/O / UI vs what globs claim.
4. **False-green soft block** — doctor / coverage: empty Domain/Persistence while Application
   globs still cover I/O (`airtable`, `supabase`, `prisma`, `drizzle`, `repositories`, …).
   Doctor gap id: `contract-false-green-io-under-application`. If so → **`/ark-adopt`** or
   **`/ark-contract` first**; do not claim ENFORCE from type-only cleanup.
5. **Suggestive top bets** — 2–5 opportunities ranked (shape, extract, manifiesto, gates/DX),
   separate from mechanical-safe steps. User may defer; still list them.

Min bar: **≥8 source files** across **≥3 meaningful directories** (not only files in `steps[]`).

For a full reconnaissance report, run or fold in `/ark-explore`.

## Operating modes (detected, not picked)

- **Setup (Suggest):** no config → `ark start` / recommend shape.
- **Align (Adapt):** open debt, low honesty, or false-green → explore + adopt/loop; do not claim “guarded”.
- **Guard (Enforce):** `goal.met`, solid governed%, no false-green → install/confirm gates and stop.

## Flow

0. **Explore pass** — product map + false-green check + suggestive bets (see above).
1. **Setup if needed** — `ark start` if no `ark.config.json`. Trust `--recommend` / playbook:
   `vertical-slice-product` and `ddd-bounded-contexts` are first-class shapes (not hexagonal by default).
2. **Origin report** — `ark-check --report ark-report.html` (do not `--reset-origin` unless asked).
3. **Plan + code read** — `--plan --json`; read each step’s source/target; group by edge.
   Treat `peerIsolation` / cross-slice steps as **judgment** (never mechanical-safe).
4. **Concentrated edge?** — if one edge dominates, route to `/ark-contract` with a **source-based** diagnosis (not freeze).
5. **Worktree preferred** — discardable git worktree when possible.
6. **Mechanical-safe** — only kinds from `/ark-loop` table; one step, validate, rollback.
7. **Judgment** — default: propose with full “así te lo re-soluciono”. If user authorized full apply: implement the designed fix, validate, rollback on fail.
8. **Manifiesto** — if loose business rules surface (domain logic in UI/core), propose Domain placement + `intentPrefixes` / intents; apply config only via `/ark-contract` discipline (strict check after).
9. **Final report** — re-`--report`; evolution vs origin; **explore bets** still open vs auto vs judgment applied vs deferred.
10. **Strict check** — `ark-check --strict-config` (dead preset globs are advisory; real violations still fail).
11. **Core ratchet (when green)** — if plan `goal.met` and doctor still **ADAPT** only because
    populated cores are `optional: true`, run `ark-check --ratchet-cores` then `--doctor`.
    Never ratchet while active violations remain or false-green gap is open.

## Never

- Disable rules, broaden allows, or baseline **new** debt to “finish”.
- Claim clean while judgment steps were skipped without user decision.
- Claim ENFORCE / “done” when doctor reports `contract-false-green-io-under-application` (adopt first).
- Replace host Nest/DI with the runtime kernel unasked.
- Treat “plan empty” as “architecture is healthy” without the explore pass.

## Done criteria

- Explore pass completed (product map + paths read + bets listed).
- Every applied step validated by real `ark-check`.
- Final plan `goal.met` true **or** remaining steps listed with file-level proposals and why blocked.
- Report cites paths you changed, open **opportunities**, and report HTML paths.
