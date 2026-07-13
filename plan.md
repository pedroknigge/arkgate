# ArkGate pending roadmap execution plan

- Prepared: 2026-07-12
- Source of truth: `ROADMAP.md` dated 2026-07-11
- Scope: `O03`, `O04`, `V01`, `V02`, `V03`, `V04`, and `V05`
- Current release constraint: `RB-06` closed with O03; ArkGate remains beta until V05 passes

## 1. Purpose and authority

This document turns the pending roadmap into an implementation-ready sequence. It adds execution
detail, evidence locations, likely files, and verification commands. It does not replace the
roadmap.

When this document and `ROADMAP.md` disagree:

1. The ordered queue, dependencies, status, acceptance criteria, release rules, and stop conditions
   in `ROADMAP.md` win.
2. Update this plan to match the roadmap; do not silently reinterpret the roadmap from here.
3. Mark an item `done` only in accordance with the roadmap workflow and only after CI is green on
   the pushed commit.

## 2. Completed roadmap reconciliation

O03 completed on 2026-07-12. PR #41 passed its required CI using GitHub-verified signed commit
`a20f851` and was squash-merged as `105cd39`.

| Roadmap location | Current text | Operational interpretation | Required correction |
|---|---|---|---|
| Ordered queue | `O03` is `done` | O03 completion is authoritative | Start O04 only when its first implementation slice begins |
| `O03` detail | `O03` is `done` | Detailed status matches the queue | Preserve the linked local and remote evidence |
| `Next` marker | `O04` | Next queued item | Keep until O04 starts |
| Next implementation session | Points to `O04` | Current handoff | Maintain the clean-room matrix scope |

The repository contains O03's compact-start implementation and its acceptance suite at
`tests/unit/static-check/o03CompactStart.test.ts`. Its local and remote evidence is recorded in
`ROADMAP.md`; do not reopen it unless a regression is found.

## 3. Ordered plan of record

The queue is strictly sequential even where an individual dependency is already complete. Only
one item may be `doing`.

| Order | Item | Roadmap state | Dependency gate | Exit result |
|---:|---|---|---|---|
| 1 | `O03` | `done` | `O02` done | Compact single-host setup closed `RB-06` in PR #41 |
| 2 | `O04` | `done` | `O03` done | Clean-room onboarding matrix passed PR #43 CI |
| 3 | `V01` | `done` | `C05` and `O04` done | PR #45 (`d1400ca`) passed real cold, warm, and incremental budgets in CI |
| 4 | `V02` | `done` | `C04` done, plus queue order | Mutation, property, and fuzz boundaries are defended |
| 5 | `V03` | `todo` | `O04`, `V01`, and `V02` done | At least 12 pinned external adoptions are reproduced |
| 6 | `V04` | `todo` | `C06` and `V03` done | Release artifacts are bounded, complete, and attestable |
| 7 | `V05` | `todo` | Every prior item done | Independent binary beta-exit audit passes |

Do not start a later item opportunistically. If a later item exposes a P0/P1 issue, stop the queue
and add a stabilization item as required by the roadmap.

### Phase-closure synchronization rule

Before declaring any roadmap item `done`, update both `ROADMAP.md` and this plan in the same
change: the ordered status table, the item's status and acceptance text, the roadmap `Next` entry,
and the closure evidence (PR/commit and required CI result). A phase cannot be reported as closed
until those entries agree; the closing review must explicitly check this parity.

## 4. Rules shared by every item

### 4.1 Entry gate

An item may start only when all of the following are true:

1. Every roadmap dependency is `done`.
2. No other item is `doing`.
3. The item's status is changed to `doing` in `ROADMAP.md`.
4. The first failing test, benchmark, fixture, or evidence case is identified before behavior is
   changed.
5. The intended change stays inside the product boundary and does not reopen frozen runtime,
   preset, policy-pack, report-polish, control-plane, polyglot, or broad-codemod work.

### 4.2 Implementation discipline

1. Make the smallest change that closes the item.
2. Preserve the canonical host capability model and the shared analysis verdict across adapters.
3. Never lower coverage, mutation, strictness, governed scope, or an evidence budget to get green.
4. Never write product source, unrelated project files, or `package.json` without the consent
   required by the roadmap.
