# Documentation claims audit

> Hub: [AGENTS.md](../../AGENTS.md) · Package contract:
> [docs/package-surface.md](../package-surface.md) · Decisions: [docs/adr/](../adr/README.md)
> **Code and manifests are the source of truth.** Documentation does not override implementation.

**Date:** 2026-08-25 (4.7.1 published — Phase HS / HS05; npm `latest` **4.7.1**)<br>
**Scope:** project (public lanes + bounded package surfaces) — Phase HS catalog + Phase RN ArkRun extra + prior DF/ACS/IC<br>
**Intent:** audit → selective documentation + honesty evidence (HS05 published)<br>
**Variant:** ArkGate bridge (`ark.config.json`, local CLIs, project-bound `ark_manifest`,
compatibility `ark://manifest`)<br>
**Out:** root<br>
**Stack:** Node/TypeScript<br>
**Monorepo:** root `arkgate` + `packages/runtime`<br>
**Auditor:** implementer (Phase DF / DF06)

**2026-08-18 addendum (4.6.3 prepare):** C-046 records current Codex CLI/local Desktop
operation-scoped hard write. Historical 4.5.0 snapshot language below remains dated evidence.

**2026-08-25 addendum (4.7.1 published):** C-020 tree identity is **4.7.1**
(published on npm `latest`). C-047 records the optional `arkRun` extra (4.7.0).
Does not close Z09 / K01.

## Summary

Bounded set: every externally consumable package/bin/schema/integration family, both product
package manifests, and public-lane authorities (README, use, develop, ai-gates, agent-guide,
configuration, package-surface, product-voice, ROADMAP Next session, this matrix).

| Verdict | Count |
|---------|------:|
| OK | 47 |
| Partial | 1 |
| Missing | 0 |
| Contradicted | 0 |
| Unverifiable | 0 |

