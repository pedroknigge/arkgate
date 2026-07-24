# Changelog

All notable changes to ArkGate (`arkgate`; formerly `ark-runtime-kernel`) are documented here or
in the immutable pre-2.0 archive linked below.

## Unreleased

### Fixed

- **Stale global CLI vs project `arkgate` (upgrade footgun):** `ark upgrade` /
  `ark update` now **fail closed** when the running CLI package root is outside
  the project's `node_modules/arkgate` **and** the running version is older than
  the installed project package. Message points at
  `npx arkgate upgrade …` / `node node_modules/arkgate/bin/ark.mjs upgrade …`.
  Does not block project-local CLI, newer globals, or projects with no local
  install yet. Field context: global Homebrew **2.x** mutative upgrade next to
  3.8+/4.0 projects (see [4.0.0 release notes](docs/releases/4.0.0.md#field-footgun--global-arkgate-2x-on-path)).
- **`/ark-upgrade` skill:** procedure step 1 resolves the **project-local** CLI
  first, probes for managed upgrade (`--plan-digest`), and aborts when only an
  old PATH binary is available.

## 4.0.0 — 2026-07-24

**Major** over 3.9.2. **Breaking:** deprecated root subpaths `arkgate/runtime` and `arkgate/nestjs`
are removed (use `@arkgate/runtime`). **ArkRules (opt-in):** intra-layer structural sensors,
invariant catalogs, coverage evidence, brownfield rules inventory, and modular `arkrules/*.json`
on the same enforcement plane (CLI, MCP, PreToolUse, CI, doctor). Absence of `arkRules` changes no
inter-layer verdict. **Not field-cohort proven:** Z09/RB-11 retained adoption remains open; AR16
case-study docs are scaffolding, not a closed field gate.

### Breaking (AR04)

- **Removed** deprecated root package subpaths `arkgate/runtime` and `arkgate/nestjs`
  (and the `compat/` forwarders). Import `@arkgate/runtime` / `@arkgate/runtime/nestjs`
  instead. See [migration note](docs/migrate-from-ark-runtime-kernel.md#arkgate-4--ar04--root-runtime-forwarders-removed).

### Added — ArkRules foundations + sensors (AR01–AR08)

- **AR01 — ArkRules foundations (ADR 0012):** optional `arkRules` map on `ark.config.json`
  (`schemaVersion` `1.0→1.1` additive migration), sibling schema
  `schemas/ark.arkrules.schema.json` (`arkgate/schema/arkrules`), pure
  `loadArkRulesContract` / `resolveEffectiveContract` with per-rule provenance, and fail-closed
  diagnostics for missing/invalid referenced files. Absence of `arkRules` changes no inter-layer
  verdict. Zero-match `appliesTo` emits `ARKRULE_SCOPE_EMPTY` (advisory warn / enforced fail).
- **AR02 — Effective Contract policyHash + policy-delta:** `loadContract` folds non-empty
  ArkRules into `policyHash` (absent → historical hash preserved); policy-delta classifies
  arkrule add/remove/promote/demote; CLI loads referenced files via
  `bin/lib/effective-contract-load.mjs` and observes them for resident invalidation.
- **AR03 — Adapter contract 1.4:** diagnostics carry optional `evidence.arkruleId` +
  `evidence.arkruleSource`; remediation/nextAction for `ARKRULE_*` / `INVARIANT_UNCOVERED`
  is judgment-only with provenance on every surface.
- **ADR 0013** + resolved facts schema `1.1` optional `classShapes[]` (class-shape evidence)
  produced on the write/CI path via `extractClassShapesFromSource`.
- **Tier-1 sensors:** `aggregate-private-state`, `always-valid-factory`,
  `domain-event-on-mutation`, `orchestration-only`, `thin-adapter`.
- **Tier-2 advisory:** `no-anemic-model` (never promotable).
- **fileHints:** Tooling derives conservative `orchestrationHeavy` / `adapterThick` hints
  (`deriveArkRuleFileHints`) and feeds the write/CI scan path (prefer false negatives;
  default templates stay advisory).
- **Templates:** `templates/arkrules/*.json` + presets/init emit lean `arkRules` refs and
  copy editable starter files.

### Added — invariants, inventory, migration surfaces (shipped in package; progressive opt-in)

- **ADR 0014–0016:** invariant catalog + coverage evidence + promotion ladder; migration
  routes through existing skills; no executable evaluator in core.
- **Invariant coverage:** test-title + symbol evidence; `INVARIANT_UNCOVERED`; partial when
  test globs missing; `canPromoteInvariant` refuses uncovered promotions. Write path loads real
  test contents via `bin/lib/invariant-coverage-io.mjs`. CLI policy-delta loads Effective ArkRules
  + coverage so covered promotions can auto-strengthen.
- **Doctor/HTML** `rulesUnderContract` (counts, not a score); report parity key.
- **Rules inventory:** `ark-check --rules-inventory` + MCP `ark_rules_inventory`; extraction
  cards for pilotLoop; freeze residual reuses baseline keys.
- Skills deepen (`ark-adopt`, `ark-contract`, `ark-place`) without new skill names.
- Pre-release field dogfood workflow: `.grok/workflows/pre-release-field-dogfood.rhai`.

### Confidence / package budgets (4.0.0)

- **Branch floor** recalibrated **84.5% → 83.0%** after ArkRules dual-plane growth (measured
  ~83.3% on the clean candidate). Statement / function / line floors and mutation gates unchanged.
- **Module LOC budgets** raised for `ark-check-runtime`, `doctor-plan`, `presets`,
  `html-report-advisories` (evidence in `scripts/check-module-budgets.mjs`).
- **Package pack budgets** remeasured for 4.0.0 (≥10% headroom in `release/package-budgets.v1.json`).

### Honesty / not claimed in 4.0.0

- No claim that Z09 / RB-11 retained field adoption is closed.
- No claim that a consented multi-adopter field pilot (AR16 gate) is complete — case-study docs
  are present; cohort evidence is not.
- No numeric trust score; green with frozen residual still says so.
- **Dual-truth residual:** `ark upgrade --no-install` can refresh managed assets while leaving
  package.json on an older pin — doctor exposes `packageVersionTruth` and upgrade JSON/human notes
  when the pin is behind the CLI.
- **Field note — global 2.x PATH:** bare `ark upgrade` from a global **arkgate 2.x** install is
  mutative (pre managed content-identity) and unsafe next to 3.8+/4.0 projects — prefer
  `npx arkgate upgrade …`. Documented in [4.0.0 release notes](docs/releases/4.0.0.md#field-footgun--global-arkgate-2x-on-path);
  CLI fail-closed guard ships under Unreleased.

## 3.9.2 — 2026-07-23

**Patch** over 3.9.1. Product honesty for post-validity coaching, coverage/host write paths, and
advisory analysis precision — **no required config migration**, no gate weakening, no hard-write
claims on soft hosts. Y07 / Y09 remain **parked** (not promoted).

### Added

- **Enforcement honesty helpers** (`bin/lib/enforcement-honesty.mjs`): coverage honesty
  (empty / weak &lt;50% worse-than-no-gate / partial / strong; `greenIsNotEnforcement` until 100%;
  `wholeTreeGoverned`), baseline dirty-freeze risk, write-path honesty with soft hosts derived from
  `HOST_SUPPORT_MATRIX` (fail-closed: soft never `hardWriteActive`).
- **Graph blind spots** (`bin/lib/graph-blind.mjs`): advisory scan for unresolvable dynamic
  import/require edges (template-interpolation + non-literals + import-equals). Never a hard
  architecture verdict; Y09 direction only.
- Doctor / plan JSON: `coverageHonesty`, `baseline.honesty`, `writePath.honesty`,
  `graphBlindSpots`, design-weak honesty flags (`healthyFinishedForbidden`,
  `multiPilotBatchForbidden`, `autoApplyForbidden` / `autoApplyPlanBForbidden`).
- Focused unit suite `tests/unit/static-check/enforcementHonesty.test.ts`.

### Changed

- **Post-green path:** placement coaching + shared design-weak honesty flags.
- **Pilot loop:** one-at-a-time queue (`queuedBets` / `queueNote`); multi-pilot batch and silent
  plan-B auto-apply forbidden on all return paths.
- **Ambient sensor (Y07 honesty only):** status vocabulary (`idle` / `active-clean` /
  `active-findings` / `unavailable`), `blockerGrade: false`, `strictDiagnostics: 'parked-Y07'`;
  idle/clean/unavailable print honesty lines (not silence-as-done).
- **Skills** (`ark-coverage`, `ark-explore`, `ark-place`): deepen honesty / one-pilot routing
  without new skill basenames.
- **HTML advisories:** graphBlindSpots X01 parity; ambient h2 parked-Y07 wording.

### Notes

- Soft write hosts (Cursor / Codex / OpenCode) remain advisory at write; required CI status is the
  hard merge boundary.
- Z09 / residual `RB-11` remain open. Y07 / Y09 not marked done.

## 3.9.1 — 2026-07-23

**Patch** over 3.9.0. Repo hygiene and CI honesty only — **no required config migration**, no gate
weakening, no product API changes.

### Fixed

- **Onboarding matrix (`o04`):** `ark start --install` may rewrite package-manager lockfiles when the
  published package is installed; tests compare product mutation paths only (lockfile drift allowed).
- **Docs post-3.9.0 publish:** CONTRIBUTING / README / release notes / migrate guide match npm truth
  for the published line (updated again for this patch after 3.9.1 lands on `latest`).
- **Supply-chain hygiene:** `fast-uri` **3.1.4** (transitive via `ajv`) closes host-confusion advisory
  GHSA-v2hh-gcrm-f6hx. Eval fixtures pin **Next.js 15.5.21** (patched) so Dependabot Next alerts on
  `eval/cases/**` corpus close without shipping Next in the `arkgate` npm tarball.

### Notes

- Next bumps are **eval fixture hygiene**, not a consumer-runtime CVE in the published package.
- Z09 / residual `RB-11` remain open.

## 3.9.0 — 2026-07-23

**Beautiful Path** minor: one primary flow, doctor as control plane, progressive disclosure, and
senior-grade product voice — plus residual beauty, write-path honesty, Shape coach depth, and
field-claim scaffolding. **No required config migration.** Does not weaken write gate or CI.
Z09 / residual `RB-11` remain open (longitudinal claim gate; field kit is scaffolding only).
Not a rewrite of the analysis engine. No plan-B silent codemod. No fake hard write on Cursor/Codex.

### Added

- **Product voice canon:** `docs/product-voice.md` — lexicon (including **design-weak** / **residual**
  / hard vs advisory write), **Do** table, doctor/deny microcopy models, progressive-disclosure rule.
  Linked from README and Agents knowledge map.
- **Field program kit (not closed):** `docs/field/` — Z09 preregistration template, cohort D30/D90
  checklist, independent-reviewer manifesto + open signed-identity decision. Explicit **status: not
  closed**; does not invent adopter counts or close `RB-11` / C-028 residual.
- **Release notes:** `docs/releases/3.9.0.md`.
- **Docs information architecture:** three public lanes — [docs/use.md](docs/use.md) (anyone),
  [docs/develop.md](docs/develop.md) (integrate), [CONTRIBUTING.md](CONTRIBUTING.md) (library);
  hub [docs/README.md](docs/README.md); history under [docs/archive/](docs/archive/README.md).
  Historical release notes and epic plans remain in-repo but are not the product front door.
- **Maintainer workflow:** `.grok/workflows/product-beauty-audit.rhai` — read-only parallel audit of
  product surfaces against product-voice criteria (report-only by default).
- **Host enforcement expansion (prepared, not npm-published as a separate release):**
  - **Google Antigravity** (`antigravity` / alias `agy`): `.agents/hooks.json` PreToolUse install,
    `ark-mcp --hook` adapter for `toolCall` + write tools (`write_to_file`,
    `replace_file_content`, `multi_replace_file_content`), doctor inventory, hard-write when
    installed + trusted (same ladder as Claude/Grok).
  - **OpenCode** (`opencode`): merge/write `opencode.json` MCP (`type: local`), advisory-only
    write path, optional experimental plugin template
    `templates/hooks/opencode-ark-write-gate.mjs` (never claimed hard).
  - Canonical host matrix + README/`docs/ai-gates.md` honesty rows updated.

### Changed

- **README first-run narrative:** one door (`start` → doctor → optional `/ark-autopilot`); skills
  section reframed as expert escapes, not a second curriculum; status lights language tightened;
  host matrix states **required CI status** as the merge hard boundary and labels
  Cursor/Codex/OpenCode advisory at write (Antigravity hard when covered).
- **Compact router** (`compactAgentInstructions`): primary path = doctor + place/validate/check;
  full `/ark-*` pack documented as optional expert depth with install command.
- **Doctor human surface:** status-light copy matches product voice; top block is **Primary next
  action** (#1) plus optional **Also** list; design-weak mode uses warn `!` (not green `✓`);
  edge-clean under design-weak no longer claims absolute “matches the contract”; New-here primary
  is finish `start` → doctor (not a competing recommend/architect curriculum); Cursor/Codex write
  path lines state advisory + required CI. JSON ids (`postGreenPath`, `primaryNextAction`,
  `clarify-for-ai`) unchanged.
- **Post-green primary action string:** senior-grade Shape residual wording; same skill chain.
- **Agent install messaging:** install-agent-gates prints compact vs expert-skill-pack profile hints.
- **Skill frontmatter / mode tables:** `/ark-autopilot` = guided end-to-end; ranks **Enforce ·
  design-weak** Shape door; `/ark-explore` = specialized map / post-green door with status-light
  table and smell-envelope honesty (absence ≠ full-tree proof).
- **Agent guide / AI gates / package surface:** default path and host write honesty aligned; design
  smell envelope documented; no “default = full skill pack.”

### Tests

- `q01PostGreenPath` — primary-action wording, design-weak mode mark `!`, no absolute contract-match
  under residual.
- `skillsSurface` — autopilot/explore Shape door ranking; compact router progressive disclosure.
- `q06ReleaseSurfaces` — 3.9.0 notes, product-voice Do/lexicon, field kit not-closed.
- Compact-start / adoption-gaps / codex residual honesty expectations updated for voice.

## 3.8.3 — 2026-07-22

Corrective **patch** over 3.8.2 from multi-repo field evidence (PROPIA pnpm workspace upgrade;
Amarilla greenfield `start`). **No required config migration.** Z09 / residual `RB-11` remain open.

### Fixed

- **pnpm workspace upgrade install:** `packageInstallArgv` emits `pnpm add -D arkgate@… -w` on
  workspace roots (`pnpm-workspace.yaml`). Yarn workspaces get `-W`. npm single-package path
  unchanged.
- **Upgrade re-install when already current:** skip package-manager install when
  `node_modules/arkgate` already matches this CLI version; go straight to managed preview.
- **Install failure recovery copy:** prints the exact failed install command and a
  `--no-install` re-run path.
- **`start` package pin by default:** `start --apply` pins `arkgate` in `devDependencies`
  unless `--no-install` (was: only with explicit `--install`).
- **Compact start always writes `.mcp.json`:** every host gets project MCP registration;
  setup budget raised to 8 files / 32 KB so MCP fits with host hooks.
- **Unbound upgrade apply when content matches:** `--apply` without `--plan-digest` is a
  successful no-op when `wouldWrite` is 0 (optional stamp refresh still needs the digest).
- **Upgrade applied copy:** distinguishes content writes vs stamp/metadata refresh instead of
  a single “Applied N changes” when only stamps moved.

### Tests

- `tests/unit/static-check/fieldJourney383.test.ts` — workspace argv, skip-when-current, start pin.
- Z06 / O03 / installFieldFixes expectations updated for default pin and MCP-in-compact.

## 3.8.2 — 2026-07-22

Corrective **patch** over 3.8.1 from PREDIAL WEB field evidence. Aligns doctor skill freshness with
managed upgrade content identity, hardens upgrade preview honesty, clarifies doctor writePath
inventory vs this-invocation, ships the Y06 pure-layer opt-in advisory, and treats complete-catalog
Codex leftover prompts as safe-to-delete. **No required config migration.** Z09 / residual `RB-11`
remain open.

### Fixed

- **Doctor skill “stale” vs managed upgrade (field DX):** skill gap detection now uses the same
  content-identity rules as `ark upgrade` (stamp-normalized). A skill whose body matches the
  package template is not stale when only `arkVersion` lags. Stale copy says content-behind-package.
- **Upgrade preview phantom apply:** summary reports `managedAssets` / `wouldWrite` /
  `customizedPreserved`; when `wouldWrite` is 0, prints “Nothing to apply” instead of urging
  `--apply` as the primary next step (optional stamp-only apply remains digest-bound).
- **Doctor writePath honesty:** with `activeHost: unknown`, a `sessionNote` separates on-disk
  inventory from this-invocation hardness; package `installed` is independent of host support.
  Hard still requires runtime proof (Z10).
- **Codex legacy prompts:** complete `.agents/skills` with leftover `.codex/prompts` is an
  advisory safe-to-delete signal (CLI, doctor, HTML), not an install-agent-gates gap.

### Added

- **Y06 pure-layer opt-in nudge:** when a golden pattern names pure modules and no layer sets
  `pure: true`, doctor emits one advisory line (`doctor.pureLayerOptIn`). Never a blocker; never
  auto-writes `pure: true`. Promoted from field evidence (PREDIAL WEB).

## 3.8.1 — 2026-07-22

Corrective **patch** over 3.8.0. Closes silent fail-open on peerIsolation incomplete evidence,
improves pure-IR type-only and relative-`require` graph accuracy, and splits the Domain analysis
vocabulary pilot without changing public gate import paths. **No required config migration.**
Z09 / residual `RB-11` remain open for retained adoption and independent close.

### Fixed

- **peerIsolation fail-closed (S1):** when `peerIsolation: true` is configured, missing paths, no
  slice folders, or unclassifiable slices **deny** (cannot prove same-slice). No silent fail-open.
  Incomplete path evidence can surface new denials; that is intentional safety, not a config
  migration.
- **Pure IR type-only named bindings (S5):** all-type lists (`import { type A }`,
  `export { type A } from '…'`) are type-only for capability evidence; mixed lists and
  default+named imports stay value.
- **Relative `require` edges (S4):** pure module graph emits dependency edges for relative
  `require(...)` like relative import; package require remains capability evidence only.

### Changed

- **Plan-B god-module pilot:** split `src/domain/analysis.ts` by concern into a DomainModel pilot
  cluster — Analysis IR + facade in `analysis.ts`; `stableHash.ts`; `resolvedCandidateFactsTypes.ts`;
  create/load in `resolvedCandidateFacts.ts`; import-free `resolvedCandidateFactsSchema.ts` for
  `generate:cli-pure`. Public root/gate import paths unchanged. Judgment-only hygiene; no contract
  or gate weakening.

### Documentation

- **Queue hygiene:** Phase Z engineering slices remain closed in 3.8.0+; `Z09` is a parked claim
  gate (residual `RB-11` = retained adoption + independent close only). No engineering `doing`.
  Y06/Y09 stay parked; Y07 low priority; Y10 archived until field demand + ADR; K01 runtime-only.
  After the analysis pilot, self-hosted design-weak residual is package barrel `src/index.ts`
  only (plan-B judgment; never mechanical-safe).
- **Pin honesty:** migration guide, claims matrix, and TS support pin current stable as
  **arkgate@3.8.1** (not 3.7.0 / unpublished corrective).

## 3.8.0 — 2026-07-21

This corrective minor makes complete analysis fail closed, restores one resolved architecture
verdict across parity-capable adapters, hardens clean install and managed upgrade flows, and adds
an opt-in base-relative design-delta gate. **No required config migration.** Retained adoption and
independent close remain open under Z09, so this release does not claim Phase Z completion.

### Added

- **Z10:** add the opt-in base/candidate `domain-logic-in-ui` ratchet with hook/MCP/CLI parity and
  fail-closed bases. Enforcement-state `1.1` adds runtime/operation proof for `hard`; assets and MCP
  alone remain non-hard.
- **Analysis completeness (Z02):** CLI, MCP, hook, and public schema/type envelopes now carry
  required `complete | partial | unavailable` evidence. Incomplete analysis cannot satisfy a
  remediation goal; governed parse diagnostics fail `--strict-merge`, and a missing analysis host
  exits `2` instead of producing a clean-looking plan.
- **Resolved candidate facts (Z04):** the stable root API now exposes a versioned, serializable
  facts contract plus `analyzeResolvedProject` and `preflightResolvedChange`. Tooling resolves one
  complete virtual create/update/delete candidate; the pure Kernel and generated CLI bundle
  evaluate the same policy, resolver, facts, and tree identities.
- **Differential adapter corpus (Z04):** API, generated bundle, atomic preflight, CLI, MCP,
  complete-patch hook, final strict check, and ESLint within its bounded envelope are compared over
  relative and configured paths, packages/workspaces, symlinks, supported import forms,
  unresolved/parse evidence, exclusions, unclassified paths, and create/update/delete batches.
- **Managed-content upgrade (Z06):** `ark upgrade` is now a read-only identity preview. Package
  update/re-preview and managed-file application are separate confirmations; the latter requires
  the preview's SHA-256 `planDigest`. `ark.managed.json` distinguishes current, stale, missing,
  customized, and conflicted assets without touching unrelated source, similar files, or global
  Codex state. Recorded deletions/conflicts require explicit consent.
- **Enforcement-state contract (Z06):** doctor JSON publishes schema-backed
  `writePath.enforcementState` plus stable public TypeScript types and schema subpaths. Local write,
  advisory MCP, and CI merge boundaries independently report supported, analyzed, configured,
  installed, active, bypassable, required, and structured evidence values.
- **Packed managed-upgrade matrix (Z06):** all 11 supported hosts install and execute one
  checksum-verified candidate tarball through 132 fail-closed journey stages in CI.

### Fixed

- **Packed TypeScript 7 analysis:** ArkGate now ships an exact, separately named TypeScript 6
  JS-API host that package-manager deduplication cannot replace with TS7's version-only export.
  The consumer's own TypeScript remains preferred when usable and its selected `tsc` is unchanged.
  Packed Yarn cells record strict PnP for TS5/6 and the normal `node-modules` linker for native TS7.
- **One architecture verdict:** complete-candidate CLI/MCP/hook paths now consume resolved facts
  instead of a compiler-free relative-only graph. A contract-allowed same-layer edge is no longer
  rejected by AICodeGate's former path heuristic. Retained lexical/single-snippet compatibility
  paths report `partial` and non-green, while legacy pre-Z04 cache snapshots are ignored until the
  identity-keyed Z07 warm path is proven.
- **Required-status honesty:** workflow text records CI configuration only. Required merge status
  remains `unverified` without opt-in provider evidence, which is read from the repository's
  default branch rather than the caller's current branch.

### Changed

- The npm changelog retains complete 2.x/current-major notes and links pre-2.0 detail to the
  immutable pre-Z06 canonical history, keeping the frozen package-size ceiling while preserving
  later corrections to those historical notes.

## 3.7.0 — 2026-07-17

Phase Y turns field feedback into explicit decision memory, more honest design/parse advisories,
safer skill-driven edits, and one confirmed purity-bypass closure. **No breaking** CLI, MCP tool,
analysis IR, or `ark.config.json` changes. **No product-policy gate weakening. No automatic
reshape or codemod.**

### Added

- **Recorded reshape decisions (Y01):** `.ark/reshape-decisions.json` can explicitly accept,
  defer, or reject a physical-cohesion pilot with a required reason and optional `reviewBy`.
  Current deferred/rejected decisions suppress only repeated pilot pressure; the underlying
  facts remain visible. Stale, expired, malformed, duplicate, or oversized records suppress
  nothing, and doctor/HTML surfaces render the lifecycle.
- **Hollow-persistence advisory (Y02):** the existing `handler-in-persistence` smell now sees
  static framework HTTP imports/re-exports, route definitions, and handler shapes inside
  Persistence-role modules. It stays advisory and judgment-only, with a bounded and explicit
  inspection envelope.
- **Parse-health honesty (Y03):** doctor JSON/human output and the HTML report expose governed
  files with parser diagnostics through additive `parseHealth` totals and a deterministic,
  overflow-aware file list. The existing AST is reused; the verdict and exit code are unchanged.
- **Exact `process` module dual (Y08):** `forbiddenGlobals: ["process"]` now owns exact value
  imports of `process` and `node:process` across CLI cold/warm cache, pure IR, atomic preflight,
  AICodeGate/MCP, and ESLint. It emits one `FORBIDDEN_GLOBAL` voice; type-only forms within the
  documented TypeScript envelope, subpaths, and `child_process` remain excluded.

### Changed

- **Mechanical-edit hygiene (Y04):** `ark-fix`, `ark-autopilot`, and `ark-loop` now require
  injected headers to merge into an existing doc block, typed `defineRoute<…>` calls to retain
  their generics/shape, and convention-only placeholder modules to remain uncreated. A
  deterministic eval guards all three outcomes.
- **Cycle budgets (Y05):** package and Linux hook/doctor p95 ceilings were re-measured once from
  clean 3.6.1 candidates with evidence-backed headroom, preserving fixed release guardrails.
- **Confidence budget:** Y08 adds multi-form ESLint regressions while the full-suite branch floor
  is recalibrated from 85% to 84.5%; statement/function/line floors and mutation gates are
  unchanged.

### Fixed

- **Portable peer isolation:** slice identities are case-normalized, so mixed-case paths do not
  produce a false cross-slice violation on case-insensitive filesystems. Repositories that differ
  only by path case intentionally share the portable identity.
- **Convergence remediation direction:** an unplanned removed dependency now tells the user to
  restore it; an unplanned added dependency still tells the user to remove it.

## 3.6.1 — 2026-07-17

Codex project-scoped MCP fix. **No breaking** CLI, MCP tool, or `ark.config.json` changes.
**No gate weaken.**

### Fixed

- **Codex MCP follows the active repository:** `--install-agent-gates --tools codex` now writes
  `.codex/config.toml` with relative project paths. Each repository owns its primary `ark`
  binding, so `ark upgrade` no longer leaves Codex resolving `ark://manifest` through another
  permanent project registered in the global home config.
- **Doctor effective-config honesty:** Codex advisory-MCP capability and adoption checks prefer
  a valid project `.codex/config.toml`; an unrelated `$CODEX_HOME` primary no longer produces a
  false `write-path-none` or `codex-home-multi-project` warning.
- **Ephemeral worktree cleanup:** roots under `.claude/worktrees`, `.codex/worktrees`, or
  `.grok/worktrees` are treated as temporary instead of permanent global MCP owners.

### Changed

- `$CODEX_HOME/config.toml` remains an explicit compatibility fallback via `--codex-home`.
  Normal `--tools codex` installs no longer mutate the global MCP registry, and skills-only
  home refreshes cannot accidentally rebind its primary server.

## 3.6.0 — 2026-07-17

Phase X closes: the doctor learns to see **physical shape** and agents get a governed way to
execute reorganizations, plus three field warm-ups from the 3.5.0 the field adopter validation.
Everything remains **advisory** — no verdict, exit-code, `designFitness`, or `patternBets`
change. **No breaking** CLI or `ark.config.json` changes. **No gate weaken. No apply path.**

### Added

- **Physical cohesion sensor (X04, ADR 0010):** `doctor.physicalCohesion` reports domain
  concepts exploded across mirrored directory clusters — concentration, not volume (dispersed
  `use-*` hooks never fire). Deterministic path/name tokenization (framework filenames take the
  topmost meaningful path segment; monorepo scaffold roots are never a concept); fixed
  corpus-calibrated thresholds (`maxCluster ≥ 40` OR ≥2 anchors ≥ 20); findings ranked and
  capped honestly; anchors under `app/`/`pages/` are `fixedByConvention`. `notAScore` — facts,
  never a score or gate input.
- **Reshape pilot (X04):** `physicalCohesion.reshapePilot.nextPilot` is a **proposed, never
  applied** card — one at a time, smallest convention-free anchor, `moveSample`/`movesTotal`,
  `successSignal`, `killSwitch`, hard `doNot[]`. Real moves run only through the write gate and
  atomic preflight via `/ark-loop`; merges are `/ark-architect` **merge cards** (domain
  modeling, **never a codemod**); `/ark-fix` never folds reshapes into a fix batch. The
  consolidation target subtree is never re-proposed as a source — the loop converges (validated
  end to end: pilot → gate → kill switch → judgment → convergence).
- **Stale acknowledgments (X05):** ack entries matching no detected edge (orphaned, unknown id,
  typo) land in `contractHealth.ackLifecycle` as `staleCount` + `stale[]` (sorted, capped);
  doctor and report name the exact entries to fix or delete, even at zero visible smells.

### Changed

- **Mid-name families (X06):** the family-infra carve-out matches the target's family token
  against ANY source token (`HoursPersistenceAdapters -> PersistenceInfrastructure` goes
  quiet); generic role words (`adapter(s)`/`gateway(s)`) never count as a family, so
  `AdaptersCore` is not every `*Adapters` layer's base.
- **Report evidence overflow (X07):** per-finding evidence lists announce their 6-item cap with
  an honest `(+N more)` marker; expired/stale lifecycle notes carry the same honesty.

## 3.5.0 — 2026-07-16

Field-feedback release (Phase X, from an internal field-adoption session): the HTML report reaches
parity with the doctor and stays there by an executable rule, contract-smell acknowledgments gain
a lifecycle so migration acks cannot fossilize, and the lateral-adapter smell stops firing on a
family's own infrastructure base. Everything remains **advisory** — no verdict, `designFitness`,
or gate behavior changes. **No breaking** CLI or `ark.config.json` changes. **No gate weaken.**

### Added

- **Report parity (X01):** `ark-check --report` now renders every doctor advisory — contract
  health (smells with evidence/fix, acknowledgment honesty, invalid-sidecar warning), governance
  weight, ambient state (idle/clean/findings with honest overflow), and capability-wall badges
  (`pure` / `walls: …`) in the layers table. The rule is **executable**: `reportParity.test.ts`
  enumerates the advisory keys `computeDoctorAdvisories` returns and fails CI when any key lacks
  a `data-advisory` section — the report can never silently fall behind the product again.
- **Acknowledgment lifecycle (X02):** a contract-smell ack may carry an optional `reviewBy`
  (`YYYY-MM-DD`, strict round-trip validation). Past that date the ack **stops applying** and the
  smell returns with `(ack expired …)` annotated evidence; a re-ack with a fresh date wins over a
  dead entry, and once any dated ack exists for an edge the dated entries govern — a leftover
  undated duplicate cannot resurrect an expired exception.
  Undated acks keep applying (backward compatible) but are counted and surfaced —
  doctor line, report note — even when every smell is suppressed. Malformed dates never apply
  (fail-loud, like a sloppy edge); non-string `reviewBy` invalidates the file. Doctor JSON gains
  `contractHealth.ackLifecycle` (`{ undated, malformed, expiredCount, expired[] }`).

### Changed

- **Lateral-adapter smell (X03):** `contract-lateral-adapter-allow` no longer fires when an
  adapter layer reaches its **own family's infra base** (same leading name token and every
  remaining target token an infra word — `Infra`/`Base`/`Core`/`Shared`/`Common`/`Kernel`/
  `Platform`/`Foundation` — e.g. `PaymentsAdapters -> PaymentsInfra`; `PaymentsCoreAdapters` is
  still a sibling). Cross-family edges, same-family non-infra siblings, and the reverse
  direction (base → member) still fire.

## 3.4.0 — 2026-07-16

Understandable execution, second slice (Phase U: U04–U07): the capability evidence shipped in
3.3 becomes **opt-in enforcement** across every adapter, plus the advisory ambient-state sensor
and the measured pre-tool path. Everything remains opt-in — a config without `capabilities` /
`pure` keys behaves exactly as before. **No breaking** CLI or `ark.config.json` changes.
**No gate weaken.**

### Added

- **Capability walls (U04):** a layer may declare `capabilities: { deny: [...] }` (seven-id enum
  in the versioned schema) or the casual shorthand `pure: true` (denies all seven). Enforcement
  is judgment-class `CAPABILITY_VIOLATION` — never mechanical-safe, never auto-patched — with a
  port-injection `nextAction`, across the CLI scan (ambient + import evidence), the pure IR
  engine and atomic preflight (a multi-file batch cannot hide a denied capability), the real
  PreToolUse hook and MCP gate (`capabilityWalls`), and ESLint
  (`ark/no-denied-capabilities`, import dimension, in the recommended config). One violation,
  one voice: an ambient use covered by the layer's `forbiddenGlobals` reports only
  `FORBIDDEN_GLOBAL`.
- **Coverage-atom policy delta (U04/D6):** T01 classifies the ambient/wall surface on coverage
  atoms (`ambient:<entry>` prefix-expanded + `import:<capability>`): any lost atom is weakening
  (`fetch`→`XMLHttpRequest`, `Date`→`Date.now`, wall→`forbiddenGlobals` all require the
  hash-bound acknowledgment); migrating `forbiddenGlobals` to an equivalent-or-stronger wall
  never needs one.
- **Ambient-state sensor (U05, advisory + opt-in):** `doctor.ambientState` flags module-scope
  `let`/`var` in `pure: true` layers only, with bounded sidecar acknowledgments at
  `.ark/ambient-state-acks.json`. `declare` ambients and `using` bindings never count; skipped
  oversized files are reported. No strict mode exists.
- **Measured pre-tool path (U06):** `npm run bench:hook-path` measures the complete
  hook/doctor child-process paths; `eval/performance/hook-budgets.v1.json` locks the D5 method
  (Linux baseline first, ceilings = baseline + fixed headroom, recording mode until then); CI
  runs the bench. Dual-depth remediation everywhere: plain port hints for casual users, stable
  `ruleId`/`capability`/`fixClass`/`nextAction` JSON for tooling.

### Fixed

- The scan cache is version-bumped (v8) so a warm cache from an older ArkGate cannot miss wall
  verdicts; template-literal text and `require()` handling in the pure scanner are
  capability-correct (templates skipped; require counts as evidence, never as a graph edge).

## 3.3.0 — 2026-07-16

Understandable execution, first slice (Phase U: U01–U03): typed effect capabilities as
**evidence-only** architecture facts, a locked ADR boundary, and a legibility dogfood of the
engine itself. Nothing blocks on capabilities in this release — walls arrive with the second
slice (U04+) after the corpus matures in the field. **No breaking** CLI or `ark.config.json`
changes. **No gate weaken.**

### Added

- **ADR 0009 (U01):** the accepted architecture-vs-style boundary — seven closed capability ids
  (`network`, `filesystem`, `clock`, `randomness`, `environment`, `process`, `persistence`),
  direct-evidence-only blocking threshold (transitive inference never blocks), config lowering
  design (`forbiddenGlobals` and future capability policy lower to one semantic space;
  `pure: true` planned as the casual surface), coverage-faithful lowering for prefix-matched
  globals (bare `process` covers `environment` too), surface-ownership dedup rule, and the
  W02 governance-weight reconciliation. Backed by a 25-case executable fixture corpus
  (`tests/fixtures/capability-corpus/`) with a content-aware structural guard.
- **Effect capabilities in the canonical analysis (U03):** the internal
  `collectCapabilityUses(ts, sourceFile)` composes the existing symbol-aware collectors
  (shadowing / type-only / `globalThis`-alias precision; no second scanner); the internal Domain
  vocabulary is `CAPABILITY_IDS` / `capabilityForModuleSpecifier` /
  `capabilityForAmbientName` / `lowerForbiddenGlobal`. These names were never root `arkgate`
  exports. The supported public surface is `analyzeProject(...).ir.capabilityUses`, populated
  with import-based evidence by the compiler-free IR engine (exact module/subpath matching —
  never substring; textual `import type` / `export type` erasure). Additive within IR `1.0`;
  evidence only.

### Changed

- **Engine legibility dogfood (U02):** `src/kernel/analysis.ts` is now a pure facade over six
  cohesive kernel modules and the `ark.config.json` contract types moved to
  `src/domain/configTypes.ts` — zero consumer import changes, byte-identical generated
  config artifacts, identical hashes and verdicts (verified by execution old-vs-new). ArkGate's
  own doctor now reports **zero design smells** on this repository.
- The experimental `@arkgate/runtime` built distribution artifact is minified with `keepNames` (stable
  class/function names for reflection and Nest diagnostics) and stays well inside its
  release-artifact budget.

## 3.2.0 — 2026-07-15

Contract health (Phase W): ArkGate now also meta-lints the contract itself and describes its
governance weight, and the docs name the enforcement-boundary trade-off explicitly. Everything in
this release is **advisory only** — no verdict, `designFitness`, `patternBets`, or gate result
changes. **No breaking** CLI or `ark.config.json` changes. **No gate weaken.**

### Added

- **W01 contract smells:** `ark-check --doctor --json` gains `doctor.contractHealth` with four
  stable, deterministic smell ids that lint the contract rather than the code:
  `contract-bidirectional-allow` (both directions explicitly allowed between two layers),
  `contract-peripheral-depends-core` (audit/observability layer allowed into
  orchestration/persistence), `contract-lateral-adapter-allow` (adapter layer allowed into a
  sibling adapter layer), and `contract-dead-rule` (rule referencing an unknown or empty layer, or
  a same-layer no-op; `optional: true` layers are exempt). Each smell carries `severity`,
  sorted `evidence[]` with honest `…(+N more)` truncation, technical `message`, plain-language
  `outcome`, and `fix`. Human doctor prints a "Contract health (advisory)" section.
- **Acknowledgment sidecar:** deliberate edges are recorded in an optional
  `.ark/contract-smell-acks.json` (`{ acks: [{ id, edge, reason }] }`; bidirectional edges
  order-insensitive) — the versioned `ark.config.json` schema is untouched. The file is bounded
  (≤64 KB, ≤200 entries); a malformed file or edge grammar is reported via `ackFile.invalid` and
  never suppresses a smell. `contractHealth.acknowledged` counts applied acks only.
- **W02 governance weight:** `doctor.contractHealth.governanceWeight` reports raw facts
  (declared/populated layers, governed files, rules, denied/allowed edges, files-per-layer,
  rules-per-layer) plus a fixed comparative band — `heavy` (fewer than 25 governed files per layer
  AND 6+ layers or 4+ rules per layer), `light` (≤2 layers over 150+ governed files), `typical`,
  or `unknown` — with fixed wording and an explicit `notAScore: true`. Banding uses raw ratios;
  reported ratios are rounded for display. The heavy note asks to justify NEW layers with
  demonstrated pressure and never suggests deleting working ones.
- **W03 enforcement-boundary positioning:** README explains why the hard guarantee lives at the
  required merge status ("deliberate trade-off, not a gap"; the contract doubles as a pressure
  sensor), and `docs/ai-gates.md` / `docs/agent-guide.md` carry the same framing next to the
  canonical host support matrix. A docs regression pins the wording without strengthening any
  guarantee claim.

### Fixed

- Contract meta-lint reads the rules actually in force (manifest-aware), not only `config.rules`.
- Hostile ack-file inputs (FIFO/symlink targets, oversized files, sloppy edge strings) can no
  longer hang `--doctor`, exhaust memory, or silently suppress findings; null rule entries and
  malformed coverage rows no longer throw.
- Governance-weight banding is size-relative in both clauses: a large tree with a proportionate
  dense rule matrix never reads `heavy`, and NaN/negative counts read `unknown`.

## 3.1.0 — 2026-07-15

Deterministic change integrity. **No breaking** CLI or `ark.config.json` changes. **No gate
weaken.**

### Added

- **T01 policy-transition guard:** the public analysis API and generated CLI engine classify
  `ark.config.json` changes as `strengthening`, `neutral`, `judgment-required`, or `weakening`.
  `--strict-merge` compares the Git merge-base contract when available; explicit
  `--policy-base` / `--policy-base-ref` inputs are also supported.
- **Hash-bound acknowledgement:** weakening and judgment-required findings fail until
  `--policy-ack` supplies the exact base/candidate policy hashes, complete finding-id set, and a
  non-empty reason. Any later contract edit invalidates the acknowledgement.
- **CI base provenance:** generated workflows fetch full history and the composite Action passes
  the PR/push base SHA through `ARK_POLICY_BASE_REF`.
- **MCP parity:** `ark_policy_delta` exposes the same read-only classifier for explicit base and
  candidate contracts and returns blocking transitions as tool errors.
- **T02 atomic change preflight:** public `preflightChange(...)`, CLI
  `ark preflight --changes <change-set.json>`, and MCP `ark_prepare_change` evaluate one complete
  create/update/delete candidate without writing. Schema `1.0` includes per-file content
  fingerprints plus policy, compiler, base-tree, and candidate-tree fingerprints.
- **Batch safety:** duplicate normalized paths, stale delete targets, lexical root escapes, and
  symlink escapes fail closed; cross-file forbidden edges and cycles are reported before commit.
- **T03 optional architecture change map:** strict schema `1.0` describes canonical operations,
  resolved layers, and local edges. CLI/MCP preflight binds its deterministic hash; no map is
  installed by default. Both published schema subpaths are parity-checked with the Domain contract.
- **T04 honest structural convergence:** map-enabled preflight compares the explicit complete
  candidate with the current supplied base through the shared analysis IR. Stable findings separate
  satisfied, missing, contradictory, and unplanned file/edge work; structural drift rejects the
  batch without writes, while every result states behavioral completion was not evaluated.
- **T05 actionable, context-independent enforcement:** blocking diagnostics expose one deterministic
  `nextAction` across JSON and human output. Doctor and hook repair JSON separate supported,
  installed, active, and bypassable enforcement with evidence and operation coverage; MCP-only and
  locally unverifiable required-status state remain labeled honestly.
- **Complete-patch hook parity:** governed Codex `ApplyPatch` create/update/delete sets use the same
  atomic preflight as CLI/MCP before per-file safety checks, catching batch-only edges and cycles.
  Codex remains advisory/bypassable at the host level.
- **Fixed Phase T evaluation:** `npm run eval:change-integrity` proves identical no-context hashes and
  verdicts, CLI/MCP/hook/final diagnostic parity, one concise casual denial, prewritten feature
  acceptance, and strict Ark green without a live LLM or required planning file.
### Fixed

- **Compatibility/release:** analysis-result `1.1` preserves `1.0` TypeScript values; first-push
  zero SHAs and resumable npm release assets are handled safely.

Release note: `docs/releases/3.1.0.md`.

## 3.0.5 — 2026-07-14

Codex host skill catalog + residual honesty. **No breaking** CLI or `ark.config.json`
changes. **No gate weaken.**

### Fixed

- **Codex `/ark-*` skills not invocable:** install wrote flat `.codex/prompts/*.md`, which
  Codex does not load as skills. Repo catalog is now `.agents/skills/<name>/SKILL.md`
  (Agent Skills REPO scope); optional home catalog is `$CODEX_HOME/skills/<name>/SKILL.md`
  via `--codex-home`. Post-install verifies AGENTS.md `/ark-*` refs against each selected
  host catalog.
- **Temp-root MCP footgun:** `--codex-home` no longer rebinds primary `[mcp_servers.ark]` in
  the default `~/.codex/config.toml` when the project root is a temp/upgrade path (skills may
  still refresh under an isolated or real home).
- **Multi-host skill hints:** Codex legacy-prompts-only debt no longer suppresses missing/stale
  skill reports for Claude/Cursor/other hosts in doctor and `ark-check` human output.
- **Deferred Codex home debt severity:** outside a Codex session, home skill gaps are dim/info
  (not warn) and are not Top actions; when the session host is Codex they stay warn + fix.

### Added

- **Skill parity sensors:** missing / stale / legacy-prompts-only for repo and home catalogs,
  with package `arkVersion` stamps; doctor and JSON expose concrete refresh fixes
  (`--skills-only --tools codex` and/or `--codex-home`).
- **CI fail-closed detection:** workflows with ark-check but only `--strict-config` (or no
  strict flags) surface `enforcement-ci-not-fail-closed` (warn) with a `--strict-merge` fix.
  `--strict` / `--strict-merge` / `--require-gates` count as fail-closed. Merge-gate inventory
  evidence requires that fail-closed profile.
- **Codex write-path honesty:** install and doctor state local Codex write is advisory (MCP +
  best-effort hooks; not Claude/Grok hard-write + repair); CI `--strict-merge` + required
  status is the hard merge backstop.

Release note: `docs/releases/3.0.5.md`.

## 3.0.4 — 2026-07-14

Report honesty + showcase depth patch. **No breaking** CLI or `ark.config.json` changes.
**No gate weaken.**

### Fixed

- **HTML report false ADAPT:** `computeReportFitness` counted *any* `optional: true` layer
  with files as `coreOptionalWithFiles`, so doctor could report **ENFORCE** while
  `ark-report.html` / `latest.json` mode stayed **ADAPT** (secondary layers like
  SharedKernel / Integration / Workflow). Report now uses the same `CORE_LAYER_NAMES`
  filter as doctor adoption (`DomainModel`, `ApplicationOrchestration`,
  `PresentationAdapters`, `PersistenceAdapters`).
- **False adoption gap `write-path-none` on report/CI:** when `activeHost` is `unknown`
  (plain `npx ark-check --report` outside an agent session) but the repo inventory already
  has hard-write hooks or advisory MCP for Claude/Grok/Cursor/Codex, doctor/report no longer
  open a `write-path-none` adoption gap. Session projection still reports `mode: none` for
  honesty (other hosts' hooks are not a guarantee for this process). `detectActiveAgentHost`
  also recognizes `GROK_AGENT`.

### Added

- **Report metric hints:** HTML showcase KPIs (hero, adoption, contract density, debt) show
  plain-language micro-copy under each tile plus native tooltips; PASS/mode badges and score
  parts (Coverage/Clean/Gates/Rules) explain what they mean for newcomers.
- **Report design-depth strip:** `ark-check --report` includes doctor-parity Shape residual
  (design-weak badge, smell outcomes, one next pilot, post-green door, optional golden pattern).
  Clean ENFORCE with no smells shows a short “Design depth · OK” note (only when sensors ran).
- **Report adoption extras:** write-path line (active host · mode · inventory on disk) and a
  fixed baseline-policy legend (`keep-empty` / `active-ratchet` / `absent`).

Release note: `docs/releases/3.0.4.md`.

## 3.0.3 — 2026-07-13

### Added

- **Post-green path (Q01):** when design residual remains under edge-clean ENFORCE, doctor
  JSON exposes `postGreenPath` / `primaryNextAction` / `healthyFinishedForbidden` for a single
  “clarify for AI / Shape” door (`clarify-for-ai`). Skill routing maps messy/design-weak work
  to that path — no skill shopping.
- **Smell outcomes (Q02):** each stable `designSmells[]` id carries plain-language `outcome`
  for newbies; technical `message` retained; doctor human prints outcome first.
- **Golden pattern (Q03):** optional `.ark/golden-pattern.json` (`name` + `norm`, optional
  `newCodeHome` / `examplePath`). Surfaced on `ark_place`, `ark_prepare_write`, and
  `doctor.goldenPattern` as **advisory for NEW code only**. Absent is OK; never ENFORCE;
  never clears design-weak; malformed fails closed.
- **Pilot loop (Q04):** `plan.pilotLoop` / `doctor.pilotLoop` select **one** next extraction
  card (`nextPilot`: pilot target, move, success, kill-switch). One pilot → re-doctor;
  residual outside the pilot may remain; never multi-pilot batch; never mechanical-safe.
- **AI-velocity eval (Q05):** `npm run eval:ai-velocity` compares the same fixed feature
  scenario on design-weak vs golden-path arms. Metric `placementTurns` (agent-equivalent);
  golden must be strictly better. Fixture-measured (no live LLM); method string lives next
  to the number in `eval/ai-velocity-report.json`.
- **Skills:** `/ark-place` honors golden; explore/autopilot document pilot loop; `/ark-explain`
  opens `ark-report.html` in the default browser after generating the showcase report.

### Documentation

- package-surface, agent-guide, brownfield pilot-loop section, eval README, Phase Q ROADMAP
  evidence for Q01–Q05. Release note: `docs/releases/3.0.3.md`.

## 3.0.2 — 2026-07-13

### Documentation

- Sync consumer-facing agent docs with 3.0.1 design-depth skills: `designFitness` /
  `patternBets`, extraction cards, dual-plan B honesty in agent-guide, AI gates, and the
  autopilot demo. Release note status for 3.0.1 marked published.

## 3.0.1 — 2026-07-13

### Added

- **Design fitness (doctor):** deterministic `designSmells` and `designFitness` on
  `ark-check --doctor --json` / human doctor. Edge-clean ENFORCE can report
  **ENFORCE · design-weak** when lived design residual remains (e.g. facade SQL in routes,
  handlers in persistence, god modules, domain logic in UI, soft contract, mixed patterns).
- **Plan pattern B:** `ark-check --plan --json` includes `patternBets[]` with pilot, success
  signal, kill-switch, and `neverMechanicalSafe: true`. Never auto-applied by loop/autoPatch;
  `goal.met` remains edge honesty only.
- **Skills (Phase P):** clearer When/not when routing; explore Shape ladder and dual-plan B;
  coverage narrowed to Ark fitness; adopt/autopilot seed Shape residual; extraction-card
  template in brownfield docs and skills.
- **Fixture:** `tests/fixtures/design-weak-enforce` for ENFORCE + design-weak honesty.

### Fixed

- Module budget for `bin/lib/doctor-plan.mjs` raised to match the design-depth surface.

## 3.0.0 — 2026-07-13

### Added

- **Compact active-host onboarding:** `ark start` now asks for the active host on a TTY (or
  detects it non-interactively), writes at most five project files / 25 KB, and uses one
  package/MCP-backed router instead of copied per-host skill packs. It does not alter
  `package.json` unless `--install` is explicit; host removal and re-addition are previewed,
  safe, and reversible.

- **Canonical analysis engine bundle:** graph policy, cycle evaluation, and configuration
  diagnostics now have one Kernel implementation shared by the library, CLI, and MCP. A documented
  standalone CLI bundle preserves the package's self-hosted boundary and is protected by a CI drift
  check and Kernel/bundle parity fixtures.
- **Symbol-aware semantic analysis:** one Kernel extractor now resolves forbidden ambient
  capabilities through local symbols, aliases, `globalThis`, static keys, and destructuring, and
  classifies TS/JS dependency forms across ESM, CommonJS, type-only, and unresolved dynamic edges.
  CLI, safety diagnostics, and AICodeGate consume the same generated implementation. The supported
  soundness envelope is documented and guarded by a labeled adversarial corpus plus TypeScript
  5/6/7 and mutation matrices.
- **Versioned adapter parity:** CLI JSON, MCP structured results, write hooks, ESLint, and the
  GitHub Action now expose the same `ark.analysis-result` v1 diagnostics. A generated JSON Schema,
  committed compatibility fixture, exact golden corpus, and mandatory CI parity job prevent
  adapter drift; source-policy decisions no longer live privately inside ESLint.
- **Runtime package isolation:** the next-major `arkgate` root now contains only gate APIs. The
  optional runtime and NestJS adapter build independently as experimental `@arkgate/runtime`;
  deprecated subpath shims contain no implementation. The non-atomic store is now presented as
  `InMemoryEventBuffer`, with production recovery and durability requirements made explicit.

### Fixed

- **Deterministic offline setup tests:** `ark start` fixtures that do not exercise installation now
  pass `--no-install`, preventing a published current version from turning unit tests into registry
  installs.
- **Node 26 watch fallback:** `ark-check --watch` falls back to bounded polling when recursive
  `fs.watch` fails asynchronously with `EMFILE`, instead of crashing the watcher process.

## 2.13.0 — 2026-07-11

- Added the stable, deterministic analysis IR and public in-memory API: `loadContract`,
  `analyzeProject`, `analyzeChange`, and `explainViolation`.

### Fixed

- **Temp-worktree release verification:** Codex multi-project fixtures now keep the simulated
  primary project outside temp-root policy even when the repository itself is checked out under
  `/tmp`, so the release confidence gate is reproducible without weakening fail-closed temp MCP
  rewrites.
- **Test and Codex-home isolation:** Vitest now redirects `CODEX_HOME` to a disposable test home,
  so direct helper calls and spawned CLIs cannot rewrite the developer's real Codex config. Temp
  project installs also recognize an explicitly exported default `~/.codex` as the real home and
  skip implicit MCP rewiring unless `--codex-home` is requested.
- **Workflow retry boundary:** `RetryPolicy` now retries only `step.execute` failures and
  timeouts. A snapshot-store or completion-audit failure after a successful effect is terminal,
  enters compensation, and never executes the completed effect again.
- **Scanner bypass corpus:** forbidden-global checks now use single-file TypeScript symbols, so
  local `fetch` / `Date` bindings do not false-positive while ambient aliases and
  `globalThis.Date.now()` remain violations. CLI, AICodeGate, and ESLint share the verdict.
  TypeScript `import x = require('...')` now creates a dependency edge, and direct
  `require(expr)` emits `DYNAMIC_REQUIRE_NOT_ALLOWLISTED` (strict profiles fail unless the file
  is reviewed in `dynamicImportAllowlist`). The scan cache is versioned past the old semantics.

### Added

- **Versioned configuration contract:** `ark.config.json` now carries `$schema` and
  `schemaVersion: "1.0"`. One canonical loader validates and migrates the contract for CLI, MCP,
  and ESLint with path-specific diagnostics and a fail-closed unknown-key policy. The generated
  JSON Schema ships at the stable `arkgate/schema` subpath; unversioned configs from the previous
  major migrate deterministically in memory.
- **Active-host enforcement capabilities:** doctor and adoption checks now project
  `hard-write`, `advisory-write`, `merge-gate`, and `repair-payload` from the active host only,
  with evidence paths and a separate repo-wide inventory. Claude/Grok hooks can no longer make
  Codex, Cursor, or an unknown host appear hard-enforced; human doctor output names the host and
  separates advisory MCP checks from the shared CI check and its external required-status policy.
- **Host-compatible enforcement profiles:** generated CI now uses `--strict-merge`, while
  `--strict` remains a compatibility alias; neither depends on an editor hook. The optional
  `--require-write-hook <host>` check verifies Claude/Grok explicitly, reports Cursor/Codex as
  advisory-write plus the shared CI check only, and makes `ark start` reject impossible,
  mismatched, or preserved-incompatible requests before writing project files.
- **Executable regression confidence gate:** `npm run test:confidence` now combines the existing
  broad Vitest coverage thresholds with real Stryker mutation testing over write-path detection,
  dependency extraction, forbidden-global detection, baseline keys, and workflow retry logic.
  CI and both npm release paths invoke the same gate; mutation score fails below 90%.
- **Q2 repair dogfood closed:** deny → `ARK_REPAIR_JSON`/`autoPatch` → host re-inject →
  revalidation allow proven via shipped `bin/ark-mcp.mjs` (Claude/Grok hooks already
  `--hook-repair`; `doctor.writePath.mode = repair`).
- **Q3 weakest-link sensors:** `bin/lib/weakest-link.mjs` + doctor adoption gaps
  (`enforcement-ci-*`, config drift, pre-commit missing); maintained
  `templates/hooks/pre-commit-ark`; optional `ARK_DOCTOR_GITHUB=1` branch-protection
  report (honest unavailable / not-protected — never fake green).
- **Q5 scale bench:** `scripts/ark-scale-bench.mjs` / `npm run bench:scale` (real
  ark-check cold/warm p50/p95 on generated trees).
- **Q6 module budgets:** `scripts/check-module-budgets.mjs` / `npm run check:module-budgets`.
- **Q8 fault-injection tests:** compensation failure audit, cancellation-ignoring timeout,
  outbox retry attempts + clear (durability boundary).
- **Q9 threat model + package allowlist:** `docs/threat-model.md`,
  `scripts/verify-package-files.mjs` / `npm run check:package-files`.

### Changed

- **Product identity retained:** ArkGate, `arkgate`, the `arkgate*` / `ark*` commands,
  `ark.config.json`, `ark://`, `ARK_*`, the existing GitHub repository, and `arkgate.online` remain
  canonical. The unpublished local rename experiment was reversed before any external cutover.
- **Truthful host support matrix and runtime status:** one capability-backed matrix now drives
  README and generated `AGENTS.md` guarantees for Claude, Grok, Cursor, and Codex. Doctor exposes
  both the supported host profile and repository evidence; public docs distinguish hard local
  hooks, advisory MCP, CI checks, and required-status merge blocking. The optional runtime/Nest
  surface is explicitly experimental and is not required for architecture-gate adoption.
- **Active host vs deferred Codex on upgrade/doctor:** `/ark-upgrade` greens the
  **session host** first; Codex `$CODEX_HOME` prompts/MCP multi-project debt is
  **deferred** when the session host is **known and not Codex** (Grok/Claude/Cursor).
  Unknown host (CI/plain shell) keeps original severity. Doctor marks deferred gaps
  `deferred: true` (severity `info`), prefixes the message, and omits them from Top
  actions. Temp/upgrade MCP `--root` stays urgent (fail-closed). New helpers:
  `detectActiveAgentHost`, `codexConcernIsActive` (do not treat `CODEX_HOME` alone
  as Codex). `ark-check` advisory for stale Codex-home skills notes the deferral.
  Completion contract adds **Active host** / **Deferred hosts**.
- **ROADMAP Track Q:** Q2 `done`; Q3/Q5/Q6/Q8/Q9 `doing` with residual external/DoD
  items listed; Q4/Q7/Q10 remain `todo` (no false complete).

## 2.12.0 — 2026-07-10

### Fixed

- **Install agent gates on temp roots:** skip rewriting the developer's real
  `~/.codex/config.toml` when the project root is a temp/upgrade scratch and
  `CODEX_HOME` is unset. Home MCP wire failures no longer fail an otherwise
  successful repo gate install (sandbox/EPERM). Explicit `CODEX_HOME` and
  `--codex-home` still wire as before.
- **Q1 coverage floors (broad include, 80/85/95):** Vitest thresholds statements/lines **≥80%**,
  branches/functions **≥85%** on the **full product unit surface** (`src/**` + `bin/lib/**` +
  `bin/ark-shared.mjs`; only process-entry shells excluded — no cherry-picked enforcement-core
  include). Per-path critical floors: write-path-detect / auto-patch / prepare-write /
  safety-diagnostics / baseline-key / graph-cycles at **≥95%** branch. Real branch-driving tests
  under `tests/unit/static-check/` (critical + surface/topup/seam suites). Two consecutive
  green `npm run test:coverage` captures (stmts/lines **92.71%**, branches **85%**, functions
  **94.76%**; critical modules all **≥95%** branch).
- **agent-gates modularization:** thin facade (`bin/lib/agent-gates.mjs` ~100 LOC) re-exports
  `gate-files`, `skill-install`, `ci-and-commands`, `mcp-adoption`, `install-migrate`,
  `typescript-host`, `hook-templates`, `write-path-detect`, plus field/codex helpers.
  `detectDeployPathQuality` extracted to `bin/lib/deploy-path.mjs` so `mcp-adoption.mjs` stays
  under the 600 LOC module budget. Import hygiene on extract modules; `loadTypeScript` uses
  `__arkCheckCli` for the nested arkgate TypeScript fallback.
- **Deny→repair CI proof:** `tests/unit/static-check/writePathDetect.test.ts` drives
  shipped `bin/ark-mcp.mjs --hook --hook-repair` and asserts `ARK_REPAIR_JSON` /
  `ARK_AUTOPATCH_JSON` on deny (exit 2); reject-only without repair flag still supported.
- **Dogfood write path repair:** local Claude/Grok hooks use `--hook-repair`; doctor
  reports `writePath.mode = repair` on this tree.
- **Self-hosted AGENTS.md:** `--install-agent-gates --force` no longer overwrites library
  mother-repo Identity (`skipped-self-hosted`).
- **hexagonal-order-api:** `safety.allowInMemory` for ephemeral demo kernel; prefer
  `arkgate/runtime` imports; `npm run check` green under `--strict-config`.
- **multi-app / monorepo rules:** deny App→Persistence, Presentation→Domain, and
  Persistence→Presentation (parity with crud-product starter).
- **Generated CI Node default lags local npm (again):** when a project had no
  `.nvmrc` / `engines.node`, the Ark architecture gate workflow defaulted to
  Node 22. Lockfiles written on Node 24/26 then failed `npm ci` with
  "Missing: … from lock file" before `ark-check` ran — CI green, Ark red.
  Detection order is now `.nvmrc` / `.node-version` → `engines.node` → **highest
  `node-version` from sibling workflows** (excludes `ark-check.yml` so a stale
  gate cannot re-pin itself) → default **24**. Refresh existing gates with
  `ark-check --install-agent-gates --force` (or edit `node-version` in
  `.github/workflows/ark-check.yml`).

### Changed

- **Hook templates extracted** to `bin/lib/hook-templates.mjs` (agent-gates seam).
- **Write-path detect extracted** to `bin/lib/write-path-detect.mjs` (doctor W5; re-exported
  from agent-gates).
- **Coverage thresholds** raised to Q1 floors on the broad include set: statements/lines **≥80**,
  branches/functions **≥85**, critical write/safety modules **≥95%** branch (see Fixed above).
- **`/ark-explore` skill:** decision-grade recon — field path (run starters/checks),
  installed hooks vs install templates, coupling via fan-in/exports (not LOC alone),
  ranked “así te lo re-soluciono” rows only when residual changes action; ENFORCE /
  empty plan treated as baseline, not the story. **v2.1:** output modes (recon vs
  dual-plan seed, no multi-week roadmaps by default); path-correct vs design-correct
  + semantic false-green; success signals and kill-switches on bets (anti-vanity).
- **`/ark-autopilot` skill:** explore-first (decision-grade), **dual plan** —
  A remediation from `--plan` + B pattern/evolution bets (never auto-apply B as
  mechanical-safe); empty plan no longer means “healthy” without explore/B.
- **Day-zero origin first:** `ark start` / `ark init` freeze `.ark/reports/origin.*`
  immediately after `ark.config.json` exists and **before** agent docs, skills, and CI
  templates. Later `--report` still shows evolution vs that snapshot.

## 2.11.0 — 2026-07-10

Fail-closed enforcement hardening: `--strict` now combines contract coverage, installed-gate
checks, write-hook presence, and bypass diagnostics in one CI profile. The GitHub Action runs
the exact checked-out revision by default, and runtime workflows cancel timed-out work
cooperatively.

### Added

- **Strict CI profile:** `arkgate-check --strict` enables strict config validation, requires
  generated gates plus a PreToolUse write hook, and fails on configured safety diagnostics.
- **Bypass diagnostics:** new `dynamicImportAllowlist` and `safety` config fields detect
  non-literal dynamic imports, TypeScript suppression directives, explicit `any` casts,
  production InMemory defaults, and disabled or omitted peer isolation. `--doctor --json`
  exposes the same evidence under `doctor.safety`.
- **Release-quality CI:** JavaScript syntax validation, enforced coverage thresholds, and a
  Node 18/20/22/24 compatibility matrix now run before merge.

### Changed

- **Pinned GitHub Action execution:** `uses: pedroknigge/arkgate@<tag-or-SHA>` now runs that
  checked-out ArkGate source. The `version` input remains available only as an explicit exact
  npm compatibility override.
- **Complete MCP contract:** `ark://manifest` exposes every configured file layer separately
  from runtime intent layers, plus reviewed dynamic-import and safety policy.
- **Workflow cancellation contract:** workflow steps receive an `AbortSignal` as their third
  argument. `timeoutMs` aborts that signal, clears the active step, and rejects duplicate step
  names before execution can corrupt compensation order.
- **Filesystem confinement:** source scans follow internal symlinks once and reject symlinks
  that escape the project root.

### Fixed

- **Baseline duplicate honesty:** repeated violations now receive stable per-occurrence keys,
  so adding a second identical violation is new debt instead of being hidden by one baseline
  entry.
- **Write-hook duplicate honesty:** proposed writes compare violation counts, preventing a new
  duplicate from being mistaken for an already-existing violation.
- **CLI argument safety:** unknown flags and missing flag values fail with usage guidance
  instead of silently weakening enforcement or throwing an internal error.
- **Action gate detection:** repositories using the ArkGate composite Action satisfy the CI
  gate check without needing a separate literal `ark-check` command.

## 2.10.0 — 2026-07-10

Track W — **Constrained write → verified repair**: write-boundary autoPatch, prepare_write,
loop-cost measurement, opt-in hook repair payloads, doctor write-path awareness, and a
proof-gated port-inject transform (judgment for auto-apply).

### Added

- **W1 write-boundary autoPatch:** `validate_code` and PreToolUse `--hook` may return
  additive `autoPatch: { source, remediationKind, confidence, valid }` for mechanical-safe
  **import type** rewrites (`import-type-from-pure-type-module`, `import-type-of-type-exports`).
  Post-patch revalidation must be green or the patch is discarded (never silent write).
  Implementation: `bin/lib/auto-patch.mjs`.
- **W2 `ark_prepare_write` MCP tool:** place + constrain + validate + optional autoPatch +
  judgmentBrief + contentHash in one call (`bin/lib/prepare-write.mjs`). Composes
  `ark_place` + write gate — not a second contract.
- **W3 loop-cost eval harness:** `eval/loop-cost-run.mjs` / `npm run eval:loop-cost`
  records turns-to-green, optional tokens, CHEATED (fixture-measured). Baseline
  `eval/loop-cost-baseline.json` (medianTurnsTypeOnly=1, cheatedRate=0).
- **W4 opt-in hook repair payload:** `--hook-repair` / `ARK_HOOK_REPAIR=1` on deny emits
  `ARK_REPAIR_JSON` + `ARK_AUTOPATCH_JSON` (stderr) and optional Grok `autoPatch` (stdout).
  Default `--hook` remains hard-block prose only. Install templates (Claude/Grok) include
  `--hook-repair`. Never silent write.
- **W5 doctor write-path awareness:** `ark-check --doctor` (JSON + human) surfaces
  `writePath.mode` (`repair` | `reject-only` | `mcp-only` | `none`) and
  `prepareWrite` / `autoPatch` flags from installed hooks/MCP. Reject-only gap is
  additive (info) with install fix.
- **W6 port-proof inject binding (eval-gated):** prove+transform for
  `port-proof-inject-binding` — single named value import used only as
  `binding.method(...)` inside function declarations. Removes the import, emits a
  port type, injects the binding as a parameter (call sites preserved). **Judgment for
  auto-apply** (call arity changes; not write-path autoPatch). Fail-closed static proof;
  rest params refuse apply. Labeled eval case. Implementation: `bin/lib/port-proof.mjs` +
  scan flag `portProofEligible`.

### Changed

- **Write gate type-only edges:** `import type` / `export type` no longer hard-block
  LAYER_IMPORT / infra heuristics on the write path (erased at runtime). Value imports
  and peerIsolation still deny. ark-check plan continues to surface type placement debt.
- **`ark_prepare_write` isError:** always `isError` when proposed source is invalid
  (autoPatch is additive recovery, not soft-success).
- **`resolveImportFileAbs`:** confines disk reads under project root (no path escape).

## 2.9.2 — 2026-07-09

Skill surface hardening: dual-engine, explore, STOP handoffs, AGENTS routing, subagent fan-out.
**No intentional CLI flag or JSON shape breaks.**

### Added

- **`/ark-explore` skill:** exploratory architecture reconnaissance — product map, entry
  points, coupling hotspots, false-green risk, ranked *suggestions* (not only residual
  violations). CLI remains a sensor; host agent reads the real tree.
- **Skill completion contract:** every `/ark-*` template ends with fixed
  `### Completion` fields (Sensor / Opened / Result / Handoff / Incomplete?) —
  **skill incomplete if missing**.
- **Hard STOP handoffs:** critical paths (false-green, concentrated edge, bulk debt,
  wrong skill) use `STOP — do not continue this skill as complete` + named next skill.
- **AGENTS skill routing table:** trigger → skill map in generated `AGENTS.md` while
  keeping `/ark-autopilot` as the default when unsure.
- **Subagent fan-out protocol:** every `/ark-*` skill documents optional **parallel
  subagents** when the host supports them (disjoint read-only scopes + parent merge);
  otherwise **fall back to sequential**. AGENTS.md repeats the rule.

### Changed

- **Skills dual-engine (deterministic + exploratory):** **all** shipped skill templates
  require dual-engine behavior (CLI sensor + real source/product pass where applicable).
  Plan empty ≠ architecture healthy without explore. Refresh installed skills with
  `ark-check --install-agent-gates --skills-only --force`.

## 2.9.1 — 2026-07-09

Field-install honesty: non-TTY start, baseline→CI sync, pin, false-green soft block, Grok defaults.
**No intentional CLI flag or JSON shape breaks.**

### Fixed

- **Non-TTY `ark start` / `ark init`:** when stdin/stdout are not a TTY and `--yes` was
  omitted, guided setup no longer throws on a null readline interface. Non-interactive
  sessions use the same defaults as `--yes` (agents never hang on prompts).
- **Baseline → CI/scripts sync:** after a successful `--update-baseline`, existing
  `package.json` scripts and GitHub Actions workflows that already run `ark-check` gain
  `--baseline .ark-baseline.json` without a full `--force` reinstall of gate templates.
- **Grok in default agent tools:** no-signal `--install-agent-gates` now installs
  claude + cursor + codex + **grok**; `GROK_BUILD` / `XAI_GROK` env also adds Grok when
  other hosts are detected.

### Added

- **`start` pins `arkgate` as a devDependency** (opt out with `--no-install`) so CI/`npx`
  are not forced to rely on a stale global install.
- **False-green contract soft block:** doctor adoption gap
  `contract-false-green-io-under-application` when Domain/Persistence are empty while
  Application globs still cover I/O dirs (airtable/supabase/prisma/…). `ark start`
  wrap-up and `/ark-autopilot` steer to `/ark-adopt` / `/ark-contract` instead of pure
  ENFORCE victory.
- **`bin/lib/field-install.mjs`:** field-install helpers (baseline sync, pin, false-green)
  extracted from the agent-gates surface for scannability; re-exported from `agent-gates.mjs`.

### Changed

- **Public ROADMAP:** active backlog is **Track W** (constrained write → verified repair:
  W1–W6). Finished foundation tracks live under Shipped.

## 2.9.0 — 2026-07-09

Track P: slice isolation, vertical-slice + DDD presets, skill surface, and adoption depth.
**No intentional CLI flag or JSON shape breaks** for existing presets; new rules/presets are opt-in.

### Added

- **`peerIsolation` edge rules (P0):** opt-in cross-slice bans
  (e.g. `features/auth` ↛ `features/payments`). Optional `sliceFolders`.
  Wired in `ark-check`, ESLint, write-gate, remediation (`cross-slice-boundary`, judgment).
- **`vertical-slice` preset (P2):** Features / Shared / Lib / App with peerIsolation on
  Features. `ark init --preset vertical-slice`. CLI help and fit scoring include all
  public presets (`ui-surface` documented).
- **P3 vertical-slice adoption surface:** playbook archetype `vertical-slice-product`,
  signal `verticalSliceLayout`, policy pack `enthusiast-vertical-slice`, gallery
  `examples/vertical-slice-starter/` (strict-config green).
- **P4 `ddd-bounded-contexts` preset:** contexts/*/domain|application|presentation|infra +
  SharedKernel; peerIsolation matrix blocks **any** cross-context import (same or
  cross technical layer). Archetype, pack, gallery starter.
- **Skills (S1/S3):** architect/place/fix/adopt/autopilot know vertical-slice + DDD;
  new host-only `/ark-think` skill (no package LLM). Refresh installs with
  `ark-check --install-agent-gates --skills-only --force`.
- **Eval corpus (S5):** `eval/cases/vertical-slice-cross-feature` labeled peerIsolation case
  (`cross-slice-boundary` fixClass, judgment).
- **S2 recommend/doctor:** JSON/human output includes `galleryStarter` + `policyPack`; wizard
  choices for vertical-slice and DDD; doctor new-here lines for Nest modular and monorepo tooling.
- **P5 monorepo depth:** default include falls back to `packages`/`apps`/`libs`; detect
  `turbo.json` / `nx.json`; playbook boosts multi-app-workspace on monorepo tooling.
- **P6 FSD patterns:** feature-sliced accepts `src/<layer>/**` and root `<layer>/**` (app/pages).
- **P7 aliases:** `clean-architecture` and `onion-architecture` → hexagonal factory.
- **P8 Nest guidance:** agent-guide + doctor tip (hexagonal vs ddd-bounded-contexts).

### Changed

- **Same-layer deny semantics (locked):** classic `{ allowed: false }` without
  `peerIsolation` never blocks same-layer edges (historical short-circuit restored /
  confirmed). Only `peerIsolation: true` may deny, and only when slice ids differ.
- **`peerIsolation` applies cross-layer too:** when set, deny only if slices differ
  (enables honest DDD inter-context isolation for e.g. application→domain across contexts).
- **`FRAMEWORK_INTERNAL_EXCLUDE`:** `src/kernel/**` + `**/src/kernel/**` only — no longer
  `**/kernel/**` (which carved out `src/shared/kernel/**`).
- **Write-gate import resolve:** single `resolveImportTarget` primitive in
  `bin/lib/import-resolve.mjs`; `ark-mcp` entry stays under 1000 LOC.
- **Gallery starters:** `npm run check:gallery-starters` fails on factory drift;
  `generate:gallery-starters` rewrites configs from presets.

## 2.8.3 — 2026-07-09

Field residuals + official site: core ratchet to honest ENFORCE, typecheck bootstrap,
host-token scrub, arkgate.online homepage. **No intentional CLI flag or JSON shape breaks.**

### Added

- **`--ratchet-cores`:** when architecture is green (0 active violations, governed ≥ 50%),
  set `optional: false` on **populated** core layers only so doctor can report **ENFORCE**
  honestly. Empty cores stay optional (no false-ENFORCE theatre). Doctor core-optional gaps
  point at this command; `/ark-autopilot` documents the step after goal.met.
- **Typecheck bootstrap:** `ark start` / `--install-agent-gates` add `"typecheck": "tsc --noEmit"`
  when `tsconfig.json`/`jsconfig.json` exists and no typecheck-like script is present; generated
  CI includes the typecheck step. Existing scripts are never overwritten.

### Changed

- **Official website:** product homepage is [arkgate.online](https://www.arkgate.online/)
  (`package.json` `homepage`, README badges/footer, ROADMAP identity). npm package page
  and GitHub remain source + distribution links.
- **Repo hygiene:** scrub named field-probe host identities from docs, comments, tests, and
  historical changelog wording; fixtures stay framework-generic (Nest/Next only).
- **Maintainability:** `--ratchet-cores` lives in `bin/lib/core-ratchet.mjs` (not the ark-check
  entry); typecheck detection uses shared `packageScriptsHaveTypecheck` (not full deploy-path
  scan); typecheck bootstrap is skipped under `--skills-only`.


## 2.8.2 — 2026-07-09

Field-honesty patch (Next/UI host probe): no Nest false positives, no false ENFORCE on
ui-surface bags, honest `ark start` mode, Next proxy/middleware classification.
**No intentional CLI flag or JSON shape breaks.**

### Fixed

- **Nest detection false positive:** bare `*.service.ts` / similar names no longer set
  `nestFramework` without `@nestjs/*` or controller/module/gateway/resolver files (Next/Node
  apps no longer get a spurious `nestjs+next` overlay).
- **False ENFORCE on UI bags:** doctor/report mode stays **ADAPT** when Domain+Persistence are
  empty while Presentation dominates, or when core layers with files remain `optional: true`.
- **ui-surface / Next defaults:** drop whole-`src` and bare `**/lib/**` presentation bags;
  classify conventional data clients (`lib/supabase`, `lib/airtable`, `lib/prisma`, …) as
  **Persistence**; add Application patterns for actions/services.
- **Generated CI:** when `package.json` has `lint` / `typecheck` scripts, the installed
  GitHub Actions workflow runs them before ark-check (closes deploy-path gaps for Next hosts).
- **`ark start` wrap-up mode:** prefers `ark-check --doctor` `operatingMode` over plan-only
  `resolveOperatingMode` (default **adapt**, double-lock against false **ENFORCE**).
- **Next middleware / proxy:** ui-surface + Next overlay classify `src/proxy.ts`, root
  `proxy.ts`, and classic `middleware.ts` as **Presentation** (Next 16 rename no longer
  leaves the edge entry ungoverned).
- **Idempotent Next overlay:** re-applying framework overlays no longer yields
  `frameworkOverlay: "next+next"`.

## 2.8.1 — 2026-07-09

Runtime honesty release (roadmap **R8–R9**): EventBus publish pipeline decomposition and
explicit InMemory durability stance. **No intentional CLI flag or JSON shape breaks.**

### Changed

- **R8 — EventBus decomposition:** publish pipeline split into cohesive modules under
  `src/kernel/event-bus/` (`payloadPatch`, `publishGuards`, `publishInterceptors`,
  `observedLayerFlow`, `publishPolicy`, `publishRecording`). `EventBus.ts` is
  orchestration + public surface only. **`createEventBus` API and enforcement order
  unchanged.** Snapshot of subscribers still taken before policy hooks.
- **R9 — Runtime durability stance:** built-in stores are documented as **reference
  InMemory-only** (not production durability) in README, `docs/production-hardening.md`,
  `docs/package-surface.md`, and JSDoc on `OutboxStore` / `AuditStore` /
  `ReadModelStore` / `WorkflowStore` (+ InMemory implementations). No durable adapter
  shipped — inject your own for production.

## 2.8.0 — 2026-07-09

Co-pilot quality release (roadmap **R5–R7**): labeled eval corpus, fourth mechanical-safe kind,
and Codex multi-project MCP without silent primary overwrite. **No intentional CLI flag or JSON
shape breaks** for the gate/co-pilot path.

### Added

- **R5 — labeled eval corpus:** 16 cases under `eval/cases/` (themes + labels).
  `npm run eval:corpus` / `evalCorpus.test.ts` gate without a live agent.
- **R6 — `import-type-of-type-exports`:** named type-only exports from mixed modules →
  `import type` / `export type`. Dual-space names and targets with top-level side effects stay
  **judgment**. Scan flags `namedBindingsTypeOnly` (+ `hasTopLevelSideEffects`).
- **R7 — Codex multi-project MCP DX:** no silent primary steal; scoped
  `[mcp_servers.ark_<slug>_<hash>]`; doctor gap `codex-home-multi-project`. Codex home logic in
  `bin/lib/codex-home.mjs`.

### Changed

- Scan cache schema **v6** (typeOnlyExportNames, namedBindings, hasTopLevelSideEffects;
  invalidates v5 after non-export side-effect honesty fix).
- Classifier: single early judgment for `require` / `dynamic-import` on layer edges.
- R6 honesty: impure value-export initializers (`export const db = connect()`) count as
  top-level side effects — named type imports of those modules stay **judgment**.
- R6 honesty: non-exported impure top-level initializers (`const boot = setup()`) and
  non-exported class static field calls also count as side effects (same skip-on-import-type risk).
- Codex home: single `upsertCodexMcpTable` path for primary and secondary MCP tables.

## 2.7.0 — 2026-07-09

Maintainability release (roadmap **R1–R4**): single-source layer matching, package surface policy,
`ark-check` orchestration split, and typed pure CLI helpers. **No intentional CLI flag or JSON
shape breaks** for the gate/co-pilot path.

### Added

- **`arkgate/runtime`** package subpath (ESM/CJS + types) — preferred entry for the optional
  runtime kernel. Root `arkgate` still re-exports kernel symbols for this major (compat).
- **`docs/package-surface.md`** — stable surfaces (CLI JSON, MCP, `ark.config`) vs opt-in runtime.
- **Generated pure CLI helpers:** `bin/lib/remediation.mjs`, `bin/lib/baseline-key.mjs` from
  Domain TS (`npm run generate:cli-pure` / `check:cli-pure`).
- **`ark-check` scan pipeline modules** under `bin/lib/`: `scan-files`, `config-warnings`,
  `ts-resolve`, `ast-scan`, `graph-cycles`, `architecture-scan`.

### Changed

- **R1 — layer globs SoT:** canonical `src/domain/layerMatch.ts` → generated
  `bin/ark-layer-match.mjs`; `npm run check:layer-match` drift guard in CI.
  `normalizeGlobSeparators` keeps Windows path seps without eating glob escapes.
- **R2 — package surface = product wedge:** README / agent-guide / migrate / production-hardening
  recommend `arkgate/runtime` for kernel usage.
- **R3 — `ark-check` entry slim-down:** entry is orchestration-only (~2.4k → ~1.4k LOC);
  `runArchitectureScan` owns the check pipeline. Flags and JSON shapes unchanged.
- **R4 — typed pure core:** `classifyRemediation`, `enrichViolationWithFixClass`, and
  `baselineKey` live in `src/domain/*` with generated CLI load paths; unit tests import Domain
  sources without spawning the CLI.

### Docs / CI

- CI steps for layer-match and cli-pure drift guards.
- CONTRIBUTING / AGENTS: regenerate commands after editing pure Domain algorithms.

## 2.6.1 — 2026-07-09

Field-test release: Next/monorepo honesty (frontend monorepo hosts), simplified **one-flow** UX for
humans and autonomous agents, and skills that require real source remediation—not CLI paraphrase.

### Fixed — false greens & strict CI noise (Next / monorepo)

- **Next application bag:** framework overlay classifies `src/core/**` and `**/core/**` as
  ApplicationOrchestration so monorepos like `frontend/src/core` are governed on day one
  (not left as dark matter under a “clean” plan).
- **Nested Next detection:** `collectAggregatedDeps` + scan of `frontend/`/`web`/`client` so
  `next` only under `frontend/package.json` (root arkgate-only) still enables the Next overlay
  and `app/page.tsx` path matching (middle segment optional).
- **Next noise excludes:** public assets, tool configs, and scripts are excluded by default on
  Next detection so demo JS does not pollute coverage.
- **Domain `**/types.ts` trap removed** from monorepo and ui-surface presets. Bare
  `core/**/types.ts` no longer becomes Domain and invents Domain→Application edges.
- **`CONFIG_LAYER_PATTERN_NO_MATCHES` is advisory** (`failsStrict: false`). Dead preset globs
  (`app/**`, `src/layouts/**` when `include` is `frontend`) no longer fail `--strict-config`
  alone while architecture edges are clean.
- **Empty baseline policy:** `--update-baseline` with zero violations **deletes** an existing
  empty `.ark-baseline.json` instead of leaving an orphan “is the ratchet on?” file.
- **Monorepo CI install:** generated workflow `npm install` also installs `frontend/` when
  `frontend/package.json` exists (root-only arkgate + app under frontend).

### Changed — one-flow UX (humans + agents)

- **README:** leads with **The only flow** — `ark start` → `/ark-autopilot` → `doctor`. Skills
  are escapes, not a flat curriculum. Operating modes documented as **status lights**, not
  settings.
- **`ark start` wrap-up:** always ends with the three next steps (agent autopilot, doctor,
  strict check) instead of a long mode-specific essay.
- **Generated `AGENTS.md`:** “Default agent flow (if unsure, do only this)” — autopilot first;
  other `/ark-*` skills are optional escapes.
- **Doctor operating mode copy:** plain-language Setup / Align / Guard and “you do not pick
  this mode”.

### Changed — skills (deep co-pilot, not CLI wrappers)

Templates under `templates/skills/` (and project `.grok/skills` copies) for at least:

`ark-coverage`, `ark-autopilot`, `ark-loop`, `ark-adopt`, `ark-fix`, `ark-contract`

- **Anti-wrapper rule:** must read real source; CLI is a sensor.
- **“Así te lo re-soluciono”** remediation deliverable (file-level plans).
- **Adopt / contract:** mine loose business rules into the Ark **manifest** (layers,
  `intentPrefixes`, Domain placement, intent naming)—not config vibes only.

### Tests

- Fixture-style unit tests drive real `bin/ark-check.mjs`: Next core governance; frontend monorepo-like
  monorepo (`frontend` + `core/**/types.ts` not Domain); strict-config with dead globs;
  empty baseline removal.

### Also in 2.6.1 train (from Unreleased product priorities)

- Empty-scope honesty, auto-include TS packages, AGENTS non-clobber, `--adopt-contract`,
  UI surface preset, MCP place/suggest-include, Codex multi-project, deploy-path adoption
  gaps, soft cycle policy, Rush/Lerna monorepo roots, type-only cycle graph, default skip
  `*.gen.ts` / `*.generated.ts`.

## 2.6.0 — 2026-07-09

### Changed — maintainability hygiene (#11 / #12)

- **`bin/ark-check.mjs` modularized** (~5.8k → ~2.1k lines of orchestration):
  `bin/lib/agent-gates.mjs`, `html-report.mjs`, `doctor-plan.mjs`, `violations.mjs`,
  `suggestions.mjs`, `presets.mjs`. Entry owns scan/CLI only.
- **Layer matching single algorithm:** pure matcher in `bin/ark-layer-match.mjs` (CLI) and
  `src/domain/layerMatch.ts` (eslint). Tooling may import DomainModel for that pure helper.
  `tests/unit/static-check/layerMatchParity.test.ts` locks both implementations.
- Dual-driver ESLint/CI tests retained.

### Fixed — field test (Codex + Grok on random repos)

- **`--report` path display:** absolute report paths no longer print as brittle
  `../../../../tmp/...` relatives; paths outside the project root print absolute.
- **`ark-check --help`:** documents dual bins `arkgate-check | ark-check`.
- **`ark-check --version` / `-V`:** prints package version (no longer runs a full check).
- **Doctor thin-coverage honesty:** when there are zero violations but governed &lt; 50%
  (or empty scope), doctor no longer claims “code matches the contract”; it warns that
  green is not yet honest enforcement.
- **Grok write-gate hooks:** root env
  `${GROK_WORKSPACE_ROOT:-${CLAUDE_PROJECT_DIR:-.}}` (Grok → Claude alias → cwd).
- **AGENTS / package / Cursor check command:** if `.ark-baseline.json` exists, emitted
  `ark-check` commands include `--baseline .ark-baseline.json` (same ratchet as CI).

## 2.5.0 — 2026-07-09

### Added — ESLint ↔ CI layer parity

- **`arkgate/eslint`** `no-domain-infra-imports` is **config-driven**: loads
  `ark.config.json` (walk-up from the linted file), classifies layers with the same
  glob specificity + `exclude` semantics as `arkgate-check`, and denies edges from
  `rules[]` — not path-token “domain/infra” heuristics alone.
- Relative imports resolve to on-disk TS/JS targets; type-only and value imports both
  fail when the edge is denied (same pass/fail as CI).
- **`no-forbidden-globals`** reads `forbiddenGlobals` from the matched layer in
  `ark.config.json` (no invented defaults for layers without a purity list). Optional
  rule option `globals` still overrides. Domain path heuristic + defaults only when
  no config is found.
- Dual-driver tests: same fixtures → ESLint rule + `ark-check --json` agree.
- Recommended config enables `ark/no-forbidden-globals`.
- Without `ark.config.json`, legacy domain→infra path heuristic remains for bare trees.
- **ESLint 8–10 filename API:** rules read `physicalFilename` → `filename` → `getFilename()`
  so config walk-up works on ESLint 10 (where `getFilename` was removed).

## 2.4.0 — 2026-07-08

### Added — Adoption completeness (P0–P2)

- **`collectAdoptionGaps`** shared classifier: incomplete agent hosts (detected dirs
  without skills/hooks), dual-bin MCP argv, Codex home temp/wrong root, core layers
  still `optional` while populated, missing origin report, baseline policy signal.
- **`--doctor` / `--doctor --json`**: Adoption section + `doctor.adoption` JSON (separate
  from fitness score); fix commands on each gap.
- **Codex home fail-closed:** `wireCodexMcp` rewrites temp/`ark-upgrade` roots and stale
  bins to absolute project root + single `arkgate-mcp` even without `--force`.
- **P1:** `ark start` / `ark init` nudge origin report + doctor; HTML report **Adoption**
  card (hosts, MCP, origin, core optionality, baseline) distinct from score ring.
- **P2:** Educational presentation-heavy / thin-domain note in senior diagnostics;
  `templates/tests/ark-adoption-gaps.test.ts` structural template for consumers.

### Fixed — MCP dual-bin on upgrade

- **`--migrate-commands`** stripped only `ark-mcp` then re-prepended a bin while
  `arkgate-mcp` could remain → `args: ["ark-mcp","arkgate-mcp",…]` broke stdio MCP.
  Now strips **all** MCP bin aliases + runner noise and emits a single
  **`arkgate-mcp`**. Fresh `.mcp.json` / hooks / Codex+Grok wiring use the preferred bin.
- Doctor warns when dual bins are detected; `/ark-upgrade` skill documents the check.

### Added — TypeScript 5 / 6 / 7 compatibility bar

- **`usableTypescript` / load fallback** shared in `ark-shared.mjs`: reject modules
  without classic JS host (`ts.sys` + AST + resolve). TypeScript **7.0.x** main export is
  version-only — gate falls back to ArkGate’s nested **JS-API** `typescript@^5.9`
  (production dependency) so teams can try project TS 7 without breaking the gate.
- **CI job `ts-compat`:** matrix `typescript@5.9.3` / `6.0.3` / `7.0.2` on
  `tests/fixtures/ts-consumer` via `scripts/ts-compat-matrix.mjs`.
- **Docs:** [docs/typescript-support.md](docs/typescript-support.md) (supported ranges,
  TS7 version-only entry, tsconfig 6→7, dual-install 6+7, `ARK_DEBUG_TS`).
- Optional peer `typescript: >=5 <8` (project compiler); runtime dependency pins JS-API host.

### Docs & skills — full surface update for 2.4

- Skills (`/ark-loop`, `/ark-fix`, `/ark-autopilot`, `/ark-explain`, `/ark-upgrade`) document
  all three `mechanical-safe` `remediationKind`s and TS7 fallback notes.
- README / CONTRIBUTING / SECURITY / enthusiast track: **ArkGate** branding, dual CLIs,
  TS 5–7 badge; drop incorrect “zero dependencies” claim.
- Agent / AI-gates / brownfield / demos / migrate guide aligned with plan classifier + TS7.

## 2.3.0 — 2026-07-08

### Added — P0 complete (mechanical-safe depth + release-trust)

- **Third `mechanical-safe` remediation:** pure-type **file** relocate when the whole source
  file is type-surface only (`sourcePureTypeModule` + type-only edge) —
  `remediationKind: pure-type-file-relocate`.
- Keeps 2.2.0 classes: type-only import move; static import of pure-type target modules.
- **Deferred:** verbatim infra relocation of value modules (cannot prove behavior-preserving).
- **Release-trust:** `verify-release-tag` defaults to **fail-closed** on unsigned tags;
  override only via `ARK_ALLOW_UNSIGNED_RELEASE_TAG=true` (publish workflow sets this
  explicitly until GPG signing is wired). Unit tests cover policy + real script path.
- Corpus: pure-type file, pure-type target, side-effect type file, require/dynamic, value
  import, forbidden global, cycles.

## 2.2.0 — 2026-07-08

### Added — co-pilot P0 depth (mechanical-safe expansion)

- **Second `mechanical-safe` class:** static value-syntax imports of **pure type-only modules**
  (only `export type` / `interface` + type-only imports; **no** top-level runtime statements).
  Flagged `targetTypeOnlyExports` → convert to `import type`. Mixed modules, side-effecting
  type files, `require()` / dynamic `import()` stay **judgment** (zero false-safe).
- **Scan cache v3** carries per-file `exportsOnlyTypes` (two-pass scan so targets resolve).
- **Classifier corpus** extended: type-only + pure-type static import = 2 auto steps; value
  import, side-effect target, require/dynamic, forbidden global, cycles remain judgment.

## 2.1.1 — 2026-07-08

### Documentation

- **Migration guide** for the ~4.5k installs still on `ark-runtime-kernel`:
  [docs/migrate-from-ark-runtime-kernel.md](https://github.com/pedroknigge/arkgate/blob/main/docs/migrate-from-ark-runtime-kernel.md)
  + README section *Upgrading from ark-runtime-kernel?*
- `/ark-upgrade` skill points rename-aware projects at `arkgate`.

## 2.1.0 — 2026-07-08

**Identity: ArkGate.** Same product and codebase; honest package name.

### Changed

- **npm package renamed to [`arkgate`](https://www.npmjs.com/package/arkgate)** (was
  `ark-runtime-kernel`). Product name: **ArkGate** — architecture co-pilot / gate for AI
  TypeScript. The optional runtime API is not the product.
- **CLI bins:** primary `arkgate`, `arkgate-check`, `arkgate-mcp`. Compat aliases
  `ark` / `ark-check` / `ark-mcp` remain for one major.
- **MCP / server.json:** identifier `arkgate`, MCP name `io.github.pedroknigge/arkgate`.
- **GitHub Action** and docs/examples install paths point at `arkgate`.
- Config file remains `ark.config.json`; skills remain `/ark-*` (contract family).

### Migration

Full guide: [docs/migrate-from-ark-runtime-kernel.md](https://github.com/pedroknigge/arkgate/blob/main/docs/migrate-from-ark-runtime-kernel.md).

```bash
npm uninstall ark-runtime-kernel && npm install -D arkgate
npx arkgate-check --install-agent-gates --force
# bins: npx arkgate-check …  (aliases ark-check / ark-mcp still work)
```

Predecessor `ark-runtime-kernel` is **deprecated** on npm → use `arkgate`.

## 2.0.1 — 2026-07-08

Docs + agent-host polish on top of the 2.0.0 co-pilot release.

### Added

- **Grok Build as a first-class agent host** — `ark-check --install-agent-gates --tools grok`
  writes `.grok/config.toml` (MCP), `.grok/hooks/ark-write-gate.json` (SessionStart + PreToolUse),
  and `/ark-*` skills under `.grok/skills/<name>/SKILL.md`. Auto-detected from a project `.grok/` dir.
- **`ark-mcp --hook` Grok payloads** — accepts camelCase `toolName`/`toolInput` and
  `write`/`search_replace`; emits `{ "decision": "deny", "reason": "…" }` on stdout for Grok.
- **README skill inventory** — table of all eleven `/ark-*` skills with a one-line summary each.

### Documentation / positioning

- Public title and framing: **Ark — Architecture Co-pilot for AI TypeScript** (write gate · CI ·
  co-pilot). npm name `ark-runtime-kernel` called out as historical; product is not the optional
  runtime kernel.
- [docs/ai-gates.md](docs/ai-gates.md), [docs/agent-guide.md](docs/agent-guide.md), enthusiast
  how-to, demos, roadmaps, and hexagonal example updated for Grok + skill list.

### Also in this train (from the showcase field branch)

- Showcase HTML architecture report + origin/latest/history snapshots under `.ark/reports/`
- Autopilot before/after report steps; empty-scope false-green fix; monorepo/start TS7 hardening
- Unit/e2e `*.spec.ts` / `*.test.ts` excluded from architecture scope

## 2.0.0 — 2026-07-08

**The architecture co-pilot.** This major completes the Gate → Guide → **Co-pilot** arc: Ark can
now take a non-developer from "I have a project" to "governed, cleaned up, and enforced," with an
agent doing the work and Ark keeping it honest. It's built on the three primitives every modern
agent harness uses — **plan**, **goal**, **loop** — composed into a guided, tiered flow.

This is a **milestone** major, not an API break: everything from 1.x keeps working, and the two
aliases previously earmarked for 2.0 removal (`AIGateViolation.code`, `layeredArchitectureRules()`)
are **retained** to avoid surprising consumers. Upgrade with `npx ark upgrade`.

### Added — Phase I (autopilot + tiers)

- **`/ark-autopilot` skill** — the end-to-end co-pilot for non-developers. One flow: guided setup
  (`ark start`) → show the plan (`ark-check --plan`) → drive the fixes (`/ark-loop`) → confirm the
  gates are enforcing → report, all in plain language with approvals. It auto-applies only
  `mechanical-safe` changes (validated, with rollback) and PROPOSES the rest; the agent edits, Ark
  validates; code only, never weakening the gate.
- **Two tiers, one contract** — documented in `/ark-autopilot`: newbie = the autopilot flow;
  expert = the pieces directly (`ark init` / `/ark-contract` / `ark-check --plan` / `/ark-fix` /
  the gate). `ark start` now points newcomers at the autopilot as the next step.

### Added — Phase J (proof)

- **Classifier-precision corpus test** — a labeled set (type-only / value / forbidden-global /
  circular) asserting the classifier matches every label and NEVER marks anything but a type-only
  import move as `mechanical-safe` (the zero-false-safe guarantee the autopilot depends on).
- **End-to-end demo** — `docs/demos/03-copilot-autopilot.md`.
- **Enforcement-handoff test** — verifies the guided path leaves config + AGENTS.md + the CI gate
  active ("and stays that way").

### Added — Field-hardened co-pilot (honesty · detection · frameworks)

- **Three operating modes** on one contract: **suggest** (greenfield shape), **adapt** (raise
  coverage / match real layout), **enforce** (gates honestly hold the line). Surfaced by
  `ark start`, `--plan`, and `--doctor` — not just "newbie vs expert" entry styles.
- **False-green closed.** `ark-check --plan` embeds `governedPercent` and sets `goal.met` only
  when violations are clear *and* coverage is meaningful (≥50%). A 0% governed repo no longer
  prints "meets contract / Done — guards your architecture."
- **Shape-signal hygiene.** Dot-directories (`.github`, `.claude`, `.codex`, …) are skipped when
  scoring archetypes — CI YAML and Ark's own gates no longer flip recommend to
  "event-coordinator."
- **Framework layout overlays** on init/start presets: Nest (`*.controller.ts` /
  `*.service.ts` / `*.module.ts`), Next (app/pages/components), express, and library
  conventions are merged into hexagonal/layered globs so starters get real governed% on day one.
- **Stronger detection:** `@nestjs/*`, Nest filename conventions, `next`, express-like HTTP
  frameworks weighted in the architecture playbook.
- **pnpm runner reliability:** emitted commands use
  `pnpm --config.verify-deps-before-run=false exec …` so `ERR_PNPM_IGNORED_BUILDS` (sharp,
  esbuild, tailwind oxide, …) no longer blocks Ark on common pnpm apps.
- **TypeScript resolution:** load TS from the project, then Ark; `--plan` still reports coverage
  honesty when TS is missing (instead of a hard crash mid-start).

### Note

- The intermittent CI "onTaskUpdate" vitest flake is fixed (single-fork test run).
- Field matrix harness (not shipped in the package): `../beta-field-test/run-matrix.mjs`.

## 1.19.0 and earlier

Detailed 0.x/1.x history remains available in the immutable
[`1.x` CHANGELOG](https://github.com/pedroknigge/arkgate/blob/5e9d6745170a7b144015e718d0aed854c4bcd662/CHANGELOG.md#1190--2026-07-08).
The published package keeps complete 2.x and current-major notes so upgrade triage stays local
without making every install carry the full pre-2.0 development log.
