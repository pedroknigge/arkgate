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
| `src/domain/changeMap.ts` | bundled in `bin/lib/analysis-engine.mjs`; schema parity test guards `schemas/ark.change-map.schema.json` | `generate:analysis-engine` / `check:analysis-engine` |
| `src/domain/changeConvergence.ts` | bundled in `bin/lib/analysis-engine.mjs` | `generate:analysis-engine` / `check:analysis-engine` |

Parity/drift tests + CI enforce generated files stay in sync.

The project is only considered Ark-enforced when the write gate, CI gate, and runtime path all pass.

## Product plans (library epic queue seeds)

Implementation queue remains **`ROADMAP.md`** (one `doing` at a time). Narrative epic seeds and
retained shipped rationale live under `docs/plans/`:

| Plan | Status | Purpose |
|------|--------|---------|
| [power-simple-shape](docs/plans/power-simple-shape/README.md) | Shipped | Dual depth (dev power + newbie simplicity) → AI-clear, maintainable code after Enforce |
| [change-integrity-loop](docs/plans/change-integrity-loop/README.md) | Shipped in 3.1.0 | Context-independent contract guard, atomic patch preflight, dual-depth remediation, and structural convergence |

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
