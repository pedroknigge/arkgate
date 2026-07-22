# ArkGate Enforcement (self-hosted)

## Identity — read this first (every agent)

> **Git / clone only.** This file is **not** published in the npm package. Consumers who
> `npm install arkgate` never see it. Do **not** copy this Identity block into generated
> consumer `AGENTS.md`, README, or other surfaces that ship with the library.

**This working tree is the mother / canonical development repository for the ArkGate library.**

| Fact | Meaning for you |
|------|-----------------|
| **What this is** | Source of truth for product **ArkGate**, npm package **`arkgate`**, dual CLIs `arkgate*` + `ark*`, MCP, published skills (`templates/skills/`), and the optional runtime kernel. |
| **What this is not** | A normal app that *depends on* `arkgate`. Consumer monorepos (product apps, galleries, client projects) are **downstream** — never treat this tree as “just another project with arkgate installed.” |
| **Where you are** | Library **authoring** root. Edits here ship (or dogfood) the package itself. |
| **Contract shape** | Self-hosted **4-layer** profile in `ark.config.json` (DomainModel / Kernel / Tooling / FrameworkAdapters) — **not** the default 11-layer consumer starter. |
| **Dogfood** | Gates run on **this** tree via local `bin/` + `dist/` after `npm run build`. Prefer workspace CLIs over a stale global `arkgate`. |

If the task is “improve arkgate the product,” you are in the right place. If the task is “adopt Ark on a business app,” you are usually in a **different** repository that lists `arkgate` as a dependency.

---

## Project knowledge map

Code and manifests are the source of truth for implementation details and for whether a
structural claim is true. These documents capture product intent, operating constraints, and
retained decisions; when they disagree with code, fix or flag the documentation.

| Topic | Canonical authority |
|-------|---------------------|
| Public product and first-run flow | [README.md](README.md) |
| Stable vs experimental package contract | [docs/package-surface.md](docs/package-surface.md) |
| Config contract and schema | [docs/configuration.md](docs/configuration.md) |
| Agent, CLI, MCP, and runtime reference | [docs/agent-guide.md](docs/agent-guide.md) |
| Host enforcement setup | [docs/ai-gates.md](docs/ai-gates.md) |
| TypeScript compatibility | [docs/typescript-support.md](docs/typescript-support.md) |
| Brownfield and enthusiast adoption | [docs/brownfield-adoption.md](docs/brownfield-adoption.md) · [docs/enthusiast/](docs/enthusiast/README.md) |
| Security | [SECURITY.md](SECURITY.md) · [docs/threat-model.md](docs/threat-model.md) |
| Decisions | [docs/adr/](docs/adr/README.md) |
| Implementation queue | [ROADMAP.md](ROADMAP.md) |
| Releases | [CHANGELOG.md](CHANGELOG.md) · [3.8.2 notes](docs/releases/3.8.2.md) |
| Documentation audit | [docs/audit/claims-matrix.md](docs/audit/claims-matrix.md) |

Read this hub and the relevant authority before significant work. After changing a public
surface, architecture boundary, decision, or plan, update its authority and the coverage row.

### Package index

The product tree contains two publishable Node/TypeScript packages. Example manifests under
`examples/` are gallery fixtures, not additional workspace packages.

