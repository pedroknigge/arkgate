# Changelog

All notable changes to `ark-runtime-kernel` are documented here.

## 1.19.0 — 2026-07-08

Co-pilot Phase H — the safe apply loop (the `loop` primitive).

### Added

- **`/ark-loop` skill** — drives the remediation plan toward the goal, one step at a time, in a
  discardable git worktree: auto-applies only the changes Ark classed `mechanical-safe`
  (validating each with `ark-check` and rolling back any regression), PROPOSES the `judgment`
  ones for a human decision, and never weakens the gate. Loops until the goal is met or a round
  makes no progress, then reports what was auto-applied vs proposed vs deferred. Honors the
  principle: the agent edits, Ark validates — code only, never DB/schema. Installed for every
  detected agent CLI like the other `/ark-*` skills.
- **`goal.met`** in `ark-check --plan --json` — the loop's termination signal (true when there
  are no active violations left).

## 1.18.0 — 2026-07-08

Co-pilot Phase G — a guided front door for newcomers (`ark start`).

### Added

- **`ark start`** — one guided command that takes a newcomer from "I have a project" to
  "governed, with a plan," in plain language and without knowing any preset or skill name. It
  looks at the repo and describes the shape in everyday terms, sets up the config + agent/CI
  gates, and finishes with the classified plan (`safe to auto-fix` vs `your call`) plus plain
  next steps. On an established codebase (≥150 files) it adopts your real structure via
  detection instead of imposing a preset; on a fresh project it uses the recommended shape.
  Interactive by default; `--yes` runs non-interactively. It only orchestrates existing steps
  (recommend → init → `--plan`) and changes no source code. This is the co-pilot's guided-entry
  and plain-language layer (Phase G).

## 1.17.0 — 2026-07-08

Co-pilot Phase F — a classified remediation plan (the `plan` + `goal` primitives).

### Added

- **`ark-check --plan [--json]`** — reads your active violations and sorts each into
  `mechanical-safe` (behavior-preserving and gate-verifiable — safe for an agent to auto-apply),
  `judgment` (real coupling or a design choice — Ark proposes, you decide), or `deferred`, with a
  `confidence` and a plain-language `rationale`, ordered auto-first, wrapped in a `goal` block
  (active violations → 0 without weakening the contract). Report-only — it changes no files.
  This is the **plan** primitive of Ark's co-pilot; the coming worktree-safe apply-loop consumes
  it. The classifier (`classifyRemediation`) is shared in `ark-shared.mjs` so the CLI, the MCP
  gate, and the future loop classify identically. `--doctor` now points at it. The v1 classifier
  is biased toward `judgment` — only a provably-safe type-only import move earns `mechanical-safe`.

## 1.16.0 — 2026-07-08

One command to update Ark.

### Added

- **`ark upgrade`** (alias **`ark update`**) — a single command that replaces the multi-step
  update chain: bumps the package to `@latest` (via the detected package manager), refreshes
  gate templates + `/ark-*` skills (and Codex home prompts when `~/.codex` exists), migrates
  command runners to the project's package manager, and runs the strict architecture check.
  `--no-install` refreshes gates/skills against the installed version; `--no-strict` skips the
  final check. Each step reruns as a fresh process, so the refresh runs from the freshly
  installed version. The `/ark-upgrade` skill and README now point at it.

## 1.15.1 — 2026-07-08

Fix package-manager detection so a stray lockfile can't hijack a project's commands.

### Fixed

- **A leftover `pnpm-lock.yaml` (or `yarn.lock`) no longer hijacks an npm project.** Detection
  now honors the `package.json` `packageManager` field first, and on a lockfile conflict a
  present `package-lock.json` wins — because `npx` runs fine in a pnpm/yarn repo, but
  `pnpm exec` / `yarn` in an npm repo breaks (`ERR_PNPM_OUTDATED_LOCKFILE`,
  `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`, a spurious pnpm lock). Previously any
  `pnpm-lock.yaml` was preferred over `package-lock.json`, so `--migrate-commands` rewrote the
  `check:architecture` script (and every emitted command) to `pnpm exec`, and `npm run
  check:architecture` then failed. All emitted commands, the CI workflow, the install hints,
  and the stale-runner advisory share the one detector.
