# Domain Fitness & Session Truth (4.5.0) — Phase DF

> **Plan, not implementation authority.** Code and executable schemas decide whether a claim is
> true. Work starts only when item IDs appear as `doing`/`todo` in [ROADMAP.md](../../../ROADMAP.md).
> Hub: [AGENTS.md](../../../AGENTS.md) · [Roadmap](../../../ROADMAP.md) · [Product voice](../../product-voice.md)

**Status:** Accepted — **DF01–DF03 done**; **DF04 implemented (review)**; amended 2026-08-10 (Scale Stack + LEVELS); next after close **`DF05`**  
**Slug:** `domain-fitness-session-truth`  
**Kind:** epic / product minor train  
**Owners:** product (Pedro) + library maintainers  
**Last updated:** 2026-08-10  
**Target package:** **arkgate@4.5.0** (minor over 4.4.0)  
**Code paths (expected):** `src/domain/` (compass, status facts, pure critical paths),
`bin/lib/status-command.mjs` / doctor wiring, module budgets, property/mutation config,
install/upgrade honesty residual, `docs/*` product lanes, CHANGELOG, `docs/releases/4.5.0.md`

---

## Mandates for this train

### LEVELS (v1.1)

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

### Scale Stack (platform seams — library scale)

ArkGate scales by **repos × agents × monorepo size × upgrade retention**, not multi-region RPS.
This train treats the package as a **mini enforcement platform**:

| Seam | Meaning for DF |
|------|----------------|
| **Edge** | Hooks / prepare-write / CI remain the only hard verdicts |
| **Control plane view** | `ark status` / MCP must be an honest residual map (DF02) |
| **Data plane purity** | Domain stays maintainable and fail-closed (DF03, DF04) |
| **Self-service** | Upgrade/activation honesty without maintainer tickets (DF05) |
| **Absorb complexity** | Session recipe in product docs so agents do not invent loops (DF06) |

**Maturity:** Growing → Large Product. No org control-plane, no runtime productization, no
platform-scale cargo-cult in 4.5.0.

---

## Plan lock (DF01)

Phase DF is the **sole engineering epic** for npm **4.5.0**. Plan authority matches
[ROADMAP.md](../../../ROADMAP.md) Phase DF. No other `todo` engineering epic may take `doing`
without explicit reprioritization in ROADMAP.

### Product voice for this train

- **Session truth** — one agent turn can trust `ark status --json` / MCP `ark_status` for residual
  architecture (including improvement compass when honest), without inventing a scorecard.
- **Honest modes** — if status cannot match doctor residual, it labels `subset` / `unavailable`
  (never invents green lenses).
- **Domain fitness** — pure Domain stays Level 4 hybrid: contracts hard; projections thin and
  **split when oversized** (budgets alone that only rise each release are not done).
- **Self-service residual** — DF05 is chosen by *upgrade/activation ticket reduction*, not random bugs.
- **Stewardship, not sprawl** — close honesty gaps and protect critical pure paths over new sensors.
- **Scan / process dual depth (unchanged):** status/doctor/compass = scan; skills = process.

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
| Runtime productization | ADR 0004; optional kernel stays experimental |
| False hard-write claims for soft hosts | Honest activation labels only |
| Z09 retained-adoption claim close as DF scope | Parked residual RB-11 |
| Broad codemods / multi-pilot batch Shape | One pilot at a time |
| Presentation-only HTML report expansion | Doctor/status truth first |
| “Level 5 the monorepo” as a goal | Selective L5 islands only |
| Raising domain LOC budgets **without** split when over ceiling | Disguised debt; DF03 forbids it as sole fix |

Inherited hard lines from ROADMAP product mandate remain in force.

---

## Problem

ArkGate **4.4.0** shipped firewall + agent contract (4.3) + improvement compass. LEVELS (2026-08-10)
rated the shell **Level 4** with L5 islands on truth paths. Scale Stack review refined the gaps:

| Persona / surface | Pain after 4.4.0 |
|-------------------|------------------|
| **AI agent** | Doctor has full compass; **status is pass-through only**. Loops re-run doctor or invent residual. Risk of **silent subset** if 4.5 projects compass cheaply without mode labels. |
| **Maintainer** | `improvementCompass` ~900+ LOC; budgets that only ratchet up = maintenance debt. |
| **Enforcement truth** | peerIsolation / policy-delta ack / invariant promote need selective verification ratchet. |
| **Install path** | Self-service failure mode: “upgraded and do not know if write-path is still active / custom files preserved.” |
| **Product** | Need **one honest session snapshot** + domain operable at 2–3 years — not more vocabulary. |

