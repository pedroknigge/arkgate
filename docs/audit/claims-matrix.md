# Documentation claims audit

> Hub: [AGENTS.md](../../AGENTS.md) · Package contract:
> [docs/package-surface.md](../package-surface.md) · Decisions: [docs/adr/](../adr/README.md)
> **Code and manifests are the source of truth.** Documentation does not override implementation.

**Date:** 2026-07-25<br>
**Scope:** project (public lanes + bounded package surfaces) — Phase EH deep audit<br>
**Intent:** audit → selective documentation + honesty evidence (EH01–EH08)<br>
**Variant:** ArkGate bridge (`ark.config.json`, local CLIs, `ark://manifest`)<br>
**Out:** root<br>
**Stack:** Node/TypeScript<br>
**Monorepo:** root `arkgate` + `packages/runtime`<br>
**Auditor:** documentation-manager + implementer (Phase EH)

## Summary

Bounded set: every externally consumable package/bin/schema/integration family, both product
package manifests, and public-lane authorities (README, use, develop, ai-gates, agent-guide,
configuration, package-surface, product-voice, ROADMAP Next session, this matrix).

| Verdict | Count |
|---------|------:|
| OK | 32 |
| Partial | 1 |
| Missing | 0 |
| Contradicted | 0 |
| Unverifiable | 0 |

