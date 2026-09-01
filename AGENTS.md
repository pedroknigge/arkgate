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
structural claim is true. Documentation is organized in **three public lanes** — use the map,
not every historical file:

| Lane | Entry | Audience |
|------|-------|----------|
| **Use** | [docs/use.md](docs/use.md) | Anyone shipping with AI |
| **Develop** | [docs/develop.md](docs/develop.md) | Integrate gates, hosts, CI, brownfield |
| **Contribute** | [CONTRIBUTING.md](CONTRIBUTING.md) | Improve this library |
| **Docs hub** | [docs/README.md](docs/README.md) | Full navigation |

| Topic | Canonical authority |
|-------|---------------------|
| Public product / marketing surface | [README.md](README.md) |
| Product voice (English UI / copy) | [docs/product-voice.md](docs/product-voice.md) |
| Stable vs experimental package contract | [docs/package-surface.md](docs/package-surface.md) |
| Config contract and schema | [docs/configuration.md](docs/configuration.md) |
| Agent, CLI, MCP reference | [docs/agent-guide.md](docs/agent-guide.md) |
| Host enforcement setup | [docs/ai-gates.md](docs/ai-gates.md) |
| TypeScript compatibility | [docs/typescript-support.md](docs/typescript-support.md) |
| Brownfield and enthusiast track | [docs/brownfield-adoption.md](docs/brownfield-adoption.md) · [docs/enthusiast/](docs/enthusiast/README.md) |
| Security | [SECURITY.md](SECURITY.md) · [docs/threat-model.md](docs/threat-model.md) |
| Decisions | [docs/adr/](docs/adr/README.md) |
| Implementation queue | [ROADMAP.md](ROADMAP.md) (live) · [archive](docs/archive/roadmap-history.md) |
| Releases (current / last published) | [CHANGELOG.md](CHANGELOG.md) · [4.8.8](docs/releases/4.8.8.md) (prepared; not published) · [4.8.7](docs/releases/4.8.7.md) (published, npm `latest`; does not close `K01`) · [4.8.6](docs/releases/4.8.6.md) (published) · [4.8.5](docs/releases/4.8.5.md) (published) · [4.8.4](docs/releases/4.8.4.md) (published) · [4.8.3](docs/releases/4.8.3.md) (published) · [4.8.2](docs/releases/4.8.2.md) (published) · [4.8.1](docs/releases/4.8.1.md) (published) · [4.8.0](docs/releases/4.8.0.md) (published) · [4.7.6](docs/releases/4.7.6.md) (published) · [4.7.5](docs/releases/4.7.5.md) (published) · [4.7.4](docs/releases/4.7.4.md) (published) · [4.7.3](docs/releases/4.7.3.md) (published) · [4.7.2](docs/releases/4.7.2.md) (published) · [4.7.1](docs/releases/4.7.1.md) (published) · [4.7.0](docs/releases/4.7.0.md) (published) · [4.6.7](docs/releases/4.6.7.md) (published) · [4.6.6](docs/releases/4.6.6.md) (published) · [4.6.5](docs/releases/4.6.5.md) (published) · [4.6.4](docs/releases/4.6.4.md) (published) · [4.6.3](docs/releases/4.6.3.md) · [4.6.2](docs/releases/4.6.2.md) · [4.6.1](docs/releases/4.6.1.md) · [4.6.0](docs/releases/4.6.0.md) · [4.5.7](docs/releases/4.5.7.md) · [4.5.6](docs/releases/4.5.6.md) · [4.5.5](docs/releases/4.5.5.md) · [4.5.0](docs/releases/4.5.0.md) · [4.4.0](docs/releases/4.4.0.md) · [4.3.0](docs/releases/4.3.0.md) |
| History / maintainer evidence | [docs/archive/](docs/archive/README.md) · [docs/plans/](docs/plans/) · [docs/field/](docs/field/) · [docs/audit/](docs/audit/claims-matrix.md) |

Read the **lane entry** before significant work. After changing a public surface, architecture
boundary, decision, or plan, update its authority and the docs hub row if needed.

