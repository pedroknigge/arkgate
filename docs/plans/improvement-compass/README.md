# Improvement Compass (4.4.0) — Phase IC

> **Plan, not implementation authority.** Code and executable schemas decide whether a claim is
> true. Work starts only when item IDs appear as `doing`/`todo` in [ROADMAP.md](../../../ROADMAP.md).
> Hub: [AGENTS.md](../../../AGENTS.md) · [Roadmap](../../../ROADMAP.md) · [Product voice](../../product-voice.md)

**Status:** Shipped / published in **4.4.0**  
**Slug:** `improvement-compass`  
**Kind:** epic / product minor train  
**Owners:** product (Pedro) + library maintainers  
**Last updated:** 2026-08-09  
**Target package:** **arkgate@4.4.0** (minor over 4.3.0)  
**Code paths (expected):** `src/domain/` (compass pure), doctor/status adapters, HTML report,
`templates/skills/` + `templates/agent-skills/`, compact agent router, `docs/use.md` /
`docs/develop.md` / `docs/agent-guide.md`, package-surface, CHANGELOG, `docs/releases/4.4.0.md`

---

## Plan lock (IC01)

Phase IC is the **sole engineering epic** for npm **4.4.0**. Plan authority matches
[ROADMAP.md](../../../ROADMAP.md) Phase IC. No other `todo` engineering epic may take `doing`
without explicit reprioritization in ROADMAP.

### Product voice for this train

- **Improvement compass** — a closed set of **architecture lenses** (aligned to 15 well-known
  principles) projected from **existing** deterministic evidence. Never a 0–10 score, never a
  ranking band (Excellent/Good/…), never a gate input.
- **Scan / process dual depth (unchanged):** **scan** = CLI/MCP/engine facts; **process** =
  skill/agent judgment that coaches placement and Shape. Process never decides pass/fail in
  the package.
- **Vibe-coder first in process, expert depth in JSON:** human doctor and skill prose lead with
  plain outcomes and one next move; `--json` keeps full evidence for staff engineers.
- **False done still forbidden:** Enforce ≠ elegant design; empty plan A ≠ healthy finished;
  residual lenses must not read as “architecture finished.”

### Freeze restated for 4.4.0 (do not start without a new ROADMAP item)

| Frozen | Why (IC) |
|--------|----------|
| Numeric trust / architecture / principle **scores** or averages | Binary gate; compass is `notAScore` projection only |
| New skill **names** (beyond the current 13) | Deepen bodies + Agent Skills 1:1 layout; ADR 0015 |
| New architecture presets / policy packs | Field demand + separate promotion |
| New ArkRules sensor vocabulary | Needs ADR + field demand; compass reuses current sensors |
| LLM pass/fail or package “process verdict” | Deterministic gate only |
| AGENTS.md / skills / projection as enforcement | Non-authoritative coaching only |
| Runtime productization | ADR 0004 |
| False hard-write claims for soft hosts | Honest activation labels only |
| Z09 retained-adoption claim close as IC scope | Parked residual RB-11 |
| General codemod / multi-pilot batch Shape | One pilot at a time; judgment not silent |

Inherited hard lines from ROADMAP product mandate remain in force.

---

## Problem

ArkGate 4.3.0 is a strong **write firewall + coach** for experts who already understand layers,
design-weak, dual-plan A/B, and pilot loops. Field reality after ACS:

| Persona | Pain |
|---------|------|
| **Expert / tech lead** | Surfaces are rich (doctor JSON, status, catalog, finding refs). Low pain — “we're fine.” |
| **Vibe coder / “ask the AI everything”** | Installs Ark or pastes a skill once; AI claims “architecture is good” after green edges; spaghetti residual ignored; skill pack is long, staff-oriented, and easy to skip. |
| **AI agent** | Has status + diagnostics but **no stable map** of *what good architecture residual remains* in familiar principle language (SoC, DIP, domain alignment…). Routes poorly without a staff human. |
| **Product** | External skill *arquitectura-software-analyzer* scores 15 principles but does not enforce. ArkGate enforces but does not **teach progress** in that vocabulary. Users who want “order + AI-easy code” bounce between two mental models. |

