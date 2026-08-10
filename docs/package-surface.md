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
| **CLI** | `arkgate` / `arkgate-check` (aliases `ark` / `ark-check`) | Flags and human text may improve; **JSON output shapes** for `--json` (check, doctor, plan, coverage, recommend, **status**, **agents-md**) are stable within a major. Additive fields OK; removals/renames are major. From 4.2, `--require-gates` implies strict config and verifies semantic Ark AGENTS, project-rooted MCP/compact Codex registration, and fail-closed CI rather than file presence alone. `ark status --json` is the unified status snapshot. `ark agents-md` is the version-matched agent projection (non-authoritative). |
| **Programmatic gate API** | `import { analyzeProject, loadContract, createAICodeGate, ... } from 'arkgate'` | The root export is the static gate/config/analysis contract listed below. It intentionally contains no runtime-kernel implementation. |
| **Improvement compass (4.4; status honesty 4.5)** | `ark-check --doctor --json` → `doctor.improvementCompass`; human doctor section **Improvement compass (not a score)**; HTML report `data-advisory="improvementCompass"`. **`ark status --json` / MCP `ark_status`** project a thin `improvementCompass` residual map with explicit honesty **`mode`**: `full` \| `subset` \| `unavailable` (always `notAScore: true`). When `mode` is `full`, status residual lens **ids** are a **subset of** doctor residual for the same facts (report snapshot stores the thin slice after `--report`). Incomplete or missing session facts → `subset` / `unavailable` + `reasonCode` / `reason` — **never invent green residual**. Residual never flips `valid` / strict-merge / `goal.met`. When status mode ≠ full, run doctor for full 15-lens detail. | Additive schema `1.0`. Closed **15** lens ids (`soc`, `cohesion`, `coupling`, `srp`, `dip`, `ocp`, `encapsulation`, `modularity`, `scalability`, `resilience`, `security`, `maintainability`, `testability`, `domain`, `stack`) with status `ok` \| `residual` \| `not-instrumented` \| `out-of-scope`, evidence refs, optional `nextAction`, capped `topResidual`, always **`notAScore: true`**. Projection from existing smells / walls / cohesion / ArkRules / design-weak only — **never** a gate input. Out-of-scope locked for scalability, resilience, and app security (no residual invent from missing SAST/APM). Root API: `buildImprovementCompass` / `IMPROVEMENT_LENS_IDS`; status: `projectStatusImprovementCompass` / `STATUS_COMPASS_MODES`. |
| **Doctor design fitness** | `ark-check --doctor --json` → `doctor.designFitness`, `doctor.designSmells[]` | Additive. Stable smell `id`s: `io-under-application`, `handler-in-persistence`, `god-module`, `domain-logic-in-ui`, `facade-sql-in-routes`, `mixed-pattern-cluster`, `soft-contract`. `handler-in-persistence` covers static ES imports/re-exports of framework HTTP surfaces (`next/server`), `defineRoute` calls, and existing handler bodies inside Persistence-role layers or specific persistence paths; `require()` and dynamic `import()` are outside this narrow advisory, and a generic `Infrastructure` role alone is not Persistence. Persistence candidates are filtered and sorted before the bounded content scan so large application prefixes cannot hide the advisory. The detector inspects the first 800 sorted Persistence candidates; later candidates are uninspected, so **absence of a smell is not full-tree proof** above that envelope (incomplete/`partial` analysis also never proves “no smells”). **4.2 feedback hardening:** mode labels preserve the observed SUGGEST/ADAPT/ENFORCE state; a local permission/UI-state `canEdit` name alone is not a domain smell; real UI business rules route Domain → Application → UI; seed/fixture/demo/migration/generated files are not god-module pilots. Each smell has `evidence[]`, `fix`, technical `message`, and plain-language **`outcome`**. Does **not** fail the gate by itself. |
| **Post-green Shape door** | `doctor.postGreenPath`, `doctor.primaryNextAction`, `doctor.healthyFinishedForbidden` | Additive when `designFitness.designWeak`. Single Shape door (`id: clarify-for-ai`): explore shape-focus → dual-plan B → autopilot only with OK. Never empty plan A = healthy finished. |
| **Golden pattern (new code)** | Optional `.ark/golden-pattern.json`; doctor JSON `doctor.goldenPattern`; MCP `ark_place` / `ark_prepare_write` → `goldenPattern` | Additive, **advisory for NEW code only**. Required fields: `name`, `norm`; optional `newCodeHome`, `examplePath`, `schemaVersion`. **Absent is normal** (no claim). Never ENFORCE; never clears design-weak. Malformed → `invalid: true`, not silent guidance. |
| **Plan pattern B (Shape bets)** | `ark-check --plan --json` → `plan.patternBets[]`, `plan.goal.designWeak` | Additive. Each bet: `id`, `smellId`, `pilot`, `evidence`, `successSignal`, `killSwitch`, **`neverMechanicalSafe: true`**, `class: "judgment"`. **Never** auto-applied by loop/autoPatch; not a `remediationKind` mechanical-safe. `goal.met` remains edge honesty only. |
| **Pilot loop (one at a time)** | `plan.pilotLoop` / `doctor.pilotLoop` | Additive. When design-weak: `active`, `oneAtATime`, `neverMechanicalSafe`, **`nextPilot`** extraction-card fields (`pilotTarget`, `smellId`, `move`, `successSignal`, `killSwitch`, `doNot[]`). **One pilot → re-doctor**; never multi-pilot batch; never mechanical-safe. |
| **AI-velocity eval (maintainer)** | Repository-only evidence: `npm run eval:ai-velocity` → `eval/ai-velocity-report.json` | Fixture-measured (no live LLM). Same feature scenario on design-weak vs golden-path arms; metric **`placementTurns`** (agent-equivalent). Golden must be strictly better. Method string lives next to the number. Does not weaken the gate. |
| **Contract health** | `ark-check --doctor --json` → `doctor.contractHealth`; optional `.ark/contract-smell-acks.json` | Additive, **advisory only** — meta-lint of the contract itself (layer-name heuristics; imprecision costs a warning line, never a verdict); never changes the verdict, `designFitness`, or `patternBets`. Stable smell ids: `contract-bidirectional-allow`, `contract-peripheral-depends-core`, `contract-lateral-adapter-allow`, `contract-dead-rule`; each smell has `severity`, `evidence[]` (sorted, honest `…(+N more)` truncation), `fix`, `message`, plain-language `outcome`, and `acknowledgedEdges` (acks applied to that id). **X03/X06**: the lateral smell does not fire on an adapter reaching its **own family's infra base** — the target reads `<Family><InfraWords…>` (**every** remaining target token an infra word: `Infra(structure)`/`Base`/`Core`/`Shared`/`Common`/`Kernel`/`Platform`/`Foundation`) and the source carries the family token **anywhere** in its name (X06, field: `HoursPersistenceAdapters -> PersistenceInfrastructure` — mid-name families). `PaymentsCoreAdapters` is still a sibling; cross-family edges, non-infra siblings, and the reverse (base → member) still fire. Acknowledgments live in the bounded sidecar (`{ acks: [{ id, edge, reason, reviewBy? }] }`, ≤64 KB / ≤200 entries; bidirectional edges order-insensitive, exact two segments); `contractHealth.acknowledged` counts **applied** acks only (stale acks count 0). **X02 ack lifecycle**: optional `reviewBy` (`YYYY-MM-DD`, strict round-trip validation — `2026-02-30` is malformed) — past the date the ack **stops applying** and the smell returns with `(ack expired …)` annotated evidence; among dated entries a fresh re-ack wins over a dead one, but once ANY dated ack exists for an edge the dated entries govern — a leftover undated duplicate cannot resurrect an expired exception. `detectContractSmells` defaults `today` to the real clock (pass `null` to disable expiry); `analyzeContractSmells` stays pure (clock injected). `contractHealth.ackLifecycle` reports `{ undated, malformed, expiredCount, expired[], staleCount, stale[] (lists capped at 12) }`; undated acks apply (backward compatible) but surface in doctor, report, and the fossilization note even when every smell is suppressed. **X05**: an ack matching **no detected edge** (orphaned by a fixed contract or quieted heuristic, unknown id, or typo'd edge) is `stale` — it suppresses nothing and doctor/report list the exact entries to fix or delete, even at zero visible smells. Malformed `reviewBy` never applies (fail-loud, like a sloppy edge); non-string `reviewBy` → whole file `invalid`. **Absent is normal**; malformed file or edge grammar → ignored + `ackFile.invalid` where applicable, never silent suppression. |
| **Effect capabilities** | Public root API: `analyzeProject(...).ir.capabilityUses`; the CLI/hook adapters add symbol-aware ambient evidence internally | Additive within IR `1.0`. Seven **closed** ids: `network`, `filesystem`, `clock`, `randomness`, `environment`, `process`, `persistence` (ADR 0009). `collectCapabilityUses` and the Domain vocabulary are internal implementation exports, **not** exports from `arkgate`; the related public low-level helper is `collectForbiddenCapabilityUses`. Direct evidence only — transitive inference never detects. The symbol-aware adapter path covers ambient globals (shadowing/type-only/globalThis-alias precision from the S05/C04 machinery) plus imports; the compiler-free IR engine carries **import-based** uses only (exact module or subpath match, never substring; textual `import type`/`export type` erasure and all-type named lists (`import { type A }`) are type-only there; mixed `{ type A, B }` stays a value import; template-literal bodies are skipped entirely (specifiers inside `${…}` are the symbol path's job); package `require(…)` counts as capability evidence only, while relative `require(…)` also emits a pure-path graph edge). **U04 walls are opt-in:** per-layer `capabilities: { deny: [...] }` or the dual-depth sugar `pure: true` (denies all seven); absence changes no verdict. `CAPABILITY_VIOLATION` is judgment-class (never mechanical-safe) with a port-injection `nextAction`; D7 dedup — evidence already owned by the layer's `forbiddenGlobals` reports only `FORBIDDEN_GLOBAL`. Y08 adds one deliberately narrow import dual: `forbiddenGlobals: ["process"]` owns exact value imports of `process` and `node:process`, but not subpaths or `child_process`; statement-level `import type` / `export type` remains erased on every path (pure-IR residual envelope: mixed `{ type A, B }`, default+named type lists, and comment-interrupted forms stay value imports; symbol path owns full precision). Atomic preflight blocks denied capabilities and that exact dual across a complete multi-file candidate (import-based on the pure path; other ambient evidence adds on the symbol-aware CLI/hook path). T01 policy-delta classifies the surface on **coverage atoms** (`ambient:<entry>` prefix-expanded, narrow `import-exact:<specifier>` duals, and `import:<capability>` for a complete wall): any lost atom is weakening (`fetch`→`XMLHttpRequest`, `Date`→`Date.now`, wall→fg all weaken; finding path `$.layers[name].capabilities`); fg → equivalent-or-stronger wall never needs an acknowledgment; unlowerable custom globals keep raw key comparison. |
| **Ambient state (pure layers)** | `ark-check --doctor --json` → `doctor.ambientState`; optional `.ark/ambient-state-acks.json` | Additive, **advisory only and opt-in**: only layers declared `pure: true` are scanned; the MVP shape is module-scope `let`/`var`. Findings carry `file`/`line`/`name`/`kind` (sorted, capped with honest `truncated` count). Acknowledgments live in the bounded sidecar (`{ acks: [{ file, name, reason }] }`, ≤64 KB / ≤200 entries); `acknowledged` counts applied acks; malformed file suppresses nothing. When TypeScript is unavailable the sensor reports `available: false` instead of guessing. **No strict mode exists** — A5: strictness requires a completed corpus and an explicit later decision. |
| **Parse health + analysis completeness** | `ark-check --doctor --json` → `doctor.parseHealth` + `doctor.completeness`; check JSON → `completeness`; report section `data-advisory="parseHealth"` | The resolved candidate facts contribute only `parseDiagnosticCount` per governed file (no raw diagnostics, second parser pass, or `tsc`). Z04's correctness path ignores legacy v9 caches and parses the complete candidate on every invocation; Z07 owns any future identity-keyed warm snapshot. Doctor remains diagnostic: parse health adds no architecture violation and does not change `designFitness` or `patternBets`. Verdict surfaces consume the evidence fail-closed: affected governed files mean `partial`, plan `goal.met: false`, normal JSON `valid:false`/`ok:false`, and strict merge exit `1`; the non-strict process exit remains advisory for compatibility. No usable host means `unavailable`, plan false, and CLI exit `2`. JSON reports `scannedFiles`, `affectedFiles`, `diagnosticCount`, deterministic top-12 `{ file, diagnosticCount }` entries, and honest `truncated`/`overflow`; missing/unsafe evidence never becomes a clean claim. |
| **Physical cohesion + reshape pilot** | `ark-check --doctor --json` → `doctor.physicalCohesion` (`reshapePilot`, `reshapeDecisions`); optional `.ark/reshape-decisions.json`; report section `data-advisory="physicalCohesion"` | Additive, **advisory only** — `notAScore`; never feeds the verdict, `designFitness`, or `patternBets`. Signal is **concentration, not volume**: concept clusters per anchor directory (deterministic path/name tokenization; framework filenames like `route.ts` take the topmost meaningful path segment — ADR 0010 D2). Fixed corpus-calibrated thresholds (`maxCluster ≥ 40` OR ≥2 anchors ≥ 20, ADR 0010 D3); findings ranked and capped (top 5, honest `truncated`). Anchors under `app/`/`pages/` are `fixedByConvention` and never move (D7). `reshapePilot` is **proposed, never applied** (`neverMechanicalSafe`): one Q04-style pilot card at a time targeting the smallest convention-free anchor, with `moveSample`/`movesTotal`, `successSignal`, `killSwitch`, `doNot[]`; real moves run only through the write gate + atomic preflight via `/ark-loop`; merges are `/ark-architect` judgment cards, never a codemod (D6). **Y01 verdict memory:** bounded sidecar `{ schemaVersion?: "1", decisions: [{ concept, anchors, verdict: "accepted"|"deferred"|"rejected", reason, reviewBy? }] }` (≤64 KiB / ≤200 unique targets). Identity is concept + complete sorted anchor set, never counts/change-map evidence. Current rejected/deferred records suppress pilot pressure only; accepted keeps the existing path. Expired/malformed/stale/invalid records suppress nothing; lifecycle and decisions render in doctor/report. Explicit only — golden-pattern prose never infers a verdict. |
| **Capability walls, every adapter** | CLI scan, pure IR engine, atomic preflight, `ark-mcp --hook` / MCP gate (`capabilityWalls`), ESLint `ark/no-denied-capabilities` | The same opt-in deny set enforces across every surface: hook/MCP and CLI cover ambient + import evidence (symbol-aware); the pure engine, preflight, and ESLint cover the import dimension (documented envelope). Dual depth everywhere: plain port hint (`FIX_HINTS`/`suggestion`) + stable JSON (`ruleId`, `capability`, `fixClass: inject-port`, deterministic `nextAction`). |
| **Hook-path budgets (maintainer)** | Repository-only evidence: `npm run bench:hook-path`; `eval/performance/hook-budgets.v1.json`; CI job "Hook-path end-to-end budgets" | Measures the COMPLETE pre-tool paths as fresh child processes (hook cold/warm, doctor cold) at 1k/10k. D5 method locked: ceilings are Linux-baseline p95 + fixed headroom, set once per cycle, never ratcheted; scenarios without a recorded baseline stay in RECORDING mode and cannot fail CI. |
| **Governance weight** | `ark-check --doctor --json` → `doctor.contractHealth.governanceWeight` | Additive, **advisory only** — raw facts (`declaredLayers`, `populatedLayers`, `governedFiles`, `rules`, `deniedEdges`, `allowedEdges`, `filesPerLayer`, `rulesPerLayer`) plus a fixed comparative band `weight: heavy | typical | light | unknown` and its fixed `note`. Fixed deterministic thresholds: **heavy** = fewer than 25 governed files per declared layer AND (6+ layers OR 4+ well-formed rules per layer); **light** = at most 2 layers over 150+ governed files; **unknown** = no layers or no governed files; everything else is **typical** (banding uses raw ratios; the reported ratios are rounded for display). `notAScore: true` is explicit: never a composite score, ranking, or gate input; the heavy note asks to justify NEW layers/rules and never suggests deleting working ones. Human doctor prints a line only for `heavy`/`light`. |
| **Report parity and snapshot evidence (4.2)** | `ark-check --report` → advisory sections (`data-advisory="contractHealth\|ambientState\|parseHealth"`, nested `governanceWeight`) + layer wall badges; `.ark/reports/*.json` | The report is a rendering of doctor truth. **Standing rule:** every doctor advisory ships with its report section — enforced by the `reportParity` guard, which enumerates the doctor's advisory keys and fails on any missing section. Snapshots add best-effort Git `HEAD`/branch/dirty provenance without a shell; unavailable Git is explicit. Evolution renders the Ark score delta only when both snapshots name the same ArkGate version, while retaining raw facts across versions. |
| **MCP project identity (4.2)** | `ark_identity`; `arkgate/schema/project-identity` or `arkgate/schema/ark.project-identity.schema.json`; root API constants/helpers/types | Schema `1.0`. `projectId` hashes canonical root + config path and stays stable across contract edits/restarts; runtime id/start time are separate. Every project-bound tool result and error carries `projectIdentity`, `binding` (`matched` / `unverified` / `mismatch`), and `authoritative`. Canonical out-of-root config/file evidence fails before project data. |
| **MCP tools and compatibility resource** | `arkgate-mcp`; `ark_manifest`; `ark_status`; `ark://manifest` | Tool names and primary argument shapes are stable within a major. Every tool accepts additive `project.expectedRoot` / optional `expectedProjectId`. The initial handshake requires the exact project root; a contained descendant is authoritative only together with the matching project id. Legacy tool calls remain callable but `unverified` and non-authoritative. `ark_manifest` is the authoritative contract surface after binding. **`ark_status`** returns the status manifest envelope (parity with `ark status --json`). Standard `resources/read` cannot portably carry the expectation, so `ark://manifest` remains compatibility-only and always unverified/non-authoritative. The server never retargets from input. |
| **`ark.config.json`** | Layer globs, rules, include/exclude, forbiddenGlobals, intent prefixes, `peerIsolation`, `dynamicImportAllowlist`, `safety` thresholds; optional **`arkRules`** map (schema `1.1+`) | Versioned by `schemaVersion`; unknown fields fail closed and migrations preserve the previous supported major. Absence of `arkRules` is byte-for-byte silent on inter-layer verdicts. |
| **ArkRules inventory / under-contract (4.0; layer context 4.2)** | `ark-check --rules-inventory [--json]`; doctor `rulesUnderContract`; MCP `ark_rules_inventory` | Additive. Honest counts (inventoried / under-contract / frozen) — **never a score**. When configured layer evidence exists it overrides filename role guesses: a Domain file named `handler` is not a controller candidate. Test/fixture/seed/migration/exclusion surfaces plus narrow development-identity, PostgreSQL OID, and technical I/O constants are silent. Without layer evidence, backward-compatible path/content heuristics remain. Structure/invariant diagnostics use adapter `1.4` provenance. |
| **`arkgate/schema/project-identity`** or **`arkgate/schema/ark.project-identity.schema.json`** | MCP canonical project, contract, runtime, expectation, and binding envelope | Schema `1.0`. Initial `expectedRoot` must be the exact project root. A contained descendant can match only when `expectedProjectId` is also present and correct; id-only matching stays non-authoritative. Mismatch codes are `PROJECT_ROOT_MISMATCH`, `PROJECT_ID_MISMATCH`, and `INVALID_PROJECT_EXPECTATION`. |
| **Package pin dual-truth (4.0)** | doctor JSON `packageVersionTruth`; upgrade JSON/human note when pin behind CLI | Additive, advisory. Surfaces after `upgrade --no-install` when managed CLI is ahead of package.json. |
| **Managed upgrade self-service honesty (4.5 / DF05)** | `ark upgrade [--json]` → `selfService` (+ human “Self-service honesty” lines) | Additive, advisory. Answers without a maintainer: write-path activation labels per selected host (`hard`\|`advisory`\|`unavailable`) and customized content-identity preserve (`customizedPaths` / `customizedContentPreserved`). Soft hosts never hard; upgrade never invents `hardWriteActive` from disk alone. Always `notAScore: true`. Not a gate input; not part of `planDigest`. |
| **Product honesty readiness split (4.1.1)** | doctor JSON `productHonesty` | Additive. `unfinished` / `headline` / `primaryNextAction` / `reasonIds` remain; EH adds `contractReadiness` (`ready`\|`partial`\|`not-ready`), `localWriteBoundary` (`advisory`\|`hard`\|`unverified`\|`unknown`), `architectureReasonIds`, `environmentResidualIds` / `environmentResiduals`. Soft-write hosts stay in evidence without alone forcing global **Not finished**. `notAScore: true` always. |
| **Policy transition analysis (3.1.0)** | `analyzePolicyDelta(...)`; MCP `ark_policy_delta`; CLI `--policy-base` / `--policy-base-ref` / `--policy-ack`; check JSON `policyDelta` | Additive schema `1.0`. Classifications and finding ids are deterministic. Weakening/judgment requires an acknowledgement bound to both policy hashes and the exact blocking finding set. |
| **Atomic change preflight (3.1.0)** | `preflightChange(...)`; CLI `ark preflight --changes <file> --json`; MCP `ark_prepare_change` | Additive schema `1.0`. One complete governed production-source `{path,content}` / `{path,delete:true}` batch; read-only; returns operation, content/tree/policy/compiler fingerprints and stable graph findings. MCP availability alone is advisory. |
| **Architecture change map (3.1.0)** | `arkgate/schema/change-map` or `arkgate/schema/ark.change-map.schema.json`; CLI `ark preflight --change-map <file>`; MCP `ark_prepare_change.changeMap` | Optional strict schema `1.0`. Canonical planned paths + operations + resolved Ark layers + dependencies between planned files. Preflight returns `changeMapHash`; absence is normal and adds no project file. Structural intent only, never behavioral completion. |
| **Structural convergence (3.1.0)** | `analyzeArchitectureConvergence(...)`; map-enabled `preflightChange(...)`; existing CLI/MCP preflight adapters | Additive `convergence` result with stable `satisfied`, `missing`, `contradictory`, and `unplanned` findings. Uses the supplied/current project tree as base and the explicit complete change set as candidate; no implicit Git or LLM input. `readOnly: true`; `behavioralCompletion: "not-evaluated"`. Structural mismatch makes preflight invalid. |
| **Enforcement ladder + fixed journey (3.1.0)** | `doctor.writePath.enforcementLadder`; hook repair `enforcement`; `npm run eval:change-integrity` | Additive schema `1.0` separates supported/installed/active/bypassable state and evidence. Hard is operation-scoped only for a supported covered hook; MCP is advisory; required CI status stays unverified locally. Fixed no-context fixture proves CLI/MCP/hook/final parity, one casual denial, acceptance behavior, and strict Ark. |
| **Enforcement state** | `doctor.writePath.enforcementState`; schema/type | Schema `1.1`: runtime observation, operation coverage, and operation-scoped `hard`. Only fresh covered active-host evidence permits `hard:true`; unverified assets and MCP remain non-hard. |
| **Design delta (opt-in ratchet)** | `--fail-on-new-smells --base-ref <ref>`; hook/MCP; schema/types | Schema `1.0`: identities, touched paths, stable evidence/verdict. Missing base fails closed; only new/worsened `domain-logic-in-ui` blocks; global doctor smells stay advisory. |
| **`arkgate/schema/analysis-result`** or **`arkgate/schema/ark.analysis-result.schema.json`** | Public CLI/MCP/hook diagnostic envelope (`schemaVersion`, `mode`, `valid`, `completeness`, `completenessReasons`, `diagnostics`, resolved identities) | Schema **`1.5`** adds optional stable finding refs on diagnostics: `findingRef` (`fnv1a-` + hex), `targetKey` (baseline-compatible freeze identity), `docsCodePath` (`docs/diagnostics.md#RULE_ID`). Factory-emitted diagnostics always include them; consumer-owned 1.0–1.4 values remain valid without them. `1.4` added optional `evidence.arkruleId` / `evidence.arkruleSource` for ArkRules; `1.3` distinguished `resolved-candidate-facts` from `lexical-compatibility`; partial/unavailable analysis is always non-green, and resolved complete/partial results require policy/resolver/facts/tree identities. `1.2` added completeness and remains accepted alongside consumer-owned 1.0/1.1 values. |
| **Stable finding refs (4.3)** | Root API `adapterFindingTargetKey` / `adapterFindingRefFromTargetKey` / `toAdapterDiagnostic` / `createAdapterResult`; CLI/MCP/repair envelopes via analysis-result diagnostics | Multi-turn re-address without fuzzy message match. `targetKey` **is** the baseline (occurrence) key so freeze identity is never orphaned; `findingRef` is a compact FNV-1a of that key. Line/message drift does not change the ref. Multi-turn fixture: `tests/fixtures/finding-refs/multi-turn-stability.json`. |
| **Diagnostic code catalog** | Root API `DIAGNOSTIC_CATALOG` / `getDiagnosticCatalogEntry` / `diagnosticDocsPath`; docs [diagnostics.md](diagnostics.md) (`#RULE_ID` anchors) | Closed vocabulary of public `ruleId`s with why/fix anchors. Cataloguing only — no new rule semantics. Remediation parity is test-guarded. Docs ship in the npm tarball. |
| **Status manifest** | CLI `ark status [--json]`; MCP `ark_status`; `arkgate/schema/status-manifest`; root API `buildStatusManifest` / `ARK_STATUS_MANIFEST_SCHEMA` / `projectStatusImprovementCompass` | Schema `1.0`. One session/project snapshot: identity binding, honest write-path activation (`hard`\|`advisory`\|`unavailable`), last-check summary, rules residual counts, primary next action, and **`improvementCompass`** with honesty **`mode`** `full`\|`subset`\|`unavailable` (residual ids only; always `notAScore: true`; optional `reasonCode`/`reason`/`factsSource`/`contractHash`). **Not a score.** Residual never changes gate verdicts. Never prompts (`CI=1` forces JSON). Optional `--expected-root` / `--expected-project-id` (MCP `project`) for matched vs stale identity. |
| **Agent contract projection** | CLI `ark agents-md [--write] [--check] [--stdout] [--json]`; install/upgrade AGENTS templates; root API `buildAgentProjectionBlock` / `mergeAgentProjectionDocument` | Schema `1.0` (projection markers). Version-stamped managed block (`arkgateVersion` + contract summary + diagnostic short list). **Non-authoritative** — not a gate input; enforcement is ark-check / hooks / CI. Content-identity merge preserves customized regions outside markers. Drift: `--check` vs package version. |
| **Agent Skills packaging** | `templates/agent-skills/<name>/SKILL.md` (+ package README); root API `ARK_SKILL_NAMES` / `validateAgentSkillsPackage`; `npm run check:agent-skills` | Schema `1.0` (package contract). Same **13** skill names as flat templates; Agent Skills–compatible layout for `npx skills add`. No new skill names. Layout is generated 1:1 from `templates/skills/*.md`. |
| **`arkgate/schema/arkrules`** or **`arkgate/schema/ark.arkrules.schema.json`** | Per-layer structure sensors + invariant catalog (ADR 0012) | Schema `1.0`. Opt-in via root `arkRules` map (`ark.config` schema `1.1`). |
| **`arkgate/schema/resolved-candidate-facts`** or **`arkgate/schema/ark.resolved-candidate-facts.schema.json`** | Versioned parity-capable input for `analyzeResolvedProject` / `preflightResolvedChange` | Schema `1.0` is serializable and deterministic. Tooling owns filesystem/compiler resolution; Domain/Kernel validate and evaluate supplied facts without importing those effects. Facts name resolver/compiler inputs, governed files, dependency evidence, completeness reasons, and candidate tree/facts hashes. |
| **Config JSON Schema** | `arkgate/schema` or `arkgate/schema/ark.config.schema.json` | Stable package resource subpaths for editor completion and contract tooling. |
| **Agent skills** | `/ark-*` templates; install via `--install-agent-gates` (often `--skills-only` on top of compact) **or** Agent Skills ecosystem path | **Day zero** is the compact router from `ark start` / `start --apply` + doctor control plane — not the full skill pack. Skill *names* (frozen **13**) and the guided expert path (`/ark-autopilot` after pack install) are stable; internal skill prose may evolve. **4.0:** all skills except experimental `/ark-runtime` integrate **layers + ArkRules** and must label residual `[Layer]` vs `[ArkRules]`. **4.2:** repo catalogs are content-idempotent; the optional shared Codex home catalog is monotonic across 4.2.0+ installers. Pre-4.2 writers are outside that protocol and must be upgraded first. A durable pending-catalog journal preserves the floor across an interrupted install and is cleared only by its owning same/newer recovery. **4.3:** Agent Skills–compatible layout at `templates/agent-skills/<name>/SKILL.md` (1:1 with flat `templates/skills/*.md`); install via `npx skills add ./node_modules/arkgate/templates/agent-skills` (or the GitHub tree). Domain `ARK_SKILL_NAMES` + `validateAgentSkillsPackage`; drift `npm run check:agent-skills`. Skills never enforce. |
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
| Metadata and adapter diagnostics | `version`, `ARK_ANALYSIS_RESULT_SCHEMA_VERSION`, `ARK_ANALYSIS_RESULT_SCHEMA`, `ADAPTER_DIAGNOSTIC_DOCS_RELATIVE_PATH`, `createAdapterResult`, `toAdapterDiagnostic`, `adapterFindingTargetKey`, `adapterFindingOccurrenceTargetKeys`, `adapterFindingRefFromTargetKey`, `adapterDocsCodePath` |
| Diagnostic code catalog (ACS02 / 4.3) | `DIAGNOSTIC_CATALOG`, `DIAGNOSTIC_RULE_IDS`, `DIAGNOSTIC_CATALOG_SCHEMA_VERSION`, `DIAGNOSTIC_DOCS_RELATIVE_PATH`, `getDiagnosticCatalogEntry`, `isKnownDiagnosticCode`, `isCataloguedOrArkRuleFamily`, `diagnosticDocsPath`, `diagnosticDocsFragment`, `catalogWhyForRuleId`, `catalogFixForRuleId`, `serializeDiagnosticCatalog` |
| Status manifest (ACS03 / 4.3) | `ARK_STATUS_MANIFEST_SCHEMA_VERSION`, `ARK_STATUS_MANIFEST_SCHEMA_URL`, `ARK_STATUS_MANIFEST_SCHEMA`, `buildStatusManifest`, `evaluateStatusBinding`, `classifyStatusWritePath`, `resolveStatusNextAction`, `defaultHonestLabel` |
| Agent contract projection (ACS04 / 4.3) | `ARK_AGENT_PROJECTION_SCHEMA_VERSION`, `DEFAULT_AGENT_PROJECTION_RULE_IDS`, `AGENT_PROJECTION_NON_ENFORCEMENT_LABEL`, `buildAgentProjectionBlock`, `buildAgentProjectionBody`, `buildAgentProjectionMeta`, `mergeAgentProjectionDocument`, `extractAgentProjectionBlock`, `projectionMatchesPackageVersion`, `agentProjectionContentIdentity` |
| MCP project identity | `ARK_PROJECT_IDENTITY_SCHEMA_VERSION`, `ARK_PROJECT_IDENTITY_SCHEMA_URL`, `ARK_PROJECT_IDENTITY_SCHEMA`, `PROJECT_EXPECTATION_SCHEMA`, `PROJECT_BINDING_SCHEMA`, `createProjectId`, `createProjectIdentity` |
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
- Diagnostic catalog: `DiagnosticCatalogEntry`, `DiagnosticCategory`.
- MCP project identity: `ProjectIdentity`, `ProjectExpectation`, `ProjectBinding`.
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
build `packages/runtime` in an ArkGate source checkout and install that local folder. Root
`arkgate/runtime` / `arkgate/nestjs` forwarders were **removed in 4.0.0** (AR04).

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
(current published: [4.5.0.md](https://github.com/pedroknigge/arkgate/blob/main/docs/releases/4.5.0.md);
 prior published: [4.4.0.md](https://github.com/pedroknigge/arkgate/blob/main/docs/releases/4.4.0.md), [4.3.0.md](https://github.com/pedroknigge/arkgate/blob/main/docs/releases/4.3.0.md),
[4.2.1.md](https://github.com/pedroknigge/arkgate/blob/main/docs/releases/4.2.1.md);
previous: [4.2.0.md](https://github.com/pedroknigge/arkgate/blob/main/docs/releases/4.2.0.md),
[4.1.1.md](https://github.com/pedroknigge/arkgate/blob/main/docs/releases/4.1.1.md),
[4.1.0.md](https://github.com/pedroknigge/arkgate/blob/main/docs/releases/4.1.0.md),
[4.0.1.md](https://github.com/pedroknigge/arkgate/blob/main/docs/releases/4.0.1.md),
[4.0.0.md](https://github.com/pedroknigge/arkgate/blob/main/docs/releases/4.0.0.md)).
Publish path: signed annotated tag → GitHub Release → `publish-npm.yml` (see [CONTRIBUTING.md](https://github.com/pedroknigge/arkgate/blob/main/CONTRIBUTING.md)).
