# ArkRules evolution (v4 epic seed)

> **Plan (seeded — Phase AR in the ROADMAP queue).** Library hub: [AGENTS.md](../../../AGENTS.md)<br>
> Related: [ROADMAP.md](../../../ROADMAP.md) · [ADR index](../../adr/README.md) ·
> [Configuration](../../configuration.md) · [Brownfield adoption](../../brownfield-adoption.md)

**Status:** Seeded 2026-07-23 as **Phase AR** (`AR01`–`AR19`, orders 82–100) in
`ROADMAP.md` for the `arkgate@4.x` release train. One `doing` at a time; `AR01` is next.
This document holds the contrast evidence, design decisions, and per-item exit criteria.<br>
**Slug:** `arkrules-evolution`<br>
**Kind:** epic / contract deepening + brownfield migration toolkit<br>
**Owners:** product (Pedro) + library maintainers<br>
**Last updated:** 2026-07-23

---

ArkGate today proves **inter-layer** truth: who may import whom, which capabilities a layer
may touch, whether the tree is governed. It says nothing about **what must exist inside a
layer** — invariants, always-valid aggregates, policies — so the most valuable rules in any
codebase stay invisible to the contract. ArkRules extends the same contract, the same
deterministic engine, and the same enforcement plane (MCP, PreToolUse, CI, doctor) to
intra-layer rules, and turns the library into an active migration partner for brownfield
codebases whose rules are still spaghetti.

Vision source: the "ArkGate Evolution Vision" brief (inter-layer → intra-layer ArkRules +
brownfield migration toolkit). This plan reconciles that brief with the code as it exists at
`3.9.1` and with the ROADMAP hard lines.

## 1. Contrast: vision vs current code (evidence)

| Vision requirement | Current state (evidence) | Gap |
|---|---|---|
| Intra-layer declarative rules | Per-layer `forbiddenGlobals`, `capabilities.deny` (closed 7-id vocab), `pure`, `intentPrefixes`, `peerIsolation` in `schemas/ark.config.schema.json` + `src/domain/configContract.ts` | Effect/dependency constraints only; no pattern/richness/invariant rules. `arkrules` has zero occurrences in the tree |
| Business rules as data | Skills (`ark-adopt` step "mine business rules", `ark-contract`) can only record rules *structurally* (folder + intent prefix). Runtime kernel (`src/kernel/manifest`, `intent`, `policy`) models intents/policies/events as data but is experimental and quarantined (ADR 0004, `K01` parked) | No declarative home for an invariant in the supported static contract |
| Modular config composition | Single-file `ark.config.json`; hand-rolled validator (`validateNode`); `schemaVersion` is `const "1.0"`; migration table `unversioned→1.0` only. No include/extends/multi-file merge exists | Reference resolution + Effective Contract is genuinely new work |
| Same enforcement plane | Single choke point already exists: violations enter `violations[]` (`src/kernel/resolvedAnalysis.ts` / `graphEvaluate.ts`), normalize through `toAdapterDiagnostic` (`src/domain/adapterContract.ts`, schema `1.3`), and flow to CLI, MCP tools, `ARK_REPAIR_JSON` hook payloads, `--strict-merge` CI, doctor, HTML report with no per-surface code | Only the evidence schema (`additionalProperties:false`) and remediation tables need additive extension |
| Structural sensors | Resolver facts (`resolveCandidateFacts`, schema `1.0`) carry imports, capability uses, top-level side effects, type-only exports. `bin/lib/ast-scan.mjs` already walks classes/properties/static fields but only for side-effect sensing. Design smells are filesystem/regex heuristics, advisory | No class-shape facts (visibility, constructor/factory shape, mutability), no aggregate/anemic sensors |
| Test-based coverage of invariants | Nothing mines test titles. Closest templates: `computeCoverage`, design-delta base/candidate ratchet, `changeConvergence` `satisfied\|missing` model | New coverage sensor required |
| Brownfield freeze + burn-down | `.ark-baseline.json` keyed by `baselineKey(ruleId,file,from,to,target)`; `--update-baseline` refuses lopsided freezes; `--plan` classifies `mechanical-safe\|judgment\|deferred`; `pilotLoop.nextPilot` extraction cards; design-delta `new\|worsened` ratchet; `.ark/contract-smell-acks.json` ack pattern | All import-edge/smell centric; needs arkrule keys, inventory discovery, and rule-mode promotion |
| Migration skills | 13 skills shipped; ROADMAP freezes **new skill names** ("prefer deepen + route"). `ark-adopt`/`ark-contract` already own the "mine business rules" job | Vision's `/ark-migrate-inventory`, `/ark-extract-rule`, `/ark-promote-rule`, `/ark-domain-richness` conflict with the freeze → resolve by deepening (§6) |