**Why now:** Phase ACS finished the agent **contract surface**. The next wedge is not more
codes — it is **making residual improvement legible and actionable** for non-experts and for
agents that drive most commits, **without** becoming a generic architecture scorecard.

**Root gap (process side):** skills and the compact router still assume a reader who will
skill-shop and interpret design-weak. They need a **single compass** and **deeper, outcome-first
skill bodies** so “ask the AI to fix architecture” actually moves SoC/DIP/domain/shape — and
stops at honest out-of-scope (perf, app security, full stack idioms).

---

## Outcome (4.4.0 done when)

1. **Compass surface:** `doctor.improvementCompass` (and status snapshot additive field when
   wired) exposes 15 closed **lenses** with status `ok | residual | not-instrumented | out-of-scope`,
   deterministic evidence refs, optional next action, `notAScore: true`, and capped `topResidual`.
2. **Human doctor** prints a short **Improvement compass** section: top residual lenses in plain
   language + one primary next action (never a score bar).
3. **HTML report** has an advisory section for the compass (report parity rule).
4. **Skills + compact router upgraded** (same 13 names): vibe-coder outcome-first paths, compass
   routing, anti-false-done, “what better looks like for AI/user/system,” and explicit out-of-scope.
5. **Docs** (use / develop / agent-guide / product-voice) teach compass vs analyzer scorecard and
   the spaghetti → Align → Stabilize → Shape path in dual depth — **in product language only**.
6. **Public docs are product-only (IC06):** README, use/develop/agent-guide, diagnostics, package
   surface consumer rows, skills, compact router, release notes, CHANGELOG user-facing bullets,
   and doctor/CLI human copy describe **what the product does and how to use it**. They do **not**
   narrate roadmap phase codes, item ids (e.g. IC02, ACS08, Z09), epic slugs as user jargon, or
   internal queue archaeology. Historical evidence stays under `ROADMAP.md`, `docs/plans/`,
   `docs/archive/`, `docs/audit/`, `docs/field/` — not the public product lanes.
7. **Claims:** 0 Contradicted for new product statements; package **arkgate@4.4.0** published with
   release notes; no required config migration.

---

## Users and success

### Primary users

| Persona | Job-to-be-done after IC |
|---------|-------------------------|
| **Vibe coder** | “Tell the AI to clean architecture” → doctor/skills produce ordered, safe steps; green edges do not end the story while residual lenses remain. |
| **AI agent** | Read `topResidual` + `primaryNextAction`; open the right skill; one pilot; re-doctor; stable finding refs. |
| **Expert** | Same JSON depth as today; compass is a projection they can ignore or audit. |

### Success metrics (falsifiable — no score)

| Metric | Direction | Notes |
|--------|-----------|-------|
| Sessions that stop at empty plan A while design-weak / residual lenses | ↓ | False-done rate |
| Agent chooses wrong skill when residual is Shape vs edges | ↓ | Fixture or eval smoke optional |
| Compass `out-of-scope` lenses never set residual from missing SAST/APM | hold | Honesty |
| `valid` / strict-merge / designFitness **gate inputs** unchanged by residual lenses | hold | Tests |
| Skill completion contracts mention compass residual when design-weak | ↑ | IC05 |
| Expert path still works without reading human compass prose | hold | JSON only |

---

## Scope

| In 4.4.0 (Phase IC) | Explicitly later / out |
|---------------------|-------------------------|
| Domain pure `buildImprovementCompass` from **existing** doctor/coverage/smell/capability/ArkRules facts | New sensors for OCP switches, perf budgets, SAST |
| Doctor human + JSON + optional status field | Numeric averages or Excellent/Good ranks |
| HTML advisory compass section | Replacing designFitness / patternBets |
| Deepen all 13 skills + compact router (vibe-coder + compass) | New skill names |
| Docs lanes + product-voice lexicon | Polyglot, org control-plane |
| package-surface row + release 4.4.0 | Z09 claim close |
| Optional maintainer fixture: compass projection parity | Live LLM product score |

### Principle → lens instrumentation (honest)