5. Update public documentation and `CHANGELOG.md` when behavior or a stable surface changes.
6. Record before/after evidence with the candidate commit SHA and environment metadata.

### 4.3 Ark architecture boundaries

The contract in `ark.config.json` is authoritative.

| Layer | Relevant planning constraint |
|---|---|
| DomainModel | Pure algorithms only. No `fetch`, `process`, `Date.now`, or `Math.random`. |
| Kernel | Analysis and runtime implementation may depend only on DomainModel. |
| Tooling | `bin/` and `scripts/` may import DomainModel only, never Kernel. |
| FrameworkAdapters | `src/nestjs/` may depend only on Kernel. |

If V01 benchmarks `analyzeChange`, the Tooling script must exercise the public built package in a
throwaway consumer process or use a test-owned worker. It must not add a direct
`scripts/** -> src/kernel/**` import.

Regenerate derived artifacts when their canonical source changes:

```bash
npm run generate:layer-match
npm run generate:cli-pure
npm run generate:analysis-engine
```

Run only the generators relevant to the files changed, then run their drift checks.

### 4.4 Common merge gate

Run the roadmap common merge gate for every implementation item:

```bash
npm run typecheck
npm run test:confidence
npm run check:js
npm run check:layer-match
npm run check:cli-pure
npm run check:module-budgets
npm run check:package-files
npm run check:architecture
npm run build
```

Also run the explicit self-hosted contract check required by this repository:

```bash
npx ark-check --root . --config ark.config.json --strict-config
```

For package-surface or release-artifact changes, also run:

```bash
npm pack --dry-run
npm run test:ts-compat
```

### 4.5 Evidence contract

Machine-readable evidence added by the pending items must use versioned JSON and record, where
applicable:

- ArkGate candidate SHA and version.
- Node, npm, pnpm, or yarn version.
- OS, architecture, CPU model, and available memory.
- Deterministic seed and time budget.
- Fixture ID or external repository URL and pinned SHA.
- Exact command, exit status, duration, and measured result.
- Whether the result is measured, inferred, skipped, or unverified.

Third-party source must remain in temporary clean clones and must never be committed.

### 4.6 Exit gate and handoff

Before an item becomes `done`:

1. Its focused verification passes.
2. Its roadmap acceptance criteria are represented by executable checks or reproducible evidence.
3. The common merge gate passes on the same commit.
4. Required docs, changelog, and `eval/` evidence are updated.
5. CI passes on the pushed commit.
6. `ROADMAP.md` records the evidence, changes the item to `done`, and names the next item without
   changing that next item to `doing` until work actually begins.

## 5. O03 - reduce setup to the active host and five files (completed)

### Outcome

Closed `RB-06`: normal setup selects one active host, writes at most five generated project files
totaling less than 25 KB, copies no per-host skill pack, and changes package metadata only with
explicit consent.

### Current implementation baseline

The current tree already has:

- Preview/apply and setup-budget reporting in `bin/lib/start-preview.mjs`.
- Compact single-host selection in `bin/lib/install-migrate.mjs` and `bin/ark.mjs`.
- Compact host templates and a shared router path.
- Explicit package installation behavior.
- Explicit host removal behavior.
- Budget, idempotency, package formatting, multi-host rejection, and removal tests in
  `tests/unit/static-check/o03CompactStart.test.ts`.

The acceptance suite, full local gate, and PR #41 CI are green. The signed commit was squash-merged
as `105cd39`; this is closure evidence rather than an implementation baseline.

### Work packages

1. Audit the existing compact path against every O03 acceptance criterion and all CLI-selectable
   hosts.
2. Keep the default host choice to one explicit or detected active host; reject ambiguous
   multi-host compact setup before mutation.
3. Ensure the router is backed by packaged/MCP resources and creates no repository-local
   `skills/`, `prompts/`, or `commands/` copies.
4. Keep Codex repository setup free of prompt files that Codex will not load.
5. Enforce the five-file and 25 KB budgets in both preview and apply, with apply refusing an
   over-budget or stale preview.
