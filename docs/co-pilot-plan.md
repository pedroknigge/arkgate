# Ark Co-pilot — Implementation plan (next big release)

Status: **planning** (opened 2026-07-08). Target milestone: **Co-pilot**. The enablers ship
incrementally as 1.x minors; the milestone is declared when the end-to-end loop works for a
non-developer. Versioning note in the last section.

This is the "thick" plan for the third stage of Ark's arc — **Gate → Guide → Co-pilot** —
decomposing the [North Star](../ROADMAP.md#north-star--an-architecture-co-pilot-for-everyone)
into buildable deliverables. It is to the co-pilot what
[`architect-onboarding-plan.md`](architect-onboarding-plan.md) was to onboarding.

## Problem statement

Ark today is a tool an expert (or an expert-driven agent) drives by hand: run `--recommend`,
accept a shape, `--write-plan`, then chain `/ark-adopt` / `/ark-fix` / `/ark-contract`, running
`ark-check` between steps. Each piece works, but the human is the orchestrator and must know
the vocabulary.

A random, non-developer user cannot do this. They have a project and want it to be
well-architected and stay that way. They will not learn "hexagonal", "layer glob", or "facade
split" first. The gap is not capability — it is **orchestration and plain language**.

The field rounds (5–10) also set a hard constraint we must not break: **the judgment-heavy
grind is not Ark's to auto-run.** Verbatim relocation is mechanical and safe; repository
organization and cross-module refactors need human judgment. Any autonomy that blurs this
loses trust the first time it auto-lands a bad edit.

## Product goals

1. **One command takes a newcomer from "I have a project" to "governed and green"** —
   propose → accept → plan → apply the safe changes → approve the rest → enforce, in plain
   language, with an agent doing the edits and Ark deciding what may land.
2. **Two tiers, one contract.** Newbie gets the full loop; expert keeps the manual skills +
   gate. Same `ark.config.json`, same gates underneath.
3. **Autonomy that is safe, reversible, and honest.** Nothing auto-applies unless the gate
   can validate it behavior-preserving; big rocks are always proposed; the run always shows
   auto-done vs proposed vs deferred and never reports green while skipping work.
4. **Ark orchestrates and validates; it does not become a codemod engine.** The agent writes
   edits; Ark classifies, sequences, validates, and enforces.

## Design principles (additions to the public + onboarding principles)

- **Validated-and-reversible autonomy.** Every auto-applied step runs in a discardable git
  worktree, is validated by `ark-check` before it counts, and is rolled back if it fails or
  regresses. Code only — never DB/schema/DDL (round 5 invariant).
- **Bias to propose.** The classifier that decides "safe to auto-apply" must bias toward
  "propose for approval" whenever behavior-preservation is not provable. A false "safe" is the
  failure mode that sinks trust; a false "propose" only costs a click.
- **Plain language is a first-class output, not a wrapper.** Every proposal, diff, and result
  is explained in outcome terms ("your pages will stop talking to the database directly")
  before any jargon.
- **The gate is the backstop, always on.** The co-pilot never edits without the write gate
  and CI gate in force; autonomy sits *on top of* enforcement, not instead of it.

## The loop

```
analyze ──▶ propose shape ──▶ accept ──▶ plan + classify ──▶ apply loop ──▶ enforce
(recommend)  (plain lang)    (init)     (adoption plan +     (worktree,      (gates
                                         per-item class)      step→gate→      already
                                                              keep/rollback)  installed)
                                              │                    │
                                       mechanical-safe ────▶ auto-apply (validated)
                                       judgment/big-rock ──▶ propose (diff + yes/no)
                                       deferred ───────────▶ list, explain why
```

## Work classification (load-bearing — build first)

The trust boundary for what an agent may auto-apply. Extends the existing `typeOnly` tag and
the `/ark-fix` fix-classes into a per-item verdict on the adoption plan.

Classes:

- **`mechanical-safe`** (auto-applicable, gate-verifiable, behavior-preserving):
  - type-only import move to the owning layer + re-export shim (already the burn-down workhorse)
  - file relocation to its correct layer directory with import updates
  - verbatim infrastructure relocation (raw `db`/SQL in a route → a repository method; same
    bytes, route orchestrates, repo does data access)
  - back-compat re-export barrels for a facade split
- **`judgment`** (propose only, never auto-apply):
  - repository-organization choices (focused-per-route vs extend domain repos vs few read-models)
  - DTO extraction when UI owns a persistence type (real refactor, not a re-export)
  - cross-module or multi-query refactors, transactions, anything not provably behavior-preserving
- **`deferred`**: needs input Ark cannot supply (a product decision, an ambiguous target).

Signals (deterministic, from `ark-check` data): the `typeOnly` vs value tag × infra-role of the
target × edge size × whether the transform is a pure move/relocation vs a logic change. When
signals disagree or behavior-preservation is not provable → `judgment`.

Deliverable: `ark-check` emits a per-item `class` + `confidence` + one-line `rationale` on the
adoption plan (extends `ark-adoption-plan.json` and the `summary`), surfaced in `--doctor`.
Useful immediately (shows the burn-down's shape) even before any autonomy exists.

## Deliverables

- **D1 — Work classifier.** `ark-check` tags each planned change `mechanical-safe | judgment |
  deferred` with confidence + rationale; `ark-adoption-plan.json` and `--doctor` carry it.
  *(The prerequisite. Ships and is useful on its own.)*
- **D2 — Guided single entry point.** One flow (`ark start` / `/ark`) chaining recommend →
  confirm-in-plain-language → init → write-plan, so a newcomer never types a skill name.
  Reuses the mature-repo routing shipped in 1.15.0.
- **D3 — Worktree-safe apply loop.** A runner that, given a classified plan, spins a discardable
  worktree, applies one step, runs `ark-check`, keeps on green / rolls back on failure or
  regression, and surfaces a diff. Code-only guard (refuses non-code paths).
- **D4 — Autopilot orchestration.** An agent-driven skill/workflow (`/ark-autopilot`) that reads
  the classified plan and drives phases: auto-applies `mechanical-safe` (via D3, validated),
  presents `judgment` items as plain-language proposals + diff for yes/no, re-runs the gate,
  and reports progress. Composes D1–D3.
- **D5 — Tiered UX.** `--mode newbie|expert` (or detection). Newbie = autopilot with approvals +
  plain language; expert = current manual skills + gate. Same contract/gates.
- **D6 — Plain-language layer.** A rendering pass that states every proposal/diff/result in
  outcome terms first. Shared by D2, D4, D5.
- **D7 — Enforcement handoff verification.** Confirm the newbie path leaves gates installed and
  active (CI + write-gate + hooks) with zero extra steps — the "and stays that way" half.
- **D8 — Proof: a non-dev completes the loop.** A recorded end-to-end run on a real repo
  (install → accept → watch safe changes land validated → approve/decline big rocks → leave
  green with gates on), plus eval cases measuring classifier precision.

## Implementation phases

Each phase ships independently and leaves the product strictly better.

- **Phase F — Classifier (D1).** No autonomy yet. Immediate value in `--doctor`/`/ark-fix`
  (shows mechanical vs judgment vs deferred). Acceptance: classifier precision on the eval
  corpus with a near-zero false-`mechanical-safe` rate; plan + doctor carry the class.
- **Phase G — Guided entry + plain language (D2, D6).** The newcomer funnel, still
  propose-only. Acceptance: a first-time user reaches a written plan without knowing a skill
  name; every step explained in outcome terms.
- **Phase H — Apply loop (D3).** Worktree-safe, single-step, validated, reversible; not yet
  auto-driven. Acceptance: applying a `mechanical-safe` item validates and keeps; a regressing
  edit rolls back; non-code paths refused.
- **Phase I — Autopilot (D4, D5).** Compose F–H into the end-to-end loop with tiers.
  Acceptance: newbie mode auto-applies the safe class (validated), proposes the rest, ends with
  gates green; expert mode unchanged.
- **Phase J — Proof + handoff (D7, D8).** End-to-end run by a non-dev on a real repo; eval
  numbers; enforcement handoff verified. Acceptance: the North Star success criteria met.

## Dependency graph

```
F (classifier) ──┬──▶ H (apply loop) ──▶ I (autopilot) ──▶ J (proof)
                 │                         ▲
G (guided entry)─┴─────────▶ D6 (plain) ──┘
                                          ▲
                                    D5 (tiers)
```

F is the root — H and I both depend on trustworthy classification. G and D6 can proceed in
parallel and land early to smooth the funnel.

## Risks and mitigations

- **Classifier false-"safe" auto-lands a bad edit.** *Highest risk.* Mitigate: bias to
  `judgment`; require gate-verified behavior-preservation for `mechanical-safe`; every
  auto-apply still runs the gate and rolls back on regression; measure precision in evals
  before enabling autonomy by default.
- **Scope creep into a codemod engine.** Keep the line: the agent writes edits, Ark
  classifies/validates. No AST-rewrite logic owned by Ark.
- **Autonomy erodes the honesty principle.** Always report auto-done vs proposed vs deferred;
  never green while skipping; the newbie summary must be truthful, not reassuring.
- **Big-rock creep.** Repository-organization and cross-module refactors stay `judgment`
  forever, even in newbie mode. No exceptions.
- **Non-code damage.** Hard code-only guard in D3; refuse migrations/DDL (round-5 invariant).

## Success criteria (the co-pilot milestone)

Mirrors `docs/internal-roadmap.md` → "Success Criteria For The Co-pilot":

- Work classification is trustworthy (near-zero false-`mechanical-safe` on the eval corpus).
- The apply loop is safe and reversible (worktree, gate-validated, rollback, code-only).
- A non-developer completes the loop end to end on a real repo, no architecture vocabulary
  required to succeed.
- Honesty holds under autonomy (auto-done vs proposed vs deferred always shown).
- The expert path is undiminished (manual skills + gate identical; autopilot is opt-in).

## Versioning

The enablers are backward-compatible and opt-in, so each ships as a **1.x minor** (F, G, H …).
The **Co-pilot milestone** is a marketing/release moment, not necessarily a major bump. A 2.0
is only warranted if it coincides with the planned deprecations (`AIGateViolation.code` →
`ruleId`, `layeredArchitectureRules()` → `cleanArchitectureMatrix`) — decide then, with Pedro.
