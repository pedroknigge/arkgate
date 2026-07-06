# Ark — Internal Roadmap (maintainer)

Tactical, prioritized work queue. Complements the product-facing `ROADMAP.md`.
This is where release sequencing, open decisions, and the discovery log live.

Last updated: 2026-07-06.

## Release train

| Version | Theme | Status | Gate to ship |
|---------|-------|--------|--------------|
| **1.11.0** | Organize, don't false-green | **Code done on `main`, unpushed** (`d62af5f` + `31f5659`) | Brownfield validation + user go-ahead. No code blockers. |
| **1.12.0** | Write-gate ↔ CI contract parity | Not started; needs a design decision | Decision on Option A vs B (below) + kernel change + validation |
| ongoing | Trust hardening | Partial (provenance + trusted publishing done) | Can ride any release |

Decision (user, 2026-07-06): **hold the 1.11.0 minor** until we gather a couple more
real implementation feedback rounds. Do not run the release (bump ×5 + CHANGELOG +
`Publish npm`) until asked.

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
- **Config doctor** — `ark-check --doctor`: one view folding governed %, unclassified,
  empty layers, weak rule coverage, installed gates, installed skills, baseline health.
  Most of the data already exists (coverage + summary + skill-gap detection); this is
  assembly + presentation. Low-medium effort, high UX value.

### P2 — opportunistic

- **Fix-class hinting** — cross the `typeOnly` tag with an infra-role target to flag "likely
  a data-layer migration (big rock)" vs "mechanical (type move / file relocation)." Low
  effort. Low-confidence value: the value/type split + edge size already make big rocks
  obvious. Build only if a real burn-down asks for it.
- **Gate detection polish** — `--require-gates` should recognize any workflow that runs Ark,
  not only the generated filename. Small.
- **Watch mode** — `ark-check --watch`. Medium.
- **ESLint parity** — keep the plugin aligned with `ark-check`. Ongoing.

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

## Notes

- All feedback repos run `1.10.x`. To measure the pending improvements, ship or pack-test.
- Two commits sit on `main` unpushed. Keep accumulating; do not release without go-ahead.
