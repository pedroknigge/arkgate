# Changelog

All notable changes to `ark-runtime-kernel` are documented here.

## 1.7.6 — 2026-07-05

_From downstream consumer feedback after a real upgrade + CI-failure session._

### Changed — generated CI follows the project's Node version

- The generated GitHub workflow hard-coded `node-version: 20`. If a developer's
  local npm is newer than the npm that Node ships (e.g. Node 24 / npm 11), CI's
  `npm ci` fails with "missing from lock file" — the lockfile was written by a
  newer npm — a red CI unrelated to architecture that blocks the gate before
  `ark-check` even runs. The workflow now picks the Node version in order:
  `node-version-file: .nvmrc`/`.node-version` when the project pins one (CI locks
  to the dev's exact toolchain), else the major from `package.json` `engines.node`,
  else a current-LTS default (bumped `20` → `22`; defaulting high avoids the
  "CI npm older than the lockfile" class). Survives regeneration like `--baseline`.

### Changed — CI steps are named so install failures read correctly

- The generated workflow's steps were unnamed, so an `npm ci` failure surfaced
  under the "Ark architecture gate" job with no clear cause — it looked like an
  architecture violation when it was a dependency/lockfile problem. Steps are now
  named (`Checkout`, `Setup Node`, `Install dependencies`, `Ark architecture
  check`), so a red lands on `Install dependencies` and points at the real cause.

### Changed — `--install-agent-gates` says WHY a skill was skipped

- A skipped skill printed a bare `skipped <path>`, indistinguishable from "up to
  date". Skipped skills are now annotated `(up to date)` or `(stale: <old> <
  <current>)`, and a trailing note gives the exact safe refresh command
  (`--install-agent-gates --skills-only --force`) — so the user isn't left
  guessing or reaching for a bare `--force` that would clobber customized gates.

## 1.7.5 — 2026-07-05

### Added — outdated-skill detection (version-stamped skills)

- `--install-agent-gates` now stamps each installed `/ark-*` skill with an
  `arkVersion:` line in its frontmatter. A normal `ark-check` run then flags
  skills left behind by an older Ark (stamp behind the current version, or no
  stamp at all) and points at the refresh command below — distinct from the
  "not installed" notice, which uses a plain install. The stamp moves with the
  package, so editing a skill's body does not make it look outdated; only a
  version gap does. `--json` `skillGaps` entries now carry `{ tool, missing, stale }`.
- New `--skills-only` flag for `--install-agent-gates`: restricts the write to
  just the canonical `/ark-*` skills, so `--install-agent-gates --skills-only
  --force` refreshes skills to the current version WITHOUT overwriting a
  customized `AGENTS.md`, `.claude/settings.json`, or CI workflow — which a bare
  `--force` clobbers with the generic templates. The stale-skill notice and
  `/ark-upgrade` now recommend this scoped command.

### Changed — /ark-contract verifies a file move before recommending it

- `/ark-contract` could suggest moving a file to a more fitting layer (e.g. an
  HTTP client into an integration layer) without checking that the file's own
  imports are legal there. If the file also imports a layer the target may not
  (a client that reads a persistence-layer cache, `Integration → Persistence`
  denied), the "clean config change" actually breaks the contract. The skill now
  resolves the file's imports against the target layer's rules first and, when
  they don't fit, reports it as a refactor (split the file), not a config edit.

### Fixed — regenerating CI keeps `--baseline`

- The generated GitHub workflow (and the `--require-gates` command it runs)
  hard-coded `--strict-config --require-gates`. Re-running `--install-agent-gates
  --force` on a project that had added `--baseline .ark-baseline.json` silently
  dropped the flag, so CI would start failing on frozen violations instead of
  ratcheting. The workflow now includes `--baseline .ark-baseline.json` whenever
  the project has a baseline file, so regeneration preserves the ratchet.

## 1.7.4 — 2026-07-05

### Fixed — `include` accepts single files, not just directories

- `ark-check` walked every `include` entry with `scandir`, so listing a
  root-level source file (e.g. Next.js `middleware.ts`, `instrumentation.ts`)
  crashed with `ENOTDIR: not a directory`. `walk()` now governs a file entry
  directly (subject to the same source-extension filter) and still recurses into
  directory entries. This makes `/ark-coverage`'s "govern middleware.ts"
  recommendation actually applicable.

### Changed — skill polish

- `/ark-coverage` now instructs reading files with the Read tool and targeted
  commands instead of `cat`-ing whole configs to the terminal, so the audit run
  stays readable.
- `/ark-place` and `/ark-contract` document their no-argument path: when invoked
  with nothing to place / no change described, print the placement map or the
  contract snapshot + evolution options (derived from the live config) and ask,
  instead of erroring or guessing. Makes the helpful behavior guaranteed, not
  emergent.

## 1.7.3 — 2026-07-05

### Fixed — /ark-upgrade now checks the registry, and the package ships its CHANGELOG

- The `/ark-upgrade` skill only read the version already in `node_modules`, so a
  repo with a pinned lockfile reported "no update available" while a newer
  version was published. It now checks `npm view ark-runtime-kernel version`,
  updates the dependency (`npm install -D …@latest` or the project's package
  manager) so the lockfile moves too, and still refreshes gates/skills when
  already on the latest (a prior version may have shipped skills the repo never
  installed).
- `CHANGELOG.md` is now included in the published package (`files`). The
  `/ark-upgrade` changelog-triage step referenced it, but it wasn't shipped, so
  consumers had to `npm pack` and diff tarballs to see what changed. The skill
  falls back to `npm view` / GitHub release notes if an older release is missing it.

## 1.7.2 — 2026-07-05

### Changed — blocked infra imports point at the exemption

- When the write-gate blocks an infrastructure import and the file has a known
  layer, the fix hint now names the escape hatch: mark the layer in
  `ark.config.json` with `"mayImportInfrastructure": true` (or name it with an
  infra token). Previously the message only said "remove the import", so a
  legitimately-infra layer with an unconventional name looked like a hard block
  and required reading internals to discover the exemption. Zero-config
  projects (no layer context) keep the plain hint — the flag doesn't apply there.
- The PreToolUse hook (`ark-mcp --hook`) now prints the gate's fix hints under a
  `fix:` block. It was building the block message from the rule id and message
  only, silently dropping every `suggestion` — so the port/adapter guidance and
  the new infra-layer escape hatch never reached the agent. Hints are deduped.

### Added — `ark-check` surfaces uninstalled skills

- A normal `ark-check` run now advises when a project that has adopted Ark agent
  gates (`AGENTS.md` present) is missing `/ark-*` skills this version ships for a
  detected tool (`.claude/`, `.cursor/`, `.codex/`, `.windsurf/`, `.clinerules/`),
  pointing at `--install-agent-gates`. The `--json` output gains a `skillGaps`
  field. Rationale: the postinstall message was the only discovery path for new
  skills, and modern npm blocks postinstall scripts by default — so the most
  careful users (and CI) never saw it. `ark-check` runs everywhere, so the notice
  now actually lands. Advisory only; never affects the exit code.

## 1.7.1 — 2026-07-05

### Fixed — write-gate infra heuristics now respect the layer's role

- The AI write-gate's built-in infrastructure-import heuristics
  (`FORBIDDEN_PATTERN` / `FORBIDDEN_IMPORT` for `/infra`, `/adapters`,
  `/persistence`, `/db`, and ORMs) fired on **every** file regardless of its
  layer. A persistence- or adapter-layer file that legitimately imports the
  database was blocked by the PreToolUse hook even though `ark-check` (CI)
  passed it — the gate contradicted the project's own `ark.config.json`.
- The heuristics are now suppressed for layers whose name declares an
  infrastructure role (`adapter`, `infra`, `persistence`, `repository`,
  `integration`, `database`), so those layers may import infrastructure as the
  contract intends. The pure core (domain/application) and zero-config projects
  (no layer context) are unchanged — infra imports there are still blocked.
  User-supplied `forbiddenPatterns` are an explicit opt-in and always apply,
  in every layer.
- For an infrastructure layer with an unconventional name (`Storage`, `Gateway`,
  …), flag it in `ark.config.json` with `"mayImportInfrastructure": true` and the
  gate exempts it too. `createAICodeGate` gained an `infrastructureLayers` option
  carrying these names. This makes the fix universal: any project, any layer
  naming, without losing domain-purity protection.

## 1.7.0 — 2026-07-05

### Added — /ark-* agent skills, installed for every detected CLI

- New `templates/skills/` set of eight autonomous slash-command skills:
  `ark-coverage` (audit which Ark capabilities the project is NOT using, ranked
  with the exact command to enable each), `ark-fix` (resolve violations at the
  root cause — ports/moves, never weaken the contract), `ark-adopt` (baseline
  freeze + ratchet onboarding), `ark-place` ("where does X go?" answered from
  the contract), `ark-contract` (safe `ark.config.json` evolution), `ark-explain`
  (plain-language architecture tour for newcomers), `ark-runtime` (migrate
  hand-rolled event bus/outbox/sagas to the runtime kernel), and `ark-upgrade`
  (refresh gates + skills after a package update).
- `ark-check --install-agent-gates` now installs the skills into each detected
  tool's command location: `.claude/skills/<name>/SKILL.md`,
  `.cursor/commands/`, `.codex/prompts/`, `.windsurf/workflows/`, and
  `.clinerules/workflows/` (plus `.github/prompts/` for Copilot, which is
  explicit-only via `--tools copilot`). Kiro has no command mechanism, so it
  keeps only its steering rule file. One canonical markdown per skill; existing
  files are never overwritten without `--force`, so re-running after an update
  only adds what's missing.
- The skills are written to work unattended: they gather everything from the
  repo, take documented defaults instead of asking, finish with a strict
  `ark-check`, and report what they did — usable both by advanced users and by
  developers new to architecture governance (plain-language explanations are
  part of each skill's contract).
- Postinstall message now tells existing Ark projects to re-run
  `npx ark-check --install-agent-gates` after updating, so new templates and
  skills reach every configured agent CLI, not just one.

## 1.6.0 — 2026-07-04

### Changed — bounded in-memory retention by default

- `createArkKernel` now defaults `maxHistorySize` to `DEFAULT_MAX_HISTORY_SIZE`
  (1000), capping event history, trace, and audit records with oldest-first
  eviction. Previously these grew without bound in long-running processes.
  Pass `maxHistorySize: Infinity` to restore the old unbounded behavior.

### Added — custom layer matchers

- `ArchitectureLayer` accepts an optional `match: (name) => boolean` for teams
  whose intent names don't follow prefix conventions. Matchers are checked
  before prefixes, in layer declaration order, and can be combined with or
  replace `prefixes` (use `prefixes: []` for match-only layers).

## 1.5.0 — 2026-07-04

### Added — ark-check scan cache

- `ark-check` caches per-file scan results in `node_modules/.cache/ark-check.json`,
  keyed by each file's mtime+size and the config/manifest contents. Only unchanged
  files skip the TypeScript parse; import edges are ALWAYS re-resolved against the
  live filesystem, so the cache can never hide a violation introduced by adding,
  moving, or deleting other files. `--no-cache` disables it.

### Added — monorepo per-package tsconfig resolution

- Without `--tsconfig`, `ark-check` now resolves each file's path aliases against the
  NEAREST `tsconfig.json` above it (like `tsc`), so a monorepo can run under a single
  `--root` with per-package alias maps. `--tsconfig` still forces one config for all files.

### Deprecations (removal planned for 2.0)

- `AIGateViolation.code` (`src/kernel/ai-gate/types.ts`) — use `ruleId`.
- `layeredArchitectureRules()` (`src/kernel/policy/builtins.ts`) — use `cleanArchitectureMatrix()`.

## 1.4.0 — 2026-07-03

### Changed — the write gate now ratchets like the CI gate

- `ark-mcp --hook` blocks an edit only when it ADDS violations relative to the file's
  current on-disk state. Previously any pre-existing violation (frozen in a baseline or
  predating Ark adoption) made every subsequent edit to that file un-writable while CI
  passed — with the new auto-seeded `forbiddenGlobals`, that would have hit ordinary
  brownfield upgrades. New files still block on every violation.

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