6. Preserve `package.json` byte-for-byte by default. Under explicit `--install`, preserve its
   indentation, newline style, ordering outside the inserted dependency, and unrelated scripts.
7. Keep re-run idempotency at zero diff.
8. Keep removal conservative: delete only exact Ark-owned compact artifacts, preserve customized
   files, report unresolved decisions, and expose a deterministic restore command.
9. Update onboarding docs and `CHANGELOG.md` to describe compact setup, host selection, package
   opt-in, removal, and the exact budget.
10. Record the final per-host budget and idempotency evidence, then close `RB-06` in the same
    roadmap update that marks O03 done.

### Likely files, only where the audit proves a gap

- `bin/ark.mjs`
- `bin/lib/start-preview.mjs`
- `bin/lib/install-migrate.mjs`
- `bin/lib/ci-and-commands.mjs`
- `bin/lib/hook-templates.mjs`
- `tests/unit/static-check/o03CompactStart.test.ts`
- `tests/unit/static-check/arkCheck.test.ts`
- `README.md`
- `docs/agent-guide.md`
- `CHANGELOG.md`
- `ROADMAP.md`

Budget/router regression should cover every host accepted by `--tools`. Capability claims remain
limited to the canonical Claude, Grok, Cursor, and Codex support matrix.

### Acceptance checklist

- [x] Every selectable single host produces no more than five generated files.
- [x] Every selectable single host produces less than 25 KB.
- [x] Default setup does not change `package.json`, product source, unrelated scripts, or unrelated
      host files.
- [x] No copied per-host skill, prompt, or command directory is generated.
- [x] Preview and apply report and enforce the same byte budget.
- [x] Applying the preview changes exactly the previewed paths and bytes.
- [x] Re-running setup yields a zero diff.
- [x] Host removal and restore are explicit and reversible.
- [x] Customized files are preserved and reported as unresolved, not overwritten or deleted.
- [x] Documentation and changelog match actual behavior.

### Focused verification

```bash
npx vitest run tests/unit/static-check/o03CompactStart.test.ts
npx vitest run tests/unit/static-check/arkCheck.test.ts tests/unit/static-check/fieldHonestyDefaults.test.ts
```

The common merge gate and PR #41 CI passed; O03 is done.

## 6. O04 - build clean-room onboarding fixtures

### Outcome

Prove preview/apply parity, governed coverage, host honesty, strict merge success, and idempotency
across representative repository shapes without network-dependent installation.

### Matrix definition

Create 12 base fixtures:

| Shape | Sizes |
|---|---|
| TypeScript library | small, medium, large |
| API service | small, medium, large |
| Frontend application | small, medium, large |
| Monorepo | small, medium, large |

Run each fixture through:

- Hosts: Claude, Grok, Cursor, Codex.
- Package managers: npm, pnpm, yarn.

The complete contract is 12 fixtures x 4 hosts x 3 package managers = 144 deterministic cells.
Shard the cells in tests or CI if needed, but do not silently reduce the matrix. Package-manager
commands are generated and inspected offline; the harness must not install from the network.

### Work packages

1. Add the 12 minimal fixtures with realistic source roots, imports, aliases, workspaces, and lockfile
   signals appropriate to their shape and size.
2. Build one table-driven harness that creates a clean temporary copy for each matrix cell.
3. Run default preview and assert that the target tree remains byte-identical.
4. Apply the preview and assert exact path/content parity with the preview payload.
5. Run `ark-check --strict-merge` on the applied fixture.
6. Compare reported hard/advisory/CI/repair capability with the canonical host matrix.
7. Compare projected and actual governed coverage. Never report Enforce below 90%.
8. Re-run setup and assert zero diff.
9. Assert that no cell writes integration files for an unrelated host.
10. Emit a versioned machine-readable matrix and a short human report.

### Planned files

