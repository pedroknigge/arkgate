# Ark Library — Prioritized Improvement Plan

**Based on:** [evaluation-report.md](./evaluation-report.md)  
**Date:** 2026-07-01  
**Constraints:** Zero runtime dependencies · No AI providers in core · Classic clean architecture

---

## Guiding Principles

1. **Strengthen contracts, not complexity.** Prefer typed interfaces and manifest exports over new subsystems.
2. **Wire existing modules.** IntentRegistry, DependencyGraph, PolicyEngine, and Metadata should compose — not stay siloed.
3. **Extension points for AI, implementation outside core.** Define interfaces (`ArkObserver`, `AIGateExtension`) that external agent layers can implement later.
4. **Every change is test-backed.** Unit tests on real shipped functions; no test theater.

---

## High Impact / Medium Effort

*Implement these first. Each directly strengthens production readiness and AI/agent readiness.*

### H1. Machine-readable `ArkManifest` export

**Finding:** §6 — No single API for agents to discover intents, policies, entities, relationships.  
**Change:**
- Add `createArkManifest(options)` that aggregates from `IntentRegistry`, `PolicyEngine`, `MetadataRegistry`, `DependencyGraph`.
- Export `ArkManifest` type: `{ version, intents[], policies[], entities[], graph, exportedAt }`.
- Add `toJSON()` method returning serializable object.

**AI readiness:** Agents call one function to understand the full architectural contract.  
**Files:** New `src/kernel/manifest/` module, export from `src/index.ts`, tests.  
**Effort:** ~2–3 hours.

---

### H2. Bridge IntentRegistry → DependencyGraph

**Finding:** §1 — Relationships declared via `defineIntent({ dependsOn })` never reach the graph.  
**Change:**
- Add `syncRegistryToGraph(registry, graph, options?)` utility.
- Map `dependsOn` → `declared` edges, `produces` → `observed` edges (after H3 fix).
- Document in README as the standard wiring pattern.

**AI readiness:** Agents declaring intents automatically populate analyzable graphs.  
**Files:** `src/kernel/graph/sync.ts`, tests, README.  
**Effort:** ~1–2 hours.

---

### H3. Fix `produces` semantic modeling in IntentRegistry

**Finding:** §1 — `produces` incorrectly stored as `dependsOn` dependency.  
**Change:**
- Separate `dependencies` and `productions` maps in `IntentRegistry`.
- `getAllRelationships()` returns typed edges: `{ from, to, kind: 'dependsOn' | 'produces' }`.
- Update `syncRegistryToGraph` to use correct edge kinds.

**AI readiness:** Graph semantics become trustworthy for agent dependency analysis.  
**Files:** `IntentRegistry.ts`, `types.ts`, tests.  
**Effort:** ~1–2 hours.

---

### H4. Structured policy violations + EventBus observability hooks

**Finding:** §2, §3, §4 — Loose errors, silent handler failures, invisible soft violations.  
**Change:**
- Add `PolicyViolationError` class extending `Error` with typed `.violations: PolicyViolation[]`.
- Add `EventBusOptions`: `onSoftViolation?(result)`, `onHandlerError?(error, event, handler)`.
- Stop silently swallowing handler errors when `onHandlerError` is provided; always call hook, rethrow optional via `rethrowHandlerErrors?: boolean`.
- Replace `(error as any).violations` in `PolicyEngine`.

**AI readiness:** Agents receive structured, actionable violation data and can observe runtime behavior.  
**Files:** `policy/types.ts`, `PolicyEngine.ts`, `EventBus.ts`, tests.  
**Effort:** ~2–3 hours.

---

### H5. Complete AICodeGate intent allowlist + structured results

**Finding:** §3, §6 — Intent validation stubbed; violations are plain strings.  
**Change:**
- Implement intent allowlist: scan source for string literals matching registered intent names; flag unknown intents.
- Add `AICodeGateViolation` type: `{ code, message, line?, suggestion? }`.
- Wire `context` parameter into `validate()` for agent-provided metadata (e.g., `{ filePath, agentId }`).
- Add `AIGateExtension` interface (type-only) for future external analyzers: `{ name, analyze(source, ctx): AICodeGateViolation[] }`.

**AI readiness:** Gate becomes usable for agent codegen validation; extension interface allows plugging AST analyzers later.  
**Files:** `ai-gate/types.ts`, `AICodeGate.ts`, tests.  
**Effort:** ~2–3 hours.