**Constraints inherited from ROADMAP hard lines (all respected by this plan):** binary gate,
no numeric score; no LLM pass/fail; stable evidence + next action on every diagnostic; no
silent auto-apply of judgment changes; no general codemod; weakening deltas hash-acknowledged;
advisory stays labeled advisory; no "Enforce" claim on incomplete coverage; reproducible
releases.

## 2. Design decisions to lock (new ADRs)

Answers to the vision's §8 open questions, to be ratified as ADRs before implementation:

### ADR 0012 — ArkRules contract and modular composition
- **Reference syntax:** top-level `arkRules` map in `ark.config.json`, keyed by layer name,
  value = relative path: `"arkRules": { "DomainModel": "arkrules/DomainModel.json" }`.
  Chosen over per-layer inline fields to keep `layers[]` lean and make provenance trivial.
- **Physical layout:** `arkrules/<Layer>.json` at repo root (template-generated). Colocated
  paths remain legal (any relative path resolves) but templates emit the explicit layout.
- **No auto-discovery.** Only explicitly referenced files load. An `arkrules/` file that is
  not referenced produces a config warning (advisory) so drift is visible; a referenced file
  that is missing, unparsable, or schema-invalid **fails closed** exactly like an invalid
  `ark.config.json`.
- **Empty scope is an error signal, never silent green.** A rule whose `appliesTo` scope
  matches zero files emits a config warning in advisory mode and fails in `enforced` mode —
  a zero-match glob is almost always a misconfigured pattern, and a rule that governs
  nothing must not look enforced (ArchUnitTS `allowEmptyTests:false` lesson, §9).
- **Schema versioning:** `ark.config.json` `schemaVersion` bumps `1.0 → 1.1` (additive; new
  optional `arkRules` key; migration step added to `ARK_CONFIG_MIGRATIONS`). New sibling
  schema `schemas/ark.arkrules.schema.json` with its own `schemaVersion` starting at `1.0`,
  validated by the same hand-rolled `validateNode`, exported via `package.json` `./schema/*`.
- **Effective Contract:** a new pure module (`src/domain/arkRulesContract.ts` +
  `src/domain/effectiveContract.ts`, generated to `bin/lib/` via `generate:cli-pure`) resolves
  references, validates each part, and produces one in-memory contract where every rule
  carries `{ sourceFile, ruleId }` provenance. The effective contract feeds
  `deterministicHash` into `policyHash` so policy-delta classification, the resident-hook
  runtime identity, and hashes in `ark_prepare_write` all cover ArkRules automatically.
- **Backward compatible:** absence of `arkRules` changes nothing; `1.0` configs load via
  migration untouched.

### ADR 0013 — Intra-layer structural sensors are resolver facts, not style lint
- Sensors extend `resolveCandidateFacts` with **class-shape facts** (exported classes,
  member visibility, mutable public fields, constructor/factory shape, mutating methods and
  whether they reference a guard/publish call). `RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION`
  bumps `1.0 → 1.1` additively (ADR 0009 precedent: IR extends additively within a major).
