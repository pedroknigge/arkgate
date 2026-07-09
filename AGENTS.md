# ArkGate Enforcement (self-hosted)

This repo **is** ArkGate, governed by its own working-tree gates — not the published package.
The PreToolUse hook and the `ark` MCP server run `node bin/ark-mcp.mjs`, which loads
`dist/index.js`: run `npm run build` after cloning or the write gate reports an error
instead of validating. Product name **ArkGate**; npm `arkgate`; dual bins `arkgate*` + `ark*`.

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
| DomainModel | `src/domain/` | Pure types and invariants. `fetch`, `process`, `Date.now`, `Math.random` are forbidden globals here — inject a port instead. |
| Kernel | `src/kernel/`, `src/runtime/`, `src/index.ts`, `src/version.ts` | The library itself (+ `arkgate/runtime` entry). May depend on DomainModel only. |
| Tooling | `src/eslint/` | ESLint plugin. May import **DomainModel only** (pure layer-match helpers). Not Kernel. |
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

The project is only considered Ark-enforced when the write gate, CI gate, and runtime path all pass.

## Repo hygiene before handoff

Before considering repository work complete, verify the public repo is clean:

1. Latest GitHub Actions checks for the pushed head SHA are passing.
2. GitHub Dependabot has no open vulnerability or malware alerts.
3. There are no open bot PRs, especially Dependabot PRs, left untriaged.
4. The local working tree is clean and aligned with `origin/main`.

If GitHub cannot be reached, report that the repo-hygiene check is unverified instead
of assuming it is clean.
