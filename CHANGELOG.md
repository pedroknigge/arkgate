# Changelog

All notable changes to `ark-runtime-kernel` are documented here.

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
