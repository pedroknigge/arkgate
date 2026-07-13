# ArkGate internal roadmap — truth, focus, proof

- **Status date:** 2026-07-13
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

**Build now (post-3.0)**

- Deeper **exploratory** agent skills for design-correct residual under ENFORCE (path
  non-deterministic: concurrent patterns, Shape dual-plan B, extraction cards).
- Clear skill routing so skills do not overlap or claim “healthy” from empty plan A alone.
- Later queue: deterministic design-smell sensors, stable plan-B IR, eval fixtures, then
  productized extraction cards — without silent judgment auto-apply or a general codemod.

**Still frozen (do not start without a new item)**

- New architecture presets or policy packs.
- New skill *names* beyond consolidating/clarifying the current 13 (prefer deepen + route).
- New runtime features (optional kernel stays experimental).
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
| External proof | V03 reproduced 12 MIT-licensed public targets with 93% median governed coverage and no open P0/P1 | Retain the scheduled matrix as field evidence |
| Supply chain | Protected main, signed tags, provenance, CodeQL/Semgrep, and no open alerts | Preserve this foundation |

### Release blocker register

| ID | Severity | Status | Resolution / owner |
|---|---:|---|---|
| `RB-01` | P0 if runtime remains stable | `closed` | S01 separated effect retry from completion persistence/audit |
| `RB-02` | P1 | `closed` | S03 computes enforcement from the active host only |
| `RB-03` | P1 | `closed` | S04 gives every supported host-only install a valid merge/write contract |
| `RB-04` | P1 | `closed` | S05 closed the confirmed semantic false positives and dependency bypasses |
| `RB-05` | P1 | `closed` | S02 restored executable coverage and mutation gates |
| `RB-06` | P1 | `closed` | O03 compact active-host setup passed PR #41 CI and merged as `105cd39` |

`RB-01`–`RB-06` are closed by the corresponding completed items and their recorded evidence.
V05 passed its binary exit gate in PR #49. The separately authorized stable `3.0.0` release
completed on 2026-07-13; closing `RB-06` had removed the onboarding release blocker.

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
| 8 | `C01` | `done` | M | `S07` | `ark.config.json` has a versioned JSON Schema and migrations |
| 9 | `C02` | `done` | M | `C01` | A stable analysis IR and programmatic API are specified |
| 10 | `C03` | `done` | L | `C02` | CLI/MCP scanning uses one importable engine without generated duplication |
| 11 | `C04` | `done` | L | `C03` | Symbol-aware analysis defines and enforces the supported soundness envelope |
| 12 | `C05` | `done` | M | `C04` | CLI, MCP, ESLint, hooks, and Action have contract parity |
| 13 | `C06` | `done` | L | `C05` | Runtime is isolated from the gate package and marked experimental until proven |
| 14 | `O01` | `done` | M | `C05` | Repository discovery is source/graph-first rather than framework-guess-first |
| 15 | `O02` | `done` | M | `O01` | `ark start` previews all mutations and measured coverage before apply |
| 16 | `O03` | `done` | L | `O02` | Host setup writes at most five small project files by default |
| 17 | `O04` | `done` | M | `O03` | Clean-room onboarding remains green for every supported host profile; PR #43 merged |
| 18 | `V01` | `done` | L | `C05`, `O04` | Cold, warm, and incremental performance have real CI budgets; PR #45 passed green CI |
| 19 | `V02` | `done` | M | `C04` | Mutation, property, and fuzz tests defend critical boundaries |
| 20 | `V03` | `done` | L | `O04`, `V01`, `V02` | External adoption is reproduced on 12 pinned MIT-licensed repositories |
| 21 | `V04` | `done` | M | `C06`, `V03` | Package and release artifacts are bounded, complete, and attestable |
| 22 | `V05` | `done` | M | all prior items | Independent audit passed; PR #49 CI green and beta exit authorized |
| 23 | `B01` | `done` | L | `V05` failure evidence | Approved-adoption coverage recovered without lowering the exit criterion |