| # | Lens id | Principle (analyzer vocabulary) | Primary Ark evidence | Typical status |
|---|---------|----------------------------------|----------------------|----------------|
| 1 | `soc` | Separation of Concerns | Layers + edges + smells (`domain-logic-in-ui`, `facade-sql-in-routes`, …) | instrumented |
| 2 | `cohesion` | High Cohesion | `god-module`, physicalCohesion, structure sensors | instrumented |
| 3 | `coupling` | Low Coupling | Import graph violations, cycles, peerIsolation | instrumented |
| 4 | `srp` | Single Responsibility (arch) | Layer ownership + god-module + reshape pilot | instrumented |
| 5 | `dip` | DIP / IoC | pure / forbiddenGlobals / capability walls + port fix class | instrumented |
| 6 | `ocp` | Open/Closed | Weak: adapter-friendly edges only; no switch-chain sensor | often `not-instrumented` or weak residual |
| 7 | `encapsulation` | Encapsulation / abstraction | ArkRules aggregate/factory sensors when mapped | instrumented if ArkRules |
| 8 | `modularity` | Modularity / reusability | Placement/governed globs + mechanical-safe moves | instrumented |
| 9 | `scalability` | Scalability / performance | — | **out-of-scope** |
| 10 | `resilience` | Resilience / fault tolerance | Boundaries only; runtime experimental not gate | **out-of-scope** (note optional runtime) |
| 11 | `security` | Security by design | Structural least-privilege of effects only | **out-of-scope** (partial structural note) |
| 12 | `maintainability` | Maintainability / debt | Baseline, policy-delta, design-weak, freeze honesty | instrumented |
| 13 | `testability` | Testability & observability | Pure domain → testability; no OTel requirement | partial / residual if impure domain |
| 14 | `domain` | Domain alignment | DomainModel role + ArkRules + anemic sensor | instrumented |
| 15 | `stack` | Stack-specific best practices | Host/TS/Ark idioms only | partial / out-of-scope for non-TS |

Agents and docs must **never** claim Ark “scores security 9/10” or “improves latency.”

---

## Skill upgrade mandate (IC05 — first-class, not afterthought)

Expert users already get value. **IC05 is for vibe coders and full-AI workflows.** Same 13
names; bodies and compact router must go further on three outcomes:

| Outcome | Meaning |
|---------|---------|
| **Better architecture** | Residual lenses drive Align / Stabilize / Shape; contract never weakened to “finish.” |
| **Better order** | One primary door; one pilot; dual-plan A/B always in plain language; origin snapshot. |
| **Easier for agent / user / system** | Agent: stable compass JSON + nextAction. User: plain “what’s wrong / what we do next.” System: smaller, pure, placeable modules so the next AI turn does not re-spaghetti. |

### Shared skill requirements (all `/ark-*` except optional note on `/ark-runtime`)

1. **Compass preflight (when doctor available):** read `improvementCompass.topResidual` (or
   human section). Name 1–3 residual lenses in plain language before skill-shopping.
2. **Outcome-first paragraph** at top of human-facing steps: what the user will *feel*
   (fewer blocked AI writes, clearer folders, safer domain) before jargon.
3. **Anti false-done block:** empty plan A + residual lenses / design-weak → Incomplete? yes.
4. **AI-easy architecture cues:** prefer ports over concrete I/O in domain; one concern per
   module; golden pattern for new files; place before write (`/ark-place` / prepare-write).
5. **Out-of-scope honesty:** if user asks for perf/SAST/full resilience, state out-of-scope
   lenses and do not invent Ark enforcement.
6. **Completion contract extension:** add bullet **Compass:** `top residual lenses | n/a` (and
   keep Planes [Layer]/[ArkRules]).
7. **Regenerate Agent Skills layout** 1:1 (`generate:agent-skills` / `check:agent-skills`).

### Per-skill deepen (minimum)

