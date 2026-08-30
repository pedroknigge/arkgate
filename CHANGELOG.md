# Changelog

All notable changes to ArkGate (`arkgate`; formerly `ark-runtime-kernel`) are documented here or
in the immutable pre-2.0 archive linked below.

## Unreleased

**Patch** over **4.8.3**. Invariant coverage stops hiding its own limits: the scan budget and the
test globs are config, and every discarded file is counted in the diagnostic. **No required config
migration.**

### Added
- **`coverage` config (optional):** `coverage.testGlobs` replaces the built-in test-name heuristic
  and `coverage.maxFiles` sets the evidence file budget (default `400`). Both were already
  implemented inside the loader but unreachable from `ark.config.json`; `ark-check`, doctor
  (`rulesUnderContract`), and policy-delta now all pass them. Absence is silent.

### Changed
- **`INVARIANT_UNCOVERED` carries numbers:** a budget-exhausted verdict reports files loaded, the
  cap in force, tests retained, files discarded at the cap, and names `coverage.maxFiles` as the
  knob that raises it. Tests dropped for naming no catalogued invariant are counted in the message
  instead of vanishing.

## 4.8.3 — 2026-08-30

**Patch** over **4.8.2**. Persistence writes in a use-case skip the aggregate (`writes-via-aggregate`). ArkOrder **`xiKeys`** names the slow product decisions; a managed-layer Prisma/pg write of those keys is `ARKORDER_XI_FIELD_WRITE`. Dead sensors (`too-many-params`, `ingest-writes-xi`) now emit. No new skill names. Does not close `K01` / `Z09`. **No required config migration.**

**Status: published** (on npm `latest`; see `docs/releases/4.8.3.md`).

### Added
- **`writes-via-aggregate`:** tier-1 structure sensor (ADR 0032). Direct evidence = persistence driver import **and** a write token (`.insert` / `.create` / `INSERT INTO` / …). Default advisory; promotable. Absence of the rule is silent.
- Application + vertical-slice Features starter rules ship the sensor advisory. `/ark-place` `/ark-adopt` `/ark-contract` name the skip. No `Externals/` / `admission.ts` folder religion.
- **`arkOrder.xiKeys`:** optional 3–5 slow names. Empty stays silent. A use-case that persists a named key is `ARKORDER_XI_FIELD_WRITE`. Copy billing, rename the keys. Membership ids are not keys.
- ArkOrder sensors `ARKORDER_TOO_MANY_PARAMS` and `ARKORDER_INGEST_WRITES_XI` now emit (they were catalog-only).

## 4.8.2 — 2026-08-30

**Patch** over **4.8.1**. Frozen 13 skills match four-plane honesty: ArkOrder on
adopt / place / autopilot; ArkRun `kernelRoots`; kernel import `arkgate/runtime`.
No `/ark-order` / `/ark-run`. Does not close `K01` / `Z09`. **No required config migration.**

**Status: published** (see `docs/releases/4.8.2.md`).

### Changed
- **Skills four-plane honesty:** existing 13 names teach Layers, ArkRules, ArkRun, and ArkOrder. Adopt (session-0: schema `1.3+`, `planeRoots`, `maxXiKeys`) and Autopilot (grind) name ArkOrder; Place hands ArkOrder grind to Autopilot. ArkRun `kernelRoots` is preferred (`compositionRoots` alias). Kernel import is `arkgate/runtime` (companion deprecated). Skills never enforce.

## 4.8.1 — 2026-08-30

**Patch** over **4.8.0**. ArkRules invariant coverage reads tests first and retains only files that mention a declared invariant id, so large repos no longer report `INVARIANT_UNCOVERED` / `never-had-tests` while covering tests sit on disk. Does not close `K01` / `Z09`. **No required config migration.**

**Status: published** (see `docs/releases/4.8.1.md`).

### Fixed
- **INVARIANT_UNCOVERED on large trees:** `loadInvariantCoverageInputs` spent `MAX_COVERAGE_FILES` (400) on production facts before walking tests. Any repo with more than 400 governed files got `testGlobsMissing: true` and a false *never-had-tests* claim. Tests walk first; with `invariantIds`, a test is retained only if it mentions a catalog id. Doctor and policy-delta use the same ids. When the file budget is exhausted, the diagnostic says so instead of claiming the suite never existed.

