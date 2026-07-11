# ArkGate internal roadmap — truth, focus, proof

- **Status date:** 2026-07-11
- **Scope:** canonical implementation queue for the ArkGate library repository
- **Rule:** one active item at a time; do not start an item until all dependencies are `done`

This roadmap supersedes the former “Trust 95+” estimate and its active Q-track. Shipped work is
kept in the [historical appendix](#historical-appendix), but it is not evidence that the current
product is release-ready.

---

## Product mandate

ArkGate exists to prevent architecture-invalid TypeScript changes with low friction and
verifiable coverage.

```text
product value = writes observed × semantic precision × enforcement strength × retained adoption
```

The product wedge is the architecture contract, semantic analysis engine, agent adapters, and CI
gate. The optional runtime is not the product and must not determine the package shape.

### Product boundary

**Build now**

- One versioned architecture contract.
- One semantic analysis engine shared by CLI, MCP, ESLint, hooks, and CI.
- Honest host-specific enforcement capabilities.
- Preview-first onboarding with measured governed coverage.
- Reproducible external evidence.

**Freeze until the exit gate is met**

- New architecture presets or policy packs.
- New agent skills beyond consolidating the current set.
- New runtime features.
- New report polish that does not expose required evidence.
- Org control-plane, polyglot support, or broad codemods.

### Hard lines

- No silent auto-apply of judgment-heavy changes.
- No general codemod engine.
- No “Enforce” status when active-host enforcement or governed coverage is incomplete.
- No release claim that cannot be reproduced from a clean checkout.
- No numeric trust score. The final gate is binary.

---

## Audit baseline

These are the starting facts this roadmap must change.

| Area | Baseline | Consequence |
|---|---|---|
| Architecture | Self-hosted strict check passes; 125/125 files governed | Keep the contract and dogfood path |
| Tests | 680 tests passed, but `npm run test:coverage` exited 1 at 84.73% branch coverage vs 85% required | `S02` owns restoring the release gate |
| Mutation testing | Roadmap claimed a mutation ratchet; no mutation runner or configuration exists | Prior Q1 completion claim is withdrawn |
| Write enforcement | Claude/Grok have hard hooks; Cursor/Codex are advisory at write time | Capabilities must be reported per active host |
| Strict onboarding | Codex-only and Cursor-only installs generate CI that fails for a missing PreToolUse hook | `start` can create a broken setup |
| Scanner soundness | Known shadowing false positives and alias/import/require bypasses | Bypass resistance is not yet proven |
| Runtime | Audit failure can retry an already-successful workflow effect | Duplicate external side effects are possible |
| Onboarding | Default setup can generate 71 files/~487 KB; tested brownfield coverage was 0%, 23%, and 33% | Adoption cost is too high and contract fit too low |
| Performance | Cold scan is roughly linear and ~5 s at 50k trivial files; “warm” benchmark also uses `--no-cache` | Incremental latency is unknown |
| Package | ~3.1 MB unpacked; root and runtime bundles overlap; core scanner is not a stable import API | Public surface is inverted |
| External proof | Adoption matrix is a scaffold; comparative eval is mostly curated oracle data | Product claims lack field evidence |
| Supply chain | Protected main, signed tags, provenance, CodeQL/Semgrep, and no open alerts | Preserve this foundation |

### Release blocker register

| ID | Severity | Status | Resolution / owner |
|---|---:|---|---|
| `RB-01` | P0 if runtime remains stable | `closed` | S01 separated effect retry from completion persistence/audit |
| `RB-02` | P1 | `closed` | S03 computes enforcement from the active host only |
| `RB-03` | P1 | `closed` | S04 gives every supported host-only install a valid merge/write contract |
| `RB-04` | P1 | `closed` | S05 closed the confirmed semantic false positives and dependency bypasses |
| `RB-05` | P1 | `closed` | S02 restored executable coverage and mutation gates |
| `RB-06` | P1 | `open` | O03 owns preview-first setup and the five-file default limit |

`RB-01`–`RB-05` are closed by the corresponding completed Phase S items and their recorded
evidence. `RB-06` remains the only blocker in this register; normal stable feature releases remain
gated until `O03` is done.

---

## Operating rules

### Status values

`todo` · `doing` · `blocked` · `done` · `parked`

Only one item may be `doing`. A task may be marked `done` only when its item-specific acceptance
criteria and the common merge gate are green on the same commit.

### Per-item workflow

1. Change the item from `todo` to `doing` in this file.
2. Create or expose a failing test/evidence case before changing behavior.
3. Implement the smallest change that closes the item.
4. Run the item-specific verification, then the common merge gate.
5. Update user-facing docs and `CHANGELOG.md` when behavior or a stable surface changes.
6. Record measured before/after evidence in the PR and, where named, under `eval/`.
7. Change the item to `done` only after CI passes on the pushed commit.

### Common merge gate

Run for every implementation item unless the item is documentation/decision-only:

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

For package-surface changes, also run:

```bash
npm pack --dry-run
npm run test:ts-compat
```

### Stop conditions

Stop the queue and add a new stabilization item before continuing when any of these occurs:

- A new P0/P1 correctness or security issue is confirmed.
- A proposed fix lowers coverage, strictness, or governed scope to become green.
- Two adapters produce different verdicts for the same contract and source.
- Onboarding writes product source or rewrites an unrelated user file without explicit consent.
- A package/release check cannot be reproduced from a clean checkout.

While any `RB-*` blocker is open, allow only canary releases on a non-`latest` dist-tag and emergency
P0/security patches. Do not publish a normal stable feature release until `S01`–`S07` and `O03` are
`done`.

---

## Ordered implementation queue

| Order | ID | Status | Size | Depends on | Outcome |
|---:|---|---|---:|---|---|
| 1 | `S01` | `done` | S | — | Workflow effects are never retried because telemetry failed |
| 2 | `S02` | `done` | M | `S01` | Local confidence gates are green and truthfully named |
| 3 | `S03` | `done` | M | `S02` | Enforcement capabilities are computed per active host |
| 4 | `S04` | `done` | M | `S03` | Every supported host-only install produces a valid CI/write contract |
| 5 | `S05` | `done` | M | `S04` | All confirmed scanner false positives and bypasses are closed |
| 6 | `S06` | `done` | S | `S03`–`S05` | README, docs, doctor, and site use one truthful support matrix |
| 7 | `S07` | `done` | S | `S06` | ArkGate is retained as the canonical product identity |
| 8 | `C01` | `todo` | M | `S07` | `ark.config.json` has a versioned JSON Schema and migrations |
| 9 | `C02` | `todo` | M | `C01` | A stable analysis IR and programmatic API are specified |
| 10 | `C03` | `todo` | L | `C02` | CLI/MCP scanning uses one importable engine without generated duplication |
| 11 | `C04` | `todo` | L | `C03` | Symbol-aware analysis defines and enforces the supported soundness envelope |
| 12 | `C05` | `todo` | M | `C04` | CLI, MCP, ESLint, hooks, and Action have contract parity |
| 13 | `C06` | `todo` | L | `C05` | Runtime is isolated from the gate package and marked experimental until proven |
| 14 | `O01` | `todo` | M | `C05` | Repository discovery is source/graph-first rather than framework-guess-first |
| 15 | `O02` | `todo` | M | `O01` | `ark start` previews all mutations and measured coverage before apply |
| 16 | `O03` | `todo` | L | `O02` | Host setup writes at most five small project files by default |
| 17 | `O04` | `todo` | M | `O03` | Clean-room onboarding remains green for every supported host profile |
| 18 | `V01` | `todo` | L | `C05`, `O04` | Cold, warm, and incremental performance have real CI budgets |
| 19 | `V02` | `todo` | M | `C04` | Mutation, property, and fuzz tests defend critical boundaries |
| 20 | `V03` | `todo` | L | `O04`, `V01`, `V02` | External adoption is reproduced on at least 12 pinned repositories |
| 21 | `V04` | `todo` | M | `C06`, `V03` | Package and release artifacts are small, complete, and attestable |
| 22 | `V05` | `todo` | M | all prior items | Independent audit passes and the product may exit beta |

**Next:** `C01`. Version and validate `ark.config.json` through one shared contract loader.

---

## Phase S — stabilize truth and close P0/P1

### S01 — Make workflow completion audit retry-safe

- **Status:** `done`
- **Closes:** `RB-01`
- **Likely files:** `src/kernel/workflow/Saga.ts`, `tests/unit/workflow/workflowEngine.test.ts`

**Implementation**

1. Add a fault-injection test where `step.execute` succeeds and
   `workflow.step.completed` audit recording fails.
2. Separate the effect retry boundary from persistence and telemetry handling.
3. Persist a completed step once; never append duplicate step names.
4. Define the explicit policy for post-effect persistence/audit failure. An audit failure may fail
   the workflow or become a recorded telemetry failure, but it must never rerun the effect.
5. Add the same regression case for `workflow.completed` audit failure.

**Acceptance**

- The effect counter is exactly `1` under every post-effect audit failure case.
- `completedSteps` contains each completed step at most once.
- Retry tests still prove that an actual `step.execute` failure retries according to policy.
- Runtime docs state the failure semantics and continue to warn that built-in stores are not
  production durability.

**Verify**

```bash
npx vitest run tests/unit/workflow/workflowEngine.test.ts
npm run test:coverage
npm run check:architecture
```

**Not in scope:** recovery leases, durable resume, or outbox redesign. Those belong to `C06`.

**Local evidence (2026-07-11):** 683/683 tests pass; the focused workflow suite has 8/8 tests;
typecheck, build, architecture, JS/parity/module/package gates pass. Global branch coverage improved
from 84.73% to 84.77%; this was the explicit blocker subsequently closed by `S02`.

### S02 — Restore honest regression gates

- **Status:** `done`
- **Closes:** `RB-05`
- **Likely files:** tests for uncovered branches, `vitest.config.ts`, mutation config, CI/release scripts

**Implementation**

1. Add tests until the existing global branch threshold passes. Do not lower or narrow the current
   include set.
2. Run `npm run test:coverage` twice from a clean state and retain both results in the PR.
3. Add a real mutation runner for enforcement-critical modules. Start with write-path detection,
   dependency extraction, forbidden-global detection, baseline keys, and workflow retry logic.
4. Add `test:mutation` and a non-flaky CI gate with an initial critical-module score of at least
   90%.
5. Ensure release scripts invoke the same confidence gate used by CI.

**Acceptance**

- Two consecutive clean coverage runs exit 0 without exclusions added to hide misses.
- `npm run test:mutation` exists, runs real mutants, and meets its documented threshold.
- The release path cannot publish when coverage or mutation gates fail.
- No roadmap or release note claims a test capability that is not executable from `package.json`.

**Verify**

```bash
npm run test:coverage
npm run test:coverage
npm run test:mutation
npm run check:architecture
```

**Local evidence (2026-07-11):** the final `npm run test:confidence` exits 0 with 698/698 tests,
85.22% branch coverage, and 92.45% mutation score (265 real mutants: 245 killed, 20 survived,
0 no-coverage/errors/timeouts). A second clean coverage run also exits 0 at 85.22%; no coverage
threshold, include, or exclusion was weakened. CI, the local/OIDC release script, and the token
publish path all invoke `test:confidence` before publish, guarded by
`tests/unit/scripts/confidence-gates.test.ts`. Typecheck, build, architecture, JS/parity,
module-budget, package-files, and production security-audit gates pass.

### S03 — Model write enforcement per active host

- **Status:** `done`
- **Closes:** `RB-02`
- **Likely files:** `bin/lib/write-path-detect.mjs`, `bin/lib/doctor-plan.mjs`,
`bin/lib/mcp-adoption.mjs`, host detection modules, write-path tests

**Implementation**

1. Introduce a canonical host capability model with at least:
   `hard-write`, `advisory-write`, `merge-gate`, `repair-payload`, and evidence paths.
2. Make capability detection accept an explicit host. Use active-host detection only as a default.
3. Never infer Codex/Cursor hard enforcement from Claude/Grok hook files.
4. Preserve a repo-wide inventory separately from the active-host verdict.
5. Add stable JSON snapshots for Claude, Grok, Cursor, Codex, unknown, and mixed-host repos.

**Acceptance**

- `ARK_ACTIVE_HOST=codex ... --doctor --json` cannot report `hard-write` or `repair` because a
  Grok/Claude hook exists.
- Unknown host is conservative and does not merge incompatible capabilities.
- Human doctor output names the active host and distinguishes advisory write checks from hard
  merge enforcement.
- Existing Claude and Grok hard-hook behavior remains green.

**Verify**

```bash
npx vitest run tests/unit/static-check/writePathDetect.test.ts
npx vitest run tests/unit/static-check/installFieldFixes.test.ts
npm run test:coverage
```

**Local evidence (2026-07-11):** active-host and repo-inventory verdicts are separated for
Claude, Grok, Cursor, Codex, unknown, and mixed fixtures; doctor JSON with
`ARK_ACTIVE_HOST=codex` keeps Grok hard-hook/repair evidence in inventory only, while human output
labels advisory MCP and the hard CI merge gate independently. The full suite passes 705/705 tests
at 85.24% branch coverage; focused write-path coverage is 100% for both the canonical capability
model and compatibility projection. Mutation passes at 98.04% overall
(`write-path-capabilities` 99.23%, `write-path-detect` 100%). Typecheck, build, JavaScript syntax,
architecture, generated-parity, module-budget, package-files, and production security-audit gates
pass (0 vulnerabilities).

### S04 — Make strict and onboarding compatible with each host

- **Status:** `done`
- **Closes:** `RB-03`
- **Likely files:** `bin/ark-check.mjs`, `bin/ark.mjs`, gate/workflow templates, onboarding tests

**Implementation**

1. Separate merge-gate strictness from hard-write-hook strictness. Use explicit profiles or flags;
   do not make a CI process depend on a hook from an unrelated editor/agent.
2. Generate CI for the merge-gate profile.
3. Validate write-hook requirements with an explicit host profile.
4. Add isolated install fixtures for Claude-only, Grok-only, Cursor-only, Codex-only, and mixed
   installs.
5. Make `start` fail before writing files if the requested host/profile combination cannot satisfy
   the requested guarantee.

**Acceptance**

- Every host-only generated CI workflow runs green on its fresh fixture.
- Claude/Grok fixtures prove hard-write enforcement; Cursor/Codex fixtures state advisory write +
  hard CI without pretending otherwise.
- Re-running install is idempotent.
- No suggested fix tells a Codex-only user to install an unrelated host merely to satisfy CI.

**Verify**

```bash
npx vitest run tests/unit/static-check/arkCheck.test.ts
npx vitest run tests/unit/static-check/fieldHonestyDefaults.test.ts
npm run test:coverage
```

**Local evidence (2026-07-11):** generated CI uses the host-agnostic `--strict-merge` profile
(`--strict` remains an alias), and `--require-write-hook <host>` validates only the named host.
Fresh Claude-only, Grok-only, Cursor-only, Codex-only, and mixed fixtures prove their generated
merge command exits 0; Claude/Grok expose hard-write + repair, while Cursor/Codex expose advisory
write + hard CI with host-local fix guidance. Every host install is byte-for-byte idempotent.
`ark start` rejects advisory-only, tool-mismatched, and preserved-incompatible hard-hook requests
before writing, while a supported Claude request completes and verifies. The full suite passes
719/719 tests at 85.20% branch coverage; enforcement-profile focused coverage and mutation are
100%, with the full mutation gate at 98.42%. Typecheck, build, JavaScript syntax, architecture,
generated-parity, module-budget, package-files, and production security-audit gates pass
(0 vulnerabilities).

### S05 — Close the confirmed scanner bypass corpus

- **Status:** `done`
- **Closes:** `RB-04`
- **Likely files:** `bin/ark-shared.mjs`, dependency/safety scanners, `AICodeGate.ts`, new adversarial tests

**Required corpus**

- Local parameter named `fetch` is not treated as the ambient global.
- Local object named `Date` is not treated as the ambient global.
- Aliasing the ambient `fetch` remains a violation.
- `globalThis.Date.now()` remains a violation.
- `import x = require('...')` produces a dependency edge.
- Non-literal `require(expr)` produces an unresolved dynamic-dependency diagnostic under strict.
- Workspace package imports continue to resolve and enforce correctly.

**Implementation**

1. Commit the corpus as failing tests before changing detection.
2. Close every confirmed case in all currently shipped scanner surfaces.
3. Document the remaining soundness envelope: supported syntax, unresolved dynamic behavior, and
   strict-mode policy.
4. Do not add regex-only special cases when symbol/AST evidence is available.

**Acceptance**

- Required corpus is green with zero expected-failure annotations.
- CLI and in-memory validation agree on each case.
- No existing package/workspace resolution regression.

**Verify**

```bash
npx vitest run tests/unit/static-check
npx vitest run tests/unit/ai-gate
npm run eval:corpus
npm run test:coverage
```

**Local evidence (2026-07-11):** the adversarial corpus was committed red first (`3419b2f`),
then closed without expected-failure annotations across ark-check, AICodeGate, and ESLint.
Single-file TypeScript symbols distinguish local bindings from ambient references; static AST
paths cover `globalThis`, import-equals, literal import attributes, and direct dynamic
import/require policy. Workspace-package enforcement remains green and scan cache v7 prevents old
verdict reuse. Static-check passes 454/454 tests, AICodeGate 26/26, ESLint 15/15, and the eval
corpus 18/18 cases. The final confidence gate passes 732/732 tests at 85.16% branch coverage and
97.49% mutation with no uncovered mutants. TypeScript 5.9/6.0/7.0 compatibility, typecheck, build,
JavaScript syntax, architecture, generated parity, module budgets, package allowlist/dry-run, and
production security audit all pass (0 vulnerabilities).

### S06 — Publish one truthful support matrix

- **Status:** `done`
- **Closes:** unsupported product claims
- **Likely files:** `README.md`, `docs/ai-gates.md`, `docs/agent-guide.md`, templates, release docs,
website source if maintained in this repository

**Implementation**

1. Define one canonical host matrix sourced from the capability model.
2. Replace “every write” and “full hooks” claims with exact hard/advisory/CI guarantees.
3. Make README, generated agent instructions, doctor, and website copy agree.
4. Mark runtime experimental and remove production implication until `C06` and `V05` pass.
5. Add a docs regression test or snapshot for the host matrix and key claims.

**Acceptance**

- No repository search finds a stronger claim than the canonical matrix permits.
- A user can tell, before install, what is blocked at write time and what is blocked only in CI.
- Release notes identify the guarantee change explicitly.

**Verify**

```bash
rg -n "every write|full MCP/hooks|PreToolUse|hard write|advisory" README.md docs templates
npm run test:run
npm run check:architecture
```

**Local evidence (2026-07-11):** `bin/lib/host-support-matrix.mjs` is the single static support
source for Claude, Grok, Cursor, and Codex. It renders the only public guarantee matrix in README
and the generated `AGENTS.md`; detailed guides link to it, while doctor reports both the supported
profile and repository-specific evidence. Hard hook operations, advisory MCP calls, CI checks,
external required-status merge blocking, and repair re-injection are stated separately. No website
source is maintained in this repository. Runtime/Nest docs and the shipped `/ark-runtime` skill now
label that surface experimental and unnecessary for gate adoption. The docs regression passes with
the full 736/736-test suite; coverage is 92.59% statements/lines, 85.22% branches, and 95.28%
functions. Typecheck, build, JavaScript syntax, architecture, generated parity, module budgets,
package allowlist/dry-run, and the production security audit pass (0 vulnerabilities).

### S07 — Decide the product name before stabilizing new APIs

- **Status:** `done`
- **Decision input:** direct category/name collision with `archgate/cli`

**Implementation**

1. Run package, repository, domain, search, and basic trademark availability checks for 3–5 names.
2. Write an ADR that compares: retain ArkGate with explicit differentiation vs rename before wider
   adoption.
3. Record migration cost for npm package, bins, config filename, skills, website, and GitHub.
4. Choose one outcome. Do not leave the ADR undecided.
5. If rename wins, add a migration sub-plan before `C01`; keep a deprecated compatibility shim for
   at least one major version.

**Acceptance**

- The ADR has an owner, decision date, evidence links, and a final decision.
- New schema/API names in Phase C use the decided identity.
- If the name is retained, positioning explicitly distinguishes the product from Archgate.

**Verify:** documentation review plus package/domain availability evidence. No release is required.

**Decision (2026-07-11):** retain **ArkGate** as the canonical product and `arkgate` as the npm
package. [ADR 0001](docs/adr/0001-product-identity-arkgate.md) records the owner decision, migration
cost, canonical surface table, existing package/repository/site evidence, and the explicit
positioning boundary from the unrelated Archgate CLI. The unpublished local rename experiment was
reversed without changing GitHub, npm, or `arkgate.online`. Phase C therefore continues with
`ark.config.json`, `Ark*` APIs, `ARK_*` environment variables, `ark://` MCP resources, and the
existing command/skill names.

---

## Phase C — create one product core

### C01 — Version and validate `ark.config.json`

- **Status:** `todo`
- **Depends on:** `S07`

**Implementation**

- Add a packaged JSON Schema with `$schema`, `schemaVersion`, defaults, constraints, and unknown-key
  policy.
- Validate configs through one loader used by every surface.
- Add explicit migrations and compatibility tests for all published config examples/presets.
- Export the schema through a stable package subpath and document editor integration.

**Acceptance**

- Every shipped preset and repository config validates against the schema.
- Invalid/unknown fields fail with a path-specific diagnostic.
- A config written by the previous supported major either loads unchanged or receives a deterministic
  migration.
- CLI, MCP, and ESLint cannot parse config differently.

**Verify:** config fixture suite, public JSON snapshots, `npm pack --dry-run`, common merge gate.

### C02 — Specify the stable analysis IR and API

- **Status:** `todo`
- **Depends on:** `C01`

**Implementation**

- Write the ADR for engine ownership and the intentional self-hosted layer change.
- Define a minimal public API: `loadContract`, `analyzeProject`, `analyzeChange`, and
  `explainViolation` (names may change in the ADR).
- Define versioned IR types for files, layers, resolved/unresolved edges, symbol capability uses,
  evidence, violations, and content/policy hashes.
- Add contract tests before moving scanner implementation.

**Acceptance**

- API and IR have one documented owner and one source of truth.
- Results are deterministic for identical content, compiler options, and policy.
- The API accepts in-memory post-edit content required by write hooks.
- No runtime-kernel type leaks into the analysis surface.

### C03 — Move scanning behind the importable engine

- **Status:** `todo`
- **Depends on:** `C02`

**Implementation**

- Move existing graph/config/policy evaluation behind the new API without changing verdicts.
- Bundle CLI binaries from the engine instead of maintaining generated pure copies.
- Keep a temporary parity harness comparing old and new engines on the full fixture corpus.
- Delete old implementations only after parity reaches 100% or every intentional difference has an
  approved fixture and changelog entry.

**Acceptance**

- One canonical implementation produces CLI, MCP, and library results.
- Generated domain-to-CLI duplication is removed or limited to a documented build artifact with a
  drift check.
- Full fixture parity is green.
- Module budgets and package smoke tests pass.

### C04 — Complete symbol-aware semantic analysis

- **Status:** `todo`
- **Depends on:** `C03`

**Implementation**

- Resolve forbidden capabilities through TypeScript symbols, including aliases and `globalThis`.
- Extract all supported static dependency forms through the compiler API.
- Define fail/warn behavior for unresolved dynamic imports/requires.
- Cover JS/TS, ESM/CJS, type-only edges, path aliases, project references, workspaces, and symlinks.
- Publish the supported soundness envelope as reference documentation.

**Acceptance**

- Known bypass corpus remains green.
- Adversarial corpus has zero unexplained false negatives and <0.5% labeled false positives.
- TypeScript 5/6/7 compatibility matrix remains green.
- Critical semantic modules meet the mutation threshold from `S02`.

### C05 — Enforce adapter parity

- **Status:** `todo`
- **Depends on:** `C04`

**Implementation**

- Make CLI, MCP, ESLint, hook validation, and GitHub Action consume the same engine API.
- Add golden snapshots for identical config/source inputs across every adapter.
- Version public JSON and MCP schemas; changes require compatibility fixtures.
- Remove adapter-specific rule reimplementations.

**Acceptance**

- Same source + contract yields the same rule ID, location, severity, and evidence in every adapter.
- Parity corpus is a required CI job.
- No adapter has a private architecture policy implementation.

### C06 — Isolate runtime from the gate product

- **Status:** `todo`
- **Depends on:** `C05`

**Implementation**

- Move runtime/NestJS exports to a separate package or explicitly experimental distribution chosen
  by ADR.
- Remove runtime exports from the gate root in the next major; provide a timed compatibility shim.
- Rename the current “outbox” unless it gains an atomic state+message transaction contract,
  dispatcher leases, and idempotent delivery semantics.
- Define workflow recovery, optimistic versioning, leases, and idempotency before any production
  durability claim.
- Ensure gate-only consumers do not install or bundle runtime code.

**Acceptance**

- Gate CLI/MCP/ESLint tests run without importing runtime modules.
- Package smoke tests prove independent gate and runtime installation.
- Runtime remains labeled experimental until fault/restart matrices pass.
- Root gate package no longer duplicates runtime bundles.

---

## Phase O — make adoption small and honest

### O01 — Replace framework guessing with source/graph-first discovery

- **Status:** `todo`
- **Depends on:** `C05`

**Implementation**

- Discover roots from tsconfig/jsconfig, project references, exports, entrypoints, workspaces, and
  conventional `src`/`source` directories.
- Separate production/peer dependencies from dev-only tooling signals.
- Treat library, application, docs, examples, and test packages separately.
- Use actual package/import boundaries before archetype labels.
- Cap confidence and require user confirmation when two recommendations are close or governed
  coverage is projected below 90%.

**Acceptance**

- Ky-like libraries are not classified as API servers because Express is a dev dependency.
- `source/` and workspace package roots are included.
- Zod-like docs packages cannot make the root library a CRUD product.
- Recommendation JSON explains positive and negative evidence without inverted wording.

### O02 — Make `ark start` preview-first

- **Status:** `todo`
- **Depends on:** `O01`
- **Partially closes:** `RB-06`

**Implementation**

- Split start into analyze/plan and apply phases.
- Preview exact file creations/edits, projected governed coverage, host guarantees, package changes,
  and unresolved decisions.
- Require explicit `--apply` or interactive confirmation for mutation.
- Exit non-zero without mutation when the requested guarantee cannot be met.
- Keep preview output machine-readable and deterministic.

**Acceptance**

- Default non-interactive execution is read-only unless `--apply` is passed.
- A low-coverage or incompatible plan writes nothing.
- The preview is sufficient to review the complete diff before apply.
- Applying an approved plan produces exactly the previewed mutations.

### O03 — Reduce setup to the active host and five files

- **Status:** `todo`
- **Depends on:** `O02`
- **Closes:** `RB-06`

**Implementation**

- Install only the selected/active host by default.
- Replace 13 copied skills per host with one router backed by package/MCP resources.
- Generate at most five project files and less than 25 KB for a normal single-host setup.
- Do not change `package.json` unless `--install` is explicit; preserve original formatting when a
  change is requested.
- Never write repo-local Codex prompts that Codex will not load.

**Acceptance**

- Single-host fixture meets the file/byte budget.
- Default setup does not modify product source or unrelated package scripts.
- Re-run is idempotent with a zero diff.
- Host removal/update has an explicit, reversible path.

### O04 — Build clean-room onboarding fixtures

- **Status:** `todo`
- **Depends on:** `O03`

**Implementation**

- Add small/medium/large fixtures for library, API, frontend, and monorepo shapes.
- Run each through Claude, Grok, Cursor, and Codex host profiles.
- Test npm, pnpm, and yarn workflow generation without network-dependent installs.
- Assert preview/apply parity, governed coverage, strict CI result, and idempotency.

**Acceptance**

- Every supported matrix cell produces a green merge gate.
- Hard/advisory write capability matches the canonical host matrix.
- No fixture reports Enforce below 90% governed coverage.
- No host setup requires files for an unrelated host.

---

## Phase V — prove the product outside the happy path

### V01 — Add real cold, warm, and incremental budgets

- **Status:** `todo`
- **Depends on:** `C05`, `O04`

**Implementation**

- Correct the benchmark so warm runs use cache and report peak RSS.
- Add realistic imports, aliases, symlinks, workspaces, and mixed TS/JS to generated fixtures.
- Implement content-hash incremental analysis through `analyzeChange`.
- Record 1k/10k/50k p50/p95 and enforce non-flaky regression budgets in CI.

**Acceptance targets**

- 10k-file changed-file analysis p95 <100 ms on the documented CI runner.
- 50k-file cold scan p95 ≤5 s or an approved hardware-normalized equivalent.
- Warm/incremental results prove cache hits and are not aliases for `--no-cache`.
- Peak memory is recorded and bounded.

### V02 — Expand mutation, property, and fuzz assurance

- **Status:** `todo`
- **Depends on:** `C04`

**Implementation**

- Extend mutation testing across config loading, graph edges, host capabilities, baselines, and
  workflow failure boundaries.
- Add property tests for path normalization, layer matching, and baseline occurrence keys.
- Add bounded fuzzers for JSON config, globs, module specifiers, hook payloads, and filesystem paths.
- Store every discovered regression as a minimized permanent fixture.

**Acceptance**

- Critical mutation score remains ≥90%.
- Fuzz jobs have deterministic seeds, time budgets, and artifact capture.
- No crash, traversal escape, or silent bypass remains unresolved.

### V03 — Run the external adoption matrix

- **Status:** `todo`
- **Depends on:** `O04`, `V01`, `V02`

**Implementation**

- Pin at least 12 public repository SHAs across four product shapes, four agent hosts, three package
  managers, and small/medium/large trees.
- Run from clean clones using a reproducible harness. Do not commit third-party source.
- Record preview size, files changed, projected/actual governed coverage, install time, first-green
  time, false blocks, bypasses, manual decisions, and final CI state.
- Publish machine-readable results plus a short human report.

**Acceptance**

- All required matrix dimensions are represented.
- No open P0/P1 false green or destructive onboarding issue.
- Median time to a valid merge gate is <5 minutes excluding dependency installation.
- Median governed coverage after approved apply is ≥90%; lower cases remain Adapt and are explained.

### V04 — Tighten package and release assurance

- **Status:** `todo`
- **Depends on:** `C06`, `V03`

**Implementation**

- Set package size/file budgets for the gate and runtime distributions.
- Remove duplicated bundles, unnecessary maps/docs, and stale compatibility files.
- Generate an SBOM release asset and verify checksums, provenance, signed tags, and packed contents.
- Require build, coverage, mutation, parity, adoption smoke, CodeQL, and Semgrep checks on the release
  commit.
- Use weekly/biweekly stable releases; use canary tags for intermediate slices.

**Acceptance targets**

- Gate package packed size ≤250 KB and unpacked size ≤1 MB, unless an evidence-backed exception is
  documented.
- Runtime is absent from gate-only smoke imports and bundles.
- Release dry-run and installed-tarball smoke tests pass from a clean checkout.
- No open high vulnerability/code-scanning alert at release time.

### V05 — Independent beta exit audit

- **Status:** `todo`
- **Depends on:** every prior item

Run the audit from a clean checkout by a reviewer who did not implement the final slice.

**Binary exit gate**

- Zero open P0/P1 findings.
- Common merge gate and all dedicated CI jobs green on the exact candidate SHA.
- Active-host capability matrix verified on all four hosts.
- Known bypass, mutation, fuzz, parity, performance, and external adoption gates green.
- Package artifacts verified and current security alerts empty.
- Documentation and website claims match measured capabilities.
- Public repository is clean, protected, and aligned with the published artifact.

If any condition fails, the product stays beta. Do not convert the result into a compensating score.

---

## Success metrics

| Dimension | Exit target |
|---|---:|
| Known semantic bypasses | 0 |
| Labeled false-positive rate | <0.5% |
| Critical mutation score | ≥90% |
| Host guarantee accuracy | 100% of matrix cells |
| Single-host setup | ≤5 files and <25 KB |
| Unconsented package/source rewrites | 0 |
| Governed coverage after approved adoption | median ≥90% |
| 10k changed-file latency | p95 <100 ms |
| 50k cold scan | p95 ≤5 s on documented runner |
| External matrix | ≥12 pinned repos, 4 hosts, 3 package managers |
| Open P0/P1 at beta exit | 0 |

---

## Historical appendix

The following capabilities were shipped before this roadmap reset. They remain supported unless a
task above explicitly migrates or deprecates them, but historical completion is not a substitute for
the new exit evidence.

### Shipped product foundation

- Machine-readable layers/rules contract, manifest, strict CI check, coverage, baselines, and
  concentration guards.
- Plan, fix classification, conservative autoPatch, `ark_prepare_write`, hook repair payloads, and
  doctor write-path reporting.
- Claude, Cursor, Codex, and Grok templates; hard hooks currently exist only where the host supports
  them.
- Hexagonal, layered, feature-sliced, monorepo, UI-surface, vertical-slice, DDD, clean, and onion
  presets.
- TypeScript 5/6/7 compatibility work, ESLint adapter, HTML reports, day-zero origin, skills, and
  migration from `ark-runtime-kernel`.
- Signed annotated release tags, npm provenance, checksums, pinned actions, CodeQL, Semgrep, and
  package allowlist checks.

### Completed historical tracks

- `W1`–`W6`: constrained write, prepare-write, loop-cost harness, repair payload, doctor awareness,
  and proof-gated port suggestion.
- `R1`–`R10`: pure helper sources/generation, module decomposition, baseline/remediation surfaces,
  Codex multi-project handling, runtime decomposition/honesty, and product site.
- Track P: architecture preset and peer-isolation work.

### Canonical product identity

| Surface | Current value |
|---|---|
| Product | ArkGate |
| npm | `arkgate` |
| Preferred bins | `arkgate`, `arkgate-check`, `arkgate-mcp` |
| Compatibility bins | `ark`, `ark-check`, `ark-mcp` |
| Config | `ark.config.json` |
| Website | [arkgate.online](https://www.arkgate.online/) |
| Repository | [pedroknigge/arkgate](https://github.com/pedroknigge/arkgate) |

S07 retains this identity. Any future proposal to rename it requires a new ADR and must not be
folded into Phase C implementation work.

---

## Next implementation session

```text
Item: C01 — Version and validate ark.config.json
First result: add failing schema/loader fixtures for every shipped config and prior supported version
Then: implement one versioned schema, deterministic migrations, and one loader shared by all adapters
Primary files: config loader, packaged schema, CLI/MCP/ESLint adapters, config fixtures
Required finish: presets/examples validate + invalid paths fail precisely + common/package gates green
```