- **Multiple-lockfile warning.** `--install-agent-gates` and `--migrate-commands` now say which
  package manager they picked when more than one lockfile is present, and how to override it
  (set `packageManager`, or remove the stray lockfile).

## 1.15.0 — 2026-07-08

Brownfield install & onboarding hardening + layer `exclude` — from a real install session
on a mature repo.

### Changed

- **No install lifecycle scripts.** Removed the `postinstall` banner (and `bin/ark-postinstall.mjs`).
  It was a pure `console.log`, but its mere presence tripped pnpm's build-script approval gate;
  in a hardened repo (blocked build scripts + `minimumReleaseAge`) that left `pnpm install` at
  exit 1 and could take down a dev server. Ark now installs with zero prompts and never runs code
  on install. The "run `ark init`" guidance lives in the README and npm page instead.
- **`ark init` / `ark-check --recommend` route mature repos to adoption.** On an established
  codebase (≥150 source files) where a starter contract governs a thin slice, both now steer to
  `ark-check --recommend --write-plan` + `/ark-adopt` — which align the contract to the repo's
  real structure — instead of leaving a thin or false-red gate from aspirational DDD wildcards.

### Fixed

- **`ark --help` / `ark -h` / `ark help`** now print usage and exit 0 (a flag in the command
  position was reported as `Unknown command: --help`).
- **Generated CI** enables corepack **before** `actions/setup-node`, so `cache: pnpm|yarn` can
  resolve the package manager on a fresh runner instead of failing.

### Added

- **Layer `exclude` globs.** A layer may declare `exclude: [...]` to carve subtrees out of a
  broad `patterns` glob. An excluded file is ungoverned by that layer — removed from its rules
  and `forbiddenGlobals` too. Resolved in the single `layerForFile` matcher shared by the
  ark-check CI gate and the ark-mcp write gate, so both classify identically. The wildcard
  starter presets (hexagonal, layered) now ship `"exclude": ["**/kernel/**"]` on every layer,
  so `src/**/domain/**` no longer mis-flags framework internals under `src/kernel/domain/`.
- **`"./package.json"` export** — tooling can read the installed version without an exports error.

## 1.14.0 — 2026-07-07

Architect onboarding Phases A–E: enthusiast-first path from application shape to gated adoption.

### Added

- **`templates/architecture-playbook.json`** — ten tool-agnostic application archetypes.
- **`ark-check --recommend`** (+ `--json`, **`--write-plan`** → `ark-adoption-plan.json`).
- **`ark init` enthusiast wizard** and **`ark init --archetype <id> --yes`**.
- **MCP `ark_recommend`**, skill **`/ark-architect`**, session-context enthusiast hint.
- **Terminal UX**: doctor "New here?", fix-class / `enthusiastHint`, `--watch`, `--report --beginner`.
- **Example gallery** (`examples/*-starter/`), comparative eval (30 prompts), nightly workflow, three public demo scripts.
- **Enthusiast policy packs** — `ark-check --list-policy-packs`, `--apply-policy-pack enthusiast-<preset>`.
- **Diátaxis enthusiast track** — `docs/enthusiast/`.

### Fixed

- **`collectRepoShapeSignals`** — skip unreadable directories instead of crashing `--recommend`.
- **Policy pack ids** — reject path-like ids; only canonical `templates/policy-packs/` entries apply.

## 1.13.0 — 2026-07-06

### Added

- **`ark-check --doctor`** — one consolidated adoption health view: governed %, ungoverned
  directories, empty layers, weak rule coverage, the violation summary (value vs type-only +
  concentration verdict), installed gates, installed skills, baseline health, and stale command
  runners — each with the exact fix command, plus a ranked "Top actions" list. `--doctor --json`
  for tooling.