## 4.8.0 — 2026-08-29

**Minor** over **4.7.6**. One npm package **`arkgate`**: extras opt-in by config + subpath.
**ArkOrder** (`arkgate/order`) on schema `1.3`. **ArkRun** kernel is `arkgate/runtime` in
the same tarball. `@arkgate/runtime` is **deprecated**. Does not close `K01` / `Z09`.
ArkRules unchanged.

**Status: published** (see `docs/releases/4.8.0.md`).

### Added
- **ArkOrder extra (`arkOrder`):** optional, silent when absent. Enforced skip: missing plane, Domain import of `arkgate/order`, generic `update` of ξ.
- **`arkgate/order`:** `createOrderPlane` with `release` / `project` / `ingest` / `proposeRelease`. Root `arkgate` export stays the gate.
- **Billing gallery:** `examples/arkorder-billing/` consumer projector (`plan` / `cycle` / `tenancy`).
- **`arkgate/runtime` and `arkgate/nestjs`:** real subpaths of package `arkgate` (ADR 0031). Root export stays the gate.

### Changed
- **`@arkgate/runtime` deprecated.** Prefer `import { createStrictArkKernel } from 'arkgate/runtime'`. Companion remains a leftover 0.x `experimental` pin.
- **Gate waist (WH01 / ADR 0026):** the parity-capable check is config + resolved-candidate-facts → one analysis-result. New doctor advisory surfaces must project existing facts and must not become a second verdict. Does not move shipped compass/coach. Does not close `K01` / `Z09`.
- **Config schema `1.3`:** additive `arkOrder`. `1.2` configs migrate. Absence is silent.

