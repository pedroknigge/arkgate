# Changelog

All notable changes to `ark-runtime-kernel` are documented here.

## 1.4.0 — 2026-07-03

### Added — SessionStart contract injection (`ark-mcp --session-context`)

- `ark-mcp --session-context` prints a compact contract summary — layers, forbidden
  globals, denied-edge count, baseline state, and the check command — for a Claude Code
  `SessionStart` hook, so the agent knows the architecture from the first token instead
  of learning it by rejection. `--install-agent-gates` now includes the hook in the
  generated `.claude/settings.json`.
- Project-scoped by design and safe even in global settings: without an
  `ark.config.json`, `--session-context` prints nothing and exits 0 (before loading
  `dist/`), so non-Ark projects are untouched.

### Added — instruction-tier agent gates (Windsurf, Cline, Copilot, Kiro)

- `ark-check --install-agent-gates` now knows four more tools: `windsurf`
  (`.windsurf/rules/ark.md`), `cline` (`.clinerules/ark.md`), `copilot`
  (`.github/copilot-instructions.md`), and `kiro` (`.kiro/steering/ark.md`).
  All derive from the same canonical agent contract as `AGENTS.md` and the
  Cursor rule, so the steps cannot drift between hosts.
- Windsurf, Cline, and Kiro are auto-detected from their config directories;
  Copilot is explicit-only via `--tools` (`.github/` is too weak a signal).
  Gemini CLI needs no template — it reads the generated `AGENTS.md`.

### Added — forbidden ambient globals per layer (`forbiddenGlobals`)

- Layers in `ark.config.json` can declare `forbiddenGlobals` (e.g.
  `["fetch", "process", "Date.now", "Math.random"]`). Import rules can't see code that
  reaches for an ambient global; this closes that hole for domain purity.
- Enforced identically at all three moments: `ark-check` reports `FORBIDDEN_GLOBAL`
  in CI (baseline-ratchet compatible), the `ark-mcp` write gate blocks the write, and
  the new `ark/no-forbidden-globals` ESLint rule gives in-editor feedback (scope it to
  layer directories via `files`; it takes a `{ globals: [...] }` option).
- Detection is positional, not scope-aware: dotted entries (`"Date.now"`) flag that
  property access; bare entries (`"console"`) flag member access, calls, and
  constructions. Types, import names, and shadowed locals are never flagged.
- `ark init` and `ark-check --init` seed the DomainModel layer with
  `["fetch", "process", "Date.now", "Math.random"]`.
- The `ark://manifest` MCP resource now exposes the configured `forbiddenGlobals`
  map so agents see the constraint before generating code.
- `createAICodeGate` accepts a `forbiddenGlobals` option (layer → globals), checked
  when a `typescript` module is provided.

## 1.3.0 — 2026-07-03

### Added — the 11-layer division is now suggested, to humans and agents

- `ark-check --init` on a project with no conventional layer directories now generates
  the complete 11-layer starter profile (all layers `optional`) instead of failing:
  the strict check passes immediately and each layer starts being enforced as soon as
  its directory gains source files.
- `ark-check --init` on a partially-layered project prints the undetected profile
  layers with their conventional directories, so the full division is visible before
  deciding what to adopt.
- The `ark://manifest` MCP resource now includes `suggestedLayers` (undeclared default
  layers with intent prefixes and conventional directories), so agents know where a
  new saga, job, or read model belongs before improvising an ungoverned location.
- The generated `AGENTS.md` includes a "Where new code belongs" placement table for
  the same purpose in runtimes without MCP.

### Added — gate presence enforcement (`ark-check --require-gates`)

- `ark-check --require-gates` fails the check when `AGENTS.md`, `.mcp.json`, or the
  generated CI workflow is missing, so "installed but never configured" is a red CI.
  JSON mode reports `{ ok: false, error: 'missing-gates', missing: [...] }`.
- `--install-agent-gates --tools claude,cursor,codex` selects which tool templates to
  write; without the flag, tools are auto-detected from `.claude/`, `.cursor/`, and
  `.codex/` (all templates are written when nothing is detected).

### Changed