**Why now:** 4.3 = contract shape; 4.4 = residual legibility; 4.5 = **session control-plane honesty** +
**domain stewardship** + **self-service upgrade residual**.

---

## Outcome (4.5.0 done when)

1. **Status/MCP project improvement compass** with explicit honesty:
   - `mode`: `full` | `subset` | `unavailable` (names may match implementation enums if documented)
   - residual lens ids on status **⊆** doctor residual for the same fixture facts when `full`
   - never invent green lenses; never flip gate verdicts; always `notAScore`
2. **Domain fitness is mechanical and structural:** tracked pure modules have LOC budgets;
   **oversize modules are split** (behavior-preserving) — not closed by only raising the max.
3. **Critical pure verification ratchet** (cost-gated if needed): peerIsolation fail-closed,
   policy-delta ack match, invariant promote honesty.
4. **Self-service install residual:** one pilot that answers: *after upgrade, can a team see
   write-path activation honesty and that custom content was not silently rewritten?*
5. **Release train + session recipe** in product docs (agent loop: identity → status → act;
   doctor when status mode ≠ full); claims 0 Contradicted; no required config migration.

**Not done when:** new sensors, new skill names, scores, runtime durable stores, Z09 close,
or domain budget raised without split.

---

## Ordered items (ROADMAP IDs)

| ID | Size | Depends | Priority | Outcome |
|----|-----:|---------|----------|---------|
| `DF01` | S | 4.4.0 published | — | Plan lock; freezes; LEVELS + Scale Stack mandates (**done**) |
| `DF02` | M | `DF01` | **P0** | Status/MCP compass + **parity/honesty modes** + residual ⊆ doctor (**done**) |
| `DF03` | M | `DF01` | **P0** | Domain budgets + **mandatory split** when over ceiling (**done**) |
| `DF04` | M | `DF01` | **P1** | Property/mutation ratchet on critical pure truth paths (cost-gated OK) |
| `DF05` | M | `DF01` | **P1** | Self-service upgrade/activation honesty residual (one named pilot) |
| `DF06` | S | `DF02`–`DF05` | **P2** | Session recipe docs + claims + **4.5.0** publish train |

**Engineering order (one `doing` at a time):**  
`DF02` → `DF03` → `DF04` → `DF05` → `DF06`  
(Do not reorder DF03 after DF04 without owner note — maintenance before extra mutation load.)

### Automation (Grok workflow)

Serial implement → review → fix → intermediate commit → close → next:

| | |
|--|--|
| Script | [`.grok/workflows/df-450-queue.rhai`](../../../.grok/workflows/df-450-queue.rhai) |
| Default | `DF02`…`DF06` (skips done plan-lock `DF01`) |
| Launch | `/workflow df-450-queue` or `/workflow df-450-queue {"only":"DF02"}` |
| Options | `from`/`to`/`only`, `skip_commit`, `stop_on_fail`, `await_between` |

One ROADMAP `doing` at a time; no push/PR by default. Pattern mirrors `acs-430-queue`.

---

## Item detail (authoritative acceptance)

### DF02 — Status control-plane: compass + honesty modes

**Outcome:** `ark status --json` and MCP `ark_status` project `improvementCompass` when facts allow.

**Required honesty contract (implementation names may alias if package-surface documents them):**

| Field / rule | Requirement |
|--------------|-------------|
| `notAScore` | Always true when compass present |
| Projection mode | Explicit `full` \| `subset` \| `unavailable` (or equivalent documented enum) |
| Provenance | Enough to prove same-tree intent: e.g. `contractHash` and/or facts source ref already on status identity |
| Parity when `full` | Residual lens **ids** on status ⊆ doctor residual ids for the same fixture tree/facts |
| Incomplete facts | `unavailable` or `subset` + reason code/message — **never** fabricate `ok` lenses |
| Gate isolation | Residual never changes `valid` / strict-merge / `goal.met` |

**Acceptance:**

- Focused unit + MCP fixtures cover residual SoC/DIP (or equivalent) parity when `full`.
- Fixture where facts insufficient → no invented green residual.
- Adapter-style regression: same tree facts → status residual ids ⊆ doctor residual ids.
- CI=1 non-interactive; package-surface documents modes and honesty boundary.

**Evidence:** status-command / status-manifest / doctor fact reuse; tests; package-surface.

### DF03 — Domain module fitness (budget + split)

**Outcome:** large pure Domain modules are budgeted **and** structurally maintainable.

**Rules:**

1. Track at least `src/domain/improvementCompass.ts` (and split children if created) in
   `check:module-budgets`.