### Fixed
- **`K01` honesty:** 4.7.6 shipped workflow OCC / lease / `tx` / `resume` primitives. It does not close in-process bus commit gaps or durable outbox. `K01` stays parked.
- **Release-surface pin:** ROADMAP / CONTRIBUTING / `q06ReleaseSurfaces` name npm `latest` as **4.7.6** (the #173 merge left the 4.7.5 pin).
- **CodeQL alert 16:** `scripts/release-npm.mjs` invokes npm with `execFileSync` and an argv array (no shell). Closes `js/shell-command-injection-from-environment`.
- **Antigravity MCP path:** `--install-agent-gates --tools antigravity` (and compact start) writes official workspace `.agents/mcp_config.json`. Doctor evidence for host `antigravity` no longer treats shared `.mcp.json` as loaded by the host.

## 4.7.6 — 2026-08-26

**Patch** over **4.7.5**. Production durability *primitives* for ArkRun (`tx`, OCC, leases, `resume`). Adds those hooks to the workflow engine. **No required config migration.** Companion `@arkgate/runtime` is republished as `0.1.0-experimental.1`.
Does **not** close `K01` (in-process bus commit gaps and durable outbox remain).

**Status: published** (on npm `latest`; see `docs/releases/4.7.6.md`).

### Changed
- **ArkRun (Workflow Engine):** added `tx` argument to `EventBus` and Sagas for database transactions.
- **ArkRun (Workflow Engine):** added optimistic concurrency control (`version` increments) and worker lease (`claim()`, `ownerId`, `expiresAt`) primitives.
- **ArkRun (Workflow Engine):** added `engine.resume()` to rehydrate interrupted sagas without repeating completed steps.

## 4.7.5 — 2026-08-26

**Patch** over **4.7.4**. First-contact is **Write. Check. Ship.** README H1, ASCII
pipeline, product-voice lock, and npm/MCP description use the deny: when the agent
writes a bad import, the write doesn’t land. **No required config migration.** Does
not close Z09 / K01. Companion `@arkgate/runtime` is not republished.

**Status: published** (on npm `latest`; see `docs/releases/4.7.5.md`).

### Changed

- **README H1** is `ArkGate — Write. Check. Ship.` Deny: when the agent writes a bad
  import, the write doesn’t land. ASCII: WRITE → CHECK → SHIP, Domain ─✕─▶
  Infrastructure, Setup / In progress / Ready.
- **Product voice** locks verbs, deny, and human status lights (Setup / In progress /
  Ready / Ready · needs a refactor). `--doctor` flag stays.
- **npm and MCP description** are the deny. ADR 0001 product title is Write. Check.
  Ship. Historical 4.6.2 three-beat line stays in that release note.

## 4.7.4 — 2026-08-26

**Patch** over **4.7.3**. First experimental npm publication of `@arkgate/runtime`
(`0.1.0-experimental.0`, dist-tag `experimental`, never `latest`). `/ark-runtime` can
install the companion from the registry. **No required config migration.** Does not
close Z09 / K01.

**Status: published** (see `docs/releases/4.7.4.md`). Companion:
`npm view @arkgate/runtime dist-tags --json`.

### Added

- **`@arkgate/runtime` publish path (RN17):** root `publish-npm.yml` publishes the
  companion under `experimental` (never `latest`) when that version is unpublished.
  Companion-only: `publish-runtime.yml`. First registry copy still needs the npm org
  `@arkgate` plus GitHub `NPM_TOKEN` (OIDC is registered only for unscoped `arkgate`).
  Verify with `npm view @arkgate/runtime dist-tags --json`. In-memory stores are still
  not production durability.

## 4.7.3 — 2026-08-25

**Patch** over **4.7.2**. Remaining first-contact copy: README H1, below-fold headings,
product-voice lexicon, live site pages, and doctor HTML strings. Same deny.
**No required config migration.** Does not close Z09 / K01.

**Status: published** (on npm `latest`; see `docs/releases/4.7.3.md`).

### Changed

- **README H1** is the deny, not “Architecture Co-pilot”. Below the fold: two kinds of
  rules (not “two planes”); required CI is the hard line (not “merge gate”).
- **Product voice** North star and lexicon prefer rules file / the write is rejected /
  doctor. Allowlist wins.
- **npm keywords** drop `co-pilot` / `write-gate`.
- **Doctor HTML** strings drop co-pilot. ADR 0001 product title unchanged. Historical
  4.6.2 three-beat line stays in that release note.

## 4.7.2 — 2026-08-25

**Patch** over **4.7.1**. Public copy uses ordinary software words: if the AI writes an
illegal import, the write is rejected; the same check fails the pull request. Not an API Gateway.
Not a folder linter. If the check is not required on the PR, the rules file is
just documentation. **No required config migration.** Does not close Z09 / K01.

**Status: published** (on npm `latest`; see `docs/releases/4.7.2.md`).

### Changed

- **First-contact wording (common language):** README, use/develop/docs hub/enthusiast,
  agent-guide, ai-gates, package-surface openings, compact agent router, skill picker
  `description` frontmatter, first-run CLI help, compact doctor strings, Action and MCP
  descriptions, npm `description`, and the live product site lead with the deny. How:
  one rules file, one check, one next step. Authority:
  [product voice](docs/product-voice.md). ADR 0001 product title unchanged. Historical
  4.6.2 three-beat line stays in that release note.

## 4.7.1 — 2026-08-25

**Patch** over **4.7.0**. One project skill catalog, visible package version in the
skill picker, no home duplicates, ArkRun routed through existing skill names.
**No required config migration.** Does not close Z09 / K01.

**Status: published** (on npm `latest`; see `docs/releases/4.7.1.md`).

### Added

- **Visible skill version (picker):** install stamps `description` with
  `arkgate@<version>. ` so Codex/Claude/Cursor/Grok show the package pin without
  opening the file. `arkVersion:` in YAML stays for doctor. Same-body stamp drift
  refreshes without `--force` (`stamp-refresh`).
- **`--prune-home-duplicates`:** removes frozen `/ark-*` copies from
  `$CODEX_HOME/skills`, `~/.claude/skills`, and `~/.grok/skills` when the project
  already has `.agents/skills`. Never deletes non-Ark skills.

### Changed

- **One project catalog:** `.agents/skills/<name>/SKILL.md` is the byte source.
  Claude / Grok / OpenCode get relative adapter links. Cursor/Codex/Antigravity
  already read `.agents/skills` — no second copy. `.cursor/commands/ark-*.md` is
  no longer written (Cursor listed commands + skills as two copies).
- **`--codex-home` / `--agent-homes`:** skip home skill write (and home MCP bind)
  when the project catalog or `.codex/config.toml` already exists. Codex lists
  user+repo; a home copy is why `/ark-*` appeared twice and stayed old.
- **Doctor:** when home `ark-*` and project `.agents/skills` both exist, next
  action is prune, not `--codex-home --force`.
- **`/ark-contract`:** routes ArkRun extra edits (first extra `/ark-adopt`,
  companion `/ark-runtime`, new files `/ark-place`). No new skill names.

## 4.7.0 — 2026-08-25

**Minor** over **4.6.7**. Ships **ArkRun**: an opt-in extra on schema `1.2` for kernel
usage and complete declarations, plus companion `@arkgate/runtime` DX. Absence is
silent (Layers / ArkRules verdicts unchanged). In-memory stores remain
reference-only. **No required config migration.** Does not close Z09 / K01.

**Status: published** (on npm `latest`; see `docs/releases/4.7.0.md`).

### Added

- **`arkRun` extra on `ark.config.json` schema `1.2` (RN02):** optional inline
  `{ mode, compositionRoots, managedLayers, requireDeclarations }`. `1.1` and
  earlier configs migrate in memory; absence is silent (Layers / ArkRules
  verdicts unchanged). Unknown keys, unknown `managedLayers` names, and empty
  `compositionRoots` in `enforced` mode fail closed (`ARKRUN_MISSING_ROOT`).
  Advisory → enforced is a strengthening policy delta; demotion or deletion is
  weakening and needs the existing hash-bound ack. ESLint envelope is RN06
  (landed below); CI extra teeth landed in RN07. Does not close Z09 / K01.

- **ArkRun resolver facts on resolved-candidate-facts schema `1.2` (RN03):**
  additive optional `arkRunKernelCalls`, `arkRunManagedNews`, and
  `arkRunCompositionRootHits`. `1.0`/`1.1` payloads stay loadable (empty
  arrays). Syntax evidence only — sensors consume these in RN04. Absence of
  `arkRun` still leaves Layers / ArkRules verdicts unchanged. Does not close
  Z09 / K01.

- **ArkRun tier-1 sensors (RN04):** when `arkRun` is present, closed sensors
  emit `ARKRUN_MISSING_ROOT`, `ARKRUN_KERNEL_IN_DOMAIN`, `ARKRUN_DIRECT_NEW`,
  `ARKRUN_UNDECLARED_EMIT`, `ARKRUN_UNDECLARED_HANDLE`, `ARKRUN_UNDECLARED_DEPEND`,
  and `ARKRUN_TRANSPORT_BYPASS`. Advisory findings never flip `valid`; enforced
  blocks. Absence of the extra is still silent on Layers / ArkRules verdicts.
  Optional `arkRunDeclarations` facts stay additive on schema `1.2`. Dual-depth
  catalog nextAction is RN05 (landed below). Does not close Z09 / K01.

- **ArkRun diagnostic catalog dual-depth (RN05):** closed `ARKRUN_*` catalog
  entries have dual-depth remediation: casual `enthusiastHint` plus engineer
  `nextAction` (target interpolates the call-site literal or specifier). Adding
  an existing declaration-list string is `mechanical-safe` (`arkrun-declaration-list`)
  only when that literal is already present; other ArkRun findings stay
  `judgment`. Sensors, adapter fallback, and CLI remediation share
  `deterministicNextAction`. Does not close Z09 / K01.

- **ArkRun ESLint envelope (RN06):** `arkgate/eslint` recommended config adds
  `ark/no-arkrun-kernel-in-domain`, `ark/no-arkrun-direct-new`, and
  `ark/no-arkrun-transport-bypass`. Same `ARKRUN_*` sensors as ark-check for
  the import / `new` envelope; silent when `arkRun` is absent. Missing-root and
  undeclared-* stay CLI/MCP/preflight. Does not close Z09 / K01.

- **ArkRun extra-teeth parity (RN07):** CLI `--strict-merge`, MCP `ark_check` /
  snippet write, PreToolUse hook, atomic preflight, and CI share one ArkRun
  verdict. Enforced extra teeth arm only when the layer plane is classified
  (same ≥50% governed / ≥1 populated-layer floor as ArkRules); advisory and
  absence stay silent on `valid`. Doctor/status `arkRun` section landed in
  RN08 below. Does not close Z09 / K01.

- **ArkRun doctor / status / report (RN08):** `ark-check --doctor`, HTML
  `--report`, and `ark status` / MCP `ark_status` expose an `arkRun` section
  that is always `notAScore`. Residual is a finding-id count, never a score or
  LLM verdict. `mergePlanes.arkRun` states whether the extra can fail merge;
  advisory and absence never arm extra teeth. Report parity requires
  `data-advisory="arkRun"`. Does not close Z09 / K01.

- **ArkRun companion branding (RN09):** `@arkgate/runtime` README and public
  docs brand the kernel **ArkRun**. `createStrictArkKernel` stays the factory
  (per-instance; no process-wide singleton). Kernel implementation stays out of
  the `arkgate` tarball. Branding is not a production-durability claim. Does not
  close Z09 / K01.

- **ArkRun interaction declarations (RN10):** `@arkgate/runtime` `register()`
  accepts `uses` / `reactsTo` / `raises` / `sends` plus optional tooling-only
  `extendedInfo`. `getDependencyInformationPackage()` returns a JSON-serializable
  snapshot of ids, lifetime, and declarations — never factories, live instances,
  or input DTOs. Companion registrations may omit declarations for local
  experiments; enforced `arkRun` on the gate still requires them. Does not close
  Z09 / K01.

- **ArkRun transport ports (RN11):** `@arkgate/runtime` `send()` is one call site
  for `local` / `localBlocking` / `broker`. `ephemeral` defaults true (await local
  recording or adapter accept — not a durability claim). Missing broker adapter
  falls back to in-process local delivery, not cloud portability. No cloud SDKs
  ship in the package. Does not close Z09 / K01.

- **ArkRun dev inspector (RN12):** `@arkgate/runtime` `startInspector()` /
  `startArkRunInspector()` is opt-in. Default bind is `127.0.0.1`; `NODE_ENV=production`
  vetoes start; public hosts (`0.0.0.0`, `::`) are rejected. HTTP is lazy-loaded.
  `GET /snapshot` and `GET /events` (SSE) serve the information package plus
  transport facts (no factories, no shipped cloud SDKs). Does not close Z09 / K01.

- **ArkRun graph slices (RN13):** `@arkgate/runtime` `requestGraph()` slices the
  information package into `process` (raises / reactsTo / sends) or `technical`
  (`uses`) graphs. Optional `nodeIds`, `degreesOfSeparation`, and include/exclude
  query keep a neighborhood. `formatArkRunGraphMermaid()` / `graph.mermaid` is a
  helper string, never a score. Inspector `GET /graph` serves the same slice.
  Does not close Z09 / K01.

- **ArkRun skip corpus (RN14):** `tests/fixtures/arkrun-skip-corpus/` is the
  executable proof: Application `new`, same-layer peer import, and homemade
  `EventEmitter` stay green when `arkRun` is absent (Layers / ArkRules match
  schema `1.1`) and fail write path, CLI, MCP, and `--strict-merge` when the
  extra is enforced. Does not close Z09 / K01.

- **ArkRun skill-body deepen (RN15):** `/ark-runtime`, `/ark-place`, and
  `/ark-adopt` teach the extra vs companion (advisory adopt, kernel-only
  scaffold, composition-root wiring). Frozen **13** names — no `/ark-run`.
  Skills never enforce; doctor `arkRun` stays `notAScore`. Agent Skills layout
  stays 1:1 with `templates/skills`. Does not close Z09 / K01.

## 4.6.7 — 2026-08-24

**Patch** over **4.6.6**. Production-hardening: CODEOWNERS, eval/pack honesty, CLI extracts,
spawn timeouts, and HTML list cap. **No required config migration.** Does not close Z09.

**Status: published** (on npm `latest`; see `docs/releases/4.6.7.md`).

### Changed

- **CODEOWNERS:** `/src/`, `/bin/`, and `/schemas/` owned by `@pedroknigge`. GitHub still
  needs `require_code_owner_reviews` (or an approving-review count) for that file to
  enforce; the in-tree list is the product control.

- **Eval comparative fixture:** `saas-dashboard/without-ark` is a real Presentation→Domain
  **value** import. Type-only was non-blocking and made the nightly oracle go false-green.

- **npm pack JSON:** `scripts/npm-pack-report.mjs` strips ANSI and parses JSON lines that
  actually have `filename`. Empty `[]` / `{}` stay empty; missing filename still throws.

- **CLI extracts:** hook payload, package-manager helpers, and check args/config/watch live
  in `bin/lib/`. Module-budget maxima were not raised.

- **git/gh timeouts:** `SPAWN_TIMEOUT_MS = 8000` on git/gh `spawnSync`. Timeout is
  fail-closed (`status !== 0`).

- **HTML violation cap:** beginner and full showcase lists share a cap of 12 plus
  `+N more (T total)`. KPI tiles still use the full array.

## 4.6.6 — 2026-08-22

**Patch** over **4.6.5**. Phase AL corrective honesty plus a slimmer public docs surface.
**No required config migration.** Does not close Z09. AL05 stays parked.

**Status: published** (see `docs/releases/4.6.6.md`).

### Changed

- **D0 adopted (AL01):** a tree is adopted only when a required GitHub status runs
  `arkgate-check --strict-merge`, or `.ark/adoption-stance.json` records explicit
  `stance: "advisory-only"`. Doctor / start / status no longer sound like success from
  `AGENTS.md` or a workflow file alone. `operatingMode: enforce` stays contract-fit
  (`ok` / `goal.met` / `--strict-merge` unchanged). Does not close Z09.

- **`--strict-merge` / `--strict` created-path design delta (AL02):** the advertised merge
  command now evaluates `domain-logic-in-ui` for **created** files versus the Git merge
  base (`--base-ref`, then `ARK_POLICY_BASE_REF`, then `origin/$GITHUB_BASE_REF`, then
  local discovery). Historical residual and a stronger rule in an **existing** UI file
  stay green. Missing base skips the check (does not exit 2), matching Action first-push
  / EH04. `--fail-on-new-smells --base-ref` remains the full new+worsened-on-touched-paths
  ratchet (Z10 unchanged). The GitHub Action needs no extra flags: `--strict` inherits
  `ARK_POLICY_BASE_REF`.

- **Stewards or Adapt (AL03):** empty `stewards[]` cannot print Healthy ENFORCE (doctor
  unfinished residual `empty-stewards`; `operatingMode` stays `enforce`). T4 weakening
  and T5 `--update-baseline` require `--contract-session` even with an empty list;
  `--policy-ack` remains the hash tooth. `--force` does not skip the session. Does not
  flip all `--strict-merge` to team preflight when the list is empty.

- **First-run noun cut (AL04):** `ark start --help`, `ark start` preview, and the first
  doctor screen each stay at **≤12** product nouns. Default `arkgate-check --doctor` is
  compact; `--doctor --all` prints Details. Compass and deep-module coach stay in JSON and
  drop from human output. No new skill names, scores, or LLM verdicts.

- **Docs surface:** npm `CHANGELOG.md` keeps Unreleased + 4.6.x (pre-4.6 in
  `docs/archive/CHANGELOG-pre-4.6.md`). Live `ROADMAP.md` is the current queue; full
  history is archived. README / use lead with adopted = required merge status.

## 4.6.5 — 2026-08-19

**Patch** over **4.6.4**. Adoption, placement, doctor, upgrade, and write-path honesty for
existing Next.js trees and multi-host teams. **No required config migration.**

**Status: published** (see `docs/releases/4.6.5.md`).

### Changed

- **Adopt starter:** existing trees get SharedKernel (types/constants), CompositionRoot (wiring),
  and `src/**/domain/**`. Flattened `src/lib/**` is not dumped into Application. Adopt writes
  `.ark/golden-pattern.json` (load-bearing for place).
- **Place:** `filePath` is required (fail-closed). Never invents `components/*.tsx` or defaults
  to Presentation.
- **LAYER_IMPORT nextAction:** branches by import kind — constants/types → Domain/SharedKernel;
  kernel/events from Persistence → do not emit; port only for a real use-case.
- **Reserved empty globs:** `reserved` / `allowEmpty` so `--strict-config` does not fail on
  future houses. Typo warning only if the glob is not reserved.
- **Parse / lexical:** `ANALYSIS_PARSE_INCOMPLETE` includes the TypeScript line + message.
  Contract `exclude` paths skip the write hook. Incremental mid-edit parse does not deny.
  `LEXICAL_EVIDENCE_INCOMPLETE` hook deny does not tell the agent to call `ark_prepare_change`.
- **WritePath / CI honesty:** `.ark/ci-merge-boundary.json` — hook configured-not-fired,
  per-host writePath (Claude hard vs Cursor soft), CI present-but-not-required, GitHub Free
  cannot require. Hook green is not tree green.
- **Upgrade:** preview default is hosts keep (union `--tools` with existing). Apply installs
  the bumped package unless `--no-install`. Projection writes AGENTS.md and CLAUDE.md.
  Prefer project `.agents/skills`; home must not duplicate the catalog.
- **Doctor JSON:** stable envelope `{ schemaVersion, envelope: "doctor", ok, doctor }`.
  ENFORCE + empty plan A → Shape, not reinstall gates. Distinguishes installed vs stale skills.
- **Graph scan:** threshold scales with included file count (floor 2500, cap 8000) so a
  ~3300-file Next.js tree is not deferred.
- **INVARIANT_UNCOVERED:** `never-had-tests` (adopt residual) vs `tests-disappeared` (regression).
- **CLI-first:** identity handshake is optional when the CLI already resolved the root.

## 4.6.4 — 2026-08-18

**Patch** over **4.6.3**. `ark upgrade` now tells Codex users how to activate the local
`apply_patch` boundary after upgrading: refresh the project hook, restart Codex/local Desktop,
trust the exact hook definition, and verify `doctor.writePath` after a governed patch.
**No required config migration.**

**Status: published** (see `docs/releases/4.6.4.md`).

### Changed

- **Upgrade JSON:** `whatsNew.items` includes stable id `codex-hard-write` with the exact
  `--install-agent-gates --tools codex --force` command and evidence to inspect.
- **Upgrade human output:** **Suggested improvements** prints the same refresh/restart/trust/check
  path on preview and apply, including nothing-to-apply previews.
- **Upgrade skill:** flat and Agent Skills guidance tells Codex to exercise a governed
  `apply_patch` and keeps hosted/specialized/shell/direct/incomplete/human paths CI-backed.
- **Stale MCP fail-closed:** when process version no longer matches the project install,
  `ark_identity` reports non-authoritative evidence and project tools return
  `PROCESS_PACKAGE_STALE` until restart/retarget.
- **Global CLI handoff:** a modern stale global `ark upgrade` delegates the original invocation
  to the project-local `node_modules/arkgate/bin/ark.mjs` instead of managing from the wrong PATH
  version. Pre-4.6.4 globals still require one `npx arkgate upgrade` entry.

## 4.6.3 — 2026-08-18

**Patch** over **4.6.2**. Codex CLI and local ChatGPT Desktop/App Server now get a
runtime-proven pre-write block for complete `apply_patch` calls. ArkGate accepts the current
`tool_input.command` payload, while incomplete, hosted, specialized, shell/direct, and human
write paths remain CI-backed. **No required config migration.**

**Status: published** (npm `latest` from signed tag `v4.6.3`; OIDC run `32167523804`;
see `docs/releases/4.6.3.md`).

### Changed

- **Codex hook payload:** current `PreToolUse` `apply_patch` bodies are read from
  `tool_input.command`; historical patch/input/content fields stay compatible.
- **Operation-scoped hard write:** a complete trusted and runtime-observed local patch can report
  `hard:true` and exit `2` before disk mutation. Hook files alone stay unverified.
- **Honesty surfaces:** host matrix, doctor/status, `--require-write-hook codex`, onboarding,
  upgrade self-service, skills, and public docs now share the same boundary.
- **All-path backstop:** required `arkgate-check --strict-merge` CI remains mandatory. MCP stays
  advisory and repair reinjection is not claimed.

## 4.6.2 — 2026-08-16

**Patch** over **4.6.1**. First-contact copy: a newcomer (human or coding agent) sees what
to do in a few lines — `arkgate` / `arkgate-check --help`, start wrap-up, doctor light +
#1, write-gate deny, SessionStart, MCP tool order, and the five doors. Same 13 skill names.
**No required config migration.**

**Status: published** (on npm `latest`; see `docs/releases/4.6.2.md`).

### Changed

- **First-run help:** `arkgate --help` and `arkgate-check --help` are short; encyclopedia
  text is `--help --all`. `arkgate upgrade --help` is preview vs apply.
- **Start wrap-up:** doctor → `/ark-adopt` session 0 (not `/ark-autopilot` as step 1).
- **Doctor:** operating-mode light + primary next action #1 print first.
- **Write-gate deny:** `blocked {file} — {reason}` then `Next:` (move the import / `/ark-place`).
  Rule id on a following line. No “call ark_manifest”.
- **Agents:** SessionStart points at `/ark-adopt` or `arkgate-check --doctor`. `ark_identity`
  is first. `ark_check` is a scan (pass/fail/incomplete), not a yes/no architecture score.
  `server.json` first sentence is the layers definition.
- **Skills:** five doors open with when + steps. Shortcuts are not the first-run menu.
- **Status:** `nextAction` is `map-leftover-design` when leftover design work remains
  (never `stay-enforced`).
- **npm `description`:** `One architecture config. One check. One coach.` (not “co-pilot”).
- **`docs/use.md`:** Cursor hard-blocks Write/StrReplace when hooks are trusted;
  Codex/OpenCode stay advisory.

## 4.6.1 — 2026-08-14

**Patch** over **4.6.0**. Five-door autonomy (skills write or map in-turn; CLI is sensor +
gate) plus team parliament (law vs feature: stewards, mixed-PR deny, ratchet vs the merge
base, cheap `--changed` check). Same 13 skill names. Steward identity is a GitHub handle or
email, not git `user.name`. **No required config migration.**

**Status: published** (on npm `latest`; see `docs/releases/4.6.1.md`).

### Added

- **Five-door autonomy (SK01–SK05):** `/ark-adopt`, `/ark-place`, `/ark-autopilot`,
  `/ark-explore`, `/ark-upgrade` write or map in the same turn. The other eight names stay
  installed as shortcuts. Invoking a door is the approval; the CLI does not apply the change.
- **Team parliament (TW01–TW08):** mixed law+product deny; optional `stewards` (GitHub handle
  or email); `--contract-session` / `--contract-diff` / `--changed --base` / `--against` /
  `--persona` / `--author`; `ark status --vs`; doctor `stewardNudge` (ask or show list drift).
  `stewards` is excluded from the policy hash.

### Changed

- Doctor, compact router, and public lanes prefer the five doors. Historical changelogs stay
  as shipped.
- Published 4.6.1 tarball `README.md` still banners 4.6.0 (packed at `1eadc96` before the
  pointer flip). Tree README on `main` is current. No 4.6.2 for that banner.

## 4.6.0 — 2026-08-12

**Minor** over **4.5.7**. Understandable Ark: doctor, HTML, skills, and public docs use common
software words (import rules, leftover design work, pre-write block) while **ArkGate** and
**ArkRules** stay as product names. Shared Claude/Grok agent homes get the same monotonic
“always latest” floor Codex already had. **No required config migration.** JSON field names
and `ruleId`s stay stable. No new skill names, sensors, or scores.

**Status: published** (on npm `latest`; see `docs/releases/4.6.0.md`).

### Added

- **Shared Claude/Grok home skills:** `--claude-home`, `--grok-home`, and `--agent-homes`
  write monotonic home catalogs (Codex-parity lock + floor). Doctor reports stale
  `~/.claude/skills` / `~/.grok/skills` when those catalogs exist. Temp/upgrade `--root`
  never mutates default user homes.

### Changed

- **Human language:** doctor, HTML report, compact router, skills, and public lanes prefer
  common terms. Leftover design work replaces “design-weak” in human copy; JSON `designWeak`
  is unchanged.

## 4.5.7 and earlier

Pre-4.6 history lives in the maintainer archive, not the npm changelog:
[docs/archive/CHANGELOG-pre-4.6.md](docs/archive/CHANGELOG-pre-4.6.md).
