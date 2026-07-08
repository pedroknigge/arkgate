# Ark Co-pilot — Implementation plan (next big release)

Status: **ships as 2.0.0** — milestone complete (I+J) **and** field-hardening is **in scope for
the same major** (honesty, framework overlays, modes, pnpm-safe runner). Enablers F–H shipped as
1.x minors; I+J + field-hardening land as 2.0.0. See freeze checklist in
[`roadmap-internal.md`](roadmap-internal.md).

This is the "thick" plan for the third stage of Ark's arc — **Gate → Guide → Co-pilot** —
decomposing the [North Star](../ROADMAP.md#north-star--an-architecture-co-pilot-for-everyone)
into buildable deliverables. It is to the co-pilot what
[`architect-onboarding-plan.md`](architect-onboarding-plan.md) was to onboarding.

## Harness primitives: plan, loop, goal

The co-pilot is built from the three primitives every modern agent harness relies on:

- **plan** — a structured, ordered list of steps toward a target. Shipped in Phase F as the
  classified remediation plan (`ark-check --plan`), each step tagged mechanical-safe / judgment
  / deferred.
- **goal** — the target condition the work drives toward and the honesty backstop for "done".
  Shipped embedded in the plan's `goal` block (active violations → 0 without weakening the
  contract); enforced continuously by `ark-check`.
- **loop** — apply → validate → keep-or-rollback, iterated over the plan until the goal holds.
  Lands in Phase H (the worktree-safe apply loop), driven by the autopilot in Phase I.

Progress: **plan ✅ (F) · goal ✅ (F) · loop ✅ (H) · autopilot ✅ (I) · proof ✅ (J) ·
field-honesty ✅ (2.0)** — the co-pilot milestone ships as **2.0.0**.

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
2. **Two entry styles × three operating modes × one contract.** Newbie gets the full loop;
   expert keeps the manual skills + gate. Modes: **suggest** (shape), **adapt** (coverage /
   real layout), **enforce** (gates honestly hold). Same `ark.config.json` underneath.
3. **Autonomy that is safe, reversible, and honest.** Nothing auto-applies unless the gate
   can validate it behavior-preserving; big rocks are always proposed; the run always shows
   auto-done vs proposed vs deferred; `goal.met` is false while governed coverage is near zero.
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

- **D1 — Work classifier. ✅ SHIPPED (1.17.0).** `ark-check --plan [--json]` tags each active
  violation `mechanical-safe | judgment | deferred` with confidence + rationale, ordered
  auto-first, wrapped in a `goal` block; `--doctor` points at it. Report-only. The classifier
  (`classifyRemediation`) is shared in `ark-shared.mjs` so the CLI, the MCP gate, and the
  future apply-loop classify identically.
- **D2 — Guided single entry point. ✅ SHIPPED (1.18.0).** `ark start` chains recommend →
  confirm-in-plain-language → init (preset for greenfield, detection for an established repo) →
  `--plan`, so a newcomer never types a skill name. `--yes` for non-interactive.
- **D3 — Worktree-safe apply loop. ✅ SHIPPED (1.19.0).** The `/ark-loop` skill drives the plan
  in a discardable worktree, applies one `mechanical-safe` step, validates with `ark-check`,
  keeps on green / rolls back on regression, proposes `judgment` steps, and loops until
  `goal.met` or no-progress. Agent edits, Ark validates — code only. `goal.met` in `--plan`
  is the termination signal. (An agent-driven skill rather than a CLI codemod, by principle.)
- **D4 — Autopilot orchestration. ✅ SHIPPED (2.0.0).** The `/ark-autopilot` skill composes
  setup (G) + plan (F) + loop (H): confirms the plan, drives `/ark-loop` for the
  `mechanical-safe` steps (validated), proposes `judgment` items for yes/no, verifies the gates,
  and reports auto-applied vs proposed vs deferred — in plain language.
- **D5 — Tiered UX. ✅ SHIPPED (2.0.0).** Two tiers over one contract, documented in
  `/ark-autopilot`: newbie = the autopilot flow with approvals + plain language; expert = the
  pieces directly (`ark init` / `/ark-contract` / `ark-check --plan` / `/ark-fix` / gate).
  Realized by the two entry styles rather than a mode flag.
- **D6 — Plain-language layer. ✅ SHIPPED (1.18.0 → 2.0.0).** `ark start`, `--plan`, and
  `/ark-autopilot` state the shape, each step, and the result in outcome terms first.
- **D7 — Enforcement handoff. ✅ SHIPPED (2.0.0).** The guided path leaves the gates installed
  and active (config + AGENTS.md + CI workflow), verified by the `ark start` test.
- **D8 — Proof. ✅ SHIPPED (2.0.0).** Deterministic classifier-precision corpus test (zero
  false-`mechanical-safe` across type-only / value / forbidden-global / circular cases) +
  the end-to-end demo `docs/demos/03-copilot-autopilot.md`.

## Implementation phases

Each phase ships independently and leaves the product strictly better.

- **Phase F — Classifier (D1). ✅ SHIPPED (1.17.0).** Delivers the `plan` + `goal` primitives:
  `ark-check --plan` emits the classified, ordered remediation plan with an embedded goal;
  report-only, no autonomy yet. Immediate value — it shows mechanical vs judgment vs deferred
  before any apply loop exists. Remaining for the milestone: measure classifier precision on an
  eval corpus (near-zero false-`mechanical-safe`) once the apply loop can exercise it.
- **Phase G — Guided entry + plain language (D2, D6). ✅ SHIPPED (1.18.0).** `ark start`: the
  newcomer funnel, still propose-only. A first-time user reaches a written plan without knowing
  a preset or skill name; the shape, steps, and result are framed in outcome terms.
- **Phase H — Apply loop (D3). ✅ SHIPPED (1.19.0).** `/ark-loop`: worktree-safe, single-step,
  validated, reversible. Applies `mechanical-safe` items (validate-or-rollback), proposes
  `judgment` ones, loops to `goal.met` or no-progress. Delivers the `loop` primitive.
- **Phase I — Autopilot (D4, D5). ✅ SHIPPED (2.0.0).** `/ark-autopilot` composes F–H into the
  end-to-end flow with newbie/expert tiers over one contract; `ark start` points newcomers to it.
- **Phase J — Proof + handoff (D7, D8). ✅ SHIPPED (2.0.0).** Classifier-precision corpus test
  (zero false-`mechanical-safe`), the end-to-end demo, and the enforcement-handoff test.

**Milestone reached — the co-pilot ships as 2.0.0**, including field-hardening:

- governed% honesty in `--plan` / `ark start` / `--doctor` (suggest · adapt · enforce)
- framework layout overlays (Nest / Next / express / library) on init
- shape-signal hygiene (no `.github` contamination)
- pnpm verify-deps-safe runner; TypeScript resolve + plan without hard-fail

Remaining work is **depth, not primitives**: broaden `mechanical-safe` (file relocation,
verbatim infra relocation) as evals prove each safe; grow the classifier corpus from real runs.

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
- Honesty holds under autonomy (auto-done vs proposed vs deferred always shown; no false-green
  at ~0% governed).
- The expert path is undiminished (manual skills + gate identical; autopilot is opt-in).
- Field matrix on diverse public starters: meaningful governed%, correct archetypes, no
  recommend self-perturbation from Ark's own CI files.

## Versioning

Enablers F–H shipped as **1.x minors**. **2.0.0** is the co-pilot **milestone major** (I+J +
field-hardening) — **not** an API break. Deprecated aliases stay for now. Deprecation removal
is a later major once consumers confirm unused.