---

### H6. Bounded event history + trace record format

**Finding:** §8 — Unbounded `history[]`; §6 — no standard trace format.  
**Change:**
- Add `EventBusOptions.maxHistorySize?: number` (default: unlimited for backward compat).
- When exceeded, evict oldest entries (ring buffer behavior).
- Add `TraceRecord` type aligned with history: `{ type: 'event.published' | 'policy.softViolation' | 'handler.error', timestamp, intent, correlationId?, details }`.
- Optional `getTrace(): TraceRecord[]` or enrich `PublishedEventRecord`.

**AI readiness:** Agents can consume a stable trace schema without unbounded memory.  
**Files:** `event-bus/types.ts`, `EventBus.ts`, tests.  
**Effort:** ~1–2 hours.

---

### H7. Built-in layer-crossing policy helpers

**Finding:** §3 — No default architectural policies.  
**Change:**
- Add `defineLayerPolicy(options)` factory producing policies that check `IntentRegistry` relationships and/or `DependencyGraph` edges against allowed layer flows (e.g., `Domain → Application` ok, `Domain → Adapter` forbidden).
- Export preset: `architecturalPolicies.layerIsolation()`.
- Document as recommended starter set; still opt-in.

**AI readiness:** Agents get copy-pasteable, well-named policies instead of inventing checks.  
**Files:** New `src/kernel/policy/builtins.ts`, tests, README.  
**Effort:** ~2 hours.

---

## Medium Impact / Medium Effort

*v0.2 now ships the enforcement-critical and medium-tier readiness work.*

### M1. Saga compensation test + minimal state exposure ✅ shipped in v0.2

**Finding:** §4 — Compensation path untested; no step status.  
**Change shipped:** Added compensation coverage and exposed `SagaInstance.status` (`'idle' | 'running' | 'completed' | 'compensating' | 'failed'`) plus `completedSteps[]`.
**Effort:** ~2 hours.

### M2. Metadata export + entity–intent linking ✅ shipped in v0.2

**Finding:** §5 — No JSON export; no entity–event link.  
**Change shipped:** Added `MetadataRegistry.toJSON()`; optional `EntityMeta.emits?: string[]` / `consumes?: string[]` intent name lists are included in manifest links.
**Effort:** ~2 hours.

### M3. Runtime intent registration validation on publish ✅ shipped in v0.2

**Finding:** §3 — Raw events bypass registry.  
**Change shipped:** `EventBusOptions.strictRegistry` defaults to true when `intentRegistry` is provided and rejects unregistered publish/subscribe paths. Runtime naming validation is available via `validateIntentNaming`.

### M4. Subscriber index by intent name ✅ shipped in v0.2

**Finding:** §8 — O(n) scan per publish.  
**Change shipped:** Internal `Map<string, InternalSubscription[]>` keyed by intent name.
**Effort:** ~1 hour.

### M5. Agent-oriented documentation section ✅ shipped in v0.2

**Finding:** §7 — No agent guide.  
**Change shipped:** Added `docs/agent-guide.md`: manifest usage, naming conventions, extension points, example agent workflow. README links to the guide.
**Effort:** ~1–2 hours.

### M6. Typed policy context helpers ✅ shipped in v0.2

**Finding:** §2 — `any` in policy checks.  
**Change shipped:** Exported `PublishPolicyContext`, `GraphPolicyContext`, and `definePublishPolicy()` helper.
**Effort:** ~1 hour.

---

## Low Impact / Low Effort

*Polish items; schedule after High tier.*

### L1. Architecture diagram in docs (Mermaid)

Visual map of kernel modules and data flow.  
**Effort:** ~30 min.

### L2. README cleanup

Remove session-plan references; add links to `docs/evaluation-report.md`, `docs/agent-guide.md`, manifest API.  
**Effort:** ~30 min.

### L3. `defineIntent` registry default source option

`createIntentRegistry({ defaultSource })` propagated to event metadata.  
**Effort:** ~30 min.

### L4. Negative-path test expansion

Handler error, soft violation hook, saga compensation, graph custom rules.  
**Effort:** ~1–2 hours.

### L5. Performance smoke benchmark (dev-only)

Vitest benchmark or simple loop timing for 10k publishes — document results in evaluation addendum. Not a runtime dependency.  
**Effort:** ~1 hour.