2. If a tracked domain module is **already over** the ceiling at DF03 start, **done requires a
   behavior-preserving split** into smaller pure modules (optional gen parity for CLI mirrors).
3. **Forbidden as sole fix:** raising the max LOC without a split or a dated exception with
   owner + kill date in the budget file comment.
4. Optional stretch: soft hold (no raise) on presentation modules already near ceiling
   (`html-report*`, `doctor-plan`) — no presentation rewrite required.

**Acceptance:** `check:module-budgets` fails on drift; pure Domain has no Kernel/Tooling I/O;
unit behavior parity after split; gen parity if mirrors move.

### DF04 — Critical pure verification ratchet

**Outcome:** selective L5 islands: `layerMatch` peerIsolation fail-closed (missing paths),
`policyDelta` acknowledgement matching, `invariantCoverage` promote honesty. Existing
baselineKey / configContract slices remain.

**Acceptance:**

- New property and/or Stryker groups green in CI **or** maintainer script with documented cost gate
  (must still run in release train or scheduled CI lane named in PR).
- Focused unit fixtures for fail-closed cases.
- No weakening of strict semantics; no claim of whole-repo mutation completeness.

### DF05 — Self-service upgrade / activation honesty (one pilot)

**Outcome:** close **one** residual chosen by this gate question (must be answered in PR):

> After a managed upgrade (or equivalent), can a consumer learn from package surfaces whether
> the write-path is still honestly labeled active/advisory and whether customized install content
> was preserved — without asking a maintainer?

**In-scope pilot classes (pick one):** managed-upgrade force-preserve / content-identity;
activation label post-upgrade; stable upgrade preview/dry-run honesty. **Not in scope:** new hosts,
host matrix expansion, false hard-write for soft hosts.

**Acceptance:** named residual + self-service criterion in PR; failing-then-passing tests;
activation labels remain honest; common merge gate green.

### DF06 — Session recipe + product release 4.5.0

**Outcome:**

1. Product docs (use / agent-guide or equivalent public lane) teach a short **session recipe**
   without roadmap codes: identity bind → `ark status` → act on residual / findingRef; run doctor
   when status compass mode is not full / unavailable. No new skill names.
2. CHANGELOG + `docs/releases/4.5.0.md` product voice; package-surface; claims 0 Contradicted;
   version **4.5.0** publish train.

**Acceptance:** stranger can follow session recipe without ROADMAP; IC06 hygiene held; merge gate
green; no required config migration.

---

## Non-goals (explicit)

- Raising global mutation to 100% or formal methods.
- Productizing `@arkgate/runtime` durability.
- New improvement lenses / principles beyond the closed 15 without a separate epic.
- Rewriting HTML report design for polish alone.
- Closing RB-11 / Z09 as part of 4.5.0.
- Org multi-tenant control plane / policy-pack ecosystem (post-4.5 field demand).

---

## Acceptance (epic)

- Common merge gate green on the release commit.
- No required `ark.config.json` migration.
- Public lanes stay product-first (IC06 rule held).
- Status/doctor residual honesty modes never invent green.
- Domain: no oversize pure module closed only by raising budget without split.
- LEVELS re-check: status/compass Level 4 honesty; domain still hybrid L4.

---

## Evidence expectations

| Item | Evidence homes |
|------|----------------|
| DF02 | status + doctor fact path; unit/MCP; parity fixture residual ⊆; package-surface modes |
| DF03 | `scripts/check-module-budgets.mjs`; split modules + gen parity if needed |
| DF04 | `tests/property/*` and/or `stryker.config.mjs` + cost-gate note |
| DF05 | static-check/install tests; PR names self-service criterion |
| DF06 | use/agent-guide session recipe; CHANGELOG; `docs/releases/4.5.0.md`; claims; publish |

---

## Post-4.5 (not DF engineering `todo`)

Seed only — promote to ROADMAP when owner prioritizes:

| Horizon | Theme |
|---------|--------|
| Next minor after 4.5 | Golden upgrade path matrix (hosts × package managers) as self-service proof |
| Field demand | Monorepo activation playbook depth; new sensors only with ADR |
| Claim gate | Z09 / RB-11 retained adoption + independent close (unchanged owner) |

---

## Related

- Prior: [improvement-compass](../improvement-compass/README.md) (4.4.0), [agent-contract-surface-4.3](../agent-contract-surface-4.3/README.md)
- LEVELS assessment 2026-08-10 · Scale Stack review 2026-08-10
- Parked: Z09 / RB-11 (not DF scope)
