# Documentation claims audit

> Hub: [AGENTS.md](../../AGENTS.md) · Package contract:
> [docs/package-surface.md](../package-surface.md) · Decisions: [docs/adr/](../adr/README.md)
> **Code and manifests are the source of truth.** Documentation does not override implementation.
> **Living claims v0:** `anchor.path` + optional symbol/hash + `severity` — matrix-first; no parallel claims wiki.

**Date:** 2026-09-06 (tree **4.8.13** CHANGELOG Status: prepared; npm `latest` **4.8.11**; `RL813` doing; tags `v4.8.12` and `v4.8.13` exist)<br>
**Scope:** project (public lanes + bounded package surfaces)<br>
**Audit-scope:** full-tree (user opt-in via code-as-is project audit)<br>
**Intent:** audit → selective integrate (as-is vs last-claim to-be)<br>
**Variant:** ArkGate bridge (`ark.config.json`, local CLIs, project-bound `ark_manifest`,
compatibility `ark://manifest`)<br>
**Out:** root<br>
**Stack:** Node/TypeScript<br>
**Monorepo:** root `arkgate` + leftover companion `packages/runtime`<br>
**Auditor:** implementer (ord_edd76bb5 identity wave 3; hub as-is already indexes order/dashboard/field-gap-closure)

**2026-08-18 addendum (4.6.3 prepare):** C-046 records current Codex CLI/local Desktop
operation-scoped hard write. Historical 4.5.0 snapshot language below remains dated evidence.

**2026-08-25 addendum (4.7.1 published):** C-020 tree identity was **4.7.1**.
C-047 records the optional `arkRun` extra (4.7.0). Does not close Z09 / K01.

**2026-08-30 addendum (4.8.2 published):** C-020 tree identity was **4.8.2**.
C-048 records the optional `arkOrder` extra (4.8.0; `arkgate/order`). Skills
four-plane honesty is 4.8.2.

**2026-08-30 addendum (4.8.3):** last living C-020 text was tree **4.8.3** published;
npm `latest` **4.8.3**. That sentence is **to-be / historical Planned** (C-053), not
current as-is. C-049 records `writes-via-aggregate`. C-048 gains `xiKeys` +
`ARKORDER_XI_FIELD_WRITE`. Does not close Z09 / K01.

**2026-09-06 addendum (identity restatement):** C-020 as-is is tree **4.8.13**
(Status: prepared, not npm-published); npm `latest` **4.8.11**; tag `v4.8.12`
stands; tag `v4.8.13` exists; `RL813` doing. Code wins. Last 4.8.3 C-020 claim
kept as C-053 (do not delete). Does not close Z09 / K01. Last freeze “no new
skill names” is to-be: `#217` added first-class `/ark-order` to the closed catalog.

**2026-09-06 addendum (hub as-is):** `Agents.md` indexes dashboard bins, `arkgate/order`,
and `docs/plans/field-gap-closure`. C-018 and C-052 restated OK. Last Partial/omit
wording and the 2026-07-17 “14/14 100%” sentence are to-be/Planned (not deleted).

**2026-09-06 merge (`#217` on `main`):** C-037 as-is is the closed catalog with
first-class `/ark-order` (ADR 0036). Leftover shortcuts are one-release stubs.
ACS05 freeze was opened for this item; Domain `ARK_SKILL_NAMES` still closes
the list. The *set* covers Layers + ArkRules + ArkRun + ArkOrder (when / not
when / handoff). Filter: **Contener · Guiar · Ordenar** — contain the path,
guide leftover design and extras, protect the few big choices. ξ / Haken stay
below the fold. Last “frozen 13 skill names / no new skill names” wording is
to-be/historical Planned (not deleted).

## Summary

Bounded set: every externally consumable package/bin/schema/integration family, both product
package manifests, and public-lane authorities (README, use, develop, ai-gates, agent-guide,
configuration, package-surface, product-voice, ROADMAP Next session, this matrix).