---

## Implementation Sequence (Recommended)

```
Phase 1 — Contracts & Wiring (H3 → H2 → H1)
  Fix produces semantics, bridge registry→graph, export manifest

Phase 2 — Enforcement & Observability (H4 → H6 → H7)
  Structured errors, bounded history/traces, built-in policies

Phase 3 — Agent Surface (H5 → M5)
  Complete AI gate, write agent guide

Phase 4 — Polish (remaining L1–L5)
  As time permits
```

**Estimated High-tier total:** ~12–16 hours of focused implementation.

---

## Explicit Non-Goals (Updated for v0.5)

- Embedding LLM/AI provider SDKs
- Full type-aware TypeScript semantic analyzer
- Owning database persistence for audit, workflow snapshots, or read models
- Distributed event bus, queue runtime, or cross-service workflow engine
- Full CQRS command/query framework or reporting database
- Runtime npm dependencies of any kind

---

## Success Criteria (Post-Implementation)

| Criterion | Measure |
|-----------|---------|
| Agent contract discovery | `createArkManifest().toJSON()` returns complete intent/policy/entity/graph snapshot |
| Graph integrity | `syncRegistryToGraph` + fixed `produces` produce correct Mermaid |
| Enforcement feedback | `PolicyViolationError` with typed violations; soft violations observable |
| AI gate completeness | Unknown intents flagged; structured violation output |
| Memory safety | `maxHistorySize` prevents unbounded growth |
| Zero deps | `package.json` dependencies still `{}` |
| Tests | All existing + new tests pass; negative paths covered for H4, H5, H3, M1, M2 |

---

## Implementation Status (2026-07-01)

**High-tier items H1–H7 plus v0.2 enforcement/package hardening: shipped.** See `docs/final-summary.md` for details.

| ID | Status |
|----|--------|
| H1 ArkManifest | ✅ |
| H2 syncRegistryToGraph | ✅ |
| H3 produces semantics | ✅ |
| H4 PolicyViolationError + hooks | ✅ (+ `buildPublishPolicyContext`, `intentRegistry`/`dependencyGraph` bus options) |
| H5 AICodeGate structured violations | ✅ |
| H6 bounded history + TraceRecord | ✅ |
| H7 layer policies | ✅ |
| V2 strict registry publish/subscribe validation | ✅ |
| V2 stricter `IntentName` typing | ✅ |
| V2 npm scripts and pack workflow | ✅ |
| V2 package rename to `ark-runtime-kernel` | ✅ |
| M1 Saga compensation/state | ✅ |
| M2 Metadata export/entity-intent links | ✅ |
| M4 Subscriber index | ✅ |
| M5 Agent guide | ✅ |
| M6 Typed policy context helpers | ✅ |

## v0.3 Implementation Status (2026-07-01)

The next architecture hardening wave is now implemented:

| Capability | Status |
|------------|--------|
| 11-layer architecture profile | ✅ |
| Strict `createArkKernel()` runtime | ✅ |
| Native AuditTrail and bounded audit history | ✅ |
| EventBus audit integration and tracing hooks | ✅ |
| Workflow engine with snapshots, retries, timeouts, compensation, pluggable store | ✅ |
| Projection/read-model registry with checkpoints | ✅ |
| Metadata validation, ownership/version fields, relation checks | ✅ |
| Layer-grouped graph Mermaid visualization | ✅ |
| AI Code Gate line numbers and layer-aware checks | ✅ |
| Manifest exports for architecture and projections | ✅ |

**Low tier:** remaining non-blocking items are L1–L5.

## v0.4 Implementation Status (2026-07-01)

The next phase addresses the strict 11-layer review findings and the Grok report's main recommendations:

| Capability | Status |
|------------|--------|
| `createStrictArkKernel()` for stricter default runtime enforcement | ✅ |
| Event contract registry with event version and payload validation | ✅ |
| Known-source enforcement for event metadata | ✅ |
| Basic outbox store and `OutboxStore` extension point | ✅ |
| `ark-check` CLI for TypeScript AST import checks | ✅ |
| `ark-check` intent-string layer reference checks | ✅ |
| Policy lifecycle metadata: owner, version, rationale, enforcement mode, deprecation | ✅ |
| Manifest export of event contracts and policy lifecycle metadata | ✅ |
| Package bin coverage in publish/pack tests | ✅ |