**Surface coverage:** 14/14 bounded rows have a canonical authority in
[AGENTS.md](../../AGENTS.md#surface-coverage) (**100% documentation coverage**).

**Top residual risks:**

1. **C-028 Partial (wontfix for EH):** Z09 / RB-11 retained-adoption + independent close remain a
   parked claim gate — not an engineering `doing` until preregistration is met.
2. Tree version may be **4.1.1 prepared** while npm `latest` is still **4.1.0** until publish —
   README and release notes must keep **prepared vs published** language (EH08).
3. Soft-write hosts stay advisory forever; doctor must not re-collapse them into unfinished
   architecture debt after EH05.

**Recommended next Intent:** publish prepared **4.1.1** when maintainer checklist is green; keep
Z09 parked.

## EH01 inventory (public lanes)

| Lane | Authority paths | Checklist / result |
|------|-----------------|--------------------|
| Front door | `README.md` | Host matrix regenerated from `host-support-matrix.mjs`; dual bins; version strip names published 4.1.0 + prepared 4.1.1; required status wording |
| Use | `docs/use.md`, `docs/product-voice.md` | Doctor control plane; soft-host honesty; product-voice EH vocabulary |
| Develop | `docs/develop.md`, `docs/ai-gates.md`, `docs/agent-guide.md`, `docs/configuration.md`, `docs/package-surface.md` | CI base-ref snippet EH04; CLI vs status context; Codex advisory |
| Contribute | `CONTRIBUTING.md`, `ROADMAP.md` Next session, `Agents.md` plans | Queue EH done; next session = prepared 4.1.1 publish |
| Releases | `CHANGELOG.md`, `docs/releases/*` | 4.1.0 published language; 4.1.1 **Status: prepared** |
| Templates | `action.yml`, generated workflow | First-push-safe base-ref |
| Audit | this file | 0 Contradicted on public lanes |

### README 0.3 checklist (signed)

- [x] Choose-your-path + one-minute path match product voice + doctor control plane
- [x] Host support table matches matrix (Codex/Cursor/OpenCode advisory; repair envelope split)
- [x] Required merge boundary = **required status context**, not “CI file present”
- [x] Dual bins consistent
- [x] Version strip: published 4.1.0 + prepared 4.1.1 (no false npm claim for 4.1.1)
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
| C-006 | MCP has dual bins, `ark://manifest`, and every registered tool is named in docs | [MCP reference](../agent-guide.md#write-path-gate-mcp) | `bin/ark-mcp.mjs` · `server.json` | OK | keep |
| C-007 | Config and public schema aliases are documented | [Package surface](../package-surface.md) · [Configuration](../configuration.md) | root `exports` · `schemas/` | OK | keep |
| C-008 | Recommended ESLint config enables the documented rule set | [AI gates](../ai-gates.md#eslint-editor-feedback--same-contract-as-ci) | `src/eslint/index.ts` | OK | keep |
| C-009 | GitHub Action inputs and first-push-safe base-ref behavior are documented | [AI gates](../ai-gates.md#ci-backstop) | `action.yml` · `ci-and-commands.mjs` | OK | EH04 |
| C-010 | Shipped hooks, skills, and adoption-test template have discoverable guidance | [Agent guide](../agent-guide.md#supported-agent-hosts) · [AI gates](../ai-gates.md) | `templates/` · installer | OK | keep |
| C-011 | Playbook, policy packs, and gallery examples map to the enthusiast track | [Enthusiast index](../enthusiast/README.md) | templates · `examples/` | OK | keep |
| C-012 | Experimental runtime uses `@arkgate/runtime`; Nest uses its `/nestjs` subpath | [Runtime README](../../packages/runtime/README.md) · [Package surface](../package-surface.md#experimental-opt-in-surfaces) | runtime manifest | OK | keep experimental label |
| C-013 | Deprecated root `arkgate/runtime` and `arkgate/nestjs` forwarders were **removed** (AR04) | [Package surface](../package-surface.md#experimental-opt-in-surfaces) · [Migration](../migrate-from-ark-runtime-kernel.md) | root exports (no forwarders) | OK | use `@arkgate/runtime` only |
| C-014 | Root package metadata is available at `arkgate/package.json` | [Package surface](../package-surface.md) | root manifest export | OK | keep |
| C-015 | Published payload is bounded by the root manifest and verified separately | [Contributing](../../CONTRIBUTING.md) | root `files` · package verifier | OK | keep |
| C-016 | This repository's Ark contract has four declared layers and generated parity seams | [Hub placement](../../AGENTS.md#where-new-code-belongs) | `ark.config.json` · generate scripts | OK | keep |
| C-017 | Project TS5/6/7 compilers stay project-owned with fail-closed incomplete analysis | [TypeScript support](../typescript-support.md) | typescript host · packed matrix | OK | keep |
| C-018 | All retained plan seeds are indexed with current shipped status | [Hub plans](../../AGENTS.md#product-plans-library-epic-queue-seeds) | `docs/plans/` · ROADMAP | OK | EH plan → Shipped when EH closes |
| C-019 | Accepted ADRs are navigable without duplicating their rationale | [ADR index](../adr/README.md) | ADR frontmatter | OK | keep |
| C-020 | Tree version identity is **4.1.1** prepared; npm latest observed **4.1.0** until publish | [4.1.1 notes](../releases/4.1.1.md) · [4.1.0 notes](../releases/4.1.0.md) | package/lock/version/server | OK | never claim 4.1.1 published early |
| C-021 | Links in shipped Markdown resolve inside the tarball or use repository URLs | Shipped README/docs | root `files` | OK | rerun on release |
| C-022 | Nightly evaluation claims distinguish deterministic, opt-in live, and skipped cases | [Eval guide](../../eval/README.md) | nightly workflow | OK | keep |
| C-023 | Migration and runtime guidance uses current package boundaries | [Migration guide](../migrate-from-ark-runtime-kernel.md) | manifests | OK | keep |
| C-024 | Contributor layout distinguishes stable gate code, experimental runtime, payload | [Contributing](../../CONTRIBUTING.md) | layout | OK | keep |
| C-025 | Preflight, CLI, MCP, write gate, final CI share one candidate graph | [ADR 0005](../adr/0005-atomic-change-preflight.md) | resolved-candidate facts · parity | OK | keep |
| C-026 | Gallery starters clean-room journey | [Examples](../../examples/README.md) | packed matrix | OK | keep |
| C-027 | `ark upgrade` managed content honesty | Setup CLI · agent guidance | managed-content identities | OK | keep |
| C-028 | Field evidence measures real merge gate + retained adoption | [Roadmap](../../ROADMAP.md) · [Field kit](../field/README.md) | Z07–Z10 evidence; Z09 parked | Partial | owner: Z09 / RB-11 (not EH) |
| C-029 | Design delta ratchet + host hardness requires runtime/provider proof | [Package surface](../package-surface.md) · [AI gates](../ai-gates.md) | design-delta · enforcement-state | OK | keep |
| C-030 | Soft-write host does not alone force doctor `Not finished` | [Product voice](../product-voice.md) · plan EH | `enforcement-honesty.mjs` | OK | EH05 |
| C-031 | CI runtime observation independent of branch-protection plan API | [AI gates](../ai-gates.md) · plan EH | `github-enforcement.mjs` · `withCiProviderEvidence` | OK | EH06 |
| C-032 | Report does not broaden `.gitignore` over `.ark/*` + `!` exceptions | plan EH | `html-report.mjs` | OK | EH03 |
| C-033 | First-push all-zero base SHA does not require fail-on-new-smells delta | [AI gates](../ai-gates.md) | `ci-and-commands.mjs` · `action.yml` | OK | EH04 |

## Contradicted / Partial owners (EH01 close)

| Verdict | Claim | Owner |
|---------|-------|-------|
| Partial | C-028 field retention / independent close | Z09 / RB-11 (explicit wontfix for Phase EH) |
| None | — | **0 Contradicted** on public lanes after EH02/EH08 |

## Historical note

Prior matrix (2026-07-22) predated 4.1.0 field train close and Codex WAFI feedback. C-013
forwarder language and C-020 “3.9.0” version pin were stale relative to 4.x and AR04 removal;
corrected in this pass.

## Verification record (EH)

- npm `arkgate@latest` observed **4.1.0** at audit time; tree prepared **4.1.1**.
- Host matrix README block matches `renderHostSupportMatrixMarkdown()`.
- Focused Phase EH unit tests: gitignore, honesty soft-write, provider 403, CI runtime, base-ref template.
- `npm run check:architecture` / `test:confidence` — see implementer summary for final run.
