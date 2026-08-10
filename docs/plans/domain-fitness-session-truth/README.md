# Domain Fitness & Session Truth (4.5.0) — Phase DF

> **Plan, not implementation authority.** Code and executable schemas decide whether a claim is
> true. Work starts only when item IDs appear as `doing`/`todo` in [ROADMAP.md](../../../ROADMAP.md).
> Hub: [AGENTS.md](../../../AGENTS.md) · [Roadmap](../../../ROADMAP.md) · [Product voice](../../product-voice.md)

**Status:** Accepted — **DF01 done**; engineering queue open at **DF02** for **4.5.0**  
**Slug:** `domain-fitness-session-truth`  
**Kind:** epic / product minor train  
**Owners:** product (Pedro) + library maintainers  
**Last updated:** 2026-08-10  
**Target package:** **arkgate@4.5.0** (minor over 4.4.0)  
**Code paths (expected):** `src/domain/` (compass, status facts, pure critical paths),
`bin/lib/status-command.mjs` / doctor wiring, module budgets, property/mutation config,
install/upgrade honesty residual, `docs/*` product lanes, CHANGELOG, `docs/releases/4.5.0.md`

**LEVELS (v1.1) mandate for this train**

```
TARGET LEVEL: 4 (Robust / Production) — hybrid shell
Justification: Public gate library; blast radius is third-party repos + CI + agent write paths.
Non-goals: Level-5 monorepo (formal verification, 100% mutation, runtime productization);
  new ArkRules sensors; new skill names; principle scores; presentation-only HTML polish.
Assumptions: 4.4.0 compass is correct as notAScore projection; domain is already ~L4 with
  L5 islands on match/key/config/policy/identity; oversize pure modules and thin status are the gap.
Re-evaluate if: field reports status/doctor residual divergence; domain module grows past budget
  again; or a blocking sensor needs new vocabulary (then separate ADR epic, not DF).
```

---

## Plan lock (DF01)

Phase DF is the **sole engineering epic** for npm **4.5.0**. Plan authority matches
[ROADMAP.md](../../../ROADMAP.md) Phase DF. No other `todo` engineering epic may take `doing`
without explicit reprioritization in ROADMAP.

### Product voice for this train

- **Session truth** — one agent turn can trust `ark status --json` / MCP `ark_status` for the same
  residual architecture story doctor already exposes (including improvement compass when
  computable), without inventing a second scorecard.
- **Domain fitness** — pure Domain stays Level 4 hybrid: contracts and fail-closed paths stay hard;
  advisory projections stay thin and budgeted; no silent growth of “lenses as product surface.”
- **Stewardship, not sprawl** — 4.5.0 prefers closing honesty gaps and protecting critical pure
  paths over new sensors, skills, or runtime features.
- **Scan / process dual depth (unchanged):** status/doctor/compass = scan-side evidence; skills
  process. Process never decides pass/fail in the package.

### Freeze restated for 4.5.0 (do not start without a new ROADMAP item)

| Frozen | Why (DF) |
|--------|----------|
| Numeric trust / architecture / principle **scores** or averages | Binary gate; compass remains `notAScore` only |
| Improvement compass as a **gate input** | Residual lenses never flip `valid` / strict-merge / `goal.met` |
| New skill **names** (beyond the current 13) | Deepen only if a status/compass wording gap appears; no rename train |
| New architecture presets / policy packs | Field demand + separate promotion |
| New ArkRules **sensor vocabulary** | Needs ADR + field demand; DF only deepens tests/docs of existing sensors |
| LLM pass/fail or package “process verdict” | Deterministic gate only |
| AGENTS.md / skills / projection as enforcement | Non-authoritative coaching only |
| Runtime productization | ADR 0004; optional kernel stays experimental (L2 durability honesty) |
| False hard-write claims for soft hosts | Honest activation labels only |
| Z09 retained-adoption claim close as DF scope | Parked residual RB-11 |
| Broad codemods / multi-pilot batch Shape | One pilot at a time |
| Presentation-only HTML report expansion | Doctor/status truth first; no new advisory sections without evidence seam |
| “Level 5 the monorepo” as a goal | Selective L5 islands only (match/key/policy/identity) |

Inherited hard lines from ROADMAP product mandate remain in force.

---

## Problem

ArkGate **4.4.0** shipped a strong write firewall, agent contract surface (4.3), and improvement
compass (lenses, not scores). LEVELS assessment of the mother repo (2026-08-10) rated the product
shell **Level 4** with justified **L5 islands** on enforcement truth — and flagged drift risks that
hurt the next release if ignored:

| Persona / surface | Pain after 4.4.0 |
|-------------------|------------------|
| **AI agent** | Doctor exposes full compass; **`ark status` still does not compute lenses** (pass-through only). Multi-surface session loops re-run doctor or invent residual from prose. |
| **Maintainer** | `src/domain/improvementCompass.ts` (~900+ LOC) is the largest pure module; presentation/`bin/lib` growth pressure continues; LEVELS says **↓ simplify**, not add lenses. |
| **Enforcement truth** | Critical pure paths (`layerMatch` peerIsolation, `policyDelta` ack, `invariantCoverage`) are L4–5 by design but mutation/property coverage is uneven vs `baselineKey` / `configContract`. |
| **Install path** | LEVELS install/upgrade cluster is ~3–4; residual edge honesty (preserve/custom/host activation) remains higher risk than domain pure algorithms. |
| **Product** | Users do not need more vocabulary; they need **one honest session snapshot** and a domain that stays maintainable at Level 4. |

**Why now:** 4.3 closed agent *contract* shape; 4.4 closed residual *legibility*. 4.5 closes
**session consistency** and **domain stewardship** so the library does not rot into Level 3 sprawl
while claiming Level 4 enforcement.

**Root gap:** status is a first-class agent surface that still under-delivers vs doctor; pure domain
growth is not budget-enforced the way CLI orchestration modules are; selective L5 verification is
not ratcheted on every truth path that LEVELS marked critical.

---

## Outcome (4.5.0 done when)

1. **`ark status --json` / MCP `ark_status` can project improvement compass** from the same
   doctor-side facts path (or an explicitly documented cheap subset), still `notAScore`, never
   changing gate verdicts. Agents no longer need “read doctor only” as the sole residual map.
2. **Domain fitness is mechanical:** tracked large pure modules have LOC budgets (or an explicit
   split of `improvementCompass` without behavior change); `check:module-budgets` fails on drift.
3. **Critical pure verification ratchet:** property and/or mutation slices cover peerIsolation
   fail-closed, policy-delta acknowledgement matching, and invariant promote honesty (beyond the
   existing baselineKey/configContract slices).
4. **Install/upgrade honesty residual** (bounded): at least one field-class edge case from
   managed-upgrade or activation truth is closed with tests — no new host matrix fantasy.
5. **Release train:** product-voice CHANGELOG + `docs/releases/4.5.0.md`, package-surface,
   claims 0 Contradicted on public statements; no required config migration.

**Not done when:** new sensors, new skill names, scores, runtime durable stores, or Z09 close.

---

## Ordered items (ROADMAP IDs)

| ID | Size | Depends | Outcome |
|----|-----:|---------|---------|
| `DF01` | S | 4.4.0 published | Plan lock; freezes; LEVELS TARGET 4 hybrid recorded; sole epic for 4.5.0 |
| `DF02` | M | `DF01` | Status (+ MCP) projects improvement compass; parity tests vs doctor residual |
| `DF03` | M | `DF01` | Domain module budgets and/or surgical split of oversize pure projection modules |
| `DF04` | M | `DF01` | Property/mutation ratchet on critical pure truth paths |
| `DF05` | M | `DF01` | Bounded install/upgrade or activation honesty residual (one pilot class) |
| `DF06` | S | `DF02`–`DF05` | Product docs hygiene + claims prep + **4.5.0** publish train |

Parallelism: `DF02`–`DF05` may be sequenced one `doing` at a time; prefer **DF02 first** (user-visible
session truth), then DF03/DF04 (stewardship), then DF05 (ops residual), then DF06.

---

## Non-goals (explicit)

- Raising global mutation to 100% or formal methods.
- Productizing `@arkgate/runtime` durability.
- New improvement lenses / principles beyond the closed 15 without a separate epic.
- Rewriting HTML report design for polish alone.
- Closing RB-11 / Z09 as part of 4.5.0.

---

## Acceptance (epic)

- Common merge gate green on the release commit.
- No required `ark.config.json` migration.
- Public lanes stay product-first (IC06 rule held).
- LEVELS re-check of `src/domain/`: no new module above budget without split or documented exception;
  status/compass surfaces remain Level 4 honesty (partial/unavailable never faked).

---

## Evidence expectations

| Item | Evidence homes |
|------|----------------|
| DF02 | status-command / status-manifest wiring; unit + MCP fixtures; package-surface |
| DF03 | `scripts/check-module-budgets.mjs` (+ domain rows); optional module split + gen parity |
| DF04 | `tests/property/*` and/or `stryker.config.mjs` slices + focused unit |
| DF05 | install/upgrade or write-path tests under `tests/unit/static-check/` |
| DF06 | CHANGELOG, `docs/releases/4.5.0.md`, claims matrix rows, publish train |

---

## Related

- Prior: [improvement-compass](../improvement-compass/README.md) (4.4.0), [agent-contract-surface-4.3](../agent-contract-surface-4.3/README.md)
- LEVELS skill: maintainer assessment 2026-08-10 (repo + `src/domain` scorecard)
- Parked: Z09 / RB-11 (not DF scope)
