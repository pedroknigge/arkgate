# ArkGate package surface policy

**Product wedge:** write gate · CI gate · co-pilot (plan / loop / skills).  
**Not the wedge:** the optional in-process runtime kernel.

**Public product site:** [arkgate.online](https://www.arkgate.online/) (promise + only flow).
In-repo `docs/` remains the package/agent reference. Source: GitHub; distribution: npm.

This document is the consumer contract for **what is stable** vs **what is experimental**.
It ships as the consumer contract linked from the npm README. The separate experimental-runtime
hardening guide remains repository-hosted rather than duplicated in the gate tarball.

---

## Stable surfaces (semver-supported)

| Surface | How you use it | Stability notes |
|---------|----------------|-----------------|
| **CLI** | `arkgate` / `arkgate-check` (aliases `ark` / `ark-check`) | Flags and human text may improve; **JSON output shapes** for `--json` (check, doctor, plan, coverage, recommend) are stable within a major. Additive fields OK; removals/renames are major. |
| **Programmatic gate API** | `import { analyzeProject, loadContract, createAICodeGate, ... } from 'arkgate'` | The root export is the static gate/config/analysis contract listed below. It intentionally contains no runtime-kernel implementation. |
| **Doctor design fitness (P02+)** | `ark-check --doctor --json` → `doctor.designFitness`, `doctor.designSmells[]` | Additive. Stable smell `id`s: `io-under-application`, `handler-in-persistence`, `god-module`, `domain-logic-in-ui`, `facade-sql-in-routes`, `mixed-pattern-cluster`, `soft-contract`. Y02 extends `handler-in-persistence` to static ES imports/re-exports of framework HTTP surfaces (`next/server`), `defineRoute` calls, and existing handler bodies inside Persistence-role layers or specific persistence paths; `require()` and dynamic `import()` are outside this narrow advisory, and a generic `Infrastructure` role alone is not Persistence. Persistence candidates are filtered and sorted before the bounded content scan so large application prefixes cannot hide the advisory. The detector inspects the first 800 sorted Persistence candidates; later candidates are uninspected, so **absence of a smell is not full-tree proof** above that envelope (incomplete/`partial` analysis also never proves “no smells”). Each smell has `evidence[]`, `fix`, technical `message`, and plain-language **`outcome`** (Q02). Does **not** fail the gate by itself. |
| **Post-green path (Q01)** | `doctor.postGreenPath`, `doctor.primaryNextAction`, `doctor.healthyFinishedForbidden` | Additive when `designFitness.designWeak`. Single Shape door (`id: clarify-for-ai`): explore shape-focus → dual-plan B → autopilot only with OK. Never empty plan A = healthy finished. |
| **Golden pattern (Q03)** | Optional `.ark/golden-pattern.json`; doctor JSON `doctor.goldenPattern`; MCP `ark_place` / `ark_prepare_write` → `goldenPattern` | Additive, **advisory for NEW code only**. Required fields: `name`, `norm`; optional `newCodeHome`, `examplePath`, `schemaVersion`. **Absent is normal** (no claim). Never ENFORCE; never clears design-weak. Malformed → `invalid: true`, not silent guidance. |
| **Plan pattern B (P03+)** | `ark-check --plan --json` → `plan.patternBets[]`, `plan.goal.designWeak` | Additive. Each bet: `id`, `smellId`, `pilot`, `evidence`, `successSignal`, `killSwitch`, **`neverMechanicalSafe: true`**, `class: "judgment"`. **Never** auto-applied by loop/autoPatch; not a `remediationKind` mechanical-safe. `goal.met` remains edge honesty only. |
| **Pilot loop (Q04)** | `plan.pilotLoop` / `doctor.pilotLoop` | Additive. When design-weak: `active`, `oneAtATime`, `neverMechanicalSafe`, **`nextPilot`** extraction-card fields (`pilotTarget`, `smellId`, `move`, `successSignal`, `killSwitch`, `doNot[]`). **One pilot → re-doctor**; never multi-pilot batch; never mechanical-safe. |
| **AI-velocity eval (Q05)** | Repository-only evidence: `npm run eval:ai-velocity` → `eval/ai-velocity-report.json` | Fixture-measured (no live LLM). Same feature scenario on design-weak vs golden-path arms; metric **`placementTurns`** (agent-equivalent). Golden must be strictly better. Method string lives next to the number. Does not weaken the gate. |
| **Contract health (W01)** | `ark-check --doctor --json` → `doctor.contractHealth`; optional `.ark/contract-smell-acks.json` | Additive, **advisory only** — meta-lint of the contract itself (layer-name heuristics; imprecision costs a warning line, never a verdict); never changes the verdict, `designFitness`, or `patternBets`. Stable smell ids: `contract-bidirectional-allow`, `contract-peripheral-depends-core`, `contract-lateral-adapter-allow`, `contract-dead-rule`; each smell has `severity`, `evidence[]` (sorted, honest `…(+N more)` truncation), `fix`, `message`, plain-language `outcome`, and `acknowledgedEdges` (acks applied to that id). **X03/X06**: the lateral smell does not fire on an adapter reaching its **own family's infra base** — the target reads `<Family><InfraWords…>` (**every** remaining target token an infra word: `Infra(structure)`/`Base`/`Core`/`Shared`/`Common`/`Kernel`/`Platform`/`Foundation`) and the source carries the family token **anywhere** in its name (X06, field: `HoursPersistenceAdapters -> PersistenceInfrastructure` — mid-name families). `PaymentsCoreAdapters` is still a sibling; cross-family edges, non-infra siblings, and the reverse (base → member) still fire. Acknowledgments live in the bounded sidecar (`{ acks: [{ id, edge, reason, reviewBy? }] }`, ≤64 KB / ≤200 entries; bidirectional edges order-insensitive, exact two segments); `contractHealth.acknowledged` counts **applied** acks only (stale acks count 0). **X02 ack lifecycle**: optional `reviewBy` (`YYYY-MM-DD`, strict round-trip validation — `2026-02-30` is malformed) — past the date the ack **stops applying** and the smell returns with `(ack expired …)` annotated evidence; among dated entries a fresh re-ack wins over a dead one, but once ANY dated ack exists for an edge the dated entries govern — a leftover undated duplicate cannot resurrect an expired exception. `detectContractSmells` defaults `today` to the real clock (pass `null` to disable expiry); `analyzeContractSmells` stays pure (clock injected). `contractHealth.ackLifecycle` reports `{ undated, malformed, expiredCount, expired[], staleCount, stale[] (lists capped at 12) }`; undated acks apply (backward compatible) but surface in doctor, report, and the fossilization note even when every smell is suppressed. **X05**: an ack matching **no detected edge** (orphaned by a fixed contract or quieted heuristic, unknown id, or typo'd edge) is `stale` — it suppresses nothing and doctor/report list the exact entries to fix or delete, even at zero visible smells. Malformed `reviewBy` never applies (fail-loud, like a sloppy edge); non-string `reviewBy` → whole file `invalid`. **Absent is normal**; malformed file or edge grammar → ignored + `ackFile.invalid` where applicable, never silent suppression. |
| **Effect capabilities (U03/Y08)** | Public root API: `analyzeProject(...).ir.capabilityUses`; the CLI/hook adapters add symbol-aware ambient evidence internally | Additive within IR `1.0`. Seven **closed** ids: `network`, `filesystem`, `clock`, `randomness`, `environment`, `process`, `persistence` (ADR 0009). `collectCapabilityUses` and the Domain vocabulary are internal implementation exports, **not** exports from `arkgate`; the related public low-level helper is `collectForbiddenCapabilityUses`. Direct evidence only — transitive inference never detects. The symbol-aware adapter path covers ambient globals (shadowing/type-only/globalThis-alias precision from the S05/C04 machinery) plus imports; the compiler-free IR engine carries **import-based** uses only (exact module or subpath match, never substring; textual `import type`/`export type` erasure and all-type named lists (`import { type A }`) are type-only there; mixed `{ type A, B }` stays a value import; template-literal bodies are skipped entirely (specifiers inside `${…}` are the symbol path's job); package `require(…)` counts as capability evidence only, while relative `require(…)` also emits a pure-path graph edge). **U04 walls are opt-in:** per-layer `capabilities: { deny: [...] }` or the dual-depth sugar `pure: true` (denies all seven); absence changes no verdict. `CAPABILITY_VIOLATION` is judgment-class (never mechanical-safe) with a port-injection `nextAction`; D7 dedup — evidence already owned by the layer's `forbiddenGlobals` reports only `FORBIDDEN_GLOBAL`. Y08 adds one deliberately narrow import dual: `forbiddenGlobals: ["process"]` owns exact value imports of `process` and `node:process`, but not subpaths or `child_process`; statement-level `import type` / `export type` remains erased on every path (pure-IR residual envelope: mixed `{ type A, B }`, default+named type lists, and comment-interrupted forms stay value imports; symbol path owns full precision). Atomic preflight blocks denied capabilities and that exact dual across a complete multi-file candidate (import-based on the pure path; other ambient evidence adds on the symbol-aware CLI/hook path). T01 policy-delta classifies the surface on **coverage atoms** (`ambient:<entry>` prefix-expanded, narrow `import-exact:<specifier>` duals, and `import:<capability>` for a complete wall): any lost atom is weakening (`fetch`→`XMLHttpRequest`, `Date`→`Date.now`, wall→fg all weaken; finding path `$.layers[name].capabilities`); fg → equivalent-or-stronger wall never needs an acknowledgment; unlowerable custom globals keep raw key comparison. |
| **Ambient state (U05)** | `ark-check --doctor --json` → `doctor.ambientState`; optional `.ark/ambient-state-acks.json` | Additive, **advisory only and opt-in**: only layers declared `pure: true` are scanned; the MVP shape is module-scope `let`/`var`. Findings carry `file`/`line`/`name`/`kind` (sorted, capped with honest `truncated` count). Acknowledgments live in the bounded sidecar (`{ acks: [{ file, name, reason }] }`, ≤64 KB / ≤200 entries); `acknowledged` counts applied acks; malformed file suppresses nothing. When TypeScript is unavailable the sensor reports `available: false` instead of guessing. **No strict mode exists** — A5: strictness requires a completed corpus and an explicit later decision. |
| **Parse health + analysis completeness (Y03/Z02)** | `ark-check --doctor --json` → `doctor.parseHealth` + `doctor.completeness`; check JSON → `completeness`; report section `data-advisory="parseHealth"` | The resolved candidate facts contribute only `parseDiagnosticCount` per governed file (no raw diagnostics, second parser pass, or `tsc`). Z04's correctness path ignores legacy v9 caches and parses the complete candidate on every invocation; Z07 owns any future identity-keyed warm snapshot. Doctor remains diagnostic: parse health adds no architecture violation and does not change `designFitness` or `patternBets`. Verdict surfaces consume the evidence fail-closed: affected governed files mean `partial`, plan `goal.met: false`, normal JSON `valid:false`/`ok:false`, and strict merge exit `1`; the non-strict process exit remains advisory for compatibility. No usable host means `unavailable`, plan false, and CLI exit `2`. JSON reports `scannedFiles`, `affectedFiles`, `diagnosticCount`, deterministic top-12 `{ file, diagnosticCount }` entries, and honest `truncated`/`overflow`; missing/unsafe evidence never becomes a clean claim. |
| **Physical cohesion + reshape pilot (X04/Y01)** | `ark-check --doctor --json` → `doctor.physicalCohesion` (`reshapePilot`, `reshapeDecisions`); optional `.ark/reshape-decisions.json`; report section `data-advisory="physicalCohesion"` | Additive, **advisory only** — `notAScore`; never feeds the verdict, `designFitness`, or `patternBets`. Signal is **concentration, not volume**: concept clusters per anchor directory (deterministic path/name tokenization; framework filenames like `route.ts` take the topmost meaningful path segment — ADR 0010 D2). Fixed corpus-calibrated thresholds (`maxCluster ≥ 40` OR ≥2 anchors ≥ 20, ADR 0010 D3); findings ranked and capped (top 5, honest `truncated`). Anchors under `app/`/`pages/` are `fixedByConvention` and never move (D7). `reshapePilot` is **proposed, never applied** (`neverMechanicalSafe`): one Q04-style pilot card at a time targeting the smallest convention-free anchor, with `moveSample`/`movesTotal`, `successSignal`, `killSwitch`, `doNot[]`; real moves run only through the write gate + atomic preflight via `/ark-loop`; merges are `/ark-architect` judgment cards, never a codemod (D6). **Y01 verdict memory:** bounded sidecar `{ schemaVersion?: "1", decisions: [{ concept, anchors, verdict: "accepted"|"deferred"|"rejected", reason, reviewBy? }] }` (≤64 KiB / ≤200 unique targets). Identity is concept + complete sorted anchor set, never counts/change-map evidence. Current rejected/deferred records suppress pilot pressure only; accepted keeps the existing path. Expired/malformed/stale/invalid records suppress nothing; lifecycle and decisions render in doctor/report. Explicit only — golden-pattern prose never infers a verdict. |
| **Capability walls, every adapter (U04+U06)** | CLI scan, pure IR engine, atomic preflight, `ark-mcp --hook` / MCP gate (`capabilityWalls`), ESLint `ark/no-denied-capabilities` | The same opt-in deny set enforces across every surface: hook/MCP and CLI cover ambient + import evidence (symbol-aware); the pure engine, preflight, and ESLint cover the import dimension (documented envelope). Dual depth everywhere: plain port hint (`FIX_HINTS`/`suggestion`) + stable JSON (`ruleId`, `capability`, `fixClass: inject-port`, deterministic `nextAction`). |
| **Hook-path budgets (U06)** | Repository-only evidence: `npm run bench:hook-path`; `eval/performance/hook-budgets.v1.json`; CI job "Hook-path end-to-end budgets" | Measures the COMPLETE pre-tool paths as fresh child processes (hook cold/warm, doctor cold) at 1k/10k. D5 method locked: ceilings are Linux-baseline p95 + fixed headroom, set once per cycle, never ratcheted; scenarios without a recorded baseline stay in RECORDING mode and cannot fail CI. |
| **Governance weight (W02)** | `ark-check --doctor --json` → `doctor.contractHealth.governanceWeight` | Additive, **advisory only** — raw facts (`declaredLayers`, `populatedLayers`, `governedFiles`, `rules`, `deniedEdges`, `allowedEdges`, `filesPerLayer`, `rulesPerLayer`) plus a fixed comparative band `weight: heavy | typical | light | unknown` and its fixed `note`. Fixed deterministic thresholds: **heavy** = fewer than 25 governed files per declared layer AND (6+ layers OR 4+ well-formed rules per layer); **light** = at most 2 layers over 150+ governed files; **unknown** = no layers or no governed files; everything else is **typical** (banding uses raw ratios; the reported ratios are rounded for display). `notAScore: true` is explicit: never a composite score, ranking, or gate input; the heavy note asks to justify NEW layers/rules and never suggests deleting working ones. Human doctor prints a line only for `heavy`/`light`. |
| **Report parity (X01)** | `ark-check --report` → advisory sections (`data-advisory="contractHealth\|ambientState\|parseHealth"`, nested `governanceWeight`) + layer wall badges | The report is a rendering of doctor truth. **Standing rule:** every doctor advisory ships with its report section — enforced by the `reportParity` guard, which enumerates the doctor's advisory keys and fails on any missing section. |
| **MCP tools** | `arkgate-mcp` / `ark://…` resources | Tool names and primary argument shapes are stable within a major. |
| **`ark.config.json`** | Layer globs, rules, include/exclude, forbiddenGlobals, intent prefixes, `peerIsolation`, `dynamicImportAllowlist`, `safety` thresholds; optional **`arkRules`** map (schema `1.1+`) | Versioned by `schemaVersion`; unknown fields fail closed and migrations preserve the previous supported major. Absence of `arkRules` is byte-for-byte silent on inter-layer verdicts. |
| **ArkRules inventory / under-contract (4.0)** | `ark-check --rules-inventory [--json]`; doctor `rulesUnderContract`; MCP `ark_rules_inventory` | Additive. Honest counts (inventoried / under-contract / frozen) — **never a score**. Structure/invariant diagnostics use adapter `1.4` provenance. |
| **Package pin dual-truth (4.0)** | doctor JSON `packageVersionTruth`; upgrade JSON/human note when pin behind CLI | Additive, advisory. Surfaces after `upgrade --no-install` when managed CLI is ahead of package.json. |
| **Policy transition analysis (T01, 3.1.0)** | `analyzePolicyDelta(...)`; MCP `ark_policy_delta`; CLI `--policy-base` / `--policy-base-ref` / `--policy-ack`; check JSON `policyDelta` | Additive schema `1.0`. Classifications and finding ids are deterministic. Weakening/judgment requires an acknowledgement bound to both policy hashes and the exact blocking finding set. |
| **Atomic change preflight (T02, 3.1.0)** | `preflightChange(...)`; CLI `ark preflight --changes <file> --json`; MCP `ark_prepare_change` | Additive schema `1.0`. One complete governed production-source `{path,content}` / `{path,delete:true}` batch; read-only; returns operation, content/tree/policy/compiler fingerprints and stable graph findings. MCP availability alone is advisory. |
| **Architecture change map (T03, 3.1.0)** | `arkgate/schema/change-map` or `arkgate/schema/ark.change-map.schema.json`; CLI `ark preflight --change-map <file>`; MCP `ark_prepare_change.changeMap` | Optional strict schema `1.0`. Canonical planned paths + operations + resolved Ark layers + dependencies between planned files. Preflight returns `changeMapHash`; absence is normal and adds no project file. Structural intent only, never behavioral completion. |
| **Structural convergence (T04, 3.1.0)** | `analyzeArchitectureConvergence(...)`; map-enabled `preflightChange(...)`; existing CLI/MCP preflight adapters | Additive `convergence` result with stable `satisfied`, `missing`, `contradictory`, and `unplanned` findings. Uses the supplied/current project tree as base and the explicit complete change set as candidate; no implicit Git or LLM input. `readOnly: true`; `behavioralCompletion: "not-evaluated"`. Structural mismatch makes preflight invalid. |
| **Enforcement ladder + fixed journey (T05, 3.1.0)** | `doctor.writePath.enforcementLadder`; hook repair `enforcement`; `npm run eval:change-integrity` | Additive schema `1.0` separates supported/installed/active/bypassable state and evidence. Hard is operation-scoped only for a supported covered hook; MCP is advisory; required CI status stays unverified locally. Fixed no-context fixture proves CLI/MCP/hook/final parity, one casual denial, acceptance behavior, and strict Ark. |
| **Enforcement state (Z06/Z10)** | `doctor.writePath.enforcementState`; schema/type | Schema `1.1`: runtime observation, operation coverage, and operation-scoped `hard`. Only fresh covered active-host evidence permits `hard:true`; unverified assets and MCP remain non-hard. |
| **Design delta (Z10)** | `--fail-on-new-smells --base-ref <ref>`; hook/MCP; schema/types | Schema `1.0`: identities, touched paths, stable evidence/verdict. Missing base fails closed; only new/worsened `domain-logic-in-ui` blocks; global doctor smells stay advisory. |
| **`arkgate/schema/analysis-result`** or **`arkgate/schema/ark.analysis-result.schema.json`** | Public CLI/MCP/hook diagnostic envelope (`schemaVersion`, `mode`, `valid`, `completeness`, `completenessReasons`, `diagnostics`, resolved identities) | Schema `1.4` adds optional `evidence.arkruleId` / `evidence.arkruleSource` for ArkRules; `1.3` distinguished `resolved-candidate-facts` from `lexical-compatibility`; partial/unavailable analysis is always non-green, and resolved complete/partial results require policy/resolver/facts/tree identities. `1.2` added completeness and remains accepted alongside consumer-owned 1.0/1.1 values. |
| **`arkgate/schema/arkrules`** or **`arkgate/schema/ark.arkrules.schema.json`** | Per-layer structure sensors + invariant catalog (ADR 0012) | Schema `1.0`. Opt-in via root `arkRules` map (`ark.config` schema `1.1`). |
| **`arkgate/schema/resolved-candidate-facts`** or **`arkgate/schema/ark.resolved-candidate-facts.schema.json`** | Versioned parity-capable input for `analyzeResolvedProject` / `preflightResolvedChange` | Schema `1.0` is serializable and deterministic. Tooling owns filesystem/compiler resolution; Domain/Kernel validate and evaluate supplied facts without importing those effects. Facts name resolver/compiler inputs, governed files, dependency evidence, completeness reasons, and candidate tree/facts hashes. |
| **Config JSON Schema** | `arkgate/schema` or `arkgate/schema/ark.config.schema.json` | Stable package resource subpaths for editor completion and contract tooling. |
| **Agent skills** | `/ark-*` templates; install via `--install-agent-gates` (often `--skills-only` on top of compact) | **Day zero** is the compact router from `ark start` / `start --apply` + doctor control plane — not the full skill pack. Skill *names* and the guided expert path (`/ark-autopilot` after pack install) are stable; internal skill prose may evolve. **4.0:** all skills except experimental `/ark-runtime` integrate **layers + ArkRules** and must label residual `[Layer]` vs `[ArkRules]`. |
| **ESLint subpath** | `arkgate/eslint` | Config-driven layer/import rules; loads consumer `ark.config.json`. |
| **GitHub Action** | `pedroknigge/arkgate` (see `action.yml`) | The `uses:` tag/SHA selects the checker source; `version` remains an optional exact npm compatibility override. |
| **Package metadata** | `arkgate/package.json` | Stable resource subpath for tooling that needs the installed manifest. |

### Corrective distribution status and strict boundary

`arkgate@3.8.0` includes the non-deduplicable TS6 host, completeness schema, and resolved
candidate-facts parity path above. It installs `typescript-ark-host` at
exact `npm:typescript@6.0.3`, prefers a usable project compiler API, and fails closed on `partial`
or `unavailable` analysis. Its packed compatibility gate is scoped to Node 18/20/22/24,
npm/pnpm/Yarn, and project TypeScript 5.9.3/6.0.3/7.0.2. All 36 packed cells passed on source
`228dd893` in CI run `29655190747`. Yarn uses strict PnP for the JS compilers and its
`node-modules` linker for native TS7; the report names that mode.

Z04 closes the separate current-source parity claim under the supplied-facts boundary selected in
[ADR 0011](adr/0011-resolved-candidate-facts-boundary.md). Complete candidates—including aliases,
workspace/project packages, symlinks, creates, updates, and deletes—are resolved once into
versioned facts and evaluated by one pure Kernel/generated-bundle verdict. CLI, MCP, complete-patch
hook, programmatic resolved APIs, and final check preserve the same evidence identities; ESLint
claims parity only for its documented on-disk static-relative envelope. Retained lexical APIs and
single-snippet adapters report `lexical-compatibility`, `partial`, and non-green instead of
borrowing the resolved claim.

Strict CI remains the final authority because it is the merge boundary, not because another
semantic engine is expected there. No early adapter result is permission to suppress that gate.

Gates need **no application code imports**. Most projects only use the CLI + MCP + config.

## Programmatic root API

`src/gate.ts` is the canonical source for `import ... from 'arkgate'`. Its public runtime values
are grouped below.

| Group | Exported runtime values |
|-------|-------------------------|
| Metadata and adapter diagnostics | `version`, `ARK_ANALYSIS_RESULT_SCHEMA_VERSION`, `ARK_ANALYSIS_RESULT_SCHEMA`, `createAdapterResult`, `toAdapterDiagnostic` |
| AI snippet gate | `createAICodeGate` |
| Profiles and config factories | `createArchitectureProfile`, `createArchitectureProfileFromArkConfig`, `createElevenLayerArkConfig`, `elevenLayerProfile` |
| Analysis and preflight | `loadContract`, `analyzeResolvedProject`, `preflightResolvedChange`, lexical-compatibility `analyzeProject` / `analyzeChange` / `preflightChange`, `analyzePolicyDelta`, `analyzeArchitectureConvergence`, `explainViolation`, `evaluateArchitectureGraph`, `collectAnalysisConfigWarnings`, `detectArchitectureCycles`, `collectForbiddenCapabilityUses`, `extractSemanticDependencies` |
| Policy delta | `POLICY_DELTA_SCHEMA_VERSION`, `classifyArkPolicyDelta`, `policyDeltaAcknowledgementMatches` |
| Design delta contract | `ARK_DESIGN_DELTA_SCHEMA_VERSION` |
| Analysis IR + resolved facts | `ANALYSIS_IR_SCHEMA_VERSION`, `RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION`, `RESOLVED_CANDIDATE_FACTS_SCHEMA`, `createResolvedCandidateFacts`, `loadResolvedCandidateFacts`, `resolvedFactsEvidenceRequirementsHash`, `deterministicHash`, `stableSerialize` |
| Config contract | `ARK_CONFIG_SCHEMA`, `ARK_CONFIG_SCHEMA_VERSION`, `loadArkConfigContract`, `parseArkConfigJson` |

The type-only root exports are also semver-supported:

- Adapter diagnostics: `AdapterDiagnostic`, `AdapterResult`, `AdapterSeverity`,
  `AdapterViolationInput`, `AdapterCompletenessReason`, `AnalysisCompleteness`, `AnalysisMode`.
- Resolved facts: `ResolvedCandidateFacts`, `ResolvedCandidateFactsInput`, and their
  dependency/file/evidence component types.
- AI snippet gate: `AICodeGate`, `AICodeGateResult`, `AICodeGateViolation`,
  `AICodeGateContext`, `AICodeGateOptions`, `AIGateExtension`.
- Profiles and config factories: `ArchitectureLayer`, `ArchitectureLayerConfig`,
  `ArchitectureProfile`, `ArchitectureRule`, `ArkCheckConfig`,
  `CreateArchitectureProfileFromArkConfigOptions`, `CreateArchitectureProfileOptions`,
  `CreateElevenLayerArkConfigOptions`.
- Analysis and preflight: `AnalysisContract`, `ArchitectureChangeMap`,
  `ArchitectureChangeMapContract`, `ArchitectureChangeMapDependency`,
  `ArchitectureChangeMapFile`, `ArchitectureChangeOperation`,
  `AnalyzeArchitectureConvergenceInput`, `ArchitectureActualChange`,
  `ArchitectureConvergenceClassification`, `ArchitectureConvergenceFinding`,
  `ArchitectureConvergenceResult`, `ArchitectureDependency`, `AnalyzeProjectInput`,
  `AnalyzeResolvedProjectInput`, `PreflightResolvedChangeInput`, `AnalyzeChangeInput`,
  `AnalysisResult`, `ResolvedAnalysisFile`, `ResolvedAnalysisIr`, `ResolvedAnalysisResult`,
  `ResolvedChangePreflightResult`, `ResolvedSafetyReport`, `PreparedChangeFile`, `ChangePreflightResult`,
  `AnalyzePolicyDeltaInput`, `PolicyDeltaAnalysis`, `ArchitectureEngineViolation`,
  `ArchitectureEngineEdge`, `EvaluateArchitectureGraphInput`, `ArchitectureEngineResult`,
  `CollectAnalysisConfigWarningsInput`, `ForbiddenCapabilityUse`, `SemanticDependency`,
  `SemanticDependencyKind`.
- Policy delta: `PolicyDelta`, `PolicyDeltaAcknowledgement`, `PolicyDeltaClassification`,
  `PolicyDeltaFinding`.
- Design delta: `ArkDesignDeltaResult`, `ArkDesignDeltaIdentity`, `ArkDesignDeltaChange`,
  `ArkDesignDeltaEvidence`, `ArkDesignSmellId`, `ArkDesignDeltaVerdict`.
- Analysis IR: `AnalysisFileInput`, `AnalysisFileChange`, `AnalysisCompilerOptions`,
  `AnalysisFile`, `AnalysisImportEdge`, `AnalysisCapabilityUse`, `AnalysisEvidence`,
  `AnalysisViolation`, `AnalysisIr`.
- Config contract: `ArkConfig`, `ArkConfigLoadResult`.

Runtime-kernel factories, `CAPABILITY_IDS`, `collectCapabilityUses`, and Domain capability mapping
helpers are deliberately absent from this root. Use `@arkgate/runtime` for the experimental
runtime, and `analyzeProject(...).ir.capabilityUses` for public capability evidence.

---

## Experimental opt-in surfaces

These APIs are implemented for evaluation and compatibility, but they are **not production-ready
product claims**. Static architecture enforcement does not depend on them.

| Surface | Import path | Notes |
|---------|-------------|--------|
| **Runtime kernel** | **`@arkgate/runtime`** | Separate 0.x source package configured for the `experimental` tag. It is not currently present in the npm registry, and the root `publish-npm.yml` workflow does not publish it automatically. Event bus, intents, policies, sagas, event buffer, projections, and strict helpers. Built-in stores are **InMemory reference only**. |
| **NestJS adapter** | `@arkgate/runtime/nestjs` | Experimental optional peer `@nestjs/common`. Root `arkgate/nestjs` and `arkgate/runtime` forwarders were **removed in AR04 / ArkGate 4** — import the companion package directly. |

---

## Recommended imports

```ts
// Preferred path when evaluating the experimental runtime kernel
import { createStrictArkKernel, createStrictArkKernelFromConfig } from '@arkgate/runtime';

// Nest adapter
import { ArkModule, InjectArk } from '@arkgate/runtime/nestjs';
```

These imports describe the intended package boundary. Before an npm evaluation, verify that a
separate publication exists with `npm view @arkgate/runtime dist-tags --json`. Until it does,
build `packages/runtime` in an ArkGate source checkout and install that local folder; do not treat
the deprecated root forwarding shims as an embedded runtime.

See [production-hardening.md](https://github.com/pedroknigge/arkgate/blob/main/docs/production-hardening.md) for requirements an eventual
production deployment would need to satisfy; it is not a readiness certification.

---

## Explicitly unstable / internal

- `bin/lib/*` module layout and private helpers  
- Generated `bin/ark-layer-match.mjs` (edit canonical `src/domain/layerMatch.ts` only)  
- HTML report DOM structure (unless documented as a machine contract)  
- Internal MCP diagnostic fields not listed in agent-guide  

---

## Versioning summary

| Change | Version bump |
|--------|----------------|
| Break CLI JSON field, MCP tool rename, or required `ark.config` field | **major** |
| New optional config field, new CLI flag, additive JSON | **minor** |
| Bugfix with no contract change | **patch** |
| Additive experimental runtime API | `@arkgate/runtime` prerelease/minor |
| Remove deprecated `arkgate/runtime` / `arkgate/nestjs` forwarding shims | **Done (AR04)** — use `@arkgate/runtime` / `@arkgate/runtime/nestjs` |

---

## Release notes (maintainers)

Ship notes for a version live under [releases/](https://github.com/pedroknigge/arkgate/tree/main/docs/releases)
(prepared: [4.0.0.md](https://github.com/pedroknigge/arkgate/blob/main/docs/releases/4.0.0.md);
last published: [3.9.2.md](https://github.com/pedroknigge/arkgate/blob/main/docs/releases/3.9.2.md)).
Publish path: signed annotated tag → GitHub Release → `publish-npm.yml` (see [CONTRIBUTING.md](https://github.com/pedroknigge/arkgate/blob/main/CONTRIBUTING.md)).