| Skill | IC deepen focus |
|-------|-----------------|
| **ark-autopilot** | Default guided path for vibe coders; compass phase 0; Shape only with OK; “done” script forbidden while residual lenses |
| **ark-explore** | Map residual lenses → dual-plan B seeds; plain Align/Stabilize/Shape |
| **ark-explain** | Tour structured by lenses (teach, not score); showcase + compass section |
| **ark-coverage** | Fitness numbers + handoff when residual lenses ≠ empty |
| **ark-adopt** | Spaghetti → honest contract; SoC/DIP false-green STOP paths in plain language |
| **ark-architect** | Greenfield that is AI-easy day one (golden norm + thin layers) |
| **ark-place** | “Where so the AI doesn’t mess up next time” + golden pattern |
| **ark-fix** / **ark-loop** | Principle/lens language on each cluster; still no weaken gate |
| **ark-contract** | Contract edits as last resort; policy-delta honesty |
| **ark-think** | 2–3 options labeled by lens impact |
| **ark-upgrade** | Compass still works after upgrade; projection refresh |
| **ark-runtime** | Explicit: experimental; not compass residual for resilience unless user opts in |

### Compact router (no full skill pack)

Default `start` / install compact agent instructions must:

1. Run doctor; surface status light + primary next action.
2. Mention **improvement compass** residual in plain language when present.
3. Single door: edges debt → fix/loop; design-weak / residual shape lenses → explore then
   autopilot with user OK; never “you’re done” on green edges alone.
4. Point to skill pack install only when user wants full guided Shape — not as required first step.

---

## Public contract sketches

### Improvement compass (schema sketch `1.0`)

```json
{
  "schemaVersion": "1.0",
  "notAScore": true,
  "lenses": [
    {
      "id": "soc",
      "status": "residual",
      "summary": "Business rules still mix with UI or routes.",
      "evidence": [
        { "source": "designSmells", "ref": "domain-logic-in-ui", "detail": "…" }
      ],
      "nextAction": {
        "kind": "skill",
        "ref": "/ark-explore",
        "summary": "Map Shape residual, then one extraction pilot with user OK."
      }
    },
    {
      "id": "scalability",
      "status": "out-of-scope",
      "summary": "ArkGate does not measure performance or horizontal scale.",
      "evidence": [],
      "nextAction": {
        "kind": "docs",
        "ref": "docs/use.md#improvement-compass",
        "summary": "Use load tests and APM outside Ark."
      }
    }
  ],
  "topResidual": ["soc", "dip", "domain"]
}
```

**Rules:**

- Closed `id` enum (15). Closed `status` enum.
- Deterministic ordering of `lenses` and `topResidual` (stable sort by severity tier then id).
- No averages, no ranks, no colors that imply scores.
- Never feeds `valid`, `goal.met`, or strict-merge exit.

### Doctor human sketch

```text
Improvement compass (not a score)
  Residual: Separation of concerns · Dependency inversion · Domain alignment
  Out of scope (honest): Scalability · App security tooling · Full resilience patterns
  Next: /ark-explore (shape-focus) — one pilot at a time after map
```

---

## Ordered implementation queue

| Order | ID | Size | Depends on | Outcome |
|------:|----|------|------------|---------|
| 1 | **IC01** | S | 4.3.0 published | Plan locked; product-voice lexicon; freeze restated; ROADMAP + Agents + docs hub |
| 2 | **IC02** | M | IC01 | Domain pure compass builder + unit fixtures; `notAScore`; out-of-scope locked |
| 3 | **IC03** | M | IC02 | Doctor human + JSON; optional `ark status` additive field; no verdict change |
| 4 | **IC04** | S | IC03 | HTML report advisory section + reportParity |
| 5 | **IC05** | L | IC01 (parallel after IC03 preferred) | Skills + compact router deepen; agent-skills regenerate; vibe-coder path |
| 6 | **IC06** | M | IC03–IC05 | **Product-docs hygiene** + use/develop/agent-guide/skills/router/CLI human; strip roadmap codes from public lanes; claims prep |
| 7 | **IC07** | S | IC02–IC06 | CHANGELOG, package-surface, version 4.4.0, release notes (product voice), publish train |

**Parallelism note:** IC05 may start after IC01 for *prose* that does not require the JSON field,
but must finish with compass-aware wording once IC03 lands (no shipped skill that invents scores).

---

## Acceptance criteria (epic-level)