- **Brownfield burn-down playbook** ([docs/brownfield-adoption.md](docs/brownfield-adoption.md))
  — the end-to-end sequence for a large pre-existing codebase (diagnose → classify → facade
  split → freeze only real debt → burn down), plus a matching `/ark-fix` fix class for
  relocating raw infrastructure access (SQL or a DB client imported into a route) **verbatim**
  into a repository/adapter — the value-import counterpart to the type-only inversion pattern.

### Changed

- `/ark-upgrade` now handles the pnpm `minimumReleaseAge` cooling-off: when a freshly-cut
  version is inside the window, add it to `minimumReleaseAgeExclude` before installing so a
  loose-mode `pnpm add` can't leave a lockfile that `--frozen-lockfile` (CI) rejects.

## 1.12.0 — 2026-07-06

Makes `ark.config.json` authoritative on BOTH gates, and closes the upgrade gap where the
package-manager-aware commands didn't reach a repo's existing gate files.

### Changed

- **The AI write gate honors the contract over its infra heuristic.** A cross-layer import
  that resolves to a declared layer is now judged by the config's layer RULES — exactly like
  `ark-check` — so the write gate and CI can't disagree on a governed edge. An edge the
  contract allows (a route calling a repository, a repository importing the DB) is no longer
  blocked, and a denied edge is reported as `LAYER_IMPORT_VIOLATION`. The infrastructure
  path-heuristic (and `mayImportInfrastructure`) now applies only to **ungoverned** targets —
  external packages, or paths no declared layer covers. `ark-mcp` resolves the target layer
  from the config's layer globs + tsconfig path aliases (a barrel import is classified by its
  directory). Backward-compatible: with no resolver supplied, the gate's behavior is unchanged.

### Added

- **`ark-check --install-agent-gates --migrate-commands`** — rewrites only the Ark command
  runner (`npx` / `pnpm exec` / `yarn`) in existing gate files (`.claude/settings.json`,
  `.mcp.json`, `AGENTS.md`, rule files, the `check:architecture` script) to match the
  project's package manager, preserving every customization (no `--force` clobber). For repos
  that adopted Ark before its emitted commands became package-manager-aware. A normal
  `ark-check` now advises when a gate file's runner doesn't match the package manager, and
  `/ark-upgrade` runs the migration as part of its refresh flow.

## 1.11.0 — 2026-07-06

Sharpens Ark from "enforce a clean architecture" to **helping a team organize a messy,
pre-existing codebase — without presenting a false-green.** The tool now reports what it
actually governs, separates real debt from false positives, and guides the cleanup in order.

### Added

- **Package-manager-aware commands.** Every command Ark emits — the AGENTS.md contract,
  `.mcp.json`, the Claude/Codex hooks, the `check:architecture` script, the postinstall hints,
  the "install TypeScript" hint — now follows the project's package manager
  (`pnpm exec` / `yarn` / `npx`), not just the CI workflow. A pnpm/yarn repo is never handed
  an `npx` instruction.
- **Honest coverage + layer proposals.** `ark-check --coverage` leads with `Governed: N%`,
  warns loudly when Ark governs a minority of the tree, and proposes a canonical layer for
  each ungoverned directory (harvested from the 11-layer profile and the named presets;
  unrecognized directories are flagged, never guessed). `--init` prints the same proposals.
  New additive `governed` and `suggestions` fields in `--coverage --json`.
- **Violation diagnosis.** `ark-check` groups violations by layer edge and target subtree,
  ranked (the burn-down order), with a concentration verdict. New additive `summary` field in
  the check `--json`.
- **Type-only vs value violations.** Each `LAYER_IMPORT_VIOLATION` is tagged `typeOnly`
  (via the TypeScript AST); the summary splits `valueCount` (real runtime coupling) from
  `typeOnlyCount` (type placement), so a burn-down attacks real coupling first.