Remaining high-value hardening after v0.4:

| Gap | Priority | Notes |
|-----|----------|-------|
| Durable production adapters for outbox/audit/workflow/read models | High | Ark exposes interfaces; production deployments still need real stores |
| Type-aware semantic analyzer | High | `ark-check` is AST-based and path/config driven, not a TypeScript program/type graph |
| Distributed workflow orchestration | Medium | Keep Ark in-process; integrate Temporal/queues when process boundaries matter |
| OpenTelemetry bridge package | Medium | Core should keep hooks, not take an OTel runtime dependency |

## v0.5 Implementation Status (2026-07-01)

The dcouplr-inspired hardening wave is now implemented:

| Capability | Status |
|------------|--------|
| Add-only EventBus interceptors | ✅ |
| Interceptor audit and trace records | ✅ |
| Contract-safe interceptor failure behavior | ✅ |
| Kernel instance id stamping in event metadata | ✅ |
| Observability drift report: declared vs observed productions | ✅ |
| Runtime graph observed source-to-event flows | ✅ |
| `createArkTestHarness()` for runtime signal inspection | ✅ |
| `ark-runtime-kernel/eslint` plugin export | ✅ |
| ESLint rules for domain infra imports, raw publish, missing source | ✅ |
| Package subpath coverage for `./eslint` | ✅ |

## v0.6 Implementation Status (2026-07-01)

The strategic-audit hardening wave lands the highest-leverage enforcement gap:

| Capability | Status |
|------------|--------|
| Runtime enforcement of observed producer→event layer flows (`enforceObservedLayerFlow`) | ✅ |
| `off` / `soft` / `hard` modes with `layer.observedViolation` trace + audit records | ✅ |
| `createStrictArkKernel()` enforces observed flows `hard` by default | ✅ |
| `ObservedLayerFlowViolationError` thrown before history/outbox/subscribers | ✅ |
| Honest enforcement-scope section in README (hard-failed / observable / out of scope) | ✅ |

**Why this mattered:** before v0.6 the observed source→event edge was recorded on every
publish (`EventBus.registerEventFlow`) but read *only* by the drift report — never by an
enforcement path. Runtime "layer governance" therefore checked the declared model, not the
running system. v0.6 makes the flagship claim literal using data already in hand.

## v0.7 Implementation Status (2026-07-01)

Static enforcement — ranked #1 by both the strategic audit and the external v0.6 review —
is now real:

| Capability | Status |
|------------|--------|
| `ark-check` resolves imports via the TypeScript module resolver (`ts.resolveModuleName`) | ✅ |
| tsconfig path-alias imports (`@domain/*`, `@infra/db`) resolved and checked | ✅ |
| Package/absolute imports resolved; `node_modules` and `.d.ts` targets ignored | ✅ |
| `--tsconfig` flag; auto-discovers nearest `tsconfig.json` from `--root` | ✅ |
| Relative imports keep working (no regression) | ✅ |
| Alias-import fixture test proving the previously-invisible violation is caught | ✅ |

**Why this mattered:** `ark-check` previously resolved only relative specifiers, so
path-alias and package imports — the majority in real repos — were invisible. The honest
architecture chokepoint in TypeScript is the CI merge gate, and it now sees the imports that
actually exist.

Remaining high-value hardening after v0.7:

| Gap | Priority | Notes |
|-----|----------|-------|
| Wire `ark-check` as a mandatory gate | High | Add it to CI (Ark's own and the docs' recommended setup) so a violation blocks merge, not just prints |
| Write-path gate for AI agents | High | Ship an MCP server (manifest as resource + `validate` tool bound to `PreToolUse` on Write/Edit) so generated code is checked before it lands |
| Full type-graph analysis | Medium | `ark-check` resolves imports but not cross-layer *type-only* references / re-export chains; ship as opt-in `ark-tsmorph` behind the `AIGateExtension` seam |
| Reduce EventBus surface | Medium | EventBus now carries publish, interceptors, and observed-flow enforcement; extract cohesive helpers to keep it navigable |
| Durable adapters | High | Outbox, audit, workflow, and read model stores still need production adapters |
| Directed message bus | Medium | Useful for workflow/job commands, but should not blur Domain Events |
| Queue/backpressure runtime | Medium | Keep core thin unless queue semantics become central to Ark's governance model |