- **Direct evidence blocks; inference advises** (ADR 0009 discipline). Tier 1 sensors are
  deterministic pattern checks that can block when a layer opts in; Tier 2 heuristics
  (anemic-model, richness) are advisory-only forever, like design smells.
- The core gate does **not** become a general linter or an executable rules engine: the
  sensor vocabulary is a closed, versioned set (like `CAPABILITY_IDS`), and arbitrary
  predicate evaluation is out of scope for core (companion/experimental only, §7).

### ADR 0014 — Invariant catalog, coverage evidence, and rule modes
- Domain ArkRules may declare an **invariant catalog**: stable IDs, human description,
  owning aggregate, preferred implementation hint. Catalog entries are contract data, never
  executable code.
- **Coverage evidence, in order of strength:** (1) a test whose title contains the invariant
  ID (test-title mining over the project's test globs, same `globToRegExp` engine);
  (2) deterministic symbol matching (a Domain method/factory referenced by the declared
  aggregate, e.g. `ensureInvariants`). Semantic proof of arbitrary predicates is explicitly
  out of scope. Uncovered invariants emit `INVARIANT_UNCOVERED` (advisory, `failsStrict:false`).
- **Rule modes:** every ArkRule carries `mode: "advisory" | "enforced"` (default advisory).
  Promotion advisory→enforced is a strengthening policy delta (auto-allowed); demotion or
  deletion is a **weakening** delta and requires the existing hash-bound acknowledgment.
  An `enforced` rule with incomplete analysis evidence reports `partial` and never fakes
  green (Z02 discipline).
- **Freeze interop:** arkrule violations reuse `baselineKey` (ruleId = sensor code, target =
  invariant/arkrule ID) so `.ark-baseline.json`, `--update-baseline`, and the
  new-debt-only ratchet work unchanged. Residual frozen arkrule debt is reported per rule.

### ADR 0015 — Migration workflows route through existing skills
- Honor the skill-name freeze: **deepen, don't mint**. Routing (§6) maps the vision's four
  workflows onto `ark-adopt`, `ark-fix`/`ark-loop`, `ark-contract`, and `ark-architect`.
  If field evidence later shows routing confusion, a dedicated skill name requires its own
  roadmap item + ADR supersession (same bar as `/ark-reshape` in ADR 0010).
- Skills propose and guide; the gate's verdict is always the deterministic engine.

### ADR 0016 — Executable evaluator stays out of core
- A minimal pure predicate evaluator (if ever) is a companion/experimental surface behind
  the ADR 0004 boundary. Core enforcement mechanisms remain: structural sensors + declared
  catalogs + test-coverage evidence. This answers the vision's §5 hard line directly.

## 3. Schema design sketch

`ark.config.json` (v1.1, additive):

```jsonc
{
  "schemaVersion": "1.1",
  "layers": [ /* unchanged */ ],
  "rules": [ /* unchanged */ ],
  "arkRules": {
    "DomainModel": "arkrules/DomainModel.json",
    "ApplicationOrchestration": "arkrules/ApplicationOrchestration.json"
  }
}
```

`arkrules/DomainModel.json` (`schemas/ark.arkrules.schema.json`, v1.0):

```jsonc
{
  "$schema": "https://unpkg.com/arkgate/schemas/ark.arkrules.schema.json",
  "schemaVersion": "1.0",
  "layer": "DomainModel",
  "structure": [
    { "id": "always-valid-aggregates", "sensor": "aggregate-private-state",
      "mode": "advisory", "appliesTo": ["src/domain/**/aggregates/**"] },
    { "id": "events-on-mutation", "sensor": "domain-event-on-mutation",
      "mode": "advisory" }
  ],
  "invariants": [
    { "id": "INV-ORDER-001",
      "description": "An order total never goes below zero",
      "aggregate": "Order",
      "coverage": { "test": true, "symbol": "Order.ensureInvariants" },
      "mode": "enforced" }
  ]
}
```

- `sensor` values come from the closed, versioned sensor vocabulary (§4); unknown sensors
  fail closed with a schema error naming the file.
- `layer` must match the referencing key; mismatch fails closed.
- Every loaded entry gains provenance `{ sourceFile, id }` in the Effective Contract; every
  diagnostic carries it in `evidence` (analysis-result schema `1.3 → 1.4`, additive
  `evidence.arkruleId` + `evidence.arkruleSource`), so errors always point back to
  file + rule id on every surface.

## 4. Sensor plan (closed vocabulary, tiered)

| Sensor id | Tier | Evidence (deterministic) | Default |
|---|---|---|---|
| `aggregate-private-state` | 1 | Exported class in scope has public mutable fields / public setters (class-shape facts) | advisory, promotable |
| `always-valid-factory` | 1 | Aggregate class exposes public constructor without guard call vs private ctor + static factory | advisory, promotable |
| `domain-event-on-mutation` | 1 | Mutating method (assigns `this.*`) lacks reference to a declared event/publish symbol | advisory, promotable |
| `orchestration-only` | 1 | Application-layer file contains business predicates (branching on domain values beyond guard-and-delegate shape) — scoped, conservative | advisory |
| `thin-adapter` | 1 | Adapter-layer file exceeds declared shape (domain branching + persistence + mapping in one module) — reuses hollow-persistence machinery | advisory |
| `no-anemic-model` | 2 | Heuristic: exported Domain types with data-only shape + external mutation sites | advisory only, never promotable |
| `invariant-coverage` | 1 | Catalog entry lacks test-title or symbol evidence (§ADR 0014) | advisory, promotable per invariant |

Implementation home: facts in `src/kernel/` scanners + `src/domain/resolvedCandidateFactsTypes.ts`;
violation emission alongside `FORBIDDEN_GLOBAL`/`CAPABILITY_VIOLATION` in
`src/kernel/resolvedAnalysis.ts`; remediation classes in `src/domain/remediation.ts`
(all sensor fixes are `judgment` / `neverMechanicalSafe` except pure declaration edits);
fix hints in `bin/lib/violations.mjs`. Bounded scan budgets follow the design-smell caps.

## 5. Brownfield migration toolkit (Phase AR3)

Everything builds on shipped machinery — no parallel subsystem:

- **Discovery / inventory:** a deterministic `ark-check --rules-inventory [--json]` pass
  (and `ark_rules_inventory` MCP tool) that scans governed + ungoverned code for rule
  candidates: repeated predicates, magic business constants, validation in
  controllers/services, mutation without guards, anemic entities. Output: prioritized
  candidate list with location, suggested `arkrules` template entry, confidence
  (`direct-evidence` / `heuristic` — never a numeric score), rendered in doctor JSON,
  human output, and the HTML report ("Rules under contract" section).
- **Extraction, one pilot at a time:** inventory items become extraction cards in the
  existing `pilotLoop` (`Pilot / Smell / Move / Do not / Success / Kill-switch / Next`),
  ranked, `nextPilot` one-at-a-time, `neverMechanicalSafe`. The card's target state is:
  declarative entry in `arkrules/<Layer>.json` + pure Domain implementation + covering
  test. Preflighted through `ark_prepare_change` like any atomic change.
- **Freeze + progressive promotion:** newly extracted rules start `advisory`; promotion to
  `enforced` requires coverage evidence (the engine refuses to promote an uncovered
  invariant — deterministic, not judgment). Residual un-extracted inventory can be frozen
  with the same `.ark-baseline.json` ratchet; doctor reports
  "X inventoried candidates, Y under contract, Z frozen residual" as counts (no score).
- **Progress surfaces:** doctor gains a `rulesMigration` section; the HTML report gains the
  matching section (report-parity rule keeps them in sync from day one); design-delta-style
  base/candidate ratchet (`--fail-on-new-*` pattern) can guard against *new* spaghetti rules
  appearing in touched paths once a team opts in.

## 6. Skills routing (no new names)

| Vision skill | Routed to | Deepening |
|---|---|---|
| `/ark-migrate-inventory` | `ark-adopt` (+ `ark-coverage` reporting) | Adds the rules-inventory pass to brownfield onboarding; backlog lands in doctor JSON, not prose |
| `/ark-extract-rule` | `ark-fix` (single extraction) / `ark-loop` (drive the pilot loop) | Extraction-card execution: declare → implement → test → re-doctor; gate validates each step |
| `/ark-promote-rule` | `ark-contract` | Editing `arkrules/*.json` is contract editing; promotion/demotion flows through policy-delta |
| `/ark-domain-richness` | `ark-architect` (+ `ark-explain` for the report) | Uses Tier-2 advisory evidence to frame judgment refactors |

`ark-place` gains awareness of structure rules ("this layer requires private state; scaffold
a factory"), and `ark-upgrade` keeps stamping/refreshing skills as today.

## 7. Release train and backlog (seeded as Phase AR, orders 82–100)

v4 is the window: deprecated `arkgate/runtime` + `arkgate/nestjs` forwarders are already
scheduled for removal "at major 4.0", making `4.0.0` a real (small) breaking release while
ArkRules itself ships opt-in and additive. One `doing` at a time; each item lands with
tests, drift-checked generated artifacts, schema exports, and docs-authority updates.

### Phase AR0 — Foundations (ships in `4.0.0`)
| ID | Item | Exit criteria |
|---|---|---|
| `AR01` | ADR 0012 + `ark.arkrules.schema.json` + config `schemaVersion 1.1` migration | Schemas exported; `1.0` configs load unchanged (test-pinned); invalid/missing referenced file fails closed with file-precise diagnostics |
| `AR02` | Effective Contract loader with provenance + `policyHash` coverage | Same verdict across CLI/MCP/ESLint on fixtures; resident-hook identity invalidates on arkrules edits; policy-delta classifies arkrules add/remove/promote/demote correctly |
| `AR03` | Adapter contract `1.3 → 1.4` (`evidence.arkruleId`, `evidence.arkruleSource`) + remediation/fix-hint plumbing | An injected arkrule violation renders with provenance on CLI, MCP `ark_check`/`ark_prepare_write`, hook `ARK_REPAIR_JSON`, doctor, HTML report — no surface-specific code |
| `AR04` | v4 breaking hygiene: remove deprecated runtime forwarders; publish migration note | Clean-checkout pack passes; migration doc updated; no other breaking surface |

### Phase AR1 — Structural sensors + templates (ships in `4.0.0`)
| ID | Item | Exit criteria |
|---|---|---|
| `AR05` | ADR 0013 + class-shape facts (resolved-facts `1.1`) | Facts additive; parity + drift tests green; performance within PreToolUse budget on the 50k-file benchmark fixture |
| `AR06` | Tier-1 sensors: `aggregate-private-state`, `always-valid-factory`, `domain-event-on-mutation` | Positive/negative fixtures; advisory invariants pinned (verdict/exit/designFitness untouched in advisory mode); enforced mode blocks through hook + CI on fixtures |
| `AR07` | Tier-1 sensors: `orchestration-only`, `thin-adapter`; Tier-2 `no-anemic-model` advisory | Stays silent on this repo and the healthy onboarding-matrix fixtures; hollow-persistence machinery reused, not duplicated |
| `AR08` | Templates: `start`/presets emit `arkrules/*.json` per archetype; policy packs gain matching editable ArkRules | Every archetype generates a lean root config + editable arkrules files; onboarding budget (file count/KB) still within the 3.8.3 compact envelope |

### Phase AR2 — Invariant catalog + coverage (ships in `4.1.0`)
| ID | Item | Exit criteria |
|---|---|---|
| `AR09` | ADR 0014 + invariant catalog in Domain ArkRules | Catalog validates; provenance + policy-delta coverage; `ark://manifest` exposes it |
| `AR10` | Coverage evidence: test-title mining + symbol matching; `INVARIANT_UNCOVERED` advisory | Deterministic on fixtures; no false green (missing test globs → `partial`, never covered) |
| `AR11` | Rule modes + promotion ladder | Advisory→enforced auto-allowed; enforced→advisory/delete requires hash-bound ack; uncovered invariant refuses promotion deterministically |
| `AR12` | Doctor + HTML "Rules under contract" section; skills deepened for declare-and-cover | Report parity guard extended; `ark-contract`/`ark-place` updated and stamped |

### Phase AR3 — Brownfield migration toolkit (ships in `4.2.0`)
| ID | Item | Exit criteria |
|---|---|---|
| `AR13` | Rules inventory engine (`--rules-inventory`, `ark_rules_inventory`) | Deterministic, bounded; reproduces known fixtures (validation-in-controller, magic-constant, anemic entity); silent on healthy fixtures |
| `AR14` | Extraction cards in `pilotLoop` + preflighted pilot flow | One pilot at a time; a naive extraction blocked by preflight on fixture; `ark-adopt`/`ark-fix`/`ark-loop` deepened |
| `AR15` | Freeze/residual for arkrules + migration progress in doctor/report | Baseline keys stable; counts honest (`inventoried/under-contract/frozen`); refuses lopsided freeze like today; opt-in auto-shrink on green runs (fixed frozen violations leave the baseline and cannot silently return — ArchUnit `allowStoreUpdate` lesson, §9) |
| `AR16` | Field pilot on one consented brownfield corpus | Recorded evidence: inventory → ≥1 extraction → promotion → green with residual honestly reported (adopter never named in public artifacts) |

### Phase AR4 — Hardening & ecosystem (ships in `4.3.0`)
| ID | Item | Exit criteria |
|---|---|---|
| `AR17` | Remediation payload polish for AI hosts + performance pass | Hook budget held with arkrules loaded (resident path); mutation/coverage gates green |
| `AR18` | ADR 0016 companion-evaluator decision + docs/case studies | configuration.md, agent-guide.md, brownfield-adoption.md, use/develop lanes updated; migration case study published |
| `AR19` | Claims audit + release close | Every README/claims-matrix statement about ArkRules reproducible from clean checkout |

**Sequencing note:** `Z09`/`RB-11` is a claim gate, not an engineering blocker; it stays
parked and does not gate AR items. Frozen-list interactions: template work in `AR08` deepens
*existing* archetypes/packs (no new preset names); no new skill names anywhere in the plan.

## 8. Product invariants (test-pinned when shipped)

1. A project with dozens of business rules keeps a lean root `ark.config.json`; rules live in
   focused, reviewable `arkrules/*.json` files with provenance on every diagnostic.
2. Absence of `arkRules` changes no verdict, byte-for-byte (advisory-invariant discipline).
3. Arkrule violations reach every surface (CLI, MCP, hook deny payload, CI, doctor, HTML)
   with the same evidence and next action as layer-import violations.
4. The gate never uses an LLM verdict; coverage/promotion decisions are deterministic.
5. Migration progress is reported as honest counts (inventoried / under contract / frozen
   residual) — never a score; "green" with frozen residual always says so.
6. Weakening an ArkRule is a hash-acknowledged contract transition, same as weakening a
   layer rule.

## 9. Prior art and cherry-picks (verified 2026-07-23)

Findings verified against primary sources (ArchUnit user guide + `TextFileBasedViolationStore`
source, project READMEs/package.json, dependency-cruiser rules reference). Each borrowed idea
lands in a specific ADR or AR item; nothing is adopted as a dependency.

| ArkRules feature | Source | What to borrow (verified) | Lands in |
|---|---|---|---|
| Freeze lifecycle | **ArchUnit** `FreezingArchRule` | VCS-committed store; auto-shrink on green runs (`allowStoreUpdate`, default on) so fixed violations cannot silently return; store creation off by default (`allowStoreCreation=false` — CI can never mint a baseline); explicit `refreeze` as a deliberate act. Anti-lesson: ArchUnit keys the store by rule *description text*, so renames orphan baselines — ArkGate already keys by stable `baselineKey(ruleId,file,…)` and must keep IDs, never prose, as identity | `AR15`; existing `.ark-baseline.json` mechanics confirmed correct (line-number-agnostic keys ≙ ArchUnit's default `ViolationLineMatcher`) |
| Archetype rule bundles | **ArchUnit** Library API (`layeredArchitecture()`, `onionArchitecture()`) | A named archetype bundles many conditions (onion: domain imports nothing outer, no adapter→adapter) — validates generating pre-populated `arkrules/*.json` per archetype rather than asking users to compose sensors by hand | `AR08` templates |
| Rule grammar | **dependency-cruiser** | The forbidden/allowed/**`required`** trichotomy: `required` = "every module matching X MUST depend on / contain Y" — exactly the shape of structural sensors (aggregate MUST route mutations through a guard). Adopt require/forbid polarity in the `structure[]` entry vocabulary; `severity: ignore` as first-class off-switch ≙ our ack files | `AR01` schema design (ADR 0012) |
| Empty-scope honesty | **ArchUnitTS** (`allowEmptyTests:false`) | A rule matching zero files fails instead of passing vacuously — prevents misconfigured globs from reading as "enforced" | ADR 0012 (locked above) |
| Execution surface | **ArchUnitTS** / **ts-arch** | Framework-agnostic `rule.check() → Violation[]` core with thin per-runner matchers; both parse via the TypeScript compiler API directly (no ts-morph, no graph lib) — confirms ArkGate's existing zero-dep resolver approach; **do not add ts-morph** | Confirms AR05 approach |
| Invariant-as-object | **Ontologic** (`DomainInvariant`) | Invariant = named object `{description, predicate}` with combinators and a structured violation payload (`CorruptedStateError{entityId,state,violations[]}`) — proves the model works in TS with zero decorator/reflection magic. Its gap (no stable invariant IDs) is exactly what our catalog adds. Its check-on-read semantics are runtime-only → relevant to the companion evaluator, never the static gate | `AR09` catalog shape (ADR 0014); ADR 0016 companion notes |
| Domain pattern playbooks | **domain-driven-hexagon**, Khalil Stemmler, Vladimir Khorikov (always-valid model) | Concrete TS shapes for extraction cards and template `preferredImplementation` hints: private constructor + static factory returning Result, `ensureInvariants`, Specification pattern, events on mutation | `AR08` hints, `AR14` extraction playbooks |
| Declaration ergonomics | **json-rules-engine** (`all`/`any` conditions), **ArchFit** (flat named-check catalog + threshold) | Borrow only declaration shapes for sensor params; both are execution engines/abandoned respectively — no dependency, no executable conditions in core | `AR01` schema ergonomics |
| Policy modularity + provenance | **OPA/Rego** | Policy packages separate from code, compiled bundle with revision hash, decisions traceable to source module — conceptual template already mirrored by Effective Contract + `policyHash` + provenance | Confirms ADR 0012 |
| Encapsulation heuristics | **typescript-eslint** (`explicit-member-accessibility`, `prefer-readonly`), SonarQube smells | Mature detection heuristics to adapt into class-shape facts (public mutable fields, missing accessibility) — adapt logic, never depend on ESLint at analysis time | `AR05`/`AR06` sensors |

**Explicitly not copied:** heavyweight executable rules engines (Drools/GoRules-style —
decision tables stay behind ADR 0016 if ever), decorator/runtime-reflection registration
(hard line #3: enforcement cannot depend on runtime registration), subjective metrics
without evidence (LCOM/cohesion scores in ArchUnitTS metrics — violates the no-score line),
and diagram-as-contract validation (ts-arch PlantUML — out of wedge).