- **`/ark-*` skills reoriented to organize** around the "protect the border around a
  framework, not its internals" principle: the facade split (surface/internals + re-export
  barrel) in `/ark-contract`, the type-only inversion pattern in `/ark-fix`, and honest
  coverage in `/ark-coverage` and `/ark-explain`.

### Changed

- **`--update-baseline` refuses a lopsided freeze.** When a single edge dominates the
  violations (a likely contract bug, not debt), the freeze is refused with a diagnosis and a
  pointer to the fix, unless `--force` is passed — so adoption can't bury a wrong contract as
  frozen "debt".
- **Overlapping layer globs resolve by most-specific pattern**, not declaration order, so a
  facade split (`kernel/app/**` as a public surface over a `kernel/**` catch-all) resolves
  correctly regardless of layer order. A new `CONFIG_AMBIGUOUS_LAYERS` warning flags genuine
  equal-specificity overlaps.

### Fixed

- **Scan cache invalidates when the cached shape changes** (schema tag v1 → v2). A warm cache
  written by an older Ark was reused by the new binary, so `typeOnly` reported false for every
  violation after an upgrade until files changed; the cache now invalidates exactly once on
  upgrade and re-populates.

## 1.10.1 — 2026-07-06

### Fixed — Codex MCP wiring

- `ark-check --install-agent-gates` now auto-merges the `[mcp_servers.ark]` table into
  Codex's `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`) whenever Codex is a
  target (`--tools codex` or `--codex-home`), so `ark://manifest` and the AI write gate are
  live from the first edit. Previously Codex only received a copy-me sample at
  `docs/ark-codex-config.toml` — unlike Claude and Cursor, which got machine-readable
  registrations — so an agent that never hand-merged it fell back to the static
  `ark.config.json` and the MCP server never started. The merge is idempotent (an existing
  `ark` table is left untouched unless `--force` replaces it) and preserves other tables.
- The Codex `[mcp_servers.ark]` block now uses **absolute** `--root`/`--config` paths
  (properly escaped for TOML). Because `config.toml` is a global file loaded without the
  project as the working directory, a relative `--root .` would resolve against Codex's
  launch directory — this also fixes projects whose path contains spaces. The install
  output now states the required Codex restart and the expected result (`ark://manifest`
  plus the `validate_code`, `ark_check`, `ark_coverage`, `ark_place` tools).

## 1.10.0 — 2026-07-06

### Added — GitHub-first release hardening

- Added a manual `Publish npm` GitHub workflow that verifies a signed annotated
  `vX.Y.Z` tag, requires the GitHub Release to exist first, runs the full release
  verification suite, publishes to npm with provenance, and uploads the npm tarball
  SHA-256 checksum back to the GitHub Release.
- Added `scripts/verify-release-tag.mjs` so release automation fails before npm when
  the tag does not match `package.json` or is not annotated; signed-tag enforcement can
  be enabled with `ARK_REQUIRE_SIGNED_RELEASE_TAG=true` once release signing is configured.
- Local `npm run release:npm` now defaults to dry-run/local verification. Real local
  publish requires `--allow-local`; the normal release path is GitHub Actions provenance.

### Added — security scanning gates

- Added a dedicated `Security` workflow with CodeQL, Dependabot dependency review on
  pull requests, and Semgrep CE scanning on push, PR, schedule, and manual dispatch.
- Fixed the CodeQL alerts surfaced by that workflow: removed vulnerable built-in regex
  heuristics from the AI write gate and replaced shell-interpolated pack test commands
  with argument-vector process execution.

### Added — runtime profile from `ark.config.json`

- Added `createArchitectureProfileFromArkConfig` plus `createArkKernelFromConfig`,
  `createStrictArkKernelFromConfig`, and `createLenientArkKernelFromConfig` so runtime
  observed layer-flow enforcement can use the same layer prefixes and rules as the
  static architecture gate.
- `ArchitectureLayerConfig.intentPrefixes` is now optional in the public type, matching
  real Ark configs where file-only layers do not participate in runtime intent naming.

### Changed — packaging polish

