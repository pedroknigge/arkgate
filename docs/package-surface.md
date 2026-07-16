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
| **Doctor design fitness (P02+)** | `ark-check --doctor --json` → `doctor.designFitness`, `doctor.designSmells[]` | Additive. Stable smell `id`s: `io-under-application`, `handler-in-persistence`, `god-module`, `domain-logic-in-ui`, `facade-sql-in-routes`, `mixed-pattern-cluster`, `soft-contract`. Each smell has `evidence[]`, `fix`, technical `message`, and plain-language **`outcome`** (Q02). Does **not** fail the gate by itself. |
| **Post-green path (Q01)** | `doctor.postGreenPath`, `doctor.primaryNextAction`, `doctor.healthyFinishedForbidden` | Additive when `designFitness.designWeak`. Single Shape door (`id: clarify-for-ai`): explore shape-focus → dual-plan B → autopilot only with OK. Never empty plan A = healthy finished. |
| **Golden pattern (Q03)** | Optional `.ark/golden-pattern.json`; doctor JSON `doctor.goldenPattern`; MCP `ark_place` / `ark_prepare_write` → `goldenPattern` | Additive, **advisory for NEW code only**. Required fields: `name`, `norm`; optional `newCodeHome`, `examplePath`, `schemaVersion`. **Absent is normal** (no claim). Never ENFORCE; never clears design-weak. Malformed → `invalid: true`, not silent guidance. |
| **Plan pattern B (P03+)** | `ark-check --plan --json` → `plan.patternBets[]`, `plan.goal.designWeak` | Additive. Each bet: `id`, `smellId`, `pilot`, `evidence`, `successSignal`, `killSwitch`, **`neverMechanicalSafe: true`**, `class: "judgment"`. **Never** auto-applied by loop/autoPatch; not a `remediationKind` mechanical-safe. `goal.met` remains edge honesty only. |
| **Pilot loop (Q04)** | `plan.pilotLoop` / `doctor.pilotLoop` | Additive. When design-weak: `active`, `oneAtATime`, `neverMechanicalSafe`, **`nextPilot`** extraction-card fields (`pilotTarget`, `smellId`, `move`, `successSignal`, `killSwitch`, `doNot[]`). **One pilot → re-doctor**; never multi-pilot batch; never mechanical-safe. |
| **AI-velocity eval (Q05)** | `npm run eval:ai-velocity` → `eval/ai-velocity-report.json` | Fixture-measured (no live LLM). Same feature scenario on design-weak vs golden-path arms; metric **`placementTurns`** (agent-equivalent). Golden must be strictly better. Method string lives next to the number. Does not weaken the gate. |
| **Contract health (W01)** | `ark-check --doctor --json` → `doctor.contractHealth`; optional `.ark/contract-smell-acks.json` | Additive, **advisory only** — meta-lint of the contract itself (layer-name heuristics; imprecision costs a warning line, never a verdict); never changes the verdict, `designFitness`, or `patternBets`. Stable smell ids: `contract-bidirectional-allow`, `contract-peripheral-depends-core`, `contract-lateral-adapter-allow`, `contract-dead-rule`; each smell has `severity`, `evidence[]` (sorted, honest `…(+N more)` truncation), `fix`, `message`, plain-language `outcome`, and `acknowledgedEdges` (acks applied to that id). Acknowledgments live in the bounded sidecar (`{ acks: [{ id, edge, reason }] }`, ≤64 KB / ≤200 entries; bidirectional edges order-insensitive, exact two segments); `contractHealth.acknowledged` counts **applied** acks only (stale acks count 0). **Absent is normal**; malformed file or edge grammar → ignored + `ackFile.invalid` where applicable, never silent suppression. |
| **Effect capabilities (U03)** | Analysis API `collectCapabilityUses(ts, sourceFile)` + Domain vocabulary (`CAPABILITY_IDS`, `capabilityForModuleSpecifier`, `capabilityForAmbientName`, `lowerForbiddenGlobal`); pure-engine `ir.capabilityUses` | Additive within IR `1.0`. Seven **closed** ids: `network`, `filesystem`, `clock`, `randomness`, `environment`, `process`, `persistence` (ADR 0009). Direct evidence only — transitive inference never detects. The symbol-aware collector covers ambient globals (shadowing/type-only/globalThis-alias precision from the S05/C04 machinery) plus imports; the compiler-free IR engine carries **import-based** uses only (exact module or subpath match, never substring; textual `import type`/`export type` erasure — ANY braced named-binding list stays a value import there, and template-literal bodies are scanned like the rest of the file; the symbol path owns that precision). **U04 walls are opt-in:** per-layer `capabilities: { deny: [...] }` or the dual-depth sugar `pure: true` (denies all seven); absence changes no verdict. `CAPABILITY_VIOLATION` is judgment-class (never mechanical-safe) with a port-injection `nextAction`; D7 dedup — an ambient use covered by the layer's `forbiddenGlobals` reports only `FORBIDDEN_GLOBAL`. Atomic preflight blocks denied capabilities across a complete multi-file candidate (import-based on the pure path; ambient adds on the symbol-aware CLI/hook path). T01 policy-delta classifies the ambient surface on the **lowered capability space**: migrating lowerable `forbiddenGlobals` to equivalent-or-stronger walls is neutral; real lowered loss is weakening (finding path `$.layers[name].capabilities`); unlowerable custom globals keep raw key comparison. |
| **Governance weight (W02)** | `ark-check --doctor --json` → `doctor.contractHealth.governanceWeight` | Additive, **advisory only** — raw facts (`declaredLayers`, `populatedLayers`, `governedFiles`, `rules`, `deniedEdges`, `allowedEdges`, `filesPerLayer`, `rulesPerLayer`) plus a fixed comparative band `weight: heavy | typical | light | unknown` and its fixed `note`. Fixed deterministic thresholds: **heavy** = fewer than 25 governed files per declared layer AND (6+ layers OR 4+ well-formed rules per layer); **light** = at most 2 layers over 150+ governed files; **unknown** = no layers or no governed files; everything else is **typical** (banding uses raw ratios; the reported ratios are rounded for display). `notAScore: true` is explicit: never a composite score, ranking, or gate input; the heavy note asks to justify NEW layers/rules and never suggests deleting working ones. Human doctor prints a line only for `heavy`/`light`. |
| **MCP tools** | `arkgate-mcp` / `ark://…` resources | Tool names and primary argument shapes are stable within a major. |
| **`ark.config.json`** | Layer globs, rules, include/exclude, forbiddenGlobals, intent prefixes, `peerIsolation`, `dynamicImportAllowlist`, `safety` thresholds | Versioned by `schemaVersion`; unknown fields fail closed and migrations preserve the previous supported major. |
| **Policy transition analysis (T01, 3.1.0)** | `analyzePolicyDelta(...)`; MCP `ark_policy_delta`; CLI `--policy-base` / `--policy-base-ref` / `--policy-ack`; check JSON `policyDelta` | Additive schema `1.0`. Classifications and finding ids are deterministic. Weakening/judgment requires an acknowledgement bound to both policy hashes and the exact blocking finding set. |
| **Atomic change preflight (T02, 3.1.0)** | `preflightChange(...)`; CLI `ark preflight --changes <file> --json`; MCP `ark_prepare_change` | Additive schema `1.0`. One complete governed production-source `{path,content}` / `{path,delete:true}` batch; read-only; returns operation, content/tree/policy/compiler fingerprints and stable graph findings. MCP availability alone is advisory. |
| **Architecture change map (T03, 3.1.0)** | `arkgate/schema/change-map`; CLI `ark preflight --change-map <file>`; MCP `ark_prepare_change.changeMap` | Optional strict schema `1.0`. Canonical planned paths + operations + resolved Ark layers + dependencies between planned files. Preflight returns `changeMapHash`; absence is normal and adds no project file. Structural intent only, never behavioral completion. |
| **Structural convergence (T04, 3.1.0)** | `analyzeArchitectureConvergence(...)`; map-enabled `preflightChange(...)`; existing CLI/MCP preflight adapters | Additive `convergence` result with stable `satisfied`, `missing`, `contradictory`, and `unplanned` findings. Uses the supplied/current project tree as base and the explicit complete change set as candidate; no implicit Git or LLM input. `readOnly: true`; `behavioralCompletion: "not-evaluated"`. Structural mismatch makes preflight invalid. |
| **Enforcement ladder + fixed journey (T05, 3.1.0)** | `doctor.writePath.enforcementLadder`; hook repair `enforcement`; `npm run eval:change-integrity` | Additive schema `1.0` separates supported/installed/active/bypassable state and evidence. Hard is operation-scoped only for a supported covered hook; MCP is advisory; required CI status stays unverified locally. Fixed no-context fixture proves CLI/MCP/hook/final parity, one casual denial, acceptance behavior, and strict Ark. |
| **`arkgate/schema/analysis-result`** | Public CLI/MCP/hook diagnostic envelope (`schemaVersion`, `valid`, `diagnostics`) | Schema `1.1` adds optional `nextAction`; the `1.0` fixture and consumer-owned TypeScript diagnostics remain valid. |
| **Config JSON Schema** | `arkgate/schema` or `arkgate/schema/ark.config.schema.json` | Stable package resource subpaths for editor completion and contract tooling. |
| **Agent skills** | `/ark-*` templates installed by `--install-agent-gates` | Skill *names* and “default flow” are stable; internal skill prose may evolve (e.g. When/not when, explore Shape dual-plan seed, extraction cards, day-zero origin order). |
| **ESLint subpath** | `arkgate/eslint` | Config-driven layer/import rules; loads consumer `ark.config.json`. |
| **GitHub Action** | `pedroknigge/arkgate` (see `action.yml`) | The `uses:` tag/SHA selects the checker source; `version` remains an optional exact npm compatibility override. |

