# Documentation claims audit

> Hub: [AGENTS.md](../../AGENTS.md) · Package contract:
> [docs/package-surface.md](../package-surface.md) · Decisions: [docs/adr/](../adr/README.md)
> **Code and manifests are the source of truth.** Documentation does not override implementation.

**Date:** 2026-07-18<br>
**Scope:** project<br>
**Intent:** audit → selective documentation update<br>
**Variant:** ArkGate bridge (`ark.config.json`, local CLIs, `ark://manifest`)<br>
**Out:** root<br>
**Stack:** Node/TypeScript<br>
**Monorepo:** root `arkgate` + `packages/runtime`<br>
**Auditor:** documentation-manager

## Summary

The bounded audit set is every externally consumable package/bin/schema/integration family,
both product package manifests, and the repository knowledge authorities that govern them.
Internal helpers and individual test files are evidence, not separate product surfaces.

| Verdict | Count |
|---------|------:|
| OK | 24 |
| Partial | 0 |
| Missing | 0 |
| Contradicted | 4 |
| Unverifiable | 0 |

**Surface coverage:** 14/14 bounded rows have a canonical authority in
[AGENTS.md](../../AGENTS.md#surface-coverage) (**100% documentation coverage**).

**Top residual risks:**

1. Four product claims remain contradicted by differential-path, clean-room, upgrade, or field
   evidence. They are correctness blockers or product-claim gates owned by
   [Phase Z](../plans/enforcement-truth-at-speed/README.md), not documentation wording to smooth over.
   Z02's current-source claim is now OK after its 36-cell packed CI matrix; published 3.7.0 still
   predates that correction.
2. `@arkgate/runtime` is not currently present in the npm registry. Its first publication remains
   a separate maintainer action; the root publish workflow does not publish it automatically, and
   parked candidate `K01` retains three confirmed intra-process commit gaps. The docs now state
   those boundaries instead of implying production readiness or one release path.
3. The ignored `.ark/reports/latest.json` is an older local sensor snapshot and is not current
   release evidence; the live architecture check is the handoff gate.

**Recommended next Intent:** move only Z03 into implementation and retain the Z03→Z09 sequence plus
all parked Y/runtime gates. Z02 may enter the next corrective release, but is not published in
3.7.0.

## Code inventory (high level)

| Kind | Evidence | Notes |
|------|----------|-------|
| Packages | [`package.json`](../../package.json) · [`packages/runtime/package.json`](../../packages/runtime/package.json) | Stable gate package plus optional experimental runtime companion |
| Stable package entry | `src/gate.ts` · `tsup.config.ts` | Root `arkgate` API; runtime-only APIs are excluded |
| CLIs and MCP | `bin/ark.mjs` · `bin/ark-check.mjs` · `bin/ark-mcp.mjs` · `server.json` | Three roles, each with `arkgate*` and `ark*` bin names |
| Public schemas | `schemas/ark.config.schema.json` · `schemas/ark.analysis-result.schema.json` · `schemas/ark.change-map.schema.json` | Export aliases are declared in the root manifest |
| Integrations | `src/eslint/index.ts` · `action.yml` · `templates/` | ESLint, Action, hooks, skills, playbook, packs, and adoption template |
| Experimental runtime | `src/index.ts` · `src/runtime/` · `src/nestjs/` · `packages/runtime/` | Separate package; deprecated root forwarders live in `compat/` |
| Ark contract | [`ark.config.json`](../../ark.config.json) · `ark://manifest` | Self-hosted four-layer profile; docs do not substitute for the gate |
| Verification | `tests/` · `eval/` · `scripts/` · `.github/workflows/` | Repository evidence, not additional npm API surfaces |

There are no product UI routes or database schemas in this library repository.

## Claims matrix

| ID | Structural claim | Source authority | Code evidence | Verdict | Action |
|----|------------------|------------------|---------------|---------|--------|
| C-001 | Product identity is ArkGate; npm package is `arkgate` | [Hub](../../AGENTS.md) · [README](../../README.md) | root manifest name · `src/version.ts` | OK | keep |
| C-002 | The product tree has a stable root package and one experimental runtime package | [Hub package index](../../AGENTS.md#package-index) | both package manifests | OK | keep indexed |
| C-003 | Root `arkgate` exports the gate/config/analysis contract, not runtime APIs | [Programmatic API](../package-surface.md#programmatic-root-api) | `src/gate.ts` · `tsup.config.ts` · built declarations | OK | keep source list canonical |
| C-004 | Setup CLI has `arkgate` and `ark` bin names | [README commands](../../README.md#common-commands) | root manifest · `bin/ark.mjs` | OK | keep |
| C-005 | Check/doctor CLI has `arkgate-check` and `ark-check` bin names | [Agent guide](../agent-guide.md) | root manifest · `bin/ark-check.mjs` | OK | keep |
| C-006 | MCP has dual bins, `ark://manifest`, and every registered tool is named in docs | [MCP reference](../agent-guide.md#write-path-gate-mcp) | `bin/ark-mcp.mjs` · `server.json` | OK | keep tool list in sync |
| C-007 | Config, analysis-result, and change-map schema aliases are public | [Package surface](../package-surface.md) · [Configuration](../configuration.md) | root `exports` · `schemas/` | OK | keep |
| C-008 | Recommended ESLint config enables the documented rule set | [AI gates](../ai-gates.md#eslint-editor-feedback--same-contract-as-ci) | `src/eslint/index.ts` recommended config | OK | keep |
| C-009 | GitHub Action inputs and strictness behavior are documented | [AI gates](../ai-gates.md#ci-backstop) | `action.yml` | OK | keep |
| C-010 | Shipped hooks, skills, and adoption-test template have discoverable guidance | [Agent guide](../agent-guide.md#supported-agent-hosts) · [AI gates](../ai-gates.md) | `templates/` · installer code | OK | keep |
| C-011 | Playbook, policy packs, and gallery examples map to the enthusiast track | [Enthusiast index](../enthusiast/README.md) | `templates/architecture-playbook.json` · packs · `examples/` | OK | keep |
| C-012 | Experimental runtime uses `@arkgate/runtime`; Nest uses its `/nestjs` subpath | [Runtime README](../../packages/runtime/README.md) · [Package surface](../package-surface.md#experimental-opt-in-surfaces) | runtime manifest · `src/index.ts` · `src/nestjs/index.ts` | OK | keep experimental label |
| C-013 | `arkgate/runtime` and `arkgate/nestjs` are deprecated forwarders only | [Package surface](../package-surface.md#experimental-opt-in-surfaces) | root exports · `compat/` | OK | remove only in next major |
| C-014 | Root package metadata is available at `arkgate/package.json` | [Package surface](../package-surface.md) | root manifest export | OK | keep |
| C-015 | Published payload is bounded by the root manifest and verified separately | [Contributing](../../CONTRIBUTING.md) | root `files` · package verifier | OK | keep |
| C-016 | This repository's Ark contract has four declared layers and generated parity seams | [Hub placement](../../AGENTS.md#where-new-code-belongs) | `ark.config.json` · canonical/generated files | OK | run Ark after source edits |
| C-017 | The current source candidate keeps project TS5/6/7 compilers project-owned while a packed TS7 install retains a usable JS-API analysis host and fails closed when analysis is incomplete | [TypeScript support](../typescript-support.md) | exact `typescript-ark-host` alias · `bin/lib/typescript-host.mjs` · schema 1.2 completeness · packed Node/package-manager/TS matrix | OK | All 36 packed cells passed on source `228dd893` in CI run `29655190747`; publish in the next corrective release |
| C-018 | All retained plan seeds are indexed with current shipped status | [Hub plans](../../AGENTS.md#product-plans-library-epic-queue-seeds) | `docs/plans/` · ROADMAP completed phases | OK | keep roadmap authoritative |
| C-019 | Accepted ADRs are navigable without duplicating their rationale | [ADR index](../adr/README.md) | ADR frontmatter/status | OK | supersede, never delete |
| C-020 | Current release identity is aligned at 3.7.0 | [Release notes](../releases/3.7.0.md) | package/lock/version/server metadata | OK | release gate owns future sync |
| C-021 | Links in shipped Markdown resolve inside the tarball or use repository URLs | Shipped README/docs | root `files` + npm dry-run inventory | OK | rerun tarball link audit on release |
| C-022 | Nightly evaluation claims distinguish deterministic, opt-in live, and skipped cases | [Eval guide](../../eval/README.md) | nightly workflow · case metadata | OK | keep evidence labels honest |
| C-023 | Migration and runtime guidance uses current package boundaries | [Migration guide](../migrate-from-ark-runtime-kernel.md) · runtime skill | manifests · compat shims | OK | keep deprecated paths labeled |
| C-024 | Contributor layout distinguishes stable gate code, experimental runtime, and actual payload | [Contributing](../../CONTRIBUTING.md) | `src/gate.ts` · runtime manifest · root `files` | OK | keep |
| C-025 | Programmatic preflight, CLI, MCP, complete-patch write gate, and final CI evaluate the same candidate graph and governed scope | [ADR 0005](../adr/0005-atomic-change-preflight.md) · [change-integrity plan](../plans/change-integrity-loop/README.md) | compiler-free relative-only graph · Tooling-only scope guard · alias differential reproduction · same-layer AICodeGate reproduction | Contradicted | `Z03` decision + `Z04` normalized facts, one pure verdict, and differential corpus |
| C-026 | Every gallery starter can be copied, installed, and checked using its documented commands | [Examples](../../examples/README.md) | starter manifests · copied vertical-slice reproduction | Contradicted | `Z05`: one catalog + current tarball clean-room matrix |
| C-027 | `ark upgrade` refreshes existing Ark-managed project skills and gates while preserving user-owned files | Setup CLI help · agent guidance | `bin/ark.mjs` installer arguments · `bin/lib/gate-files.mjs` skip-without-force behavior · installed-template drift | Contradicted | `Z06`: managed-content identities, bounded refresh, stale/conflict report |
| C-028 | V03/V05/B01 evidence measures time to the real merge gate, observed false blocks/bypasses, and independent review | [Roadmap evidence](../../ROADMAP.md#success-metrics) | `eval/adoption-run.mjs` timing/denominators/constants · beta declaration check · nightly skipped live case | Contradicted | `Z08` causal/full-denominator harness + `Z09` retained adoption and verified reviewer identity |

## Post-audit first-principles correction

The initial documentation pass verified that public surfaces were named and linked. A subsequent
installed-artifact and execution-path audit tested whether the named claims were true. Code wins:

- installing the real 3.7.0 tarball beside TS7 reproduced the missing compatible fallback and an
  unavailable `--plan` reporting `goal.met: true`;
- a forbidden alias edge passed pure preflight while the final CLI rejected it; a governed
  same-layer import allowed by the contract was rejected by AICodeGate's fallback heuristic;
- a copied gallery starter failed because its check command depended on this repository layout;
- evaluation source showed that the reported first-green interval ended before strict check,
  failures left the median, false-block/bypass values were constants, and reviewer independence
  was self-declared.

Z02 closes the first contradiction in the current source candidate: exact
`typescript-ark-host` at exact `npm:typescript@6.0.3` cannot deduplicate to project TS7, schema
1.2 names `complete | partial | unavailable`, and incomplete analysis cannot satisfy plan or
strict merge.
Clean npm/pnpm/Yarn installs retain the requested project `tsc` and report host 6.0.3. Yarn's
report names strict PnP for TS5/6 and node-modules for native TS7 rather than hiding that resolver
boundary. All 36 cells passed on source `228dd893` in CI run `29655190747`. The current-source claim
is OK; the 3.7.0 distribution distinction remains until the corrective release is published.

The remaining corrective implementation authority is
[ROADMAP Phase Z](../../ROADMAP.md#phase-z--enforcement-truth-at-speed). Z03/Z04 still own
cross-adapter parity; prose is not accepted as resolution.

## Resolved or narrowed during this audit

| Initial verdict | Drift | Resolution |
|-----------------|-------|------------|
| Contradicted | A packed TS7 consumer could lose the intended JS-API fallback and report an unavailable plan as met | Current source uses a distinct exact TS6 host and required fail-closed completeness; all 36 packed CI cells passed on source `228dd893`, while published 3.7.0 remains unchanged |
| Contradicted | Capability collector/vocabulary were described as root npm exports | Public docs now point to `analyzeProject(...).ir.capabilityUses`; internal helpers are labeled internal |
| Contradicted | Shipped runtime skill and example preferred deprecated root shims | Canonical companion imports and explicit compatibility prerequisites are documented |
| Contradicted | MCP docs said omitted `--manifest` always meant the default 11-layer profile | Docs now state project-config-first, default-profile fallback behavior |
| Contradicted | Hub plan status, skill count, migration floor, and eval wording had drifted | Claims were reconciled to manifests, code, and completed roadmap evidence |
| Missing | Root package map, surface matrix, ADR index, and claims matrix did not exist | Added integrate-first indexes without duplicating mature authorities |
| Partial | MCP/ESLint/Action/CLI flag/hook/adoption-template coverage was incomplete | Canonical references now name every bounded public family |
| Missing | Root API and `arkgate/package.json` export lacked canonical documentation | Added to package-surface policy |
| Broken in package | Repo-relative links targeted files intentionally excluded from npm | Converted those targets to canonical repository URLs |
| Contradicted | Embedded CLI help associated `ark update` with preflight and omitted doctor | Corrected help-only strings; command dispatch is unchanged |

## Verification record

- Repository Markdown links: **PASS** — 110 Markdown files; every local relative target and
  Markdown anchor resolves.
- Canonical repository URLs: **PASS** — all 43 `blob/main` / `tree/main` links resolve to a local
  path, including referenced Markdown anchors.
- npm-tarball Markdown links: **PASS** — all relative targets from 34 packed Markdown files are
  present in the `arkgate@3.7.0` dry-run inventory.
- Z02 current-source compatibility: **PASS** — CI run `29655190747` installed one
  checksum-verified tarball across Node 18/20/22/24 × npm/pnpm/Yarn × project TypeScript
  5.9.3/6.0.3/7.0.2. All 12 expanded jobs / 36 cells passed; consumers retained their selected
  project `tsc`, ArkGate's fallback reported exact 6.0.3, and incomplete analysis stayed non-green.
- Surface parity: **PASS** — 93/93 `src/gate.ts` exports, 9/9 MCP tools, 7/7 public
  schema/metadata export aliases, and 6/6 Action inputs are named in their canonical docs.
- Registry check: **OBSERVED** — `arkgate@latest` is `3.7.0`; querying
  `@arkgate/runtime` returned npm `E404`, so current guidance uses source-checkout evaluation until
  a separate publish.
- Runtime source-checkout path: **PASS** — `npm run build:runtime`, the 12-entry runtime package
  dry run, and the example's local-folder install dry run all resolved
  `@arkgate/runtime@0.1.0-experimental.0`.
- `npm run check:package-files`: **PASS** — package allowlist has 23 entries.
- Targeted Vitest run: **PASS** — 9 files / 75 tests (release/docs, host matrix, skills, gallery,
  extraction cards, smell outcomes, runtime durability/isolation, and CLI entrypoint).
- `npm run check:js`: **PASS** — 92 JavaScript files.
- `npm run typecheck`: **PASS**.
- Z02 confidence close: **PASS** — source `228dd893` CI ran 164 test files / 1,373 tests,
  90.45% statement coverage, and 91.44% mutation; Security run `29655190745` passed Dependency
  Review, CodeQL, and Semgrep.
- CLI help inspection: **PASS** — `ark update` is shown under `upgrade`; `ark-check --doctor` is
  present and described as read-only.
- `npm run check:architecture`: **PASS**.
- `npx ark-check --root . --config ark.config.json --strict-config`: **PASS**.
- Pre-Z02 public-head hygiene snapshot: **PASS** — at the initial audit, local HEAD matched
  `origin/main` at `271802c46383d3f60de8cf27250ff02df994c4f0`; CI, Security, and Publish npm runs
  succeeded, and GitHub reported zero open PRs and zero open Dependabot alerts. Current handoff
  hygiene is verified separately after PR #81 merges.