- [ ] **A1 — No score:** fixtures assert absence of averages/ranks; `notAScore: true` always.
- [ ] **A2 — Projection only:** residual lenses from existing smells/coverage/walls/ArkRules only.
- [ ] **A3 — Gate intact:** compass residual never flips `valid` / strict-merge alone.
- [ ] **A4 — Vibe path:** compact router + autopilot/explore/explain teach residual without skill menu.
- [ ] **A5 — Out-of-scope honesty:** scalability/security/resilience lenses cannot claim instrumented residual without real sensors (they stay out-of-scope or documented partial).
- [ ] **A6 — Skills:** all 13 names updated; Agent Skills layout parity; completion **Compass** bullet.
- [ ] **A7 — Product-only public docs:** public lanes (see IC06 policy) have **zero** roadmap item
      codes / phase jargon as user-facing narrative; copy is about features, commands, and behavior.
- [ ] **A8 — Release:** 4.4.0 published notes in product voice; claims 0 Contradicted for product statements.

---

## Hard lines (inherited + IC)

- No LLM-derived pass/fail; no enforcement from AGENTS.md/skills alone.
- No new skill names; no new presets/packs; no new ArkRules sensors in this phase.
- No silent mechanical apply of judgment / plan B.
- No false hard-write for Codex/Cursor/OpenCode.
- Binary gate; **no numeric principle scores.**
- One Shape pilot at a time; never multi-pilot batch.
- Do not weaken the contract to clear residual lenses.

---

## Non-goals

- Replacing or competing with external architecture analyzer skills as a score product.
- Shipping SAST, APM, chaos, or auth frameworks.
- Org multi-repo control plane.
- Auto-refactor entire monorepos.
- Claiming “any project” becomes clean architecture in one session — progress is
  edges → residual lenses → pilots, with honest leftover.
- Rewriting all historical release notes / archive / ROADMAP into product prose (history may keep
  engineering ids). **Forward** public docs from 4.4.0 must not *add* or *depend on* that jargon.

---

## IC06 — Product documentation policy (release 4.4.0+)

**Owner mandate:** from **4.4.0** forward, anyone opening product docs should understand
ArkGate from **code and behavior**, not from an internal delivery queue.

### Public product lanes (must be product-only)

Clean or rewrite so a stranger can use them without knowing ROADMAP:

| Surface | Examples |
|---------|----------|
| Front door | `README.md`, `docs/use.md`, `docs/develop.md`, `docs/README.md` (hub table product rows) |
| Agent / integrate | `docs/agent-guide.md`, `docs/ai-gates.md`, `docs/configuration.md`, `docs/diagnostics.md`, `docs/brownfield-adoption.md`, `docs/package-surface.md` (consumer-facing rows) |
| Skills & install | `templates/skills/*`, `templates/agent-skills/*`, compact agent / AGENTS projection templates |
| Release consumer | `CHANGELOG.md` **user bullets** for 4.4.0+, `docs/releases/4.4.0.md` body |
| Runtime human | Doctor / CLI help strings, status human lines, error next-action prose |

### Maintainer / evidence lanes (may keep ids)

These stay the place for `IC*`, phase names, PR archaeology, claim codes:

| Surface | Role |
|---------|------|
| `ROADMAP.md` | Implementation queue (one `doing`) |
| `docs/plans/**` | Epic seeds and acceptance for maintainers |
| `docs/archive/**`, `docs/field/**`, `docs/audit/**` | History and claims evidence |
| `CONTRIBUTING.md` / library `Agents.md` product-plans table | May link plans by path; prefer **outcome titles** over id soup in any sentence a consumer might hit |

### Forbidden in public product lanes (4.4.0+)

- Roadmap **item codes** as narrative: `IC01`, `ACS08`, `Z09`, `RB-11`, `Q04`, `EH05`, …
- “Phase X shipped Y” as the *explanation* of a feature (use “ArkGate now …”).
- Unexplained internal acronyms that only exist in the queue (`RB-*`, epic order numbers).
- CHANGELOG bullets that read like ticket dumps (`IC03: wired doctor field`) instead of user value
  (`Doctor shows an improvement compass with residual architecture lenses…`).

### Allowed (and preferred)

- Product names: improvement compass, lenses, design-weak, write gate, layers, ArkRules, doctor.
- Commands: `ark-check --doctor`, `ark status --json`, skill names `/ark-explore`.
- Stable public `ruleId`s and schema field names that agents/code use (`LAYER_IMPORT_VIOLATION`,
  `improvementCompass`, `notAScore`) — these are **API**, not roadmap.