Gates need **no application code imports**. Most projects only use the CLI + MCP + config.

---

## Experimental opt-in surfaces

These APIs are shipped for evaluation and compatibility, but they are **not production-ready
product claims**. Static architecture enforcement does not depend on them.

| Surface | Import path | Notes |
|---------|-------------|--------|
| **Runtime kernel** | **`@arkgate/runtime`** | Separate 0.x package, published under the `experimental` tag. Event bus, intents, policies, sagas, event buffer, projections, and strict helpers. Built-in stores are **InMemory reference only**. |
| **Runtime migration shim** | `arkgate/runtime` | Deprecated forwarder to `@arkgate/runtime`; contains no implementation and is removed in ArkGate 4. |
| **NestJS adapter** | `@arkgate/runtime/nestjs` | Experimental optional peer `@nestjs/common`; the deprecated `arkgate/nestjs` path forwards here. |

---

## Recommended imports

```ts
// Preferred path when evaluating the experimental runtime kernel
import { createStrictArkKernel, createStrictArkKernelFromConfig } from '@arkgate/runtime';

// Nest adapter
import { ArkModule, InjectArk } from '@arkgate/runtime/nestjs';
```

See [production-hardening.md](./production-hardening.md) for requirements an eventual
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
| Remove deprecated `arkgate/runtime` forwarding shim | ArkGate **4.0** |

---

## Release notes (maintainers)

Ship notes for a version live under [releases/](./releases/) (latest:
[3.3.0.md](./releases/3.3.0.md)).
Publish path: signed annotated tag → GitHub Release → `publish-npm.yml` (see [CONTRIBUTING.md](../CONTRIBUTING.md)).