- The generated CI workflow now runs `ark-check` with `--require-gates`.
- AGENTS.md and the Cursor rule derive from a single agent contract, so the
  enforcement steps can no longer drift between the two files.

### Fixed

- `--install-agent-gates` now reports failed template writes and exits non-zero
  instead of always claiming success.
- `--tools` no longer swallows a following flag as a tool name (`--tools --force`),
  and rejects empty or unknown tool names with exit 2 instead of silently ignoring them.
- `suggestedLayers` skips default layers whose intent prefixes the project already
  claims under another name (e.g. a `core` layer owning `Domain.`), so agents are never
  told to create a second layer for an already-governed prefix.
- Greenfield `--init` warns when existing source files live outside `src/` (and are
  therefore not governed by the generated starter config) instead of staying silent.
- The suggested `check:architecture` npm alias now uses `npx ark-check` (the previous
  snippet only worked inside Ark's own repository).
- `createElevenLayerArkConfig({ rootDir: '.' })` no longer emits broken `./`-prefixed
  patterns that matched nothing.

## 1.2.0 — 2026-07-03

### Added — agent gate installer (`ark-check --install-agent-gates`)

- One command writes the agent-enforcement starter set: `AGENTS.md`, `.mcp.json`,
  Cursor rule + MCP config, Claude settings, a Codex config snippet, and a GitHub
  Actions workflow that runs `ark-check --strict-config`. Existing files are
  skipped unless `--force` is passed.
- The generated workflow detects the project's package manager (npm / pnpm / yarn)
  from its lockfile and uses matching setup, cache, and run commands.

### CI

- Workflows updated to the node24 runtime; MCP tests isolated from concurrent builds.

## 1.1.0

### Added — baseline ratchet for existing codebases (`ark-check --baseline`)

- `ark-check --update-baseline [file]` freezes the current violations into
  `.ark-baseline.json` (line-insensitive keys, so unrelated edits don't resurrect them).
- `ark-check --baseline [file]` suppresses frozen violations: only NEW violations fail,
  and stale baseline entries are reported so the ratchet can be tightened with a re-run
  of `--update-baseline`. JSON output gains `suppressedViolations` and `staleBaselineKeys`.

### Added — Standard Schema support in event contracts

- `EventContract.standardSchema` accepts any [Standard Schema](https://standardschema.dev)
  validator (zod, valibot, arktype, ...) alongside — or instead of — Ark's own schema
  format. Issues (including paths) map to regular contract issues. Validation stays
  synchronous; async validators produce an explicit contract issue. Ark remains
  zero-dependency: the spec interface is vendored as types only.

### Added — NestJS adapter (`ark-runtime-kernel/nestjs`)

- `ArkModule.forRoot()` / `forRoot(kernel | options)` / `forRootAsync({ useFactory })`
  register a global kernel under the `ARK_KERNEL` token; `@InjectArk()` injects it.
- `@nestjs/common` is an optional peer dependency; the core stays zero-dependency.

### Added — GitHub Action

- Composite action at the repo root: `uses: pedroknigge/ark-runtime-kernel@main` runs
  `ark-check`, writes the result to the step summary, and (with `github-token`) comments
  violations on the PR. Inputs: `root`, `config`, `strict-config`, `baseline`, `version`.

### Added — docs, examples, and distribution

- `docs/ai-gates.md`: copy-paste write-gate setups for Claude Code (hook + MCP), Cursor,
  OpenAI Codex, any hook-capable runtime, plus the CI backstop.
- `examples/hexagonal-order-api/`: a full hexagonal order API governed by Ark with a
  "break it on purpose" walkthrough.
- `server.json` for the official MCP registry; `CONTRIBUTING.md`; `ROADMAP.md`.
- README rewritten adoption-first: 2-minute CI setup, honest comparison vs
  dependency-cruiser / eslint-plugin-boundaries / Nx boundaries, write-gate demo, and the
  runtime kernel repositioned as the opt-in layer.

### Changed — actionable ark-check output

- Human output now shows the rule, `file:line`, the layer edge with the resolved target,
  and a fix hint per rule, with color when attached to a TTY (`NO_COLOR` respected).
  `--json` output is unchanged (plus the new baseline fields).

### Changed — single package.json

- Removed the `package.dev.json` / `package.publish.json` swap workflow and its scripts;
  the checked-in `package.json` is the only manifest and `npm publish` ships it as-is
  (`prepack` builds). Internal working documents removed from `docs/`.

## 1.0.0 — 2026-07-02 (as published to npm)

### Added — working pre-write hook mode (`ark-mcp --hook`)

- `ark-mcp --hook` runs one-shot instead of serving: it reads a Claude Code PreToolUse
  payload from stdin, validates the file content a Write/Edit/MultiEdit is about to
  produce, and exits `2` with the violations on stderr to block the write (`0` to allow).
- Edits are validated against the post-edit file state (current file with the edit applied
  in memory), not the edit snippet in isolation.
- Fail-open plumbing: non-source files, other tools, files outside `--root`, and malformed
  payloads never block the agent.
- Fixed the Claude Code integration examples in README and the agent guide: they showed a
  hook `"type": "mcp"` that does not exist in Claude Code. The documented configuration now
  uses a real `"type": "command"` hook running `ark-mcp --hook`, plus `.mcp.json` for the
  manifest resource and `validate_code` tool.

### Added — one-command onboarding (`ark-check --init`)

- `ark-check --init` scans the project for the built-in layer directory conventions
  (`src/domain`, `src/application`, `src/adapters/persistence`, ...) and writes an
  `ark.config.json` covering only the layers that actually contain source files, with the
  default rule matrix filtered to those layers.
- The generated config passes `--strict-config` out of the box; `--init` also lists the
  top-level directories left uncovered so governance gaps are explicit from day one.
- `--init` refuses to overwrite an existing config unless `--force` is passed, and fails
  with guidance (instead of writing a useless config) when no conventional directories
  are found.

### Changed — real dogfooding and less warning noise

- Ark's own `ark.config.json` now classifies 100% of `src/` (DomainModel, Kernel, and
  Tooling layers with real boundary rules) instead of a symbolic two-layer config, and
  `npm run check:architecture` / CI run with `--strict-config` so coverage can never
  silently rot.
- Removed the `CONFIG_PARTIAL_LAYER_MAP` warning: it flagged every project with fewer
  than 11 layers even at 100% file coverage. `CONFIG_UNCLASSIFIED_FILES` already reports
  the real coverage gap.

### Added — broader static governance checks

- `ark-check` now checks dynamic `import()` and `require()` module edges against configured
  layer rules.
- `ark-check` now flags raw `publish()` calls that pass an intent string or raw event
  object.
- `ark-check` now flags publish calls missing `metadata.source`.
- `ark-check` now flags source intent literals whose resolved layer does not match the
  publishing file's configured layer.

### Added — source-bound publishers

- Event buses now expose `createPublisher(sourceIntent)` to create a source-bound
  publishing capability.
- Ark kernels expose `ark.publisher(sourceIntent)` as the recommended strict runtime path.
- Source-bound publishers stamp `metadata.source` internally and throw
  `SourceMetadataOverrideError` when callers try to publish as a different source.

### Added — operational 11-layer profile config

- Added `createElevenLayerArkConfig()` to generate an `ark-check` configuration from the
  built-in runtime 11-layer profile.
- Added `ark-check --print-config eleven-layer` for CLI bootstrap of `ark.config.json`.
- Generated layers are optional by default so teams can adopt the full profile
  incrementally without warnings for unused folders.

### Added — AST-backed AI publish checks

- `createAICodeGate()` can now run built-in TypeScript AST checks when the caller passes
  the `typescript` module.
- AST checks flag raw publish calls, publish calls missing `metadata.source`, and source
  intent literals whose layer differs from the target file layer.
- `ark-mcp` passes TypeScript into AICodeGate when available so the write-path gate blocks
  the same publish misuse patterns earlier.

### Added — ports and adapters governance metadata

- `definePort()` now accepts optional ownership metadata, intent identity, and an
  `allowedAdapters` list.
- `createAdapter()` accepts adapter metadata and rejects adapters that are not allowed by
  the port.
- Added `checkAdapterGovernance()` for non-throwing adapter allowlist checks.

### Added — production hardening

- Event contracts now support nested object fields, typed array items, and enum values.
- Added `docs/production-hardening.md` with store-interface guidance for durable audit,
  outbox, projection, and workflow implementations.

## 1.0.0 — 2026-07-01

### Changed — strict runtime baseline and governance roadmap

- `createArkKernel()` now uses hardened defaults: strict event contracts, known-source
  enforcement, and hard observed layer-flow enforcement unless explicitly relaxed.
- Added `createLenientArkKernel()` for migration and legacy paths that need the previous
  relaxed behavior.
- The built-in 11-layer profile now uses a strict cross-layer deny matrix with explicit
  allowed flows.
- `ark-check` reports advisory config warnings for missing/partial layer maps,
  unclassified included files, unmatched layer patterns, duplicate layers, and rules that
  reference unknown layers. `--strict-config` turns those warnings into a failing check.
- Documentation now states the runtime/static/AI governance boundaries explicitly and
  tracks the seven-phase roadmap for expanding Ark's enforcement scope.

## 0.8.4 — 2026-07-01

### Fixed — CI/MCP intent-classification parity

`ark-check` classified intent names with declaration-order first-match + raw `startsWith`,
while the MCP write-gate classifies via the library's `ArchitectureProfile.resolveLayer`
(longest-prefix-first + prefixes normalized to a trailing `.`). For configs with
overlapping prefixes (`Adapter.` vs `Adapter.Persistence.`) or dotless prefixes (`Domain`),
the two gates disagreed. Both now share `resolveIntentLayer` (in `bin/ark-shared.mjs`),
which mirrors the library semantics exactly — a regression test asserts the shared resolver
and `profile.resolveLayer` return identical results across overlapping/dotless configs.

## 0.8.3 — 2026-07-01

### Fixed — third code-review pass (glob robustness + latent fallback bug)

- **Unbalanced-brace crash.** A glob with an unbalanced `{` produced an invalid regex, so
  `new RegExp` threw — crashing the CI gate (exit 2) and every MCP `validate_code` call.
  `globToRegExp` now only treats braces as alternation when they're balanced, otherwise
  literal; it also honors backslash-escaped braces (`\{` → literal).
- **`layerForIntent` default fallback (latent since v0.4).** The `DEFAULT_INTENT_PREFIXES`
  fallback read `item.prefix` (singular) off `{ layer, prefixes: [...] }` entries, so it
  matched nothing — a project with layers but no `intentPrefixes` got no intent-reference
  enforcement in CI while the MCP gate blocked the same reference. Now flattened to the
  right shape; the two gates agree.
- **Out-of-root over-reach.** After dropping the hard root boundary in 0.8.1, a relative
  import escaping `--root` (`../../…`) could be classified by a catch-all pattern and
  false-flagged. `resolveImport` now skips targets whose root-relative path leads with `..`
  (and still skips `node_modules` segments) — projects under a `node_modules` segment stay
  governed; monorepos should run ark-check per package.
- **Accurate MCP warning.** The "no layers configured" stderr note no longer claims layer
  checks are disabled; with no config layers the gate uses the default 11-layer profile and
  layer-reference checks still run when the caller passes an explicit `layer`.

## 0.8.2 — 2026-07-01

### Fixed — second code-review pass (parity + glob correctness)

A re-review of the v0.8.1 fixes found that a couple of them introduced new divergences.
This closes them and unifies the two gates so they provably can't disagree:

- **ark-mcp / ark-check rule parity.** The write-path gate built its profile with
  `rules: config.rules ?? []`, so a config that declared layers but omitted `rules` got
  zero enforcement while CI still applied the default matrix. Both CLIs now share
  `DEFAULT_RULES` + `DEFAULT_INTENT_PREFIXES` (in `bin/ark-shared.mjs`) and the gate uses
  `config.rules ?? DEFAULT_RULES` with the same intent-prefix fallback ark-check uses. No
  layer is built with empty prefixes (which had made it unresolvable).
- **node_modules exclusion, done right.** `ark-check` now excludes a resolved target only
  when its path *relative to root* contains a `node_modules` segment — so a broad catch-all
  pattern (`**`) no longer false-flags third-party imports, while projects living under a
  `node_modules` segment and monorepo siblings are still governed.
- **Resolver directory shadowing.** The `.mts`/`.cts` relative fallback now requires the
  candidate to be a file (`statSync().isFile()`), so a directory named like the specifier
  can't shadow the real module file.
- **Brace globs.** `globToRegExp` now supports `{ts,tsx}` alternation (previously treated
  as literals, silently matching nothing) and caches each compiled pattern.
- **Docs/CI polish.** Corrected the observed-flow enforcement comment (edge is recorded
  *after* the check now); scoped the CI `push` trigger to `main` so PR branches don't run
  the job twice (all PRs are still gated via `pull_request`, any base branch).

## 0.8.1 — 2026-07-01

### Fixed — enforcement-defeating bugs found in the v0.8 code review

A workflow-backed review of v0.6–v0.8 surfaced a cluster of bugs that silently defeated the
very gates they added. All fixed with regression tests (including a nested-directory fixture
so the gate can never be vacuously green again):

- **Broken `**` glob (critical).** A chained `.replace()` corrupted `**` into `.[^/]*`, so
  `src/kernel/**` stopped matching nested paths — every file in a subdirectory was silently
  unclassified and skipped. This neutered both `ark-check` (CI) and `ark-mcp` layer
  inference for any real project. Fixed with a single-pass glob compiler shared by both
  CLIs (`bin/ark-shared.mjs`), removing the duplicated (and independently buggy) copies.
- **`ark-check` import filters.** Replaced the `node_modules` path-substring test (which
  discarded an entire project living under a `node_modules` segment) with TS's own
  `isExternalLibraryImport` flag; removed the out-of-root filter so monorepo cross-package
  imports are governed; restored `.mts`/`.cts` extensionless resolution via a relative
  fallback.
- **`ark-mcp` write-path gate.** It now builds the enforcement profile from the project's
  `ark.config.json` (layer names **and** rules), so it agrees with `ark-check` instead of
  always using the built-in `elevenLayerProfile` — projects with custom layer names/rules
  were getting zero layer enforcement. Malformed config now throws instead of silently
  falling back to a no-op; empty-layer configs warn on stderr. Manifest resource reflects
  the effective profile. Guarded a null-intent crash and gave a clear message on broken
  builds. Notifications never receive a response.
- **EventBus phantom edge.** In `enforceObservedLayerFlow: 'hard'`, a rejected event no
  longer records an `observed` graph edge (the check now runs before `registerEventFlow`),
  so drift/manifest/observability reports don't show flows that never happened.
- **CI gate coverage.** The workflow now triggers on every push and pull request, not only
  those based on `main`, so non-main PR topologies can't bypass the gate.

## 0.8.0 — 2026-07-01

### Added — mandatory CI architecture gate + AI write-path gate (MCP)

Two chokepoints that make Ark's enforcement unavoidable where it matters, closing the last
two "kernel-earning" gaps from the strategic audit.

**1. Mandatory CI gate.**
- `.github/workflows/ci.yml` runs typecheck, tests, build, and `ark-check` on every push/PR.
  `ark-check` exits non-zero on any layer violation, so a violation **fails the job and
  blocks the merge** — the honest architecture chokepoint for TypeScript.
- `ark.config.json` dogfoods Ark on itself: `src/domain/**` must not import the kernel
  (a real, currently-green invariant — Ark's domain types are dependency-free).
- `check:architecture` script now runs the gate explicitly with the config.

**2. AI write-path gate — `ark-mcp` MCP server (new `bin`).**
- A **zero-dependency** MCP server (hand-rolled JSON-RPC 2.0 over stdio — no SDK dependency,
  honoring the zero-dep rule) exposing:
  - resource `ark://manifest` — the architectural contract (layers + rules, or a project
    manifest via `--manifest`) for agent contract discovery.
  - tool `validate_code` — runs Ark's AI code gate on a source snippet and returns
    `{ valid, violations }`, setting `isError` when invalid.
- Designed to bind to `PreToolUse` on Write/Edit so architecturally-invalid generated code
  is blocked **before it lands** — turning the manifest + AI gate from an ignorable library
  into an enforced checkpoint on the operation that matters for AI agents.
- Run with `npx ark-mcp` (or `npm run mcp`). See `docs/agent-guide.md` for wiring.

## 0.7.0 — 2026-07-01

### Changed — `ark-check` resolves all imports, not just relative ones

`ark-check` previously resolved only relative (`./`, `../`) import specifiers, so
path-alias and package imports — the majority in real TypeScript repos — were invisible
to it. It now resolves every import specifier through the TypeScript module resolver
(`ts.resolveModuleName`) using the project's `tsconfig.json`, so:

- **tsconfig path aliases** (e.g. `@domain/*`, `@infra/db`) resolve to their real files and
  cross-layer violations through aliases are now caught.
- **package/absolute imports** resolve via node resolution; external `node_modules` and
  `.d.ts`-only targets are correctly ignored.
- **relative imports** keep working exactly as before.

New `--tsconfig <path>` flag (defaults to the nearest `tsconfig.json` from `--root`). When
no tsconfig is found, aliases are unavailable but relative/package imports still resolve.
Layer identity is still derived from file location (glob `patterns`), per the audit's
"derive layer from code, not just the intent-name prefix" recommendation.

This closes the top-ranked remaining gap from both the v0.5 strategic audit and the
external v0.6 review: the honest chokepoint for TypeScript architecture enforcement is the
CI merge gate, and it must see the imports that actually exist.

## 0.6.0 — 2026-07-01

### Added — runtime enforcement of observed layer flows

Ark now enforces architecture over **what the system actually does**, not only over what
was declared. On every publish, the event bus already recorded the real producer→event
flow (`metadata.source → intent`); v0.6 wires that observed edge into enforcement.

- `EventBusOptions.enforceObservedLayerFlow: 'off' | 'soft' | 'hard'` (with
  `architectureProfile`) checks the resolved producer layer → event layer against the
  profile's rule matrix at publish time.
  - `hard` throws `ObservedLayerFlowViolationError` **before** the event reaches history,
    outbox, or subscribers.
  - `soft` records a `layer.observedViolation` trace + audit record and proceeds.
  - `off` (default for `createEventBus`/`createArkKernel`) preserves prior behavior.
- `createStrictArkKernel()` defaults `enforceObservedLayerFlow` to `hard`. The recommended
  strict path now rejects, e.g., a persistence adapter driving a Domain event
  (PersistenceAdapters → DomainModel) or a Domain source emitting an Application event.
- New exports: `ObservedLayerFlowViolationError`, `ObservedLayerFlowMode`.
- New trace/audit record type: `layer.observedViolation`.

This closes the highest-leverage gap identified in the v0.5 strategic audit: the observed
flow was previously collected only for the drift *report*, never for enforcement — making
"runtime layer governance" a check over the declared model rather than the running system.

### Docs

- README now states the enforcement scope explicitly (hard-failed / observable / out of
  runtime scope) and frames Ark as the runtime kernel for the event/intent layer plus a
  machine-readable contract, not an OS-style choke point over all code.

## 0.5.0

Add-only event interceptors, interceptor audit/trace records, contract-safe interceptor
failure behavior, kernel instance id stamping, observability drift report (declared vs
observed), runtime graph observed flows, `createArkTestHarness()`, and the
`ark-runtime-kernel/eslint` plugin.

## 0.4.0

`createStrictArkKernel()`, event contract registry, known-source enforcement, basic
outbox store, `ark-check` CLI (AST import + intent-string checks), and policy lifecycle
metadata.

## 0.3.0

11-layer architecture profile, `createArkKernel()`, native audit trail, workflow/saga
engine, projection/read-model registry, metadata validation, and layer-grouped graph views.

## 0.2.0

`ArkManifest` export, `syncRegistryToGraph`, `PolicyViolationError` + observability hooks,
bounded history + trace format, layer policies, strict registry publish/subscribe
validation, and the package rename to `ark-runtime-kernel`.