| Verdict | Count |
|---------|------:|
| OK | 53 |
| Partial | 2 |
| Missing | 0 |
| Contradicted | 0 |
| Unverifiable | 0 |

| Severity | Count |
|----------|------:|
| critical | 43 |
| normal | 12 |

**Truth score (advisory):** 98 — `(OK*100 + Partial*50) / TOTAL_V` = `(53*100 + 2*50) / 55`. Not a merge gate.
**CI gate:** fail if any **critical** + **Contradicted** via local `scripts/audit-claims.sh` when that script is present (C-054: this tree does not ship the script; score remains advisory).

**Surface coverage:** as-is hub table is **16** bounded rows including dashboard bins and `arkgate/order` (C-052 OK). Last hub claim “14/14 bounded rows, 100% (2026-07-17)” is **to-be / Planned** — do not delete that date. Package-surface remains the consumer contract authority.

**Top residual risks:**

1. **C-028 Partial (wontfix for DF):** Z09 / RB-11 retained-adoption + independent close remain a
   parked claim gate — not an engineering `doing` until preregistration is met. Do not close Z09 / K01.
2. OpenCode and uncovered host paths stay advisory. Codex hard evidence is limited to complete,
   trusted, runtime-observed local `apply_patch`; doctor must not borrow it for other paths.
3. Repo hygiene: Dependabot may still surface transitive advisories; triage before claiming a
   clean public tree (not a product-roadmap `doing` unless it needs a pin).
4. **Identity as-is (C-020):** tree **4.8.13** prepared; npm `latest` **4.8.11**. Last 4.8.3
   published/latest wording is C-053 to-be/historical Planned.
5. **C-007 Partial:** package-surface omits dedicated export-path rows for
   `./schema/enforcement-state` and `./schema/design-delta`. Last complete alias-map claim is to-be.

**Recommended next Intent:** keep Z09 / K01 parked; C-007 is package-surface alias-row honesty (not this owns_path).

## DF06 inventory (historical — 2026-08-10 snapshot)

The table and README 0.3 checklist below are the **DF06 / 4.5.0 prepare** inventory.
They are **not** current version identity. Current as-is is C-020: tree **4.8.13** prepared;
npm `latest` **4.8.11**. Last matrix identity “tree/npm **4.8.3** published” is C-053
to-be/historical Planned. Do not read 4.4.0 / 4.5.0 / 4.7.1 / 4.8.2 / 4.8.3 here as live `latest`.

| Lane | Authority paths | Checklist / result |
|------|-----------------|--------------------|
| Front door | `README.md` | Host matrix unchanged; dual bins; **4.4.0 on npm latest**; tree preparing **4.5.0** |
| Use | `docs/use.md`, `docs/product-voice.md` | Session recipe; doctor + status compass; soft-host honesty |
| Develop | `docs/develop.md`, `docs/ai-gates.md`, `docs/agent-guide.md`, `docs/configuration.md`, `docs/package-surface.md` | Session recipe; status modes; self-service upgrade; residual ⊆ doctor when full |
| Contribute | `CONTRIBUTING.md`, `ROADMAP.md` Next session, `Agents.md` plans | DF01–DF06 **done** at prepare; publish checklist open until npm verify |
| Releases | `CHANGELOG.md`, `docs/releases/*` | 4.5.0 **Status: prepared**; 4.4.0 **published** on npm `latest` |
| Templates | `action.yml`, generated workflow, `templates/agent-skills/` | First-push-safe base-ref; closed skill catalog (`ARK_SKILL_NAMES`) |
| Audit | this file | DF06 snapshot; living identity is C-020 / C-053 |

### README 0.3 checklist (signed, DF06 / 4.5.0)