- Links to `docs/plans/…` only from maintainer/contribute paths, not as required reading for “use.”

### IC06 work checklist

1. Sweep public lanes (table above) for roadmap codes and phase-as-product language; rewrite in
   product voice ([product-voice.md](../../product-voice.md)).
2. Document improvement compass + Align/Stabilize/Shape **without** “Phase IC” framing.
3. Skills/router: outcome language; no “per IC05” footnotes in user-visible skill bodies.
4. `docs/releases/4.4.0.md` + CHANGELOG 4.4.0: feature/behavior sections first; optional short
   “Maintainers” footnote may point at ROADMAP/plan path — never the main story.
5. Claims matrix may keep internal claim ids; **public claim text** must be product-reproducible
   without those ids.
6. Spot-check: hand README + use.md to someone who never saw ROADMAP — they should not need a
   decoder ring.

### Standing rule after 4.4.0

New public doc/PRs: **product first**. Roadmap ids belong in ROADMAP/plans/PR bodies for
engineers, not in consumer-facing prose. Historical files under archive/releases before 4.4.0
are not rewritten for nostalgia; **do not regress** public lanes with new id-heavy narrative.

---

## Journey (product story)

```text
Spaghetti / AI mess
  → ark start | /ark-adopt          (honest contract)
  → doctor + improvement compass    (what residual matters)
  → plan A (edges)                  (mechanical-safe / judgment)
  → ENFORCE possible, design-weak ok
  → residual lenses (SoC, DIP, domain…)
  → /ark-explore → dual-plan B
  → one pilot with user OK
  → re-doctor / re-compass
  → write gate + required CI        (stay ordered)
```

**Success sentence (vibe coder):**  
*“The AI stopped dumping everything in one file; domain stays pure; when something’s still messy,
doctor names it and the next step — without pretending a green check means perfect design.”*

**Success sentence (expert):**  
*“Same binary gate; additive compass projection; skills finally coach non-experts without diluting
JSON depth.”*

---

## Risks and kill switches

| Risk | Mitigation |
|------|------------|
| Compass read as score | Product voice + tests forbid rank language; UI copy review in IC06 |
| Scope creep into new sensors | Freeze table; out-of-scope lenses explicit |
| Skills too long for agents | Outcome-first front; deep tables optional; compact router short path |
| IC05 blocks forever | Cap: shared requirements + per-skill minimum table; no novel skill frameworks |
| False “out-of-scope” hiding real residual | Partial instrumentation rules for ocp/testability/stack documented in IC02 |

**Kill switch:** if compass design starts requiring new scanners or scores to “feel complete,”
ship IC05+docs as patch-adjacent deepen only and park JSON surface — prefer honesty over a
half scorecard. (Owner may still choose full IC02–04 if pure projection is enough.)

---

## Release train

| Artifact | Role |
|----------|------|
| `package.json` / lock / `src/version.ts` / `server.json` | **4.4.0** |
| CHANGELOG `## 4.4.0` | Minor: additive compass + skill deepen; no required migration |
| `docs/releases/4.4.0.md` | Status prepared → published |
| `docs/package-surface.md` | New row for improvement compass |
| Claims matrix | IC claims C-0xx |

Does **not** wait for Z09/RB-11.

---

## Related

| Doc / plan | Relation |
|------------|----------|
| [power-simple-shape](../power-simple-shape/README.md) | Dual depth; false-done forbidden — IC continues Q-era path |
| [agent-contract-surface-4.3](../agent-contract-surface-4.3/README.md) | Status/catalog/skills packaging baseline |
| [reshape-copilot](../reshape-copilot/README.md) | physicalCohesion pilot evidence feeds cohesion lens |
| External skill `arquitectura-software-analyzer` | Vocabulary source for 15 principles; **not** productized as scores |

---

## Next engineering pick

After IC01 closed: **`IC02`** (Domain pure compass) as sole `doing`, unless owner prioritizes
IC05 prose-only wave in parallel under explicit ROADMAP note (still one merge-critical `doing`
for engine work).