- `tests/fixtures/onboarding/<shape>/<size>/...` for the 12 base fixtures.
- `tests/unit/static-check/o04OnboardingMatrix.test.ts` for the table-driven matrix.
- `eval/onboarding/matrix.v1.json` for committed results tied to a candidate SHA.
- `eval/onboarding/README.md` for methodology and human conclusions.
- Existing onboarding implementation files only when a failing matrix cell proves a product gap.
- `package.json` for a focused `test:onboarding-matrix` command if runtime justifies a separate job.
- `.github/workflows/ci.yml` only if sharding is needed to keep the required matrix reliable.

### Acceptance checklist

- [x] All 144 supported cells pass without network installation.
- [x] Every applied fixture has a green strict merge gate.
- [x] Claude and Grok report only their supported hard-write/repair guarantees.
- [x] Cursor and Codex report advisory write plus hard CI, never borrowed hard-hook evidence.
- [x] Previewed mutations exactly equal applied mutations.
- [x] Projected coverage equals measured post-apply coverage.
- [x] No cell reports Enforce below 90% coverage.
- [x] Every second run has a zero diff.
- [x] No cell requires files for an unrelated host.

### Focused verification

Add and run:

```bash
npm run test:onboarding-matrix
```

Then run the common merge gate.

**Local evidence (2026-07-12):** `npm run test:onboarding-matrix` passed all 12 offline shards
and their 144 deterministic cells. `npm run typecheck`, `npm run check:js`, and
`npx ark-check --root . --config ark.config.json --strict-config` also pass. The `onboarding-matrix`
CI job runs the same fixture shards independently. PR #43 passed every shard plus the full build,
security, compatibility, and adapter-parity gates on signed commit `771343d`, then merged as
`9c762c9`; O04 is done.

## 7. V01 - add real cold, warm, and incremental budgets

### Outcome

Replace the advisory scale harness with reproducible performance evidence and non-flaky CI budgets
for cold scans, warm scans with verified cache hits, changed-file analysis, and peak memory.

### Current gap

`scripts/ark-scale-bench.mjs` currently:

- Passes `--no-cache` on every run, including the reported warm run.
- Generates trivial files without realistic dependency resolution.
- Leaves `peakRssBytes` as `null`.
- Defaults to 50 and 200 files instead of the 1k/10k/50k roadmap sizes.
- Does not benchmark one-file `analyzeChange` behavior.

### Closure evidence

PR #45 at `d1400ca` passed the full GitHub Actions matrix. Its `Performance budgets` job on
`ubuntu-latest` passed the committed 1k/10k/50k latency, cache-hit, and RSS gates; the artifact is
tied to the candidate SHA. V01 is done.

### Work packages

1. Freeze a versioned benchmark result schema and runner metadata before changing performance code.
2. Extend the generated fixtures with realistic ESM/CJS imports, type-only edges, aliases,
   symlinks, workspaces, and mixed JS/TS.
3. Separate fixture generation from timed execution.
4. Define cold as a fresh process with no reusable cache state.
5. Define warm as a repeated unchanged scan with cache enabled and assert a non-zero cache-hit
   signal; a timing alone is not proof of a warm path.
6. Define incremental as one changed file in a 10k-file project through public `analyzeChange`,
   preserving content and policy hashes.
7. Collect p50, p95, sample count, failures, cache hits, and child-process peak RSS.
8. Run 1k, 10k, and 50k scenarios on a documented pinned CI image and Node version.
9. Enforce the roadmap latency targets. Establish a hard memory cap from the first reproducible
   baseline plus documented headroom; do not leave memory advisory.
10. Add a required CI performance job and upload the versioned JSON report.

The existing `scripts/ark-scale-bench.mjs` remains the Tooling orchestrator. If a worker is needed
for RSS or the public API, make it a throwaway consumer of the built package; do not import Kernel
source from `scripts/`.

### Planned files

- `scripts/ark-scale-bench.mjs`
- A small test-owned or throwaway consumer worker if required for RSS and `analyzeChange`
- `tests/unit/scripts/arkScaleBench.test.ts`
- `src/kernel/analysis.ts` only if a failing incremental benchmark proves engine work is required
- `bin/lib/architecture-scan.mjs` or `bin/lib/ts-resolve.mjs` only for proven cache telemetry gaps
- Generated `bin/lib/analysis-engine.mjs` when canonical analysis changes
- `eval/performance/budgets.v1.json`
- `eval/performance/README.md`
- `.github/workflows/ci.yml`
- `package.json`