**Surface coverage:** 14/14 bounded rows have a canonical authority in
[AGENTS.md](../../AGENTS.md#surface-coverage) (**100% documentation coverage**).

**Top residual risks:**

1. **C-028 Partial (wontfix for DF):** Z09 / RB-11 retained-adoption + independent close remain a
   parked claim gate — not an engineering `doing` until preregistration is met.
2. OpenCode and uncovered host paths stay advisory. Codex hard evidence is limited to complete,
   trusted, runtime-observed local `apply_patch`; doctor must not borrow it for other paths.
3. Repo hygiene: Dependabot may still surface transitive advisories; triage before claiming a
   clean public tree (not a product-roadmap `doing` unless it needs a pin).
4. **Published 4.7.1:** tree identity and npm `latest` are **4.7.1** (C-020). Z09 / K01 stay parked.

**Recommended next Intent:** keep Z09 / K01 parked; no competing RN `doing`.

## DF06 inventory (historical — 2026-08-10 snapshot)

The table and README 0.3 checklist below are the **DF06 / 4.5.0 prepare** inventory.
They are **not** current version identity. Current tree and npm `latest` are
**4.7.1** (C-020 / 2026-08-25 addendum). Do not read 4.4.0 / 4.5.0
here as live `latest`.

| Lane | Authority paths | Checklist / result |
|------|-----------------|--------------------|
| Front door | `README.md` | Host matrix unchanged; dual bins; **4.4.0 on npm latest**; tree preparing **4.5.0** |
| Use | `docs/use.md`, `docs/product-voice.md` | Session recipe; doctor + status compass; soft-host honesty |
| Develop | `docs/develop.md`, `docs/ai-gates.md`, `docs/agent-guide.md`, `docs/configuration.md`, `docs/package-surface.md` | Session recipe; status modes; self-service upgrade; residual ⊆ doctor when full |
| Contribute | `CONTRIBUTING.md`, `ROADMAP.md` Next session, `Agents.md` plans | DF01–DF06 **done** at prepare; publish checklist open until npm verify |
| Releases | `CHANGELOG.md`, `docs/releases/*` | 4.5.0 **Status: prepared**; 4.4.0 **published** on npm `latest` |
| Templates | `action.yml`, generated workflow, `templates/agent-skills/` | First-push-safe base-ref; same 13 skill names |
| Audit | this file | **0 Contradicted** on public lanes; new DF rows OK |

### README 0.3 checklist (signed, DF06 / 4.5.0)

- [x] Choose-your-path + one-minute path match product voice + doctor control plane
- [x] Host support table matches matrix (Codex/Cursor/OpenCode advisory; repair envelope split)
- [x] Required merge boundary = **required status context**, not “CI file present”
- [x] Dual bins consistent
- [x] Version strip: **4.4.0 published** on npm `latest`; tree preparing **4.5.0** *(historical DF06; current strip is 4.7.1 published / latest)*
- [x] Links resolve into use/develop/docs hub
- [x] No hard-write lie for Codex

## Claims matrix

| ID | Structural claim | Source authority | Code evidence | Verdict | Action |
|----|------------------|------------------|---------------|---------|--------|
| C-001 | Product identity is ArkGate; npm package is `arkgate` | [Hub](../../AGENTS.md) · [README](../../README.md) | root manifest · `src/version.ts` | OK | keep |
| C-002 | The product tree has a stable root package and one experimental ArkRun kernel package | [Hub package index](../../AGENTS.md#package-index) | both package manifests | OK | keep indexed |
| C-003 | Root `arkgate` exports the gate/config/analysis contract, not runtime APIs | [Programmatic API](../package-surface.md#programmatic-root-api) | `src/gate.ts` · `tsup.config.ts` | OK | keep |
| C-004 | Setup CLI has `arkgate` and `ark` bin names | [README commands](../../README.md#common-commands) | root manifest · `bin/ark.mjs` | OK | keep |
| C-005 | Check/doctor CLI has `arkgate-check` and `ark-check` bin names | [Agent guide](../agent-guide.md) | root manifest · `bin/ark-check.mjs` | OK | keep |
| C-006 | MCP has dual bins, **thirteen** documented tools including `ark_identity`, `ark_manifest`, and `ark_status`, plus a compatibility-only `ark://manifest` resource | [MCP reference](../agent-guide.md#write-path-gate-mcp) | `bin/ark-mcp.mjs` · `bin/ark-mcp-runtime.mjs` `TOOLS` · `server.json` | OK | ACS03 status tool (13th) |
| C-007 | Config and public schema aliases, including project identity and status-manifest, are documented | [Package surface](../package-surface.md) · [Configuration](../configuration.md) | root `exports` · `schemas/` | OK | keep |
| C-008 | Recommended ESLint config enables the documented rule set | [AI gates](../ai-gates.md#eslint-editor-feedback--same-contract-as-ci) | `src/eslint/index.ts` | OK | keep |
| C-009 | GitHub Action inputs and first-push-safe base-ref behavior are documented | [AI gates](../ai-gates.md#ci-backstop) | `action.yml` · `ci-and-commands.mjs` | OK | EH04 |
| C-010 | Shipped hooks, isolated repo skills, Agent Skills layout (4.3), monotonic shared Codex skills, and adoption-test template have discoverable guidance | [Agent guide](../agent-guide.md#install-skills-ark-and-ecosystem) · [AI gates](../ai-gates.md) | `templates/` · installer | OK | ACS05 packaging |
| C-011 | Playbook, policy packs, and gallery examples map to the enthusiast track | [Enthusiast index](../enthusiast/README.md) | templates · `examples/` | OK | keep |
| C-012 | ArkRun kernel uses `@arkgate/runtime` (`createStrictArkKernel` factory, no process singleton); Nest uses its `/nestjs` subpath | [Runtime README](../../packages/runtime/README.md) · [Package surface](../package-surface.md#experimental-opt-in-surfaces) | runtime manifest | OK | keep experimental label; kernel stays out of `arkgate` tarball |
| C-013 | 4.8.0 restores **real** `arkgate/runtime` and `arkgate/nestjs` subpaths (ADR 0031); AR04 removed *shims*; `@arkgate/runtime` is deprecated | [Package surface](../package-surface.md#experimental-opt-in-surfaces) · [Migration](../migrate-from-ark-runtime-kernel.md) · [ADR 0031](../adr/0031-one-package-extras-deprecate-companion.md) | root exports `./runtime` `./nestjs`; gate root has no factories | OK | use `arkgate/runtime` |
| C-014 | Root package metadata is available at `arkgate/package.json` | [Package surface](../package-surface.md) | root manifest export | OK | keep |
| C-015 | Published payload is bounded by the root manifest and verified separately | [Contributing](../../CONTRIBUTING.md) | root `files` · package verifier | OK | keep |
| C-016 | This repository's Ark contract has four declared layers and generated parity seams | [Hub placement](../../AGENTS.md#where-new-code-belongs) | `ark.config.json` · generate scripts | OK | keep |
| C-017 | Project TS5/6/7 compilers stay project-owned with fail-closed incomplete analysis | [TypeScript support](../typescript-support.md) | typescript host · packed matrix | OK | keep |
| C-018 | All retained plan seeds are indexed with current shipped status | [Hub plans](../../AGENTS.md#product-plans-library-epic-queue-seeds) | `docs/plans/` · ROADMAP | OK | DF plan prepare |
| C-019 | Accepted ADRs are navigable without duplicating their rationale | [ADR index](../adr/README.md) | ADR frontmatter | OK | keep |
| C-020 | Tree version identity is **4.7.1** (published); npm `latest` is **4.7.1** | [4.7.1 notes](../releases/4.7.1.md) · [4.7.0 notes](../releases/4.7.0.md) | package/lock/version/server · npm registry (4.7.1) | OK | published |
| C-021 | Links in shipped Markdown resolve inside the tarball or use repository URLs | Shipped README/docs | root `files` | OK | rerun on release |
| C-022 | Nightly evaluation claims distinguish deterministic, opt-in live, and skipped cases | [Eval guide](../../eval/README.md) | nightly workflow · placement-ab | OK | ACS07 dry mode |
| C-023 | Migration and runtime guidance uses current package boundaries | [Migration guide](../migrate-from-ark-runtime-kernel.md) | manifests | OK | keep |
| C-024 | Contributor layout distinguishes stable gate code, experimental runtime, payload | [Contributing](../../CONTRIBUTING.md) | layout | OK | keep |
| C-025 | Preflight, CLI, MCP, write gate, final CI share one candidate graph | [ADR 0005](../adr/0005-atomic-change-preflight.md) | resolved-candidate facts · parity | OK | keep |
| C-026 | Gallery starters clean-room journey | [Examples](../../examples/README.md) | packed matrix | OK | keep |
| C-027 | `ark upgrade` managed content honesty | Setup CLI · agent guidance | managed-content identities | OK | keep |
| C-028 | Field evidence measures real merge gate + retained adoption | [Roadmap](../../ROADMAP.md) · [Field kit](../field/README.md) | Z07–Z10 evidence; Z09 parked | Partial | owner: Z09 / RB-11 (not DF) |
| C-029 | Design delta ratchet + host hardness requires runtime/provider proof | [Package surface](../package-surface.md) · [AI gates](../ai-gates.md) | design-delta · enforcement-state | OK | keep |
| C-030 | Soft-write host does not alone force doctor `Not finished` | [Product voice](../product-voice.md) · plan EH | `enforcement-honesty.mjs` | OK | EH05 |
| C-031 | CI runtime observation independent of branch-protection plan API | [AI gates](../ai-gates.md) · plan EH | `github-enforcement.mjs` · `withCiProviderEvidence` | OK | EH06 |
| C-032 | Report does not broaden `.gitignore` over `.ark/*` + `!` exceptions | plan EH | `html-report.mjs` | OK | EH03 |
| C-033 | First-push all-zero base SHA does not require fail-on-new-smells delta | [AI gates](../ai-gates.md) | `ci-and-commands.mjs` · `action.yml` | OK | EH04 |
| C-034 | Public diagnostic codes have a closed catalog with why/fix docs anchors | [Diagnostics](../diagnostics.md) · [Package surface](../package-surface.md) | `diagnosticCatalog.ts` · fixtures | OK | ACS02 |
| C-035 | `ark status --json` / MCP `ark_status` returns one identity/activation/last-check/rules snapshot (not a score) | [Agent guide](../agent-guide.md) · [Package surface](../package-surface.md) | `statusManifest.ts` · schema | OK | ACS03 |
| C-036 | Version-matched agent projection is regenerable and labeled non-authoritative for enforcement | [Agent guide](../agent-guide.md) · [Package surface](../package-surface.md) | `agentProjection.ts` · CLI | OK | ACS04 |
| C-037 | The same frozen 13 skill names ship in Agent Skills–compatible layout; no new skill names | [Agent guide](../agent-guide.md#install-skills-ark-and-ecosystem) | `agentSkillsPackage.ts` · `templates/agent-skills/` | OK | ACS05 |
| C-038 | Factory diagnostics carry stable `findingRef` + baseline-compatible `targetKey` (schema 1.5) | [Package surface](../package-surface.md) · [Agent guide](../agent-guide.md) | `adapterContract.ts` · multi-turn fixture | OK | ACS06 |
| C-039 | Maintainer placement A/B eval exists under `eval/` with CI-safe dry mode; not a product score | [Eval guide](../../eval/README.md) · [placement-ab README](../../eval/placement-ab/README.md) | harness · fixtures · unit test | OK | ACS07 |
| C-040 | AGENTS.md / skills / projection never decide pass/fail; gate remains CLI/hooks/CI | [Product voice](../product-voice.md) · plan ACS hard lines | analysis paths do not import projection | OK | ACS hard line |
| C-041 | Doctor exposes improvement compass (`notAScore`) with locked out-of-scope lenses; residual never flips `valid` / strict-merge alone | [Use — compass](../use.md#improvement-compass-not-a-score) · [Package surface](../package-surface.md) | `improvementCompass.ts` · doctor adapter · unit tests | OK | 4.4.0 published |
| C-042 | Public product lanes describe compass + Align/Stabilize/Shape without roadmap-item narrative | [Use](../use.md) · [Agent guide](../agent-guide.md) · [product-voice](../product-voice.md) | README / use / agent-guide / CHANGELOG | OK | product-docs hygiene (IC06) |
| C-043 | Status/MCP project improvement compass with honesty modes `full` \| `subset` \| `unavailable`; residual ⊆ doctor when `full`; never invent green residual | [Package surface](../package-surface.md) · [Agent guide](../agent-guide.md) | `projectStatusImprovementCompass` · status fixtures | OK | DF02 / 4.5.0 prepare |
| C-044 | Public lanes teach session recipe: identity → status → act; doctor when compass mode is not full — without roadmap codes | [Use — session recipe](../use.md#session-recipe-agent-turn) · [Agent guide](../agent-guide.md#session-recipe-agent-turn) | use / agent-guide / develop / release notes | OK | DF06 |
| C-045 | Managed upgrade surfaces self-service activation labels + customized-content preserve without inventing hard-write without runtime evidence | [Package surface](../package-surface.md) · [4.5.0 notes](../releases/4.5.0.md) | `managed-upgrade-honesty.mjs` · DF05 tests | OK | DF05 / 4.5.0 prepare |
| C-046 | Codex CLI and local Desktop/App Server hard-block only complete trusted, runtime-observed local `apply_patch`; other paths remain CI-backed | [AI gates](../ai-gates.md#openai-codex-cli-and-local-desktop) · [ADR 0019](../adr/0019-codex-operation-scoped-hard-write.md) | `ark-mcp-runtime.mjs` · `host-support-matrix.mjs` · T05/Z10/host matrix tests | OK | CX01 / 4.6.3 |
| C-047 | Optional `arkRun` extra is silent when absent; enforced extra teeth share write/CI; `@arkgate/runtime` stays out of the `arkgate` tarball; in-memory stores are not production durability; doctor `arkRun` is `notAScore`; no new skill names | [Use — planes](../use.md#planes-you-choose) · [Configuration](../configuration.md) · [Package surface](../package-surface.md#experimental-opt-in-surfaces) · [Hardening](../production-hardening.md) | `arkRun` schema · skip corpus · `createStrictArkKernel` | OK | RN16 / 4.7.0 published |

## Contradicted / Partial owners (DF06 close)

| Verdict | Claim | Owner |
|---------|-------|-------|
| Partial | C-028 field retention / independent close | Z09 / RB-11 (explicit wontfix for Phase DF) |
| None | — | **0 Contradicted** on public lanes after DF06 prepare |

## Historical note

Prior matrix (2026-08-09) covered 4.3.0 / ACS08 and prep rows for IC. The DF06 pass (2026-08-10)
advanced C-020 for tree **4.5.0** prepare (npm still 4.4.0) and added C-043–C-045. That
version strip is **historical**. The 2026-08-25 HS05 addendum restates C-020 for tree
**4.7.1** published (npm `latest` **4.7.1**); C-047 remains the 4.7.0 `arkRun` extra.
Structural OK/Partial verdicts remain evidence-bound to code and authorities cited above.

## Verification record (DF06 prepare — historical 2026-08-10)

- Then-current tree identity: package/lock/`src/version.ts`/`server.json` = **4.5.0**.
- Then-current npm `arkgate@latest` was **4.4.0** (honest C-020 dual-state at DF06 close).
- Then-current release notes: [docs/releases/4.5.0.md](../releases/4.5.0.md) (now **published**).
- CHANGELOG section `## 4.5.0 — 2026-08-10` covers status honesty, domain split, pure ratchet,
  self-service upgrade, session recipe.
- Public lanes teach session recipe without roadmap-item narrative (IC06 hygiene held).
- Focused DF unit suites (status honesty, module budgets/split, pure ratchet, upgrade self-service)
  remain green under prior DF item evidence.

Current (2026-08-25 HS05) identity is C-020: tree **4.7.1** published; npm `latest` **4.7.1**.
