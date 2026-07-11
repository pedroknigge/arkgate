# Structrail Enforcement (self-hosted)

## Identity — read this first (every agent)

> **Git / clone only.** This file is **not** published in the npm package. Consumers who
> `npm install structrail` never see it. Do **not** copy this Identity block into generated
> consumer `AGENTS.md`, README, or other surfaces that ship with the library.

**This working tree is the mother / canonical development repository for the Structrail library.**

| Fact | Meaning for you |
|------|-----------------|
| **What this is** | Source of truth for product **Structrail**, npm package **`structrail`**, primary CLIs `structrail*`, MCP, published skills (`templates/skills/`), and the optional runtime kernel. |
| **What this is not** | A normal app that *depends on* `structrail`. Consumer monorepos (product apps, galleries, client projects) are **downstream** — never treat this tree as “just another project with structrail installed.” |
| **Where you are** | Library **authoring** root. Edits here ship (or dogfood) the package itself. |
| **Contract shape** | Self-hosted **4-layer** profile in `structrail.config.json` (DomainModel / Kernel / Tooling / FrameworkAdapters) — **not** the default 11-layer consumer starter. |
| **Dogfood** | Gates run on **this** tree via local `bin/` + `dist/` after `npm run build`. Prefer workspace CLIs over a stale global `structrail`. |

If the task is “improve Structrail the product,” you are in the right place. If the task is “adopt Structrail on a business app,” you are usually in a **different** repository that lists `structrail` as a dependency.

---

This repo **is** Structrail, governed by its own working-tree gates — not the published package.
The PreToolUse hook and the `structrail` MCP server run `node bin/structrail-mcp.mjs`, whose
standalone core loads
`dist/index.js`: run `npm run build` after cloning or the write gate reports an error
instead of validating. Product name **Structrail**; npm `structrail`; primary bins `structrail*`.

<!-- legacy-identity:start v3-compatibility -->
The separate `compat/arkgate/` package owns the deprecated `arkgate*` and `ark*` v3 paths.
<!-- legacy-identity:end -->

**Do not replace this file** with the consumer `AGENTS.md` template from
`--install-agent-gates` without preserving this Identity section and the 4-layer table
below — this document is **project-owned self-hosted** guidance for the library git tree,
not something end users download with the package.

Before editing TypeScript or JavaScript source files:

1. Read the Structrail contract from `structrail://manifest` when the MCP server is available.
2. Keep source files inside the layer boundaries declared in `structrail.config.json`.
3. Do not bypass Structrail publishers, event contracts, or source metadata for runtime mutations.
4. After edits, run `npm run check:architecture`.
5. If Structrail reports violations, fix the architecture instead of weakening the gate.

## Where new code belongs

`structrail.config.json` is authoritative. This project uses four layers, not the default
11-layer profile:

| Layer | Directories | Notes |
|-------|-------------|-------|
| DomainModel | `src/domain/` + generated pure CLI artifacts | Pure types and invariants. `fetch`, `process`, `Date.now`, `Math.random` are forbidden globals here — inject a port instead. |
| Kernel | `src/kernel/`, `src/runtime/`, `src/index.ts`, `src/version.ts` | The library itself (+ `structrail/runtime` entry). May depend on DomainModel only. |
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

Parity/drift tests + CI enforce generated files stay in sync.

The project is only considered Structrail-enforced when the write gate, CI gate, and runtime path all pass.

## Repo hygiene before handoff

Before considering repository work complete, verify the public repo is clean:

1. Latest GitHub Actions checks for the pushed head SHA are passing.
2. GitHub Dependabot has no open vulnerability or malware alerts.
3. There are no open bot PRs, especially Dependabot PRs, left untriaged.
4. The local working tree is clean and aligned with `origin/main`.

If GitHub cannot be reached, report that the repo-hygiene check is unverified instead
of assuming it is clean.