### Budget policy

- 10k-file one-file change: p95 below 100 ms.
- 50k-file cold scan: p95 at or below 30 seconds on `ubuntu-latest`; the prior 5-second aspiration
  is deferred to a dedicated engine-optimization milestone.
- Warm results: verified cache hits and no `--no-cache` aliasing.
- Peak memory: measured and bounded by a committed numeric budget established from reproducible
  baseline evidence.
- Budget increases: require measured evidence and explicit review; never auto-update baselines from
  a failing run.

### Focused verification

Extend `bench:scale` so the release scenario can run as:

```bash
npm run bench:scale -- --sizes 1000,10000,50000 --fail-budget --json
```

Also run focused benchmark contract tests, `npm run check:analysis-engine` when analysis changes,
and the common merge gate.

## 8. V02 - expand mutation, property, and fuzz assurance

### Outcome

Defend critical architecture boundaries against equivalent rewrites, malformed input, path
traversal, crashes, and silent bypasses with deterministic and reproducible tests.

### Work packages

1. Extend Stryker coverage across config loading, graph-edge decisions, host capabilities, baseline
   keys, semantic extraction, and workflow post-effect failure boundaries.
2. Keep every critical mutation group at or above 90%; report per-group scores as well as the
   aggregate.
3. Add deterministic property tests for path normalization, layer matching, and baseline occurrence
   keys.
4. Add bounded fuzz campaigns for JSON config, globs, module specifiers, hook payloads, and
   filesystem paths.
5. Use one dev-only property/fuzz dependency with deterministic seeds and shrinking, preferably
   `fast-check`, unless equivalent existing infrastructure is proven sufficient. It must not enter
   the published runtime dependency graph.
6. Test that filesystem and hook inputs cannot escape their temporary project root.
7. Capture seed, case count, time budget, minimized counterexample, and candidate SHA on failure.
8. Convert every discovered defect into a minimized permanent fixture before fixing it.
9. Add bounded PR and extended scheduled jobs. Neither job may rely on unbounded random execution.

### Planned files

- `stryker.config.mjs`
- `tests/property/pathNormalization.property.test.ts`
- `tests/property/layerMatch.property.test.ts`
- `tests/property/baselineKey.property.test.ts`
- `tests/fuzz/configContract.fuzz.test.ts`
- `tests/fuzz/glob.fuzz.test.ts`
- `tests/fuzz/moduleSpecifier.fuzz.test.ts`
- `tests/fuzz/hookPayload.fuzz.test.ts`
- `tests/fuzz/filesystemPath.fuzz.test.ts`
- `tests/fixtures/fuzz-regressions/<area>/<case>.json`
- `package.json` and `package-lock.json` for test scripts and a dev-only dependency if selected
- `.github/workflows/ci.yml` for bounded PR coverage
- A scheduled workflow only if the extended campaign cannot fit the normal CI budget

Canonical implementation changes must stay in their existing owners:

- Layer matching: `src/domain/layerMatch.ts`, then regenerate its CLI artifact.
- Baseline keys: `src/domain/baselineKey.ts`, then regenerate CLI-pure artifacts.
- Config contract: `src/domain/configContract.ts`, then regenerate schema/CLI-pure artifacts.
- Graph and semantic analysis: `src/kernel/analysis.ts` and `src/kernel/semanticAnalysis.ts`, then
  regenerate the analysis engine.
- Workflow retry boundary: `src/kernel/workflow/Saga.ts`.

### Acceptance checklist

- [x] Every critical mutation group remains at or above 90%.
- [x] Property and fuzz runs are reproducible from a reported seed.
- [x] PR fuzzing has a fixed case/time budget.
- [x] Extended fuzzing has a fixed case/time budget and retained artifacts.
- [x] No crash, traversal escape, or silent bypass remains unresolved.
- [x] Every fixed fuzz defect has a minimized permanent regression fixture.

### Focused verification

Add and run:

```bash
npm run test:mutation
npm run test:property
npm run test:fuzz
```

