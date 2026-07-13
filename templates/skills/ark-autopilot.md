---
name: ark-autopilot
description: End-to-end co-pilot — explore first, dual plan A remediation + B pattern/Shape bets, mechanical-safe fixes, judgment design. Empty plan A is not healthy if design-weak. CLI is a sensor; you read and remediate files.
---

# /ark-autopilot — Get to a sound architecture, end to end

Composes **explore → sensors → dual plan → loop**. Safe default: auto-apply only
`mechanical-safe`; when the user says full apply / “al mango” / apply everything, also
execute **judgment** fixes you design from reading source (still validate with ark-check,
never weaken the gate).

**Not a plan grinder.** Empty `--plan` does **not** mean “architecture is healthy” without
the explore pass and dual-plan section B (pattern / Shape bets).

## When / not when

| Use `/ark-autopilot` when… | Do **not** use it when… |
|----------------------------|-------------------------|
| “Make architecture sound” end-to-end | Map only, no apply → `/ark-explore` |
| Brownfield or greenfield with apply | Only fitness numbers → `/ark-coverage` |
| User wants A + B planned and A executed | Single edge fix → `/ark-fix`; plan A only → `/ark-loop` |
| **Apply half of Q01 post-green path** (after explore map / when user wants full apply) | Skipping explore when doctor primary is Shape map-first |
| Spaghetti under ENFORCE: Shape work with user ok on B | Contract false-green first → `/ark-adopt` / `/ark-contract` STOP paths |

**Q01:** doctor’s single door is `/ark-explore` shape-focus → dual-plan B, **then** this skill only
to apply B with OK. Prefer that order when `postGreenPath` / design-weak is the primary residual.

## Related onboarding

- **Greenfield:** `/ark-architect` or `ark-check --recommend` / `ark start`.
- **Brownfield:** `/ark-adopt` — match contract to reality; do not force a starter preset.
- **Deep map only:** `/ark-explore` — full recon / dual-plan seed without applying.
- **Adoption fitness only:** `/ark-coverage` — governed% + capability gaps (not pattern dual-plan).
- **Default path:** `ark start` → `/ark-autopilot` → `ark-check --doctor`.

## Dual engine (mandatory)

| Engine | Role |
|--------|------|
| **Deterministic** | `ark-check` plan/coverage/doctor, mechanical-safe kinds, write/CI gates, exit codes, origin snapshot |
| **Exploratory** | You map **this** product’s real tree: entry points, coupling, false greens, field path, pattern debt |

**Forbidden:** only printing `--plan` JSON or “4 safe / 4 judgment — approve?” without a
decision-grade explore pass **and** without opening violating files.

**Required:**
1. **Explore pass** (below) **before** claiming a loop strategy — same bar as `/ark-explore`, budgeted.
2. CLI sensors: `--plan --json`, `--coverage --json` / `--doctor` as needed.
3. **Dual plan** always emitted (sections A and B).
4. **Open every file** in plan A `steps[]` (and `target` if present) before classifying a fix.
5. **“Así te lo re-soluciono”** for each A cluster and each B pattern bet.
6. Apply A → re-run ark-check → rollback on regression. **Never auto-apply B** as mechanical-safe.


## Subagent fan-out (optional, host-dependent)

When the user asks to go faster **or** the work naturally splits (multiple packages,
feature dirs, plan clusters), you **may** dispatch **subagents**:

| Host capability | Behavior |
|-----------------|----------|
| **Parallel subagents supported** (e.g. multi-agent / `spawn_subagent` / concurrent Agent tools) | Launch **2–N** agents in **one wave** with **disjoint path scopes**. Prefer **read-only** explore agents for mapping; at most **one writer** unless the host gives isolated worktrees. Parent merges findings, then runs `ark-check` once. |
| **Not supported** (single agent only) | **Fall back to sequential** — same checklist, one cluster/step at a time. Never claim parallel work you did not run. |

