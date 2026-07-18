# Documentation claims audit

> Hub: [AGENTS.md](../../AGENTS.md) · Package contract:
> [docs/package-surface.md](../package-surface.md) · Decisions: [docs/adr/](../adr/README.md)
> **Code and manifests are the source of truth.** Documentation does not override implementation.

**Date:** 2026-07-17<br>
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
| Contradicted | 0 |
| Unverifiable | 0 |

**Surface coverage:** 14/14 bounded rows have a canonical authority in
[AGENTS.md](../../AGENTS.md#surface-coverage) (**100% documentation coverage**).

**Top residual risks:**

1. This is a structural reconciliation, not sentence-by-sentence semantic certification of long
   historical release notes or roadmap evidence.
2. `@arkgate/runtime` is not currently present in the npm registry. Its first publication remains
   a separate maintainer action; the root publish workflow does not publish it automatically. The
   docs now state that boundary instead of implying one release path.
3. The ignored `.ark/reports/latest.json` is an older local sensor snapshot and is not current
   release evidence; the live architecture check is the handoff gate.

**Recommended next Intent:** none after the verification commands recorded below pass.

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
| C-017 | TypeScript resolution prefers the project and has a direct package fallback dependency | [TypeScript support](../typescript-support.md) | root dependencies/peer metadata · loader | OK | keep wording dependency-accurate |
| C-018 | All retained plan seeds are indexed with current shipped status | [Hub plans](../../AGENTS.md#product-plans-library-epic-queue-seeds) | `docs/plans/` · ROADMAP completed phases | OK | keep roadmap authoritative |
| C-019 | Accepted ADRs are navigable without duplicating their rationale | [ADR index](../adr/README.md) | ADR frontmatter/status | OK | supersede, never delete |
| C-020 | Current release identity is aligned at 3.7.0 | [Release notes](../releases/3.7.0.md) | package/lock/version/server metadata | OK | release gate owns future sync |
| C-021 | Links in shipped Markdown resolve inside the tarball or use repository URLs | Shipped README/docs | root `files` + npm dry-run inventory | OK | rerun tarball link audit on release |
| C-022 | Nightly evaluation claims distinguish deterministic, opt-in live, and skipped cases | [Eval guide](../../eval/README.md) | nightly workflow · case metadata | OK | keep evidence labels honest |
| C-023 | Migration and runtime guidance uses current package boundaries | [Migration guide](../migrate-from-ark-runtime-kernel.md) · runtime skill | manifests · compat shims | OK | keep deprecated paths labeled |
| C-024 | Contributor layout distinguishes stable gate code, experimental runtime, and actual payload | [Contributing](../../CONTRIBUTING.md) | `src/gate.ts` · runtime manifest · root `files` | OK | keep |

## Resolved during this audit

| Initial verdict | Drift | Resolution |
|-----------------|-------|------------|
| Contradicted | Capability collector/vocabulary were described as root npm exports | Public docs now point to `analyzeProject(...).ir.capabilityUses`; internal helpers are labeled internal |
| Contradicted | Shipped runtime skill and example preferred deprecated root shims | Canonical companion imports and explicit compatibility prerequisites are documented |
| Contradicted | MCP docs said omitted `--manifest` always meant the default 11-layer profile | Docs now state project-config-first, default-profile fallback behavior |
| Contradicted | Hub plan status, TypeScript dependency, skill count, migration floor, and eval wording had drifted | Claims were reconciled to manifests, code, and completed roadmap evidence |
| Missing | Root package map, surface matrix, ADR index, and claims matrix did not exist | Added integrate-first indexes without duplicating mature authorities |
| Partial | MCP/ESLint/Action/CLI flag/hook/adoption-template coverage was incomplete | Canonical references now name every bounded public family |
| Missing | Root API and `arkgate/package.json` export lacked canonical documentation | Added to package-surface policy |
| Broken in package | Repo-relative links targeted files intentionally excluded from npm | Converted those targets to canonical repository URLs |
| Contradicted | Embedded CLI help associated `ark update` with preflight and omitted doctor | Corrected help-only strings; command dispatch is unchanged |

## Verification record

- Repository Markdown links: **PASS** — 109 Markdown files; every local relative target and
  Markdown anchor resolves.
- Canonical repository URLs: **PASS** — all 38 `blob/main` / `tree/main` links resolve to a local
  path, including referenced Markdown anchors.
- npm-tarball Markdown links: **PASS** — all relative targets from 34 packed Markdown files are
  present in the `arkgate@3.7.0` dry-run inventory.
- Surface parity: **PASS** — 92/92 `src/gate.ts` exports, 9/9 MCP tools, 7/7 public
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
- `npm run check:js`: **PASS** — 88 JavaScript files.
- `npm run typecheck`: **PASS**.
- CLI help inspection: **PASS** — `ark update` is shown under `upgrade`; `ark-check --doctor` is
  present and described as read-only.
- `npm run check:architecture`: **PASS**.
- `npx ark-check --root . --config ark.config.json --strict-config`: **PASS**.
- Public-head hygiene (before this uncommitted audit diff): **PASS** — local HEAD matched
  `origin/main` at `271802c46383d3f60de8cf27250ff02df994c4f0`; CI, Security, and Publish npm runs
  succeeded; GitHub reported zero open PRs and zero open Dependabot alerts.
