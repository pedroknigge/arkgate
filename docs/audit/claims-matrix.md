# Documentation claims audit

> Hub: [AGENTS.md](../../AGENTS.md) · Package contract:
> [docs/package-surface.md](../package-surface.md) · Decisions: [docs/adr/](../adr/README.md)
> **Code and manifests are the source of truth.** Documentation does not override implementation.

**Date:** 2026-08-09 (4.3.0 published — Phase ACS / ACS08 on npm latest)<br>
**Scope:** project (public lanes + bounded package surfaces) — Phase ACS claims + prior EH/WI<br>
**Intent:** audit → selective documentation + honesty evidence (ACS08 release prepare)<br>
**Variant:** ArkGate bridge (`ark.config.json`, local CLIs, project-bound `ark_manifest`,
compatibility `ark://manifest`)<br>
**Out:** root<br>
**Stack:** Node/TypeScript<br>
**Monorepo:** root `arkgate` + `packages/runtime`<br>
**Auditor:** implementer (Phase ACS / ACS08)

## Summary

Bounded set: every externally consumable package/bin/schema/integration family, both product
package manifests, and public-lane authorities (README, use, develop, ai-gates, agent-guide,
configuration, package-surface, product-voice, ROADMAP Next session, this matrix).

| Verdict | Count |
|---------|------:|
| OK | 39 |
| Partial | 1 |
| Missing | 0 |
| Contradicted | 0 |
| Unverifiable | 0 |