**Rules:**
1. Give each subagent a **tight brief**: paths in scope, sensor commands allowed, deliverable shape (paths opened + findings JSON or bullets).
2. **No shared mutable files** across parallel writers.
3. STOP handoffs and dual-engine rules still apply in every agent.
4. Parent owns the **### Completion** block (union of **Opened**, single **Handoff**).
5. Do **not** use subagents to weaken the gate or invent `mechanical-safe` kinds.

Useful first wave: **core product tree** | **field path** (examples/starters) | **agent install surfaces** (hooks vs templates).

## Explore pass (phase 0 — mandatory, first)

Do this **before** grinding plan A — plan lists *violations*, not *product reality*.  
Use the **`/ark-explore` decision-grade bar** (compressed into the autopilot report, not optional fluff).
Include explore **§G** when spaghetti / design-weak signals fire.

1. **Headline** — product one-liner + honesty (mode, governed%, false-green / false-promise /
   **ENFORCE·design-weak** risk).
2. **Map** — entry points, lived layout vs globs (one screen). **Concurrent patterns** table when ≥2 styles.
3. **Phase ladder** — name **Align | Stabilize | Shape** (explore §G).
4. **Field path** — if `examples/` / gallery / starter docs exist: open ≥2, **run** their check when cheap; flag soft-green or broken demos. Else `Field path: n/a` + internal norm.
5. **Agent/gate reality** — installed hooks vs install templates (e.g. `--hook` vs `--hook-repair`); MCP; CI gate present.
6. **Coupling** — fan-in / exports / importers for hotspots (LOC alone is a hint).
7. **False-green soft block** — doctor/coverage: empty Domain/Persistence while Application owns I/O (`airtable`, `supabase`, `prisma`, `drizzle`, `repositories`, …). Doctor gap id: `contract-false-green-io-under-application`. If so:
   **STOP — do not continue this skill as complete.** **STOP — false-green: invoke /ark-adopt or /ark-contract before claiming ENFORCE.** Do not claim goal.met / ENFORCE from type-only cleanup while doctor reports `contract-false-green-io-under-application`.
8. **Seed dual plan B** — 2–5 pattern / Shape bets ranked (impact × effort × enforceability). Each B row needs pilot + success signal; I/O bets need an **extraction card** (explore §G).

Min bar: **≥12 source files** across **≥4 meaningful directories** (not only files in `steps[]`).  
Standalone long report: `/ark-explore`. Adoption fitness only: `/ark-coverage`.

## Dual plan (always emit)

| Section | Source | Question | Auto-apply? |
|---------|--------|----------|-------------|
| **A. Remediation** | `--plan --json` + opened step files | What must change so the **gate** is honest? | Only `mechanical-safe` by default |
| **B. Pattern / Shape** | Explore §B/§G (not coverage alone) | What **design** must improve even if A is empty? | **Never** as mechanical-safe |

**Section A** — group by edge; treat `peerIsolation` / cross-slice as **judgment**.  
**Section B** examples: choose golden pattern + pilot migrate-on-touch, peerIsolation, move rules out of UI, write-path repair, split god modules, Domain placement / intents, facade SQL → port/adapter (extraction card). Cap **3–5** B rows. Each row: evidence path + **así te lo re-soluciono** + next skill/command + **success signal** + **pilot** (+ kill-switch if new layer).

B does **not** count as “architecture healthy finished.” Report B as `proposed | deferred | applied-with-user-ok`.  
When A is empty and B is non-empty: status is **`goal.met on edges · Shape residual open`** — never “done” without listing B.
Prefer CLI `patternBets[]` / `designSmells[]` when present; apply B only with explicit user ok using
**extraction cards** (`docs/brownfield-adoption.md` §6) — never mechanical-safe, never silent.
If B will take multiple PRs, offer (do not require) persisting a short Shape plan under the
repo so the next agent session continues the same pilot — still never auto-apply B.

## Origin snapshot (day-zero picture)

