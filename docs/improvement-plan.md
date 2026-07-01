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

*Remaining items for v0.3+; v0.2 shipped the enforcement-critical work.*

### M1. Saga compensation test + minimal state exposure

**Finding:** §4 — Compensation path untested; no step status.  
**Change:** Add compensation test; expose `SagaInstance.status` (`'running' | 'completed' | 'compensating' | 'failed'`) and `completedSteps[]`.  
**Effort:** ~2 hours.

### M2. Metadata export + entity–intent linking

**Finding:** §5 — No JSON export; no entity–event link.  
**Change:** Add `MetadataRegistry.toJSON()`; optional `EntityMeta.emits?: string[]` / `consumes?: string[]` intent name lists.  
**Effort:** ~2 hours.

### M3. Runtime intent registration validation on publish ✅ shipped in v0.2

**Finding:** §3 — Raw events bypass registry.  
**Change shipped:** `EventBusOptions.strictRegistry` defaults to true when `intentRegistry` is provided and rejects unregistered publish/subscribe paths. Runtime naming validation is available via `validateIntentNaming`.

### M4. Subscriber index by intent name

**Finding:** §8 — O(n) scan per publish.  
**Change:** Internal `Map<string, InternalSubscription[]>` keyed by intent name.  
**Effort:** ~1 hour.

### M5. Agent-oriented documentation section

**Finding:** §7 — No agent guide.  
**Change:** Add `docs/agent-guide.md`: manifest usage, naming conventions, extension points, example agent workflow. Update README link.  
**Effort:** ~1–2 hours.

### M6. Typed policy context helpers

**Finding:** §2 — `any` in policy checks.  
**Change:** Export `PublishPolicyContext`, `GraphPolicyContext` types; `definePublishPolicy()` sugar.  
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

Phase 4 — Polish (remaining M1, M2, M4, L1–L5)
  As time permits
```

**Estimated High-tier total:** ~12–16 hours of focused implementation.

---

## Explicit Non-Goals (This Plan)

- Embedding LLM/AI provider SDKs
- Full TypeScript AST static analyzer (deferred to external `AIGateExtension` plugins)
- Persistent saga storage / distributed event bus
- CQRS read-model implementation inside the kernel
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
| Tests | All existing + new tests pass; negative paths covered for H4, H5, H3 |

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

**Medium/Low tier:** remaining non-blocking items are M1, M2, M4, and L1–L5.