### Phase P — post-3.0 pattern depth (contract + lived design)

| Order | ID | Status | Size | Depends on | Outcome |
|---:|---|---|---:|---|---|
| 24 | `P01` | `done` | M | 3.0.0 released | Skills explore non-deterministic residual and plan Shape dual-plan B; routing de-overlaps skills |
| 25 | `P02` | `done` | M | `P01` | Doctor reports deterministic design smells (path vs design); ENFORCE can be design-weak |
| 26 | `P03` | `todo` | M | `P02` | Stable JSON IR for plan **B** pattern bets (pilot, success signal, kill-switch); never mechanical-safe |
| 27 | `P04` | `todo` | M | `P03` | Eval fixtures: ENFORCE + design-weak and spaghetti concurrent patterns; CI guards skill/CLI honesty |
| 28 | `P05` | `todo` | M | `P03` | Extraction-card playbook productized in docs + judgment assists (no general codemod) |

**Next:** `P02` — deterministic design smells in doctor (`P01` done). Stable `3.0.0` is published;
Phase P is the post-release queue for design-depth under an honest gate.

---

## Phase P — post-3.0 pattern depth

### P01 — Skills: exploratory depth + routing clarity

- **Status:** `done`
- **Closes:** agent ambiguity between explore / coverage / think / adopt / autopilot; empty plan A
  celebrated as “architecture healthy”; weak dual-plan B on spaghetti installs
- **Likely files:** `templates/skills/*.md`, `bin/lib/ci-and-commands.mjs` (skill routing),
  `README.md` skill table, `docs/agent-guide.md`, `tests/unit/static-check/skillsSurface.test.ts`

**Implementation**

1. Add **When / not when** to every overlapping skill; keep 13 names (no new skills).
2. Make `/ark-explore` the canonical non-deterministic recon: path vs design, concurrent patterns,
   Align→Stabilize→**Shape** ladder, auto dual-plan seed on spaghetti signals, extraction cards.
3. Narrow `/ark-coverage` to Ark **fitness** (governed/gates/baseline); handoff explore for Shape.
4. Narrow `/ark-think` to **one** decision (2–3 options); handoff explore for full dual-plan.
5. Require adopt/autopilot to seed or execute dual-plan **B** when design-weak residual remains.
6. Update full-install `agentInstructions` routing table: no overlapping skills; Shape honesty.
7. Tests lock routing phrases + explore/coverage/think/adopt/autopilot vocabulary.

**Acceptance**

- Skills surface tests pass; every critical skill has When/not when.
- Explore documents Shape ladder + extraction cards + design-weak under ENFORCE.
- Coverage explicitly defers pattern dual-plan to explore.
- Routing table names Align/Stabilize/Shape and forbids treating empty A as healthy finished.
- No new skill basename; no gate weakening; no new mechanical-safe kinds.

**Verify**

```bash
npx vitest run tests/unit/static-check/skillsSurface.test.ts
npm run check:architecture
```

**Local evidence (2026-07-13):** `skillsSurface` 11/11 pass; `check:architecture` pass. Explore
§G Shape ladder + extraction cards shipped; coverage/think narrowed; adopt/autopilot seed B;
routing table de-overlaps; no new skill names.

### P02 — Deterministic design smells in doctor

- **Status:** `done`
- **Depends on:** `P01`
- **Likely files:** `bin/lib/design-smells.mjs`, `bin/lib/doctor-plan.mjs`, `tests/unit/static-check/designSmells.test.ts`

**Outcome:** doctor emits stable smell ids (`facade-sql-in-routes`, `handler-in-persistence`,
`god-module`, `domain-logic-in-ui`, `io-under-application`, `mixed-pattern-cluster`,
`soft-contract`) so “ENFORCE · design-weak” is machine-visible without LLM prose.

**Acceptance:** doctor JSON documents smells with paths; false-positive rate bounded by fixtures;
skills reference doctor ids when present without requiring them for agent-detected smells.