- **When:** as soon as `ark.config.json` exists and `.ark/reports/origin.json` is missing — **before** applying fixes and **before** treating “done”. Prefer that `ark start` / `ark init` already froze origin **before** agent docs; if missing, freeze now.
- **How:** `ark-check --report ark-report.html` (writes origin once under `.ark/reports/`).
- **Never** `--reset-origin` unless the user explicitly wants a new baseline.
- **Do not** wait until the end of the loop to create origin the first time — later reports need a frozen “before” picture.
- End of run: re-`--report` for **latest** + evolution vs origin (origin stays frozen).

## Operating modes (detected, not picked)

- **Setup (Suggest):** no config → `ark start` / recommend shape (start freezes origin after config, before gates).
- **Align (Adapt):** open debt, low honesty, or false-green → explore + adopt/loop; do not claim “guarded”.
- **Guard (Enforce):** `goal.met`, solid governed%, no false-green → confirm gates; still emit dual plan B if explore found residual.

## Flow

0. **Explore pass** — decision-grade recon (see above); seed plan B.
1. **Setup if needed** — `ark start` if no `ark.config.json`. Trust `--recommend` / playbook:
   `vertical-slice-product` and `ddd-bounded-contexts` are first-class shapes (not hexagonal by default).
2. **Origin if missing** — freeze day-zero (`--report`) immediately after contract exists.
3. **Sensors** — `--plan --json`, doctor/coverage as needed.
4. **Emit dual plan** — A from plan steps (files opened); B from explore (3–5 bets).
5. **Concentrated edge?** — if one edge dominates A:
   **STOP — do not continue this skill as complete.** **STOP — concentrated edge: invoke /ark-contract with source evidence** (do not freeze a wrong contract or grind N freezes).
6. **Worktree preferred** — discardable git worktree when possible.
7. **Mechanical-safe (A only)** — kinds from `/ark-loop` table; one step, validate, rollback.
8. **Judgment (A)** — default: propose with full “así te lo re-soluciono”. If user authorized full apply: implement, validate, rollback on fail.
9. **Pattern bets (B)** — propose; apply only with explicit user go + correct skill (`/ark-contract`, refactor, install gates, etc.). Never weaken the gate to clear B.
10. **Manifiesto** — loose business rules → Domain placement + `intentPrefixes` / intents via `/ark-contract` discipline.
11. **Final report** — re-`--report`; evolution vs origin; A applied vs open; B proposed/deferred; gates on.
12. **Strict check** — `ark-check --strict-config` (dead preset globs are advisory; real violations still fail).
13. **Core ratchet (when green)** — if plan `goal.met` and doctor still **ADAPT** only because
    populated cores are `optional: true`, run `ark-check --ratchet-cores` then `--doctor`.
    Never ratchet while active violations remain or false-green gap is open.

## Never

- Disable rules, broaden allows, or baseline **new** debt to “finish”.
- Claim clean while judgment A steps were skipped without user decision.
- Claim ENFORCE / “done” when doctor reports `contract-false-green-io-under-application` (adopt first).
- Claim “done” solely because plan A is empty while explore/B residual remains unlisted.
- Replace host Nest/DI with the runtime kernel unasked.
- Auto-apply pattern (B) bets as if they were mechanical-safe.
- Create origin only after a long cleanup (freezes a polished “before” that never was).

## Done criteria

- Explore pass completed (decision-grade map + paths + field path or n/a + phase + B seeds).
- Dual plan emitted (A and/or B; if both empty, one-line justification with evidence no design-weak smells).
- Origin present under `.ark/reports/origin.*` (frozen this run or earlier).
- Every applied A step validated by real `ark-check`.
- Final plan `goal.met` true **or** remaining A steps listed with file-level proposals.
- Open **B / Shape opportunities** listed with success signals; report HTML paths cited when used.
- If A empty and design-weak present: B listed — **Incomplete?** must not claim full healthy stop.

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