- [x] Choose-your-path + one-minute path match product voice + doctor control plane
- [x] Host support table matches matrix (Codex/Cursor/OpenCode advisory; repair envelope split)
- [x] Required merge boundary = **required status context**, not “CI file present”
- [x] Dual bins consistent
- [x] Version strip: **4.4.0 published** on npm `latest`; tree preparing **4.5.0** *(historical DF06; current strip is C-020 4.8.13 prepared / 4.8.11 latest)*
- [x] Links resolve into use/develop/docs hub
- [x] No hard-write lie for Codex

## Claims matrix

Living-claims v0 columns. `anchor.hash` omitted (`—`) unless a content hash was recorded. Severity omit would mean `normal`; every structural row here sets it.

| ID | Structural claim | Source authority | Code evidence | Anchor path | Anchor symbol | Anchor hash | Severity | Verdict | Action |
|----|------------------|------------------|---------------|-------------|---------------|-------------|----------|---------|--------|
| C-001 | Product identity is ArkGate; npm package is `arkgate` | [Hub](../../AGENTS.md) · [README](../../README.md) | root manifest `name` · `src/version.ts` | `package.json` | `name` | — | critical | OK | keep |
| C-002 | Two publishable manifests: stable root `arkgate` plus leftover deprecated companion `@arkgate/runtime`; live ArkRun kernel is `arkgate/runtime` inside package `arkgate` | [Hub package index](../../AGENTS.md#package-index) | root + `packages/runtime/package.json` description DEPRECATED | `packages/runtime/package.json` | `description` | — | critical | OK | keep as-is; last claim “one experimental ArkRun kernel package” as the live kernel → to-be/historical Planned; do not delete companion row |
| C-003 | Root `arkgate` exports the gate/config/analysis contract, not runtime APIs | [Programmatic API](../package-surface.md#programmatic-root-api) | `src/gate.ts` · `tsup.config.ts` | `src/gate.ts` | — | — | critical | OK | keep |
| C-004 | Setup CLI has `arkgate` and `ark` bin names | [README commands](../../README.md#common-commands) | `package.json` `bin.arkgate` / `bin.ark` → `bin/ark.mjs` | `package.json` | `bin.arkgate` | — | critical | OK | keep |
| C-005 | Check/doctor CLI has `arkgate-check` and `ark-check` bin names | [Agent guide](../agent-guide.md) | `package.json` `bin.arkgate-check` / `bin.ark-check` → `bin/ark-check.mjs` | `package.json` | `bin.arkgate-check` | — | critical | OK | keep |
| C-006 | MCP has dual bins, **thirteen** documented tools including `ark_identity`, `ark_manifest`, and `ark_status`, plus a compatibility-only `ark://manifest` resource | [MCP reference](../agent-guide.md#write-path-gate-mcp) | `bin/ark-mcp.mjs` · `bin/ark-mcp-runtime.mjs` `TOOLS` · `server.json` | `bin/ark-mcp-runtime.mjs` | `TOOLS` | — | critical | OK | keep |
| C-007 | Config and public schema aliases, including project identity and status-manifest, are documented | [Package surface](../package-surface.md) · [Configuration](../configuration.md) | root `exports` include enforcement-state and design-delta; package-surface omits dedicated export-path rows for those two | `package.json` | `exports` | — | normal | Partial | keep; last complete alias-map claim → to-be until package-surface lists those two subpaths; do not invent schemas |
| C-008 | Recommended ESLint config enables the documented rule set | [AI gates](../ai-gates.md#eslint-editor-feedback--same-contract-as-ci) | `src/eslint/index.ts` recommended includes arkrun + arkorder rules | `src/eslint/index.ts` | `plugin.configs.recommended` | — | critical | OK | keep |
| C-009 | GitHub Action inputs and first-push-safe base-ref behavior are documented | [AI gates](../ai-gates.md#ci-backstop) | `action.yml` six inputs; all-zero SHA handling | `action.yml` | `inputs` | — | critical | OK | keep |
| C-010 | Shipped hooks, isolated repo skills, Agent Skills layout, monotonic shared Codex skills, and adoption-test template have discoverable guidance; catalog is `ARK_SKILL_NAMES` (includes `ark-order`) | [Agent guide](../agent-guide.md#install-skills-ark-and-ecosystem) · [AI gates](../ai-gates.md) · [ADR 0036](../adr/0036-skill-catalog-product-capacity.md) | `templates/skills/` + `templates/agent-skills/` match `ARK_SKILL_NAMES`; hooks · adoption test | `templates/` | — | — | critical | OK | keep as-is; last “13 skill names” count → to-be/historical Planned |
| C-011 | Playbook, policy packs, and gallery examples map to the enthusiast track | [Enthusiast index](../enthusiast/README.md) | templates · `examples/` (gallery; not in root `files`) | `examples/` | — | — | normal | OK | keep (Demo) |
| C-012 | Live ArkRun kernel import is `arkgate/runtime` (`createStrictArkKernel`, no process singleton); Nest uses `arkgate/nestjs`; companion `@arkgate/runtime` is deprecated leftover | [Package surface](../package-surface.md#experimental-opt-in-surfaces) · [Runtime README](../../packages/runtime/README.md) | root exports `./runtime` `./nestjs`; tsup bundles `src/runtime/index.ts` into `arkgate` | `package.json` | `exports["./runtime"]` | — | critical | OK | keep as-is (same plane as C-013 / C-047); last disputed claim “kernel uses `@arkgate/runtime`; kernel stays out of `arkgate` tarball” → to-be/historical Planned; do not delete |
| C-013 | 4.8.0 restores **real** `arkgate/runtime` and `arkgate/nestjs` subpaths (ADR 0031); AR04 removed *shims*; `@arkgate/runtime` is deprecated | [Package surface](../package-surface.md#experimental-opt-in-surfaces) · [Migration](../migrate-from-ark-runtime-kernel.md) · [ADR 0031](../adr/0031-one-package-extras-deprecate-companion.md) | root exports `./runtime` `./nestjs`; gate root has no factories | `package.json` | `exports["./runtime"]` | — | critical | OK | keep; use `arkgate/runtime` |
| C-014 | Root package metadata is available at `arkgate/package.json` | [Package surface](../package-surface.md) | root manifest export | `package.json` | `exports["./package.json"]` | — | normal | OK | keep |
| C-015 | Published payload is bounded by the root manifest and verified separately | [Contributing](../../CONTRIBUTING.md) | root `files` · package verifier | `package.json` | `files` | — | critical | OK | keep |
| C-016 | This repository's Ark contract has four declared layers and generated parity seams | [Hub placement](../../AGENTS.md#where-new-code-belongs) | `ark.config.json` · generate scripts | `ark.config.json` | `layers` | — | critical | OK | keep |
| C-017 | Project TS5/6/7 compilers stay project-owned with fail-closed incomplete analysis | [TypeScript support](../typescript-support.md) | typescript host · packed matrix | `docs/typescript-support.md` | — | — | critical | OK | keep |
| C-018 | All retained plan seeds are indexed with current shipped status | [Hub plans](../../AGENTS.md#product-plans-library-epic-queue-seeds) | hub plans table indexes `docs/plans/field-gap-closure/` | `Agents.md` | Product plans table | — | normal | OK | keep as-is; last Partial “field-gap-closure absent from hub table” → to-be/historical Planned; do not delete that plan |
| C-019 | Accepted ADRs are navigable without duplicating their rationale | [ADR index](../adr/README.md) | ADR frontmatter | `docs/adr/README.md` | — | — | normal | OK | keep |
| C-020 | Tree version identity is **4.8.13** (CHANGELOG Status: prepared, not npm-published); npm `latest` is **4.8.11**; tag `v4.8.12` stands; tag `v4.8.13` exists; `RL813` doing | [CHANGELOG](../../CHANGELOG.md) · [ROADMAP](../../ROADMAP.md) · [Hub releases](../../AGENTS.md) | `package.json` / lock / `src/version.ts` / `server.json` = 4.8.13; CHANGELOG 4.8.13 prepared; ROADMAP npm `latest` 4.8.11; git tags `v4.8.12` `v4.8.13` | `package.json` | `version` | — | critical | OK | keep as-is; last 4.8.3 published/latest wording is C-053 to-be/historical Planned |
| C-021 | Links in shipped Markdown resolve inside the tarball or use repository URLs | Shipped README/docs | root `files` | `package.json` | `files` | — | normal | OK | rerun on release |
| C-022 | Nightly evaluation claims distinguish deterministic, opt-in live, and skipped cases | [Eval guide](../../eval/README.md) | nightly workflow · placement-ab | `eval/README.md` | — | — | normal | OK | keep |
| C-023 | Migration and runtime guidance uses current package boundaries | [Migration guide](../migrate-from-ark-runtime-kernel.md) | manifests | `docs/migrate-from-ark-runtime-kernel.md` | — | — | critical | OK | keep |
| C-024 | Contributor layout distinguishes stable gate code, experimental runtime, payload | [Contributing](../../CONTRIBUTING.md) | layout | `CONTRIBUTING.md` | — | — | normal | OK | keep |
| C-025 | Preflight, CLI, MCP, write gate, final CI share one candidate graph | [ADR 0005](../adr/0005-atomic-change-preflight.md) | resolved-candidate facts · parity | `docs/adr/0005-atomic-change-preflight.md` | — | — | critical | OK | keep |
| C-026 | Gallery starters clean-room journey | [Examples](../../examples/README.md) | packed matrix | `examples/README.md` | — | — | normal | OK | keep |
| C-027 | `ark upgrade` managed content honesty | Setup CLI · agent guidance | managed-content identities | `bin/ark.mjs` | — | — | critical | OK | keep |
| C-028 | Field evidence measures real merge gate + retained adoption | [Roadmap](../../ROADMAP.md) · [Field kit](../field/README.md) | Z07–Z10 evidence; Z09 parked | `ROADMAP.md` | `Z09` | — | critical | Partial | owner: Z09 / RB-11 (not DF); do not close Z09 / K01 |
| C-029 | Design delta ratchet + host hardness requires runtime/provider proof | [Package surface](../package-surface.md) · [AI gates](../ai-gates.md) | design-delta · enforcement-state | `docs/package-surface.md` | — | — | critical | OK | keep |
| C-030 | Soft-write host does not alone force doctor `Not finished` | [Product voice](../product-voice.md) · plan EH | `enforcement-honesty.mjs` | `docs/product-voice.md` | — | — | critical | OK | keep |
| C-031 | CI runtime observation independent of branch-protection plan API | [AI gates](../ai-gates.md) · plan EH | `github-enforcement.mjs` · `withCiProviderEvidence` | `docs/ai-gates.md` | — | — | critical | OK | keep |
| C-032 | Report does not broaden `.gitignore` over `.ark/*` + `!` exceptions | plan EH | `html-report.mjs` | `bin/lib/html-report.mjs` | — | — | critical | OK | keep |
| C-033 | First-push all-zero base SHA does not require fail-on-new-smells delta | [AI gates](../ai-gates.md) | `ci-and-commands.mjs` · `action.yml` | `action.yml` | — | — | critical | OK | keep |
| C-034 | Public diagnostic codes have a closed catalog with why/fix docs anchors | [Diagnostics](../diagnostics.md) · [Package surface](../package-surface.md) | `diagnosticCatalog.ts` · fixtures | `src/domain/diagnosticCatalog.ts` | — | — | critical | OK | keep |
| C-035 | `ark status --json` / MCP `ark_status` returns one identity/activation/last-check/rules snapshot (not a score) | [Agent guide](../agent-guide.md) · [Package surface](../package-surface.md) | `statusManifest.ts` · schema | `src/domain/statusManifest.ts` | — | — | critical | OK | keep |
| C-036 | Version-matched agent projection is regenerable and labeled non-authoritative for enforcement | [Agent guide](../agent-guide.md) · [Package surface](../package-surface.md) | `agentProjection.ts` · CLI | `src/domain/agentProjection.ts` | — | — | critical | OK | keep |
| C-037 | Closed skill catalog (`ARK_SKILL_NAMES`) ships 1:1 in Agent Skills layout; first-class `/ark-order`; leftover shortcuts are one-release stubs; ACS05 freeze opened (ADR 0036); Domain still closes the list; the set covers Layers + ArkRules + ArkRun + ArkOrder with when/not when/handoff (**Contener · Guiar · Ordenar**) | [Agent guide](../agent-guide.md#install-skills-ark-and-ecosystem) · [ADR 0036](../adr/0036-skill-catalog-product-capacity.md) · [Product voice](../product-voice.md) | `agentSkillsPackage.ts` · `templates/agent-skills/` · `skillCatalogCapacity.test.ts` | `src/domain/agentSkillsPackage.ts` | `ARK_SKILL_NAMES` | — | critical | OK | keep as-is (#217); last “frozen 13 skill names; no new skill names” → to-be/historical Planned |
| C-038 | Factory diagnostics carry stable `findingRef` + baseline-compatible `targetKey` (schema 1.5) | [Package surface](../package-surface.md) · [Agent guide](../agent-guide.md) | `adapterContract.ts` · multi-turn fixture | `src/domain/adapterContract.ts` | — | — | critical | OK | keep |
| C-039 | Maintainer placement A/B eval exists under `eval/` with CI-safe dry mode; not a product score | [Eval guide](../../eval/README.md) · [placement-ab README](../../eval/placement-ab/README.md) | harness · fixtures · unit test | `eval/placement-ab/README.md` | — | — | normal | OK | keep |
| C-040 | AGENTS.md / skills / projection never decide pass/fail; gate remains CLI/hooks/CI | [Product voice](../product-voice.md) · plan ACS hard lines | analysis paths do not import projection | `docs/product-voice.md` | — | — | critical | OK | keep |
| C-041 | Doctor exposes improvement compass (`notAScore`) with locked out-of-scope lenses; residual never flips `valid` / strict-merge alone | [Use — compass](../use.md#improvement-compass-not-a-score) · [Package surface](../package-surface.md) | `improvementCompass.ts` · doctor adapter · unit tests | `src/domain/improvementCompass.ts` | — | — | critical | OK | keep |
| C-042 | Public product lanes describe compass + Align/Stabilize/Shape without roadmap-item narrative | [Use](../use.md) · [Agent guide](../agent-guide.md) · [product-voice](../product-voice.md) | README / use / agent-guide / CHANGELOG | `docs/use.md` | — | — | critical | OK | keep |
| C-043 | Status/MCP project improvement compass with honesty modes `full` \| `subset` \| `unavailable`; residual ⊆ doctor when `full`; never invent green residual | [Package surface](../package-surface.md) · [Agent guide](../agent-guide.md) | `projectStatusImprovementCompass` · status fixtures | `src/domain/statusManifest.ts` | `projectStatusImprovementCompass` | — | critical | OK | keep |
| C-044 | Public lanes teach session recipe: identity → status → act; doctor when compass mode is not full — without roadmap codes | [Use — session recipe](../use.md#session-recipe-agent-turn) · [Agent guide](../agent-guide.md#session-recipe-agent-turn) | use / agent-guide / develop / release notes | `docs/use.md` | — | — | critical | OK | keep |
| C-045 | Managed upgrade surfaces self-service activation labels + customized-content preserve without inventing hard-write without runtime evidence | [Package surface](../package-surface.md) · [4.5.0 notes](../releases/4.5.0.md) | `managed-upgrade-honesty.mjs` · DF05 tests | `bin/lib/managed-upgrade-honesty.mjs` | — | — | critical | OK | keep |
| C-046 | Codex CLI and local Desktop/App Server hard-block only complete trusted, runtime-observed local `apply_patch`; other paths remain CI-backed | [AI gates](../ai-gates.md#openai-codex-cli-and-local-desktop) · [ADR 0019](../adr/0019-codex-operation-scoped-hard-write.md) | `ark-mcp-runtime.mjs` · `host-support-matrix.mjs` | `bin/ark-mcp-runtime.mjs` | — | — | critical | OK | keep |
| C-047 | Optional `arkRun` extra is silent when absent; enforced extra teeth share write/CI; kernel import is `arkgate/runtime`; in-memory stores are not production durability; doctor `arkRun` is `notAScore`; wire via `/ark-runtime` (catalog list stays Domain-closed) | [Use — extras](../use.md#the-product-you-choose-the-extras) · [Configuration](../configuration.md) · [Package surface](../package-surface.md#experimental-opt-in-surfaces) · [Hardening](../production-hardening.md) | `arkRun` schema · skip corpus · `createStrictArkKernel` | `package.json` | `exports["./runtime"]` | — | critical | OK | keep; last “no new skill names” on this row → to-be/historical Planned (C-037 / ADR 0036) |
| C-048 | Optional `arkOrder` extra is silent when absent; `arkgate/order` in the same npm package; field events cannot overwrite the few slow product decisions; no `update`; `xiKeys` names those decisions; a managed-layer persistence write of a named key is `ARKORDER_XI_FIELD_WRITE`; in-memory; does not replace ArkRun; extras door is `/ark-adopt` then **`/ark-order`** (wire one candidate); first contact is doctor + `[ArkOrder]` on the check | [Use — extras](../use.md#the-product-you-choose-the-extras) · [README ArkOrder](../../README.md#optional-arkorder) · [Package surface](../package-surface.md#experimental-opt-in-surfaces) · [ArkOrder](../arkorder.md) | `exports["./order"]` · `createOrderPlane` · skip corpus `ARKORDER_*` | `package.json` | `exports["./order"]` | — | critical | OK | keep vs package-surface; hub row now exists (`Agents.md` surface coverage: `arkgate/order`) |
| C-049 | Closed ArkRules sensor `writes-via-aggregate`: Application/Feature persistence writes go through a Domain aggregate + adapter; advisory default; absence silent; no folder religion | [Configuration](../configuration.md) · [ADR 0032](../adr/0032-writes-via-aggregate-sensor.md) | `arkRuleSensors.ts` · Application templates | `src/domain/arkRuleSensors.ts` | `writes-via-aggregate` | — | critical | OK | keep |
| C-050 | Dual dashboard bins `arkgate-dashboard` / `ark-dashboard` poll inspector JSON; not a gate verdict | [Package surface](../package-surface.md) · agent-guide dashboard | `package.json` bins · `bin/ark-dashboard.mjs` | `package.json` | `bin.ark-dashboard` | — | critical | OK | keep vs package-surface; hub row now exists (`Agents.md` surface coverage: Dashboard CLI) |
| C-051 | Public ArkOrder subpath `arkgate/order` (`createOrderPlane`) is a package export in `arkgate` | [Package surface](../package-surface.md#experimental-opt-in-surfaces) | `package.json` `./order`; tsup `order/index`; `src/kernel/order/index.ts` | `package.json` | `exports["./order"]` | — | critical | OK | keep vs package-surface; hub row now exists (`Agents.md` surface coverage: `arkgate/order`) |
| C-052 | Agents.md surface coverage table indexes **16** bounded rows including dashboard bins (`arkgate-dashboard` / `ark-dashboard`) and `exports["./order"]` / `arkgate/order` | [Hub surface coverage](../../AGENTS.md#surface-coverage) | hub 16-row table vs `package.json` bins/exports | `Agents.md` | Surface coverage | — | critical | OK | keep as-is; last “omits ./order and dashboard” and “14/14 bounded rows, 100% (2026-07-17)” → to-be/Planned; do not delete the 2026-07-17 sentence |
| C-053 | Last living C-020 text (2026-08-30; **to-be / historical Planned**, not current as-is): “Tree version identity is **4.8.3** (published); npm `latest` is **4.8.3**” | this matrix 2026-08-30 addendum · [4.8.3 notes](../releases/4.8.3.md) | superseded by C-020 as-is (`package.json` 4.8.13; npm `latest` 4.8.11) | `docs/releases/4.8.3.md` | — | — | normal | OK | keep as to-be/historical Planned; do not delete; do not treat as current identity |
| C-054 | This tree does not ship `scripts/audit-claims.sh`; truth score in this matrix is advisory; the named gate would fail on critical Contradicted if present | SPEC AUDIT-002 (documentation-manager living-claims gate) | `scripts/` has no `audit-claims.sh`; no `.github/workflows/docs-audit.yml` | `scripts/` | — | — | normal | OK | last claim “script is the gate in this repo” → to-be/Planned until copied; do not invent the script (owns_paths is this matrix only) |
| C-055 | Companion `@arkgate/runtime` is deprecated leftover 0.x (`experimental` tag), not the live kernel | [Hub strikethrough](../../AGENTS.md) · [Package surface](../package-surface.md#experimental-opt-in-surfaces) | `packages/runtime/package.json` description DEPRECATED; `publishConfig.tag` experimental | `packages/runtime/package.json` | `description` | — | critical | OK | keep; do not revive as live kernel |

## Contradicted / Partial owners

| Verdict | Claim | Owner |
|---------|-------|-------|
| Partial | C-007 schema export-path rows incomplete on package-surface | package-surface (not this slice) |
| Partial | C-028 field retention / independent close | Z09 / RB-11 (explicit wontfix for Phase DF; do not close) |
| None | — | **0 Contradicted** living as-is after 2026-09-06 restatement |

## Historical note

Prior matrix (2026-08-09) covered 4.3.0 / ACS08 and prep rows for IC. The DF06 pass (2026-08-10)
advanced C-020 for tree **4.5.0** prepare (npm still 4.4.0) and added C-043–C-045. That
version strip is **historical**. The 2026-08-25 HS05 addendum restated C-020 for tree
**4.7.1**. The 2026-08-30 addendum’s C-020 text (tree **4.8.3** published; npm `latest`
**4.8.3**) is retained as C-053 **to-be / historical Planned** — not deleted, not current
as-is. The 2026-09-06 restatement is C-020 as-is (tree **4.8.13** prepared; npm `latest`
**4.8.11**). C-047 remains the `arkRun` extra; C-048 is the `arkOrder` extra; C-049 is
`writes-via-aggregate`.
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

## Verification record (2026-09-06 identity restatement)

- Tree identity: `package.json` / `package-lock.json` / `src/version.ts` / `server.json` = **4.8.13**.
- CHANGELOG `## 4.8.13` Status: prepared; npm `latest` remains **4.8.11**.
- CHANGELOG `## 4.8.12` Status: prepared; ROADMAP `RL812` done; tag `v4.8.12` stands (`28ac035`).
- ROADMAP `RL813` doing; tag `v4.8.13` exists (`6ed8c0d`); HEAD described as `v4.8.13-3`.
- npm registry corroboration (2026-09-06): `npm view arkgate version` = **4.8.11**.
- Last matrix C-020 4.8.3 published/latest kept as C-053 to-be/historical Planned.
- Living-claims columns added; no parallel claims wiki; no `src/` or `ark.config.json` edits.