Run all relevant generated-artifact checks and then the common merge gate.

### Closure evidence (2026-07-12)

- `fast-check` is a development-only dependency; `test:property`, `test:fuzz`, and
  `test:fuzz:extended` use fixed campaign seeds, bounded case/time budgets, shrinking, and JSON
  reports under `reports/fuzz` with candidate SHA metadata. The PR fuzz job now includes JSON
  config, globs, module specifiers, hook payloads, and filesystem paths; hook traversal attempts
  are asserted to leave external files untouched.
- `npm run test:mutation` reports 93.75% config loading, 91.19% graph edges, 99.58% host
  capabilities, 100% baselines, and 95.83% workflow-failure boundaries; aggregate 95.43%.
- The full coverage suite passed 115 files / 908 tests with 91.09% statements and 85.47% branches.
  `npm run typecheck`, `npm run check:js`, `npm run check:architecture`, `npm run security:audit`,
  and `npm run test:package-isolation` passed locally.
- The fuzzer exposed a root realpath comparison counterexample; its minimized `.` input is held in
  `tests/fixtures/fuzz-regressions/filesystem-path/realpath-root.json`, and the test normalizes its
  temporary root before asserting containment.

## 9. V03 - run the external adoption matrix

### Outcome

Produce reproducible field evidence from at least 12 distinct public repositories pinned to exact
commits, with all required shape, host, package-manager, and tree-size dimensions represented.

### Balanced 12-cell design

Select one distinct public repository per row and pin its full commit SHA before running:

| Cell | Product shape | Host | Package manager | Size |
|---:|---|---|---|---|
| 1 | Library | Claude | npm | Small |
| 2 | Library | Grok | pnpm | Medium |
| 3 | Library | Cursor | yarn | Large |
| 4 | API | Codex | npm | Small |
| 5 | API | Claude | pnpm | Medium |
| 6 | API | Grok | yarn | Large |
| 7 | Frontend | Cursor | npm | Small |
| 8 | Frontend | Codex | pnpm | Medium |
| 9 | Frontend | Claude | yarn | Large |
| 10 | Monorepo | Grok | npm | Small |
| 11 | Monorepo | Cursor | pnpm | Medium |
| 12 | Monorepo | Codex | yarn | Large |

This gives each shape three repositories, each host three runs, each package manager four runs,
and each size four runs. Additional runs may be added, but they cannot replace a missing required
dimension.

### Work packages

1. Replace the stale Q4 scaffold in `eval/adoption-matrix.md` with the V03 methodology and link it
   to a machine-readable manifest.
2. Select repositories using documented criteria: active public TypeScript project, reproducible
   install metadata, no repository-specific ArkGate changes, and a license permitting analysis.
3. Store URL, full pinned SHA, shape, host, package manager, size classification, and expected
   install command in the manifest. Never use a floating branch or tag.
4. Pack the local ArkGate candidate once and run each cell from a fresh temporary clone against that
   exact tarball.
5. Keep third-party source out of git. Commit only manifests, metrics, logs with sensitive paths
   removed, and human summaries.
6. Record preview size, files changed, projected and actual governed coverage, install time,
   first-green time excluding dependency installation, false blocks, bypasses, manual decisions,
   and final CI/merge-gate state.
7. Classify each issue as P0/P1/P2/P3 and distinguish product defect, contract decision, repository
   incompatibility, and environment failure.
8. Stop the queue immediately for an open P0/P1 false green or destructive onboarding issue.
9. Publish a versioned JSON result per cell and a summary with medians and dimension coverage.
10. Add a reproducible manual/scheduled workflow tied to the candidate SHA; do not make normal PRs
    depend on live third-party networks.

### Planned files

- `eval/adoption-matrix.md`
- `eval/adoption/manifest.v1.json`
- `eval/adoption/results/<candidate-sha>/<cell-id>.json`
- `eval/adoption/results/<candidate-sha>/summary.json`
- `eval/adoption/results/<candidate-sha>/report.md`
- `eval/adoption-run.mjs`
- `tests/unit/eval/adoptionHarness.test.ts` using local fake remotes/fixtures
- `.github/workflows/adoption-matrix.yml`
- `package.json` for `eval:adoption`