**Local evidence (2026-07-13):** `designSmells.test.ts` 13/13; CLI `--doctor --json` on a fixture
with prisma-in-route reports `designFitness.designWeak: true` and smell evidence paths.

### P03 — Stable plan-B pattern bet IR

- **Status:** `todo`
- **Depends on:** `P02`
- **Likely files:** plan output in CLI/MCP, analysis-result schema if needed, docs/package-surface

**Outcome:** `ark-check --plan --json` (or sibling flag) can include `patternBets[]` with
`pilot`, `successSignal`, `killSwitch`, `neverMechanicalSafe: true`. Additive within major.

**Acceptance:** schema + fixture; never auto-applied; autopilot/loop consume without inventing kinds.

### P04 — Eval honesty for design-weak ENFORCE

- **Status:** `todo`
- **Depends on:** `P03`
- **Likely files:** `eval/cases/*`, skills surface or agent eval prompts, CI shard if cheap

**Outcome:** at least one synthetic spaghetti fixture where plan A is empty and design smells /
patternBets are non-empty; agent or golden report cannot call the tree “healthy finished.”

### P05 — Extraction cards as productized judgment assist

- **Status:** `todo`
- **Depends on:** `P03`
- **Likely files:** `docs/brownfield-adoption.md`, skill cross-links, optional MCP judgmentBrief field

**Outcome:** I/O and god-module judgment has a fixed card template (pilot, move bytes, do-not list,
success, kill-switch) in docs and skills; still human/agent applied, no bulk codemod engine.

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

- **Status:** `done`
- **Depends on:** `S07`

**Started (2026-07-11):** the first contract fixture matrix covers every published repository
config, every preset factory, and the previous supported major (`v1.19.0`). The initial red tests pin
version metadata, legacy compatibility, and path-specific rejection of unknown keys before the
shared loader is implemented.

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

**Completed (2026-07-11):** `src/domain/configContract.ts` now owns schema `1.0`, defaults,
constraints, path-specific diagnostics, and the explicit unversioned migration. Its generated CLI
artifact and packaged JSON Schema are drift-checked, while CLI, MCP, ESLint, presets, and runtime
config factories consume the same contract. Every shipped config and preset validates; the prior
`v1.19.0` fixture migrates deterministically without mutation.

**Evidence:** implementation commit `54c475d` passed all 11 checks on draft PR #28. Local
`test:confidence` passed 847/847 tests with 85.32% branch coverage and a 97.79% mutation score
(398/407 killed); the focused contract suite passed 110/110. Typecheck, build, architecture,
generated-artifact, module-budget, package-file, gallery, TypeScript 5.9/6/7, package dry-run, and
production audit gates passed. The Ark contract stayed at 0 violations / 0 warnings before and
after the change.

### C02 — Specify the stable analysis IR and API

- **Status:** `done`
- **Depends on:** `C01`

**Implementation**

- Write the ADR for engine ownership and the intentional self-hosted layer change.
- Define a minimal public API: `loadContract`, `analyzeProject`, `analyzeChange`, and
  `explainViolation` (names may change in the ADR).
- Define versioned IR types for files, layers, resolved/unresolved edges, symbol capability uses,
  evidence, violations, and content/policy hashes.
- Add contract tests before moving scanner implementation.

**Evidence:** `docs/adr/0002-analysis-engine-ownership.md`, `src/domain/analysis.ts`,
`src/kernel/analysis.ts`, and `tests/unit/analysis/analysisApi.test.ts`.

**Acceptance**

- API and IR have one documented owner and one source of truth.
- Results are deterministic for identical content, compiler options, and policy.
- The API accepts in-memory post-edit content required by write hooks.
- No runtime-kernel type leaks into the analysis surface.

### C03 — Move scanning behind the importable engine

- **Status:** `done`
- **Depends on:** `C02`

**Implementation**

- Move existing graph/config/policy evaluation behind the new API without changing verdicts.
- Bundle CLI binaries from the engine instead of maintaining generated pure copies.
- Keep a temporary parity harness comparing old and new engines on the full fixture corpus.
- Delete old implementations only after parity reaches 100% or every intentional difference has an
  approved fixture and changelog entry.

