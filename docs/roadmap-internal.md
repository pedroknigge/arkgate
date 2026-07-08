# Ark — Internal Roadmap (maintainer)

Tactical, prioritized work queue. Complements the product-facing `ROADMAP.md`.
This is where release sequencing, open decisions, and the discovery log live.

Last updated: 2026-07-08.

## Release train

| Version | Theme | Status | Gate to ship |
|---------|-------|--------|--------------|
| **1.11.0** | Organize, don't false-green | **PUBLISHED** (npm + GitHub + MCP registry) | — |
| **1.12.0** | Write-gate ↔ CI parity (Option A) + upgrade command migration | **PUBLISHED** | — |
| **1.13.0** | Config doctor + brownfield playbook / `/ark-fix` infra-relocation | **PUBLISHED 2026-07-06** | — |
| **1.14.0** | Architect onboarding Phases A–E (recommend/plan/wizard/gallery) | **PUBLISHED 2026-07-07** | — |
| **1.15.0** | Brownfield install hardening + layer `exclude` | **PUBLISHED 2026-07-08** (npm ✅ provenance; GitHub release ✅; MCP registry pending user `mcp-publisher login`) | — |
| **next big** | **Co-pilot** milestone — see `docs/co-pilot-plan.md` | Planning; enablers ship as 1.x minors (Phase F first) | Per-phase |
| ongoing | Trust hardening | Partial (provenance + trusted publishing done) | Can ride any release |