| Package path | Role | Manifest | Canonical docs | Docs status |
|--------------|------|----------|----------------|-------------|
| `.` | Stable ArkGate gate, CLIs, MCP, ESLint, schemas, and integration assets | [package.json](package.json) | [README.md](README.md) · [package surface](docs/package-surface.md) | documented |
| `packages/runtime` | Optional experimental runtime companion and NestJS adapter | [package.json](packages/runtime/package.json) | [package README](packages/runtime/README.md) · [package surface](docs/package-surface.md#experimental-opt-in-surfaces) | documented |

### Surface coverage

Coverage units are externally consumable manifest entries and shipped integration-asset
families, plus the repository-only maintainer evidence surface. Internal `bin/lib/` helpers,
generated artifacts, individual source modules, and test fixtures are evidence for these rows,
not separate product surfaces. **Audit result (2026-07-17): 100% of this bounded set has a
canonical documentation authority.**

| Surface | Code / manifest evidence | Canonical documentation | Status | Documentation gap |
|---------|--------------------------|-------------------------|--------|-------------------|
| Stable `arkgate` package and programmatic gate API | `package.json` export `.` · `src/gate.ts` | [Package surface](docs/package-surface.md#programmatic-root-api) | Real | — |
| Setup CLI (`arkgate` / `ark`) | `package.json` bins · `bin/ark.mjs` | [README commands](README.md#common-commands) · [Agent guide](docs/agent-guide.md#terminal-onboarding-phase-b) | Real | — |
| Check/doctor CLI (`arkgate-check` / `ark-check`) | `package.json` bins · `bin/ark-check.mjs` | [Agent guide](docs/agent-guide.md) · [Brownfield guide](docs/brownfield-adoption.md) | Real | — |
| MCP, `ark://manifest`, write hooks, and registry descriptor | `bin/ark-mcp.mjs` · `server.json` | [MCP reference](docs/agent-guide.md#write-path-gate-mcp) · [AI gates](docs/ai-gates.md) | Real | — |
| Config and public schemas | `ark.config.json` · `schemas/` · package schema exports | [Configuration](docs/configuration.md) · [Package surface](docs/package-surface.md) | Real | — |
| ESLint plugin | package export `./eslint` · `src/eslint/index.ts` | [AI gates](docs/ai-gates.md#eslint-editor-feedback--same-contract-as-ci) | Real | — |
| Agent integration assets | `templates/skills/` · `templates/hooks/` · `templates/tests/` | [Agent guide](docs/agent-guide.md#supported-agent-hosts) · [AI gates](docs/ai-gates.md) | Real | — |
| Shape playbook, policy packs, and gallery starters | `templates/architecture-playbook.json` · `templates/policy-packs/` · `examples/` | [Enthusiast track](docs/enthusiast/README.md) | Demo | — |
| GitHub Action | `action.yml` | [Action setup and inputs](docs/ai-gates.md#ci-backstop) · [Package surface](docs/package-surface.md) | Real | — |
| Experimental `@arkgate/runtime` | `packages/runtime/package.json` · `src/index.ts` | [Runtime README](packages/runtime/README.md) · [Package surface](docs/package-surface.md#experimental-opt-in-surfaces) · [Hardening](docs/production-hardening.md) | Partial | — |
| Experimental runtime NestJS adapter | runtime export `./nestjs` · `src/nestjs/index.ts` | [Package surface](docs/package-surface.md#experimental-opt-in-surfaces) | Partial | — |
| Deprecated `arkgate/runtime` and `arkgate/nestjs` forwarders | root package exports · `compat/` | [Package surface](docs/package-surface.md#experimental-opt-in-surfaces) · [Migration guide](docs/migrate-from-ark-runtime-kernel.md) | Deprecated | — |
| Published payload and compatibility fixture | root `package.json` `files` · `scripts/verify-package-files.mjs` | [Package surface](docs/package-surface.md) · [Contributing](CONTRIBUTING.md) | Real | — |
| Maintainer verification, evaluation, and release workflows | root scripts · `tests/` · `eval/` · `.github/workflows/` | [Contributing](CONTRIBUTING.md) · [Eval guide](eval/README.md) · [Roadmap](ROADMAP.md) | Real | — |

This repo **is** ArkGate, governed by its own working-tree gates — not the published package.
The PreToolUse hook and the `ark` MCP server run `node bin/ark-mcp.mjs`, which loads
`dist/index.js`: run `npm run build` after cloning or the write gate reports an error
instead of validating. Product name **ArkGate**; npm `arkgate`; dual bins `arkgate*` + `ark*`.

**Do not replace this file** with the consumer `AGENTS.md` template from
`--install-agent-gates` without preserving this Identity section and the 4-layer table
below — this document is **project-owned self-hosted** guidance for the library git tree,
not something end users download with the package.

Before editing TypeScript or JavaScript source files:

1. Read the Ark contract from `ark://manifest` when the MCP server is available.
2. Keep source files inside the layer boundaries declared in `ark.config.json`.
3. Do not bypass Ark publishers, event contracts, or source metadata for runtime mutations.
4. After edits, run `npm run check:architecture`.
5. If Ark reports violations, fix the architecture instead of weakening the gate.

## Where new code belongs

`ark.config.json` is authoritative. This project uses four layers, not the default
11-layer profile:

| Layer | Directories | Notes |
|-------|-------------|-------|
| DomainModel | `src/domain/` + generated pure CLI artifacts | Pure types and invariants. `fetch`, `process`, `Date.now`, `Math.random` are forbidden globals here — inject a port instead. |
| Kernel | `src/kernel/`, `src/runtime/`, `src/gate.ts`, `src/index.ts`, `src/version.ts` | The gate API plus experimental runtime sources. May depend on DomainModel only. |
| Tooling | `src/eslint/`, `bin/`, `scripts/` | ESLint plugin, standalone CLIs, and repository scripts. May import **DomainModel only** (pure helpers). Not Kernel. |
| FrameworkAdapters | `src/nestjs/` | Optional NestJS integration. May depend on Kernel only. |

The CLIs (`bin/*.mjs`, `bin/lib/*.mjs`) run standalone and must not import from `src/`
or `dist/` except `ark-mcp` loading the built library. Shared CLI logic lives in
`bin/ark-shared.mjs`. **Pure Domain algorithms** (edit TS, then regenerate CLI artifacts):

| Canonical | Generated | Commands |
|-----------|-----------|----------|
| `src/domain/layerMatch.ts` | `bin/ark-layer-match.mjs` | `generate:layer-match` / `check:layer-match` |
| `src/domain/remediation.ts` | `bin/lib/remediation.mjs` | `generate:cli-pure` / `check:cli-pure` |
| `src/domain/baselineKey.ts` | `bin/lib/baseline-key.mjs` | (same `cli-pure` scripts) |
| `src/domain/configContract.ts` | `bin/lib/config-contract.mjs` + `schemas/ark.config.schema.json` | (same `cli-pure` scripts) |
| `src/domain/resolvedCandidateFactsSchema.ts` | `schemas/ark.resolved-candidate-facts.schema.json` | (same `cli-pure` scripts) |
| `src/domain/changeMap.ts` | bundled in `bin/lib/analysis-engine.mjs`; schema parity test guards `schemas/ark.change-map.schema.json` | `generate:analysis-engine` / `check:analysis-engine` |
| `src/domain/changeConvergence.ts` | bundled in `bin/lib/analysis-engine.mjs` | `generate:analysis-engine` / `check:analysis-engine` |
| Tooling `bin/lib/*.source.mjs` + design-delta schema source | compact shipped `design-delta.mjs`, `enforcement-state.mjs`, `hook-templates.mjs`, and design-delta schema | `generate:packaged-tooling` / `check:packaged-tooling` |

Parity/drift tests + CI enforce generated files stay in sync.

The project is only considered Ark-enforced when the write gate, CI gate, and runtime path all pass.

## Product plans (library epic queue seeds)

Implementation queue remains **`ROADMAP.md`** (one `doing` at a time). Narrative epic seeds and
retained shipped rationale live under `docs/plans/`:

| Plan | Status | Purpose |
|------|--------|---------|
| [power-simple-shape](docs/plans/power-simple-shape/README.md) | Shipped | Dual depth (dev power + newbie simplicity) → AI-clear, maintainable code after Enforce |
| [change-integrity-loop](docs/plans/change-integrity-loop/README.md) | Shipped in 3.1.0 | Context-independent contract guard, atomic patch preflight, dual-depth remediation, and structural convergence |
| [understandable-execution](docs/plans/understandable-execution/README.md) | Shipped in 3.4.0 | Explicit effect/state boundaries, cohesive enforcement core, and measured pre-tool flow without style dogma |
| [reshape-copilot](docs/plans/reshape-copilot/README.md) | Shipped in 3.6.0 | Advisory physical-cohesion evidence and one governed reshape pilot at a time |
| [enforcement-truth-at-speed](docs/plans/enforcement-truth-at-speed/README.md) | In progress (Phase Z; Z01–Z08 + Z10 done; Z09 parked claim gate / residual RB-11) | Restore packed-artifact truth and one adapter verdict; residual retained-adoption + independent close only |

Do not treat a plan as authorization to start work until its IDs appear as `doing`/`todo` in
`ROADMAP.md`.

## Repo hygiene before handoff

Before considering repository work complete, verify the public repo is clean:

1. Latest GitHub Actions checks for the pushed head SHA are passing.
2. GitHub Dependabot has no open vulnerability or malware alerts.
3. There are no open bot PRs, especially Dependabot PRs, left untriaged.
4. The local working tree is clean and aligned with `origin/main`.

If GitHub cannot be reached, report that the repo-hygiene check is unverified instead
of assuming it is clean.