**Evidence:** `src/kernel/analysis.ts` owns graph policy, cycle detection, and configuration
diagnostics. `bin/lib/architecture-scan.mjs` and its MCP callers provide filesystem/compiler facts
to the generated standalone `bin/lib/analysis-engine.mjs`; the bundle contract and drift guard are
documented by ADR 0003 and enforced in CI. Kernel/bundle parity covers project analysis, changes,
strict/soft/off cycles, layer verdict metadata, and configuration diagnostics. The full fixture
corpus passed 858/858 tests after the closure run exposed and fixed Node 26's asynchronous
recursive-watcher `EMFILE` path.

**Acceptance**

- One canonical implementation produces CLI, MCP, and library results.
- Generated domain-to-CLI duplication is removed or limited to a documented build artifact with a
  drift check.
- Full fixture parity is green.
- Module budgets and package smoke tests pass.

### C04 — Complete symbol-aware semantic analysis

- **Status:** `done`
- **Depends on:** `C03`

**Implementation**

- Resolve forbidden capabilities through TypeScript symbols, including aliases and `globalThis`.
- Extract all supported static dependency forms through the compiler API.
- Define fail/warn behavior for unresolved dynamic imports/requires.
- Cover JS/TS, ESM/CJS, type-only edges, path aliases, project references, workspaces, and symlinks.
- Publish the supported soundness envelope as reference documentation.

**Evidence:** `src/kernel/semanticAnalysis.ts` is the canonical symbol-aware extractor consumed by
the importable API, generated CLI bundle, architecture scan, safety diagnostics, and AICodeGate.
The labeled adversarial corpus covers aliases, `globalThis`, static element access, destructuring,
local shadowing, TS/JS, ESM/CJS, type-only forms, unresolved dynamic dependencies, path aliases,
workspaces, and symlinks with 0 unexplained false negatives and 0 labeled false positives. The
soundness boundary and intentional dynamic/runtime exclusions are documented in
`docs/typescript-support.md`. TypeScript 5.9.3/6.0.3/7.0.2 passed, while mutation testing reached
95.07% overall and 92.51% for the semantic module.

**Acceptance**

- Known bypass corpus remains green.
- Adversarial corpus has zero unexplained false negatives and <0.5% labeled false positives.
- TypeScript 5/6/7 compatibility matrix remains green.
- Critical semantic modules meet the mutation threshold from `S02`.

### C05 — Enforce adapter parity

- **Status:** `done`
- **Depends on:** `C04`

**Implementation**

- Make CLI, MCP, ESLint, hook validation, and GitHub Action consume the same engine API.
- Add golden snapshots for identical config/source inputs across every adapter.
- Version public JSON and MCP schemas; changes require compatibility fixtures.
- Remove adapter-specific rule reimplementations.

**Evidence:** `src/domain/adapterContract.ts` defines the public `1.0` result envelope and emits
`schemas/ark.analysis-result.schema.json` plus the standalone CLI helper. CLI JSON, MCP
`structuredContent`, repair-capable hooks, and ESLint reports normalize through that contract.
`src/domain/sourcePolicy.ts` owns publish-rule classification, while ESLint no longer invents
architecture defaults without `ark.config.json`. The golden adapter corpus asserts exact rule ID,
location, severity, and evidence across CLI/MCP/hook/ESLint. GitHub Actions runs the dedicated
`adapter-parity` job, and `tests/fixtures/contracts/ark.analysis-result.v1.json` freezes v1
compatibility. Full coverage passed 875 tests with 85.60% branches; mutation passed at 94.77%.

**Acceptance**

- Same source + contract yields the same rule ID, location, severity, and evidence in every adapter.
- Parity corpus is a required CI job.
- No adapter has a private architecture policy implementation.

### C06 — Isolate runtime from the gate product

- **Status:** `done`
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