### Acceptance checklist

- [ ] At least 12 distinct public repository SHAs are pinned and reproduced.
- [ ] Four product shapes, four hosts, three package managers, and three sizes are represented.
- [ ] No third-party source is committed.
- [ ] Every result is tied to the ArkGate candidate SHA and exact command environment.
- [ ] No open P0/P1 false green or destructive onboarding issue remains.
- [ ] Median first-green time is below five minutes, excluding dependency installation.
- [ ] Median governed coverage is at least 90%.
- [ ] Cases below 90% remain Adapt and explain the missing coverage.

### Focused verification

Add a local harness test and the external command:

```bash
npm run eval:adoption -- --manifest eval/adoption/manifest.v1.json
```

Then run the common merge gate. Full external results must be reproduced on the candidate SHA.

## 10. V04 - tighten package and release assurance

### Outcome

Make gate and runtime tarballs independently installable, bounded, complete, and attestable while
preserving the experimental runtime boundary selected by ADR 0004.

### Work packages

1. Measure the gate and runtime tarballs from a clean build and inventory duplicate or unnecessary
   files before deleting anything.
2. Enforce the gate target of at most 250 KB packed and 1 MB unpacked unless an evidence-backed
   exception is recorded in the roadmap.
3. Establish and commit a numeric runtime packed/unpacked/file-count budget from the clean baseline
   plus reviewed headroom.
4. Remove only proven duplicate bundles, unnecessary maps/docs, and compatibility files whose
   documented removal version has arrived. Preserve the ArkGate 3 compatibility shims scheduled
   for removal in ArkGate 4.
5. Extend installed-tarball smoke tests to prove that gate-only imports contain no runtime bundle
   and runtime installs independently.
6. Generate CycloneDX SBOMs, SHA-256 checksums, packed-content manifests, and size reports for both
   distributions.
7. Attach those artifacts to the GitHub release and verify npm provenance and the signed annotated
   tag against the exact candidate SHA.
8. Require build, coverage, mutation, adapter parity, adoption smoke, architecture, package smoke,
   CodeQL, Semgrep, and security-audit checks on the release commit.
9. Keep intermediate releases on canary/non-`latest`; permit stable release only after all V04
   checks and the later V05 audit pass.

### Planned files

- `package.json`
- `packages/runtime/package.json`
- `scripts/verify-package-files.mjs`
- `scripts/smoke-package-isolation.mjs`
- `scripts/release-npm.mjs`
- `scripts/verify-release-artifacts.mjs` if the existing checks cannot cleanly own artifact/SBOM
  validation
- `release/package-budgets.v1.json`
- `.github/workflows/ci.yml`
- `.github/workflows/publish-npm.yml`
- Existing security workflows only where a release-SHA requirement is missing
- `docs/package-surface.md`
- `CHANGELOG.md`

### Acceptance checklist

- [ ] Gate package is at most 250 KB packed and 1 MB unpacked, or has an approved exception.
- [ ] Runtime has committed packed, unpacked, and file-count budgets.
- [ ] Gate-only install/import contains no runtime bundle.
- [ ] Runtime installs and imports independently.
- [ ] Clean-checkout dry run and installed-tarball smoke pass.
- [ ] Both packages have SBOM, checksum, content manifest, and size evidence.
- [ ] Signed tag, provenance, package contents, and candidate SHA agree.
- [ ] No open high vulnerability or code-scanning alert exists at release time.
- [ ] Every required release check is green on the exact release commit.

### Focused verification

Add or extend a single artifact check, then run:

```bash
npm run check:package-files
npm run test:package-isolation
npm run check:release-artifacts
npm pack --dry-run
npm run test:ts-compat
```

Then run the common merge gate and the release workflow in dry-run mode.

## 11. V05 - independent beta exit audit

### Outcome

Obtain a binary independent decision from a clean checkout. If any gate fails, ArkGate remains beta
and no compensating score is allowed.

### Entry gate

V05 cannot start until O03, O04, V01, V02, V03, and V04 are all `done` and their evidence is tied
to the candidate SHA. Freeze the candidate SHA before assigning the reviewer.