**Surface coverage:** 14/14 bounded rows have a canonical authority in
[AGENTS.md](../../AGENTS.md#surface-coverage) (**100% documentation coverage**).

**Top residual risks:**

1. **C-028 Partial (wontfix for ACS):** Z09 / RB-11 retained-adoption + independent close remain a
   parked claim gate — not an engineering `doing` until preregistration is met.
2. Soft-write hosts stay advisory forever; doctor must not re-collapse them into unfinished
   architecture debt after EH05.
3. Repo hygiene: Dependabot may still surface transitive advisories; triage before claiming a
   clean public tree (not a product-roadmap `doing` unless it needs a pin).
4. **Published:** tree identity and npm `latest` are both **4.3.0** (C-020; signed tag `v4.3.0`,
   gitHead `65f95a0`, OIDC Trusted Publishing). Prior 4.2.1 is superseded on `latest`.

**Recommended next Intent:** keep Z09 parked; field kit stays scaffolding-only; no competing ACS
engineering `doing` — next pick is product residual or a new ROADMAP epic.

## ACS08 inventory (public lanes)

| Lane | Authority paths | Checklist / result |
|------|-----------------|--------------------|
| Front door | `README.md` | Host matrix unchanged; dual bins; version strip names **4.3.0 published** on npm `latest` |
| Use | `docs/use.md`, `docs/product-voice.md` | Doctor control plane; soft-host honesty; product-voice ACS guardrail catalog + scan/process |
| Develop | `docs/develop.md`, `docs/ai-gates.md`, `docs/agent-guide.md`, `docs/configuration.md`, `docs/package-surface.md` | Status/projection/skills/catalog/finding-refs documented; schema 1.5; soft hosts advisory |
| Contribute | `CONTRIBUTING.md`, `ROADMAP.md` Next session, `Agents.md` plans | ACS01–ACS08 **published** (`arkgate@4.3.0` on npm `latest`); publish checklist closed; Z09 parked claim gate only |
| Releases | `CHANGELOG.md`, `docs/releases/*` | 4.3.0 **Status: published** on npm `latest`; 4.2.1 prior |
| Templates | `action.yml`, generated workflow, `templates/agent-skills/` | First-push-safe base-ref; Agent Skills layout for same 13 names |
| Audit | this file | **0 Contradicted** on public lanes; new ACS rows OK |

### README 0.3 checklist (signed)

- [x] Choose-your-path + one-minute path match product voice + doctor control plane
- [x] Host support table matches matrix (Codex/Cursor/OpenCode advisory; repair envelope split)
- [x] Required merge boundary = **required status context**, not “CI file present”
- [x] Dual bins consistent
- [x] Version strip: **4.3.0 published** on npm `latest` (gitHead 65f95a0 / tag v4.3.0)
- [x] Links resolve into use/develop/docs hub
- [x] No hard-write lie for Codex

## Claims matrix

| ID | Structural claim | Source authority | Code evidence | Verdict | Action |
|----|------------------|------------------|---------------|---------|--------|
| C-001 | Product identity is ArkGate; npm package is `arkgate` | [Hub](../../AGENTS.md) · [README](../../README.md) | root manifest · `src/version.ts` | OK | keep |
| C-002 | The product tree has a stable root package and one experimental runtime package | [Hub package index](../../AGENTS.md#package-index) | both package manifests | OK | keep indexed |
| C-003 | Root `arkgate` exports the gate/config/analysis contract, not runtime APIs | [Programmatic API](../package-surface.md#programmatic-root-api) | `src/gate.ts` · `tsup.config.ts` | OK | keep |
| C-004 | Setup CLI has `arkgate` and `ark` bin names | [README commands](../../README.md#common-commands) | root manifest · `bin/ark.mjs` | OK | keep |
| C-005 | Check/doctor CLI has `arkgate-check` and `ark-check` bin names | [Agent guide](../agent-guide.md) | root manifest · `bin/ark-check.mjs` | OK | keep |
| C-006 | MCP has dual bins, **thirteen** documented tools including `ark_identity`, `ark_manifest`, and `ark_status`, plus a compatibility-only `ark://manifest` resource | [MCP reference](../agent-guide.md#write-path-gate-mcp) | `bin/ark-mcp.mjs` · `bin/ark-mcp-runtime.mjs` `TOOLS` · `server.json` | OK | ACS03 status tool (13th) |
| C-007 | Config and public schema aliases, including project identity and status-manifest, are documented | [Package surface](../package-surface.md) · [Configuration](../configuration.md) | root `exports` · `schemas/` | OK | keep |
| C-008 | Recommended ESLint config enables the documented rule set | [AI gates](../ai-gates.md#eslint-editor-feedback--same-contract-as-ci) | `src/eslint/index.ts` | OK | keep |
| C-009 | GitHub Action inputs and first-push-safe base-ref behavior are documented | [AI gates](../ai-gates.md#ci-backstop) | `action.yml` · `ci-and-commands.mjs` | OK | EH04 |
| C-010 | Shipped hooks, isolated repo skills, Agent Skills layout (4.3), monotonic shared Codex skills, and adoption-test template have discoverable guidance | [Agent guide](../agent-guide.md#install-skills-ark-and-ecosystem) · [AI gates](../ai-gates.md) | `templates/` · installer | OK | ACS05 packaging |
| C-011 | Playbook, policy packs, and gallery examples map to the enthusiast track | [Enthusiast index](../enthusiast/README.md) | templates · `examples/` | OK | keep |
| C-012 | Experimental runtime uses `@arkgate/runtime`; Nest uses its `/nestjs` subpath | [Runtime README](../../packages/runtime/README.md) · [Package surface](../package-surface.md#experimental-opt-in-surfaces) | runtime manifest | OK | keep experimental label |
| C-013 | Deprecated root `arkgate/runtime` and `arkgate/nestjs` forwarders were **removed** (AR04) | [Package surface](../package-surface.md#experimental-opt-in-surfaces) · [Migration](../migrate-from-ark-runtime-kernel.md) | root exports (no forwarders) | OK | use `@arkgate/runtime` only |
| C-014 | Root package metadata is available at `arkgate/package.json` | [Package surface](../package-surface.md) | root manifest export | OK | keep |
| C-015 | Published payload is bounded by the root manifest and verified separately | [Contributing](../../CONTRIBUTING.md) | root `files` · package verifier | OK | keep |
| C-016 | This repository's Ark contract has four declared layers and generated parity seams | [Hub placement](../../AGENTS.md#where-new-code-belongs) | `ark.config.json` · generate scripts | OK | keep |
| C-017 | Project TS5/6/7 compilers stay project-owned with fail-closed incomplete analysis | [TypeScript support](../typescript-support.md) | typescript host · packed matrix | OK | keep |
| C-018 | All retained plan seeds are indexed with current shipped status | [Hub plans](../../AGENTS.md#product-plans-library-epic-queue-seeds) | `docs/plans/` · ROADMAP | OK | ACS plan → prepared when ACS08 closes |
| C-019 | Accepted ADRs are navigable without duplicating their rationale | [ADR index](../adr/README.md) | ADR frontmatter | OK | keep |
| C-020 | Tree version identity and npm `latest` are **4.3.0** published (`gitHead` `65f95a0`, tag `v4.3.0`) | [4.3.0 notes](../releases/4.3.0.md) | package/lock/version/server · npm registry | OK | published |
| C-021 | Links in shipped Markdown resolve inside the tarball or use repository URLs | Shipped README/docs | root `files` | OK | rerun on release |
| C-022 | Nightly evaluation claims distinguish deterministic, opt-in live, and skipped cases | [Eval guide](../../eval/README.md) | nightly workflow · placement-ab | OK | ACS07 dry mode |
| C-023 | Migration and runtime guidance uses current package boundaries | [Migration guide](../migrate-from-ark-runtime-kernel.md) | manifests | OK | keep |
| C-024 | Contributor layout distinguishes stable gate code, experimental runtime, payload | [Contributing](../../CONTRIBUTING.md) | layout | OK | keep |
| C-025 | Preflight, CLI, MCP, write gate, final CI share one candidate graph | [ADR 0005](../adr/0005-atomic-change-preflight.md) | resolved-candidate facts · parity | OK | keep |
| C-026 | Gallery starters clean-room journey | [Examples](../../examples/README.md) | packed matrix | OK | keep |
| C-027 | `ark upgrade` managed content honesty | Setup CLI · agent guidance | managed-content identities | OK | keep |
| C-028 | Field evidence measures real merge gate + retained adoption | [Roadmap](../../ROADMAP.md) · [Field kit](../field/README.md) | Z07–Z10 evidence; Z09 parked | Partial | owner: Z09 / RB-11 (not ACS) |
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
| C-041 | Doctor exposes improvement compass (`notAScore`) with locked out-of-scope lenses; residual never flips `valid` / strict-merge alone | [Use — compass](../use.md#improvement-compass-not-a-score) · [Package surface](../package-surface.md) | `improvementCompass.ts` · doctor adapter · unit tests | OK | prep for 4.4.0 (tree) |
| C-042 | Public product lanes describe compass + Align/Stabilize/Shape without roadmap-item narrative | [Use](../use.md) · [Agent guide](../agent-guide.md) · [product-voice](../product-voice.md) | README / use / agent-guide / CHANGELOG Unreleased | OK | product-docs hygiene |

## Contradicted / Partial owners (ACS08 close)

| Verdict | Claim | Owner |
|---------|-------|-------|
| Partial | C-028 field retention / independent close | Z09 / RB-11 (explicit wontfix for Phase ACS) |
| None | — | **0 Contradicted** on public lanes after ACS08 prepare |

## Historical note

Prior matrix (2026-08-08) covered 4.2.1 published sync. The ACS08 pass advances C-006/C-007/C-010/C-020
and adds C-034–C-040 for agent-contract surfaces without re-performing the full EH deep-audit
measurement methodology; structural OK/Partial verdicts remain evidence-bound to code and
authorities cited above.

## Verification record (ACS08 published)

- Tree identity: package/lock/`src/version.ts`/`server.json` = **4.3.0**.
- npm `arkgate@latest` is **4.3.0** (gitHead `65f95a0`; signed tag `v4.3.0`; OIDC publish run
  `31295575658`). Claim published honestly (C-020).
- Release notes: [docs/releases/4.3.0.md](../releases/4.3.0.md) **Status: published**.
- CHANGELOG section `## 4.3.0 — 2026-08-09` covers ACS01–ACS08 surfaces.
- Focused ACS unit suites (catalog, status, projection, skills, finding refs, placement-ab) green
  under prior ACS item evidence; release-surface tests updated for 4.3.0 published train.
- Public lanes (README, docs hub, package-surface, CONTRIBUTING, Agents.md) name **4.3.0** as
  npm `latest` / published.
- MCP parity closed for C-006/C-035: agent-guide documents **thirteen** tools including
  `ark_status`; tools/list exact expectation + `ark_status` tools/call smoke in
  `tests/unit/mcp/arkMcp.test.ts`; diagnostic envelope prose uses schema **1.5**.
- Develop hub indexes status / agents-md / finding refs / agent-skills (ACS03–ACS06 pointers).
- `npm run check:architecture` / focused release-surface tests — see implementer summary.