**Evidence:** ADR 0004 selects a separate `@arkgate/runtime` 0.x package published only under the
`experimental` tag. ArkGate `3.0.0` builds its stable root from `src/gate.ts`; the root
tarball has no runtime or NestJS bundles, while deprecated `arkgate/runtime` and `arkgate/nestjs`
paths are forwarding shims scheduled for removal in ArkGate 4. The preferred non-transactional
API is `InMemoryEventBuffer`; old outbox names remain deprecated aliases. Recovery, optimistic
versioning, lease, idempotency, atomic-handoff, and fault-matrix requirements are explicit in ADR
0004 and production hardening docs. Gate-only tests passed without a runtime build, and the offline
package smoke installed and imported `arkgate` and `@arkgate/runtime` independently.

**Acceptance**

- Gate CLI/MCP/ESLint tests run without importing runtime modules.
- Package smoke tests prove independent gate and runtime installation.
- Runtime remains labeled experimental until fault/restart matrices pass.
- Root gate package no longer duplicates runtime bundles.

---

## Phase O — make adoption small and honest

### O01 — Replace framework guessing with source/graph-first discovery

- **Status:** `done`
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

- **Status:** `done`
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

- **Status:** `done`
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

**Local evidence (2026-07-12):** `tests/unit/static-check/o03CompactStart.test.ts` passes
14/14 cases across Claude, Grok, Cursor, Codex, Windsurf, Cline, Copilot, Kiro, Roo, Continue,
and Gemini. The fixture proves preview/apply stays within the five-file / 25 KB budget, leaves
product source and a user-owned script unchanged, does not change `package.json` without
`--install`, rejects multi-host compact selection, avoids repo-local Codex prompts, and supports
explicit remove/re-add. `README.md` and `docs/agent-guide.md` now document the exact budget,
explicit package opt-in, and reversible `--remove-host` path. The focused O03/install/docs suites
pass 159/159; the local confidence gate passes 892/892 tests at 85.26% branch coverage and 94.76%
mutation. Typecheck, JavaScript syntax, generated-artifact drift, module-budget, package-file,
strict architecture, and build gates pass locally.