The reviewer must not have implemented the final slice. Record reviewer identity and independence
declaration in the audit report.

### Audit packet

1. Candidate SHA, signed tag candidate, package versions, and clean-clone instructions.
2. Common merge-gate outputs and links to every dedicated CI job on that SHA.
3. Four-host capability matrix and clean-room onboarding evidence.
4. Known-bypass, adapter-parity, mutation, property, and fuzz evidence.
5. Cold, warm, incremental, and memory evidence with runner metadata.
6. The 12+ pinned external adoption results and summary metrics.
7. Gate/runtime tarballs, content manifests, size reports, SBOMs, checksums, and provenance checks.
8. Documentation and website claim inventory mapped to measured capabilities.
9. Repository hygiene evidence: protected main, latest checks, Dependabot and code-scanning alerts,
   open bot PRs, signed tags, and local alignment with `origin/main`.

### Work packages

1. Add a read-only audit orchestrator that verifies local artifacts and emits explicit pass, fail,
   skipped, and unverified states. It must never convert missing evidence into pass.
2. Run the audit from a fresh clean checkout with released dependencies only.
3. Verify zero open P0/P1 findings.
4. Verify all common and dedicated jobs are green on the exact candidate SHA.
5. Reproduce one representative cell for each host and verify the complete recorded matrix.
6. Verify bypass, mutation, property, fuzz, parity, performance, adoption, and package gates.
7. Check public documentation and website claims against measured capabilities.
8. Check GitHub repository hygiene and security state. If GitHub cannot be reached, mark the audit
   unverified and fail the binary exit gate.
9. Emit only `pass` or `fail` as the final beta-exit decision, with failed conditions listed.
10. If the audit fails, keep beta status and add a stabilization item before any stable release.

### Planned files

- `scripts/beta-exit-audit.mjs`
- `eval/beta-exit/audit-schema.v1.json`
- `eval/beta-exit/<candidate-sha>/audit.json`
- `eval/beta-exit/<candidate-sha>/audit.md`
- `docs/releases/<version>.md`
- `ROADMAP.md` for the final evidence and beta decision
- `CHANGELOG.md` only after the binary decision is known

### Binary exit checklist

- [ ] Zero open P0/P1 findings.
- [ ] Common merge gate and all dedicated jobs are green on the candidate SHA.
- [ ] All four host profiles are verified.
- [ ] Bypass, mutation, property, fuzz, parity, performance, and adoption gates are green.
- [ ] Gate and runtime artifacts, SBOMs, checksums, provenance, and sizes are verified.
- [ ] Current security and dependency alerts are empty.
- [ ] Documentation and website claims match measured capabilities.
- [ ] Public repository is clean, protected, and aligned with the published artifact.
- [ ] Independent reviewer records an unqualified `pass`.

### Focused verification

Add and run the audit from a clean checkout:

```bash
npm run audit:beta-exit -- --candidate <full-sha>
```

No stable release is authorized unless this command, the independent review, and every roadmap
binary exit condition pass on the same candidate.

## 12. Completion map

The pending roadmap is complete only when all of the following are true:

| Gate | Required final state |
|---|---|
| Release blockers | `RB-01` through `RB-06` closed |
| Queue | `S01` through `V05` done in order |
| Semantic bypasses | 0 known unresolved |
| False-positive rate | Below 0.5% on the labeled corpus |
| Critical mutation | At least 90% |
| Host guarantee accuracy | 100% of supported matrix cells |
| Compact setup | At most 5 files and less than 25 KB |
| Unconsented rewrites | 0 |
| Adoption coverage | Median at least 90% |
| Incremental performance | 10k one-file change p95 below 100 ms |
| Cold performance | 50k p95 at or below 30 seconds on `ubuntu-latest`; 5 seconds deferred to a dedicated engine-optimization milestone |
| External proof | At least 12 pinned repositories across every required dimension |
| Beta exit | Independent binary audit passes with 0 open P0/P1 findings |

Until the final row passes, ArkGate remains beta. Stable release remains subject to the V05 binary
exit gate and all applicable release checks.