Decision (user, 2026-07-08): 1.15.0 shipped as a minor with all the brownfield/​exclude work
(PR #7 merged). Next: build the **co-pilot** (North Star) — full thick plan in
`docs/co-pilot-plan.md`. **Start with Phase F (work classifier)** — the load-bearing trust
boundary; ships as a minor and is useful in `--doctor`/`/ark-fix` before any autonomy exists.
Process note stands: batch more per release to avoid tripping consumers' pnpm cooling-off.

## North Star — the autonomy vision (owner: Pedro, 2026-07-08)

**The dream, verbatim in intent:** a random, non-developer user installs Ark; Ark analyzes
the project and proposes a pattern; the user accepts; Ark (driving an agent for everything)
proposes the full set of changes, builds the plan + roadmap, and progressively improves the
whole project's architecture, using `ark-check` to validate as it goes. Ark **proposes,
adjusts, and then enforces**. A newbie benefits from the whole loop; an advanced user takes
only enforcement + adjustment.

**Arc:** Gate (v1) → Guide (1.11–1.14) → **Co-pilot** (this vision). The reframe: Ark stops
being a tool an expert drives and becomes the thing that drives the agent, with the gate as
the honesty backstop. This does NOT contradict the round-6 stance ("Ark's job ends at
diagnose + provide the pattern; the grind is the team's") — it *productizes* the agent loop
that a human previously ran by hand, and keeps the hard line that judgment-heavy big rocks
are proposed, never auto-applied.

**Decomposition — what exists vs what's needed (build order):**

1. **Analyze + propose (plain language).** EXISTS: `ark-check --recommend` (archetype
   detection + confidence), `/ark-architect`, enthusiast analogies. GAP: a single guided
   entry point so a newcomer never types a skill name; mature-repo routing (just added).
2. **Accept → plan/roadmap.** EXISTS: `ark init --archetype`, `--write-plan` →
   `ark-adoption-plan.json` (phases 1/2/3), `/ark-adopt`. Solid.
3. **Work classification for safe autonomy (KEY ENABLER, was P2 "fix-class hinting").**
   NEEDED: tag every planned change mechanical/auto-applicable (type-only move, file
   relocation, verbatim infra relocation) vs judgment/big-rock. This is the gate deciding
   what an agent may apply automatically. Promoted from opportunistic to core — the whole
   autonomy story hinges on it being trustworthy.
4. **Worktree-safe apply loop.** PARTIAL: round-5 established worktree safety (code-only,
   discardable, no schema/DDL). NEEDED: the loop that applies one step, runs `ark-check`,
   rolls back on failure/regression, and surfaces a diff for approval.
5. **The autopilot orchestration.** NEEDED: an agent-driven skill/workflow reading
   `ark-adoption-plan.json`, driving phases — auto-apply the safe class (validated), present
   judgment items for yes/no, re-run the gate, explain in plain language. Composes 1–4.
6. **Tiered UX.** NEEDED: newbie mode (full autopilot with approvals) vs expert mode
   (manual skills + gate), same contract + gates underneath. Likely a mode flag / detection.
7. **Enforcement handoff.** EXISTS: gates install during init (CI + write-gate + hooks), so
   "and stays that way" is already true once the loop ends. Verify the newbie path leaves
   them installed and active without extra steps.
8. **Honesty in autonomy (principle, not a feature).** Never auto-apply what the gate can't
   validate; never green while auto-skipping; always show auto-done vs proposed vs deferred.

**Sequencing recommendation:** #3 (classification) and #4 (apply loop) are the load-bearing
prerequisites and are independently shippable/testable. #5 (autopilot) and #6 (tiers) sit on
top. #1's guided entry point is cheap and can land early to smooth the newbie funnel. Ship
#3 first — it's the trust boundary everything else depends on and gives immediate value in
`--doctor`/`/ark-fix` even before autonomy exists.

**Risks / guardrails to hold:** don't become a codemod/AST engine (agent edits, Ark
validates); big rocks stay human-approved; code-only, never DB/schema; the classification's
false-"safe" rate is the thing that can sink trust — bias it toward "propose" when unsure.

## What's in 1.11.0 (already committed, unpushed)

The "gate → guide" reorientation. Seven improvements across `bin/*` + skills + tests
(270 tests, typecheck + self-check green):

1. Package-manager-aware emitted commands (Phase 1).
2. `init` proposes layers for ungoverned dirs; `--coverage` honest `Governed: N%` (Phase 2).
3. Violation diagnosis: edge/subtree breakdown, concentration verdict, freeze-guard (Phase 3).
4. Skills reoriented to organize; border principle (Phase 4).
5. Type-only vs value violation tagging.
6. Facade splits order-independent (most-specific pattern wins) + ambiguity warning.
7. Skill enhancements: facade barrel, type-only fix pattern + its non-mechanical cases.

## Priorities

### P0 — blockers before publishing 1.11.0

- **Brownfield validation of the pending build.** `npm pack` the working tree, install the
  tarball into a throwaway worktree of a large pnpm/Next repo (e.g. `ark-test`), re-run
  `/ark-adopt` end to end, confirm the seven improvements behave. All field feedback so far
  ran against published `1.10.x`, which lacks this work — so nothing has actually exercised
  the pending build yet. Low effort, must happen before release.
- **Release mechanics** (only on user go-ahead): version bump ×5 (package.json, lock,
  server.json ×2, version.ts) + CHANGELOG + GitHub release + `Publish npm` workflow. Note:
  the version bump re-stamps the skills' `arkVersion`, so consumers will see "skills
  outdated" and refresh — expected.

### P1 — next release (1.12.0 candidates)

- **Write-gate ↔ CI contract parity** — the top open decision. See below. Medium-high
  effort (touches the compiled kernel), medium risk (write-gate core). High value:
  restores "`ark.config.json` is authoritative" across both gates.
- **Config doctor** — ✅ BUILT (unreleased, 1.13.0 candidate). `ark-check --doctor` folds
  governed %, ungoverned dirs, empty layers, weak rule coverage, the violation summary
  (value/type-only + concentration), installed gates, installed skills, baseline health, and
  stale command runners into one view, each with the exact fix command + a ranked "Top
  actions" list. `--doctor --json` for tooling. The stale-runner check (round 8) is included.
- **Command migration on upgrade** — Phase 1 made *emitted* commands package-manager-aware,
  but `--install-agent-gates` and `/ark-upgrade` preserve existing gate files, so a repo that
  adopted before 1.11.0 keeps stale `npx` in settings.json / .mcp.json / CI; the only refresh
  is `--force`, which clobbers customizations. Add a targeted, non-clobbering rewrite (e.g.
  `--install-agent-gates --migrate-commands`) that updates only the runner in the command
  strings. Small; closes the round-8 gap.

### P2 — opportunistic

- **Fix-class hinting → PROMOTED to co-pilot enabler #3** (see North Star). Cross the
  `typeOnly` tag with an infra-role target to classify mechanical (type move / file
  relocation / verbatim infra relocation) vs judgment/big-rock. No longer opportunistic:
  it's the trust boundary for what an agent may auto-apply. Bias toward "propose" when
  unsure — a false "safe" that auto-lands a bad edit is the failure mode that sinks trust.
- **Gate detection polish** — `--require-gates` should recognize any workflow that runs Ark,
  not only the generated filename. Small.
- **Watch mode** — `ark-check --watch`. Medium.
- **ESLint parity** — keep the plugin aligned with `ark-check`. Ongoing.
- **Brownfield burn-down playbooks + a matching `/ark-fix` fix-class.** Field adoption
  produced a hand-written route→repository migration runbook (verbatim SQL relocation:
  raw `sqlClient`/`db` in a route → a repository method; the route orchestrates, the repo
  does data-access; same SQL bytes = same behavior). This recurs for any brownfield repo
  with a data layer. Ship it generically: (a) an example-gallery playbook (route→repository
  + the facade split), and (b) an `/ark-fix` fix-class — "raw infrastructure access in an
  orchestration/UI layer → relocate it verbatim into a repository/adapter layer" — the
  value-import counterpart to the type-only inversion pattern already in the skill. Low
  effort, high adoption value.

### P3 — later

- Comparative evals (with/without Ark). Example gallery incl. a worked facade split. Docs
  site. Runtime package split. Framework-border policy pack.

## Open decision #1 — write-gate ↔ CI parity

**Symptom (confirmed 3× in amarilla feedback):** the AI write gate (`ark-mcp`,
`AICodeGate`) blocks `FORBIDDEN_IMPORT` on infra path tokens (`repositories`, `db`,
`persistence`, `adapter`, …) even when `ark-check` (CI) allows the edge, because the
config's layer rules don't deny it.

**Root cause:** `createArchitectureProfileFromArkConfig` maps only `intentPrefixes` and
**drops the config's file globs**. So the runtime profile can't resolve an import target
path to a layer → the write gate falls back to the token heuristic → the heuristic ignores
the explicit layer rules. Current suppression (`layerHasInfrastructureRole` on the source
layer name, or `mayImportInfrastructure`) only covers "infra imports infra."

**Note:** in every observed case the block produced the *better* outcome (surfaced
misplaced presentation logic, real domain→infra coupling). So this is not a "the gate is
too aggressive" bug — it's a "the two gates disagree, breaking single-source-of-truth" bug.

**Options:**
- **A — honor the explicit contract (recommended).** Thread file globs into the runtime
  `ArchitectureProfile`; resolve an import target path → layer; let the layer rules decide;
  keep the token heuristic only as a fallback for targets no declared layer governs. Makes
  `ark.config.json` authoritative on both gates. Bigger change (kernel + `dist`), needs
  matching CLI/write-gate resolution semantics (see also: `layerForFile` now most-specific;
  align the profile's file resolution the same way).
- **B — bring the safety-net to CI.** Have `ark-check` apply the same infra path-heuristic
  so both gates block identically. Simpler, but makes the precise glob/rule-based CI fuzzy
  and could surprise configs that intentionally allow an infra edge.

**Sharpened by round 5 (repository migration):** creating a NEW repository that imports
`@/lib/db`, and a route that imports that repository, are both blocked by the write gate —
i.e. it blocks the repository pattern the repo explicitly wants (repos are the adapter to
the DB; routes call repos). The only escape is `mayImportInfrastructure: true`, which is
**per-layer all-or-nothing**: flagging `AppOrchestration` to allow route→repository also
stops the write gate from blocking a raw `App→db` import — only the explicit CI layer rule
(`App→Persistence: false`) still catches it. So the blunt flag trades away write-time
protection to unlock a legitimate edge. This is the strongest case yet for **Option A**:
per-edge, glob-resolved rules would allow `App→DataAccess` and `DataAccess→Persistence`
while still blocking `App→Persistence` — at BOTH gates — with no blunt flag. Under Option A
the `mayImportInfrastructure` flag becomes unnecessary for any repo with declared data
layers.

Recommendation: **A**, scheduled as 1.12.0 after 1.11.0 validates. Decide with Pedro. Until
it lands, adopters with explicit `DataAccess`/`Persistence` layers must set
`mayImportInfrastructure: true` on the layers that legitimately reach infra (and rely on the
CI layer rules for precision) — document this in `/ark-adopt` / `/ark-contract`.

## Discovery log (feedback rounds)

All rounds ran against published `1.10.x`; the pending build automates much of the manual
work below. Full detail in agent memory (`ark-project-state`).

- **Round 1 (pnpm worktree adopt).** npx in emitted configs violated a pnpm-only repo
  (→ Phase 1). `init`/adopt froze 762 and reported green while governing 41% (→ Phases 2/3).
- **Round 2 ("how would you organize it, keeping dcouplr").** The border principle +
  facade split (KernelApi vs KernelInternal); 762 → 45 real once the contract was fixed.
  Validated Phase 3's concentration guard (would have blocked the 762 freeze).
- **Round 3 (apply the 3 phases + burn-down).** Type-only moves dominated the burn-down
  (→ refinement #1). Facade worked only by declaration-order luck (→ refinement #2).
  Write-gate blocked domain→repository/persistence (→ decision #1).
- **Round 4 (resolve the 4 deferred).** Baseline 762 → 340 (−55%), Domain→UI/App cluster
  → 0. "Big rocks" (raw SQL in routes → repositories) confirmed as real refactors, not
  re-exports — restricted-layer territory, per-route with data verification.
- **Round 5 (repository-migration pilot).** Confirmed Ark touches only code, never the
  Supabase schema (no migrations/DDL) — a worktree is fully discardable. Migrating 3 routes
  off raw `sqlClient` to repositories (verbatim SQL relocation) worked cleanly (340 → 337).
  Surfaced the `mayImportInfrastructure` blunt-flag problem (see decision #1): the write gate
  blocks new repository/route writes to infra by default, and the flag is the only escape but
  is per-layer all-or-nothing. Also: UI→data violations (46) are mostly `import type` of
  Drizzle/`$inferSelect` and repo return-types — the type is persistence-owned, so these
  need UI DTOs (real refactor), NOT a cosmetic re-export (a domain re-export is blocked by
  the write gate, as seen with issues). The remaining ~285 App→Persistence are the big-rock
  tail: verbatim relocation is mechanical+safe but the repository-organization choice (focused
  per-route repo vs extend domain repos vs few read-repos per domain) affects all 285 and is
  Pedro's call.

- **Round 6 (repository migration continues, "extend existing domain repos").** Pattern
  generalizes: 6 routes migrated total (verbatim SQL relocation into existing domain repos),
  baseline 340 → 334, tsc + gate green, zero schema changes. Confirms the durable enabler
  (`mayImportInfrastructure` on DataAccess/Persistence/App). Reality of the tail: ~282
  App→Persistence + 46 UI→data left — mechanical but a long grind, with a handful of complex
  routes (10+ queries/transactions, e.g. `budget-accounts`) that are NOT verbatim relocation
  and need per-route judgment. Reinforces P2 (fix-class hinting: show the burn-down's shape —
  mechanical vs judgment vs big-rock). Validates the product stance: Ark's job ends at
  diagnose + provide the pattern; the repetitive grind is the team's (or a codemod/agent
  loop), not Ark's to auto-run.

- **Round 7 (leave a template).** The agent distilled the migration into a route→repository
  runbook committed in the amarilla worktree. That runbook is a reusable brownfield artifact,
  not amarilla-specific — captured as the "brownfield burn-down playbooks + `/ark-fix`
  fix-class" backlog item above. Adoption on amarilla ended at: 762 → 334 violations, gate
  green with `--strict-config`, zero DB/schema changes, 4 commits in the (discardable)
  worktree; the ~282+46 tail left as documented grind for a maintainer.

- **Round 8 (FIRST feedback against the real published 1.11.0 — `/ark-upgrade` 1.10.1→1.11.0
  + `/ark-coverage` on amarilla).** Strong validation in the wild: the scan-cache fix worked
  (typeOnly repopulated on upgrade — the "326→334" recount is that, not new debt); `--coverage`
  showed `Governed: 100%`, the type-only split (50 type-only of the 334), and the concentration
  verdict (App→Persistence 84%, `concentrated:false`); the facade split resolved via
  most-specific globs. All 1.11.0 diagnostics produced the intended output on a 2255-file repo.
  ONE real gap → backlog above: `.claude/settings.json`'s write-gate hook still calls
  `npx ark-mcp` because `/ark-upgrade` preserves existing gate files (only `--skills-only`
  refresh), so pre-1.11.0 adopters keep the stale runner with no clean migration path. Minor,
  not ARK: the consumer hit its own pnpm `minimumReleaseAge` cooling-off on the same-day publish
  (the agent bypassed via `node …/bin/ark-check.mjs`).

- **Round 9 (`/ark-upgrade` 1.11.0→1.12.0 on amarilla).** Validation of 1.12.0 in the wild:
  write-gate parity is backward-compatible (strict check passes clean, 334 suppressed, no new
  violations); `--migrate-commands` left every gate file on `pnpm exec` with customizations
  intact (idempotent — already migrated in round-8 validation). The only friction was NOT
  Ark: the consumer's pnpm `minimumReleaseAge` cooling-off rejected the same-day publish, and
  a loose-mode `pnpm add` left a lockfile that `--frozen-lockfile` (CI) failed; fix is to add
  the version to `minimumReleaseAgeExclude` before installing (now documented in `/ark-upgrade`).
  **Process note:** publishing several versions the same day repeatedly trips consumers'
  cooling-off — once the feedback-driven iteration settles, batch more per release to reduce it.

- **Round 10 (install session on a mature repo, 2026-07-08 — motivated the current branch).**
  A competent agent installed published `1.14.0` into a large pnpm/Next worktree and hit
  avoidable friction, ending with a broken dev server and a false-red gate. Findings, each now
  fixed on `feat/brownfield-install-hardening-and-exclude` (`79e28df`):
  - The `postinstall` banner (pure `console.log`) tripped pnpm's build-script approval gate;
    in a hardened repo (`allowBuilds` + `minimumReleaseAge`) it left `pnpm install` at exit 1,
    which Next 16 runs as a pre-check → **dev server down**. Removed the postinstall entirely.
  - `ark init --archetype event-coordinator` on the 2262-file repo produced 17 `FORBIDDEN_GLOBAL`
    false positives: the hexagonal preset's `src/**/domain/**` wildcard matched `src/kernel/domain`
    (framework DI wiring reading `process.env`) and governed only 6%. The tool's own "100% one
    edge → contract is wrong" diagnostic fired correctly, but the first run was still red+useless.
    Fixed two ways: (a) **layer `exclude`** — presets ship `"exclude":["**/kernel/**"]`, resolved
    in the shared `layerForFile` so both gates agree; (b) **mature-repo routing** — `ark init` and
    `--recommend` now steer ≥150-file repos to `/ark-adopt` instead of a wildcard starter.
  - Minor polish: `ark --help` said "Unknown command"; generated CI set `cache: pnpm` before
    `corepack enable`; `require('ark-runtime-kernel/package.json')` failed (no exports entry).
  Confirms the product stance and the North Star: on a real brownfield repo, no preset/heuristic
  produces a good contract — adoption needs judgment, so route there loudly rather than fake it.
  This session also recorded the **co-pilot vision** (North Star section above).

## Notes

- Feedback repos historically ran `1.10.x`; round 10 is the first against `1.14.0`.
- Work now lands on feature branches (PR flow), not accumulated on `main`. Current unreleased
  work: `feat/brownfield-install-hardening-and-exclude`. Do not release without go-ahead.