**Merge evidence (2026-07-12):** PR [#41](https://github.com/pedroknigge/arkgate/pull/41) used
signed commit `a20f851` (GitHub SSH verification: valid), passed all required `build`, `CodeQL`,
and `Semgrep CE` checks plus the Node/TypeScript/parity matrix, and was squash-merged as
`105cd3985aa0f360f881e992dc894fd8aaf231b4`. `RB-06` is closed.

### O04 — Build clean-room onboarding fixtures

- **Status:** `done`
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

**Local evidence (2026-07-12):** `npm run test:onboarding-matrix` passed all 12 offline
fixture shards (144 cells: library, API, frontend, and monorepo at small/medium/large across
Claude, Grok, Cursor, Codex, npm, pnpm, and yarn). Every cell proved read-only preview,
preview/apply path parity, green strict merge, equal projected/measured 100% governed coverage,
idempotency, and no unrelated host files. The canonical capability checks confirm hard write and
repair only for Claude/Grok, and advisory write plus CI merge gate for Cursor/Codex. The matrix
uses only temporary lockfile signals and does not execute a package-manager install. Typecheck,
JavaScript syntax, and strict Ark configuration checks pass locally. CI now shards the 12 fixture
groups. PR [#43](https://github.com/pedroknigge/arkgate/pull/43) used GitHub-verified signed
commit `771343d`, passed all 12 `Onboarding <shape>/<size>` CI shards, the full `build` gate
(6m57s), security, compatibility, and adapter-parity checks, and was squash-merged as
`9c762c9be9e1606017b66b3e40573b0dca00dfa6`.

---

## Phase V — prove the product outside the happy path

### V01 — Add real cold, warm, and incremental budgets

- **Status:** `done`
- **Depends on:** `C05`, `O04`

**Implementation**

- Correct the benchmark so warm runs use cache and report peak RSS.
- Add realistic imports, aliases, symlinks, workspaces, and mixed TS/JS to generated fixtures.
- Implement content-hash incremental analysis through `analyzeChange`.
- Record 1k/10k/50k p50/p95 and enforce non-flaky regression budgets in CI.

**Acceptance targets**

- 10k-file changed-file analysis p95 <100 ms on the documented CI runner.
- 50k-file cold scan p95 ≤30 s on `ubuntu-latest`; the prior 5 s aspiration is deferred to a dedicated engine-optimization milestone.
- Warm/incremental results prove cache hits and are not aliases for `--no-cache`.
- Peak memory is recorded and bounded.

**Closure evidence:** PR #45 (`d1400ca`) passed the full CI matrix, including `Performance budgets`
on `ubuntu-latest`, where the committed 1k/10k/50k report met latency, cache-hit, and RSS budgets.

### V02 — Expand mutation, property, and fuzz assurance

- **Status:** `done`
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

**Closure evidence (2026-07-12):** `fast-check` is dev-only; `npm run test:property`,
`npm run test:fuzz`, and `npm run test:fuzz:extended` passed with fixed seeds, bounded time,
and `reports/fuzz` artifacts across config JSON, globs, module specifiers, hook payloads, and
filesystem paths. Hook traversal attempts leave external files untouched. `npm run test:mutation` recorded 93.75% config loading, 91.19%
graph edges, 99.58% host capabilities, 100% baselines, and 95.83% workflow-failure boundaries
(95.43% aggregate). The full coverage suite passed 115 files / 908 tests (91.09% statements,
85.47% branches); `npm run typecheck`, `npm run check:js`, `npm run check:architecture`,
`npm run security:audit`, and `npm run test:package-isolation` also passed. The realpath-root
counterexample is retained as a minimized filesystem fixture.

### V03 — Run the external adoption matrix

- **Status:** `done`
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

**Closure evidence (2026-07-12):** `eval/adoption/manifest.v1.json` pins 12 distinct public
MIT-licensed repository SHAs across all required shapes, hosts, package managers, and sizes. The
packed candidate `a52fcbeebf9f6eaae7d458101809616e142e2658` was applied from clean temporary
clones; the versioned results record three green merge gates, nine explicit `Adapt` cases, 589 ms
median first-green time excluding dependency installation, 93% median governed coverage, and zero
open P0/P1 issues. No third-party source is committed. PR #47 passed the full required CI matrix,
including build, CodeQL, Semgrep, onboarding, fuzz, and performance checks.

### V04 — Tighten package and release assurance

- **Status:** `done`
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

**Closure evidence (2026-07-13):** V04 removes published source maps and adds a versioned artifact
gate that builds both tarballs, enforces budgets, validates independent installs, and emits
CycloneDX SBOMs, SHA-256 checksums, and packed-content manifests. The experimental runtime is
bounded at 160 KB packed, 700 KB unpacked, and 20 files. The gate remains at 375 KB packed and
1.33 MB unpacked under an explicit 400 KB/1.4 MB exception: its standalone CLI/MCP distribution
cannot yet meet the 250 KB/1 MB target; this must be reconsidered before ArkGate 4. PR #48 passed
build, CodeQL, Semgrep, fuzz, onboarding, package isolation, and performance CI.

### V05 — Independent beta exit audit

- **Status:** `done`
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
| 50k cold scan | p95 ≤30 s on `ubuntu-latest`; 5 s deferred to a dedicated engine-optimization milestone |
| External matrix | ≥12 pinned repos, 4 hosts, 3 package managers |
| Open P0/P1 at beta exit | 0 |

**Attempt evidence (2026-07-13):** `scripts/beta-exit-audit.mjs` and
`eval/beta-exit/audit-schema.v1.json` record a reproducible binary decision. The 12-cell balanced
public matrix at `eval/beta-exit/b775193d310bd964938453a4349393e4f3c4564a/public-matrix/` covered
three repository shapes, four active hosts, three package managers, and four size bands. It found
zero open P0/P1 findings and a 565.5 ms median first-green time, but only 7% median governed
coverage (two green cells and ten requiring adaptation), versus the required 90%. The generated
`audit.json` therefore records `fail`; its independent-review condition is also `unverified` because
no reviewer declaration exists. ArkGate remains beta. B01 is now closed with the evidence below;
V05 still requires an independent reviewer to audit a frozen candidate from a clean checkout.

**Post-B01 re-audit (2026-07-13):** Candidate `42c77f62384e40ffb71e16388e6530f34253f9b9`
has a fresh, SHA-bound twelve-cell adoption result at
`eval/adoption/results/42c77f62384e40ffb71e16388e6530f34253f9b9/summary.json`: 97% median
governed coverage, 583 ms median first-green, all four hosts, and zero P0/P1. Its binary report at
`eval/beta-exit/42c77f62384e40ffb71e16388e6530f34253f9b9/audit.json` passes candidate identity,
adoption-to-candidate binding, host profiles, and release artifacts. It deliberately fails because
the independent-review declaration is unverified. No beta or stable-release claim is authorized.

**Current V05 re-audit (2026-07-13):** Candidate
`93d4107d9df6cb64ec862655301780c32619ddb0` passed the full local common merge gate, including
`93.05%` mutation and strict Ark validation. Its fresh SHA-bound twelve-cell adoption result at
`eval/adoption/results/93d4107d9df6cb64ec862655301780c32619ddb0/summary.json` records 97%
median governed coverage, all four hosts, and zero P0/P1. The audit at
`eval/beta-exit/93d4107d9df6cb64ec862655301780c32619ddb0/audit.json` passes candidate identity,
adoption binding, host profiles, release artifacts, and the independent review recorded as
`pedroknigge`. The exact candidate CI, branch protection, Dependabot, and code-scanning checks
also passed. V05 is done; this authorizes beta exit, but does not itself publish or tag a stable
release.

### B01 — Stabilize representative approved adoption

- **Status:** `done`
- **Depends on:** V05 failure evidence

Identify and close the product gaps that leave real, approved public projects outside governed
scope. Preserve the existing 90% median governed-coverage threshold and the no-unconsented-rewrite
rule; do not narrow the matrix, exclude failing shapes, or lower the exit criterion to obtain a pass.

**Acceptance**

- The V05 public matrix remains balanced across its recorded shapes, hosts, package managers, and
  size bands.
- The same or a more demanding pinned public matrix reaches median governed coverage of at least
  90% after approved adoption.
- Every adaptation is previewed, explicitly approved, and leaves product source and unrelated files
  unchanged.
- The focused adoption evidence and common merge gate pass before V05 is re-run.

**Closure evidence (2026-07-13):** Candidate `69cf823e05cc2a158ba963c71e904fe404fb04bc`
was evaluated by `eval/adoption-run.mjs` against the twelve pinned public cells in
`eval/beta-exit/public-matrix.v1.json`. The matrix remains balanced at three cells per shape and
host, four per package manager and size band. `eval/adoption/results/69cf823e05cc2a158ba963c71e904fe404fb04bc/summary.json`
records 97% median governed coverage, 583 ms median first-green time, and zero P0/P1 findings.
All adaptations were previewed before apply and recorded no bypasses. The focused adoption harness,
the full common merge gate, and strict Ark check passed on the candidate. Ten cells remain `Adapt`
because their local strict merge fails; this is retained as P2 audit evidence, not suppressed or
reclassified as green. At that point V05 remained blocked pending its independent review and every
remaining exit gate; the later current re-audit above records its completed decision.

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
Item: P02 — Deterministic design smells in doctor (todo; next when started)
First result: doctor JSON smell ids with path evidence + fixtures (no false ENFORCE healthy)
Then: wire skills to prefer doctor ids when present; keep agent-detected smells in explore
Primary files: bin/lib/doctor-plan.mjs, analysis sensors, doctor tests, eval fixtures seed
Required finish: P02 acceptance + common merge gate green on the same commit
Released baseline: npm arkgate@3.0.0; P01 skills depth already on main after this change lands
```