- Repositioned package metadata and README around Ark as an AI architecture gate for
  TypeScript, with the runtime presented as optional.
- Removed the CJS build warning for the ESLint subpath while preserving its existing
  default and named exports.

## 1.9.1 — 2026-07-06

### Fixed — custom CI workflows count as installed gates

- `ark-check --require-gates` no longer requires the generated workflow filename
  `.github/workflows/ark-check.yml`. It now accepts any GitHub Actions workflow that
  runs `ark-check` or the `check:architecture` npm script, so projects can keep their
  existing `ci.yml` while still enforcing gate presence.

### Added — security policy and runtime audit gate

- Added `SECURITY.md` with private vulnerability reporting guidance and release
  verification notes.
- Added `npm run security:audit`, currently scoped to the published/runtime surface via
  `npm audit --omit=dev --audit-level=high`, and wired it into CI.

### Changed — public roadmap and npm package contents

- Reworked `ROADMAP.md` into a public `Now / Next / Later` roadmap focused on Ark as an
  AI architecture gate for TypeScript.
- Narrowed the npm `files` list for docs so internal planning notes cannot be packed
  accidentally, while explicitly including `SECURITY.md`.

## 1.9.0 — 2026-07-05

### Added — read-side MCP tools for AI agents

The MCP server (`ark-mcp`) now exposes three read-side tools alongside `validate_code`,
so an agent can query the contract instead of shelling out and parsing:

- **`ark_place`** — given a target file path, returns its layer, forbidden globals, and
  which layers it may / must not import. Call it before writing a new file so generated
  code lands in a governed location. Computed in-process from the contract.
- **`ark_check`** — the full architecture check as structured JSON (baseline-aware; a
  `strict` argument toggles config-warning failures).
- **`ark_coverage`** — per-layer file counts, the full list of unclassified (ungoverned)
  files, layers whose patterns match nothing, and layers with no rule edge.

`ark_check` and `ark_coverage` reuse the canonical `ark-check` engine (no duplicated
logic). Tools appear in the agent's tool list automatically — no skill or doc-reading
needed. `/ark-place` and `/ark-coverage` skills now reference the tools (with a CLI fallback).

### Added — `ark-check --coverage`

New report mode: per-layer matched-file counts plus the **full** unclassified-file list
(vs the 5-sample cap on the config warning), `emptyLayers` (patterns matching nothing),
and `layersWithoutRules`. Human-readable, or `--json`. Report-only — always exits 0.

### Added — monorepo-aware `ark init`

`ark init` now auto-detects workspace monorepos (npm/yarn/bun `workspaces` and
`pnpm-workspace.yaml`) and writes a cross-package profile anchored at the real workspace
roots, instead of the `src/**` 11-layer starter that matches nothing in a monorepo. A
new `--preset monorepo` does the same explicitly; its layer patterns match by directory
name in any package (`**/domain/**`, …).

### Added — three more agent gates

`--install-agent-gates` now knows **Roo Code** (`.roo/rules/ark.md`), **Continue**
(`.continue/rules/ark.md`), and **Gemini CLI** (`GEMINI.md`), auto-detected from their
config dirs — instruction-tier rule files derived from the same contract. `ark init`
gained a `--tools` passthrough, and gate installation now prints which tools it targeted
and why (detected / from --tools / default).

### Added — ESLint flat-config recipe

`docs/ai-gates.md` now documents `ark.configs.recommended` plus a domain-scoped block for
`ark/no-forbidden-globals` (which `recommended` deliberately omits, since it needs
per-path scoping).

## 1.8.3 — 2026-07-05

### Fixed — Codex-home refresh guidance no longer clobbers customized gate files

- 1.8.2's stale-skill advisory and the `/ark-upgrade` skill recommended
  `--install-agent-gates --codex-home --force`. Without `--skills-only`, that `--force`
  also rewrites customized gate files (AGENTS.md, CI workflow, settings, rules) — the exact
  clobbering `--skills-only` exists to prevent. Both now recommend
  `--install-agent-gates --skills-only --codex-home --force`, which refreshes the repo skills
  and the Codex-home prompts while leaving customized gate files untouched. The flag behavior
  is unchanged; only the recommended command (and skill guidance) is corrected.