### Package index

The product tree contains two publishable Node/TypeScript packages. Example manifests under
`examples/` are gallery fixtures, not additional workspace packages.

| Package path | Role | Manifest | Canonical docs | Docs status |
|--------------|------|----------|----------------|-------------|
| `.` | Stable ArkGate gate, CLIs, MCP, ESLint, schemas, and integration assets | [package.json](package.json) | [README.md](README.md) · [package surface](docs/package-surface.md) | documented |
| `packages/runtime` | Optional experimental **ArkRun** kernel and NestJS adapter | [package.json](packages/runtime/package.json) | [package README](packages/runtime/README.md) · [package surface](docs/package-surface.md#experimental-opt-in-surfaces) | documented |

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
| MCP, `ark_manifest`, compatibility `ark://manifest`, write hooks, and registry descriptor | `bin/ark-mcp.mjs` · `server.json` | [MCP reference](docs/agent-guide.md#write-path-gate-mcp) · [AI gates](docs/ai-gates.md) | Real | — |
| Config and public schemas | `ark.config.json` · `schemas/` · package schema exports | [Configuration](docs/configuration.md) · [Package surface](docs/package-surface.md) | Real | — |
| ESLint plugin | package export `./eslint` · `src/eslint/index.ts` | [AI gates](docs/ai-gates.md#eslint-editor-feedback--same-contract-as-ci) | Real | — |
| Agent integration assets | `templates/skills/` · `templates/agent-skills/` · `templates/hooks/` · `templates/tests/` | [Agent guide](docs/agent-guide.md#install-skills-ark-and-ecosystem) · [AI gates](docs/ai-gates.md) | Real | — |
| Shape playbook, policy packs, and gallery starters | `templates/architecture-playbook.json` · `templates/policy-packs/` · `examples/` | [Enthusiast track](docs/enthusiast/README.md) | Demo | — |
| GitHub Action | `action.yml` | [Action setup and inputs](docs/ai-gates.md#ci-backstop) · [Package surface](docs/package-surface.md) | Real | — |
| Experimental ArkRun kernel (`arkgate/runtime`) | package export `./runtime` · `src/runtime/index.ts` · `src/index.ts` | [Package surface](docs/package-surface.md#experimental-opt-in-surfaces) · [Hardening](docs/production-hardening.md) | Partial | durability, not a second package |
| Experimental ArkRun NestJS adapter | package export `./nestjs` · `src/nestjs/index.ts` | [Package surface](docs/package-surface.md#experimental-opt-in-surfaces) | Partial | — |
| ~~Companion `@arkgate/runtime`~~ | deprecated (ADR 0031) | [Package surface](docs/package-surface.md#experimental-opt-in-surfaces) | Deprecated | Use `arkgate/runtime` / `arkgate/nestjs` |
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

1. Before trusting Ark MCP evidence, call `ark_identity` with `project.expectedRoot` set to
   this project's exact absolute root. Reuse that root plus the returned
   `projectIdentity.projectId` on each Ark MCP call. A descendant path is authoritative only
   when that matching id is also supplied. A missing tool, non-`matched` binding, or different
   root means the process is stale: restart the host and use the local CLI until identity matches.
2. Read the authoritative Ark contract with `ark_manifest` using the same project expectation.
   The `ark://manifest` resource is compatibility-only and always unverified/non-authoritative.
3. Keep source files inside the layer boundaries declared in `ark.config.json`.
4. Do not bypass Ark publishers, event contracts, or source metadata for runtime mutations.
5. After edits, run `npm run check:architecture`.
6. If Ark reports violations, fix the architecture instead of weakening the gate.

## Where new code belongs

`ark.config.json` is authoritative. This project uses four layers, not the default
11-layer profile:

| Layer | Directories | Notes |
|-------|-------------|-------|
| DomainModel | `src/domain/` + generated pure CLI artifacts | Pure types and invariants. `fetch`, `process`, `Date.now`, `Math.random` are forbidden globals here — inject a port instead. |
| Kernel | `src/kernel/`, `src/runtime/`, `src/gate.ts`, `src/index.ts`, `src/version.ts` | The gate API plus experimental ArkRun kernel sources (compiled into `arkgate/runtime`; deprecated companion still mirrors). May depend on DomainModel only. |
| Tooling | `src/eslint/`, `bin/`, `scripts/` | ESLint plugin, standalone CLIs, and repository scripts. May import **DomainModel only** (pure helpers). Not Kernel. |
| FrameworkAdapters | `src/nestjs/` | Optional NestJS integration. May depend on Kernel only. |

The CLIs (`bin/*.mjs`, `bin/lib/*.mjs`) run standalone and must not import from `src/`
or `dist/` except `ark-mcp` loading the built library. Shared CLI logic lives in
`bin/ark-shared.mjs`. **Pure Domain algorithms** (edit TS, then regenerate CLI artifacts):

| Canonical | Generated | Commands |
|-----------|-----------|----------|
| `src/domain/layerMatch.ts` | `bin/ark-layer-match.mjs` | `generate:layer-match` / `check:layer-match` |
| `src/domain/remediation.ts` | `bin/lib/remediation.mjs` | `generate:cli-pure` / `check:cli-pure` |
| `src/domain/diagnosticCatalog.ts` | `bin/lib/diagnostic-catalog.mjs` | (same `cli-pure` scripts) |
| `src/domain/baselineKey.ts` | `bin/lib/baseline-key.mjs` | (same `cli-pure` scripts) |
| `src/domain/configContract.ts` | `bin/lib/config-contract.mjs` + `schemas/ark.config.schema.json` | (same `cli-pure` scripts) |
| `src/domain/configExtras.ts` | `bin/lib/config-extras.mjs` | (same `cli-pure` scripts); arkRun / arkOrder extra defaults |
| `src/domain/projectIdentity.ts` | `bin/lib/project-identity.mjs` + `schemas/ark.project-identity.schema.json` | (same `cli-pure` scripts) |
| `src/domain/statusManifest.ts` | `bin/lib/status-manifest.mjs` + `schemas/ark.status-manifest.schema.json` | (same `cli-pure` scripts) |
| `src/domain/improvementCompassTypes.ts` | `bin/lib/improvement-compass-types.mjs` | (same `cli-pure` scripts); DF03 split child |
| `src/domain/improvementCompassMap.ts` | `bin/lib/improvement-compass-map.mjs` | (same `cli-pure` scripts); DF03 split child |
| `src/domain/improvementCompass.ts` | `bin/lib/improvement-compass.mjs` | (same `cli-pure` scripts); facade re-exports types + mappers |
| `src/domain/deepeningCoach.ts` | `bin/lib/deepening-coach.mjs` | (same `cli-pure` scripts); deep-module coach deepening candidates (notAScore) |
| `src/domain/agentProjection.ts` | `bin/lib/agent-projection.mjs` | (same `cli-pure` scripts) |
| `src/domain/teamParliament.ts` | `bin/lib/team-parliament.mjs` | (same `cli-pure` scripts); TW team lock |
| `src/domain/agentSkillsPackage.ts` | `bin/lib/agent-skills-package.mjs` | (same `cli-pure` scripts); layout via `generate:agent-skills` / `check:agent-skills` |
| `src/domain/resolvedCandidateFactsSchema.ts` | `schemas/ark.resolved-candidate-facts.schema.json` | (same `cli-pure` scripts) |
| `src/domain/arkRunFacts.ts` | `bin/lib/ark-run-facts.mjs` | (same `cli-pure` scripts); RN03 kernel call / managed `new` facts |
| `src/domain/extraMergeTeeth.ts` | `bin/lib/extra-merge-teeth.mjs` | (same `cli-pure` scripts); RN07 extra-plane teeth floor |
| `src/domain/arkRunSensors.ts` | `bin/lib/ark-run-sensors.mjs` | (same `cli-pure` scripts); RN04 tier-1 ArkRun sensors |
| `src/domain/arkRunDoctor.ts` | `bin/lib/ark-run-doctor.mjs` | (same `cli-pure` scripts); RN08 doctor/status/report arkRun (notAScore) |
| `src/domain/arkOrderTypes.ts` | `bin/lib/ark-order-types.mjs` | (same `cli-pure` scripts); ArkOrder vocabulary |
| `src/domain/arkOrderError.ts` | `bin/lib/ark-order-error.mjs` | (same `cli-pure` scripts) |
| `src/domain/arkOrderInvariants.ts` | `bin/lib/ark-order-invariants.mjs` | (same `cli-pure` scripts); Haken freeze/ingest/blast |
| `src/domain/arkOrderFacts.ts` | `bin/lib/ark-order-facts.mjs` | (same `cli-pure` scripts); ADR 0029 |
| `src/domain/arkOrderSensors.ts` | `bin/lib/ark-order-sensors.mjs` | (same `cli-pure` scripts); ADR 0029 |
| `src/domain/arkRunInformationPackage.ts` | kernel-consumed (no `bin/lib` generate) | RN10 snapshot sanitizer; strips factories, live instances, input DTOs |
| `src/domain/arkRunTransport.ts` | kernel-consumed (no `bin/lib` generate) | RN11 closed send kinds + ephemeral default + broker→local plan |
| `src/domain/arkRunInspector.ts` | kernel-consumed (no `bin/lib` generate) | RN12 inspector bind policy + snapshot/SSE text; HTTP listen stays Kernel |
| `src/domain/arkRunGraph.ts` | kernel-consumed (no `bin/lib` generate) | RN13 requestGraph slices (process/technical, degrees, query) + Mermaid helper |
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
| [arkrules-evolution](docs/plans/arkrules-evolution/README.md) | Prepared for 4.0.0 (`AR01`–`AR19` implemented; field train progressive) | Intra-layer ArkRules contract (structural sensors + invariant catalogs) + brownfield rules-migration toolkit on the same enforcement plane |
| [enforcement-evidence-and-docs-truth](docs/plans/enforcement-evidence-and-docs-truth/README.md) | Shipped / implemented (Phase EH; `EH01`–`EH08` done; **4.1.1 published**) | Soft-host evidence modeling (Codex field) + mechanical CI/report fixes + deep documentation audit; claims matrix 2026-07-25 |
| [workspace-identity-activation-truth](docs/plans/workspace-identity-activation-truth/README.md) | Shipped in 4.2.0 (`WI01` done; **published**) | Project-bound MCP identity handshake, fail-closed cross-project evidence, honest runtime activation/verdicts, and layer-aware ArkRules inventory |
| [agent-contract-surface-4.3](docs/plans/agent-contract-surface-4.3/README.md) | Shipped in **4.3.0** (`ACS01`–`ACS08` done; **published**) | Agent Skills packaging, version-matched projection, diagnostic code catalog, unified status JSON, finding refs, maintainer A/B eval — guardrail catalog + scan/process voice; freeze restated; no new skill names, no LLM verdict |
| [improvement-compass](docs/plans/improvement-compass/README.md) | Shipped in **4.4.0** (`IC01`–`IC07` done; **published**) | Improvement compass (lenses, not scores) + vibe-coder skill deepen; public docs product-only |
| [domain-fitness-session-truth](docs/plans/domain-fitness-session-truth/README.md) | Shipped in **4.5.0** (`DF01`–`DF06` done; **published**) | Session control-plane honesty (status compass modes + residual ⊆ doctor); domain budget **and** mandatory split; pure verification ratchet; self-service upgrade residual; session recipe at release; LEVELS 4 hybrid + Scale Stack seams |
| [deep-module-coach](docs/plans/deep-module-coach/README.md) | Shipped in **4.5.5** (`DC01`–`DC04` done; **published**) | Post-4.5 coach: deep-module vocabulary, hot-path / deepening advisory, consumer glossary hook, two-axis done recipe — process + advisory only |
| [field-upgrade-mcp-truth](docs/plans/field-upgrade-mcp-truth/README.md) | Shipped in **4.5.6** (`FX01`–`FX12`) | Field upgrade & multi-project MCP truth: registry-aware upgrade, skill drift/refresh, processPackage honesty, publish + site |
| [understandable-ark-4.6](docs/plans/understandable-ark-4.6/README.md) | Shipped in **4.6.0** (`PL01`–`PL09` done; **published**) | Plain-language product surfaces + shared Claude/Grok home skills (Codex ratchet); former 4.5.8 HS absorbed |
| [five-door-autonomy](docs/plans/five-door-autonomy/README.md) | Shipped in **4.6.1** (`SK01`–`SK07` done; **published**) | Five doors (adopt / place / autopilot / explore / upgrade) write or map in-turn; CLI is sensor + gate; other names stay as shortcuts |
| [team-parliament](docs/plans/team-parliament/README.md) | Shipped in **4.6.1** (`TW01`–`TW08` done) | Law vs feature: stewards, mixed-PR deny, ratchet vs base branch, cheap `--changed` check; doctor asks for stewards or shows list drift; identity is GitHub handle or email |
| [alive-in-six-months](docs/plans/alive-in-six-months/README.md) | `AL01`–`AL04` done on `main` (#147); `AL05` parked field | Corrective honesty + field: D0 adopted, Propia created-path merge, stewards-or-adapt, first-run noun cut; does not close Z09 |
| [arkrun](docs/plans/arkrun/README.md) | Shipped in **4.7.0** (`RN01`–`RN16` done; **published**); `RN17` done; `PK01` done (**4.8.0** tree): kernel is `arkgate/runtime` in package `arkgate`; `@arkgate/runtime` deprecated | ArkRun gated extra: opt-in like ArkRules; enforced usage + complete declarations; does not close Z09/K01 |
| [one-catalog-one-root](docs/plans/one-catalog-one-root/README.md) | Shipped in **4.7.1** (`HS01`–`HS05` done; **published**) | One project `.agents/skills` catalog, visible `arkgate@version` in skill descriptions, no home duplicates, ArkRun routed through existing names |
| [arkorder](docs/plans/arkorder/README.md) | Shipped in **4.8.0** (`OR01`–`OR07` done; **published**); **4.8.1** invariant-coverage honesty; **4.8.2** skills four-plane honesty | Fourth extra: operational pattern (ξ vs s); opt-in `arkgate/order` **in the same npm package**; first freeze `release()`, later ξ is `proposeRelease` then `apply`; v0 physics is SaaS billing fixture; does not replace ArkRun; does not close Z09/K01 |
| [arkorder-arkrun](docs/plans/arkorder-arkrun/README.md) | Shipped in **4.8.5** (`XP01`–`XP08` done; **published**) | ArkOrder × ArkRun: findable docs, one activation shape, ADR 0033 (runtime half is ArkRun), budget/freshness/human, in-memory compare. Does not close Z09/K01 |
| [arkorder-valve-loop](docs/plans/arkorder-valve-loop/README.md) | Shipped in **4.8.6** (`LV01`–`LV09` done; **published**) | Haken control loop: valve (`apply`), σ identity, ingest residual, capacity-as-data, ArkRun decision tape, `ReleaseStore` port. [ADR 0034](docs/adr/0034-arkorder-valved-loop.md). Does not close Z09/K01. No Orderfield CLI |
| [layer-description-projection](docs/plans/layer-description-projection/README.md) | Shipped in **4.8.7** (`LD01`–`LD06` done; **published**) | Project existing `layers[].description` to place/doctor/report; strip from policyHash; app-context caption; absence silent. No new key, no new skill |
| [observability-tui](docs/plans/observability-tui/README.md) | `OD01`–`OD04` done on the **4.8.8 prepared tree** (not published) | ANSI dashboard over loopback inspector JSON; queue summaries and explicit in-memory durability facts. Not a gate verdict; does not close K01 |
| [shared-home-skills-truth](docs/plans/shared-home-skills-truth/README.md) | Superseded (absorbed into 4.6.0 PL06–PL07) | Historical seed only — do not run as a separate 4.5.8 patch train |

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