## 1.8.2 — 2026-07-05

### Added — refresh `/ark-*` skills in the Codex home dir

- Codex loads slash-command prompts from `$CODEX_HOME/prompts` (`~/.codex/prompts`), not the
  repo, so a repo refresh never updated them and they silently drifted behind. New:
  `ark-check --install-agent-gates --codex-home` writes the skills there directly (works even
  when the repo has no `.codex/`), and a normal `ark-check` now flags stale/missing skills in
  the Codex home dir by their `arkVersion` stamp — but only when copies already exist, so it
  never introduces Codex to someone who doesn't use it. `--json` gains `codexHomeGap`.

### Improved — richer, clearer HTML report

- `--report` was reworked: layers are ordered innermost → outermost with a **purpose** column
  and per-layer tags; a readable **dependency-direction** view (what each layer may import)
  sits above the precise matrix (now in a collapsible `<details>`); violations are grouped by
  rule with a fix hint each; enforcement points name the file they found; and a stats band and
  footer show layer/rule counts, gate coverage, the Ark version, and the config path.
- Layers accept an optional `"description"` in `ark.config.json`, surfaced as the report's
  purpose column. The named presets seed sensible descriptions so `ark init --preset` produces
  a self-documenting config.
- After writing a report, ark-check reminds you to add it to `.gitignore` (only when a
  `.gitignore` exists and doesn't already list it) — it's a generated artifact.

### Docs — architectural security invariants

- New README section on using layer rules + `forbiddenGlobals` to enforce security invariants
  that are architectural (confining secret/env access, outbound network, and weak randomness to
  the right layers) — without pretending to be a security scanner.

## 1.8.1 — 2026-07-05

### Changed — tighter `/ark-*` skill descriptions

- The eight skill descriptions were trimmed (~30 → ~20 words each), leading with the
  skill's key concept. Skill descriptions load into an agent's context budget; on
  hosts with many installed skills the longer descriptions could push some skills out
  of the model-visible list. Behavior is unchanged — only the frontmatter descriptions.
  Refresh installed copies with `npx ark-check --install-agent-gates --skills-only --force`.

## 1.8.0 — 2026-07-05

### Added — circular dependency detection

- `ark-check` now reports `CIRCULAR_DEPENDENCY`: files that transitively import each
  other. The check runs over the import graph Ark already resolves, so it costs
  almost nothing. One violation per cycle (anchored at the alphabetically-first
  member, so the baseline key is stable), with a fix hint. Cycles participate in the
  `--baseline` ratchet like every other rule and appear in the HTML report.

### Added — named architecture presets

- `ark init --preset hexagonal|layered|feature-sliced` writes a canonical
  `ark.config.json` for a known architecture instead of relying on directory
  detection. Globs use `**` so they fit flat (`src/domain/**`) and modular
  (`src/modules/x/domain/**`) layouts; every layer is `optional`, so the strict check
  passes on a greenfield repo and each layer switches on as its directory gains files.
  `hexagonal` inverts the domain→persistence dependency; `layered` is a relaxed n-tier
  stack; `feature-sliced` is the FSD import ladder.

### Added — HTML architecture report

- `ark-check --report [file.html]` writes a self-contained HTML report (no external
  assets, works offline, light/dark): the layer map with a real example file per
  layer, a who-may-import-whom matrix, current violations with fix hints, and which
  gates are live. A shareable artifact for PRs and onboarding.

### Added — agent-behavior eval harness

- `eval/` (dev-only, not shipped in the npm package): runs a live coding agent against
  seeded architecture violations using Ark's own gate messages, and grades whether the
  agent resolves the violation *without weakening the contract* (editing config,
  baseline, CI, or deleting the feature counts as a failure). Run with
  `npm run eval:agent`.

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
