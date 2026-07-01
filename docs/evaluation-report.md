# Ark Library — Evaluation Report

> Historical note: this report evaluated the original v0.1 state. v0.2 addressed the major enforcement, manifest, packaging, and documentation issues identified here; see `docs/final-summary.md` for current status.

**Evaluator role:** Staff Engineer (Architectural Runtime Kernel)  
**Date:** 2026-07-01  
**Version evaluated:** `0.1.0`  
**Scope:** `src/kernel/**`, `src/domain/types.ts`, `tests/**`, `examples/**`, `README.md`

---

## Executive Summary

Ark delivers a **credible zero-dependency governance kernel** with clear module boundaries, typed intent creators, a working policy engine, and an event bus with publish history. The codebase is small (~1,500 LOC kernel), readable, and test-covered on happy paths (46 tests passing).

However, Ark is currently a **strong prototype**, not yet a production-grade architectural kernel. The largest gaps are: **disconnected subsystems** (IntentRegistry ↔ DependencyGraph ↔ Metadata never sync), **weak runtime enforcement** (policies and AI gate are trivially bypassed), **thin agent contracts** (no machine-readable manifest, stubbed AI gate intent checks), and **limited observability** (unbounded history, swallowed handler errors, no trace format for agents).

The foundation is sound. With targeted hardening of contracts, wiring, and extension points, Ark can become a durable kernel for AI-augmented development without embedding AI into the core.

---

## 1. Architectural Integrity (Dogfooding)

### Strengths

- **Clean module decomposition.** Kernel is split into cohesive packages: `intent`, `policy`, `event-bus`, `graph`, `metadata`, `adapters`, `ai-gate`, `workflow`. Public surface is a single barrel (`src/index.ts`).
- **Dependency direction mostly correct.** `domain/types.ts` is pure types. `EventBus` depends on `PolicyEngine` via constructor injection (`EventBusOptions.policyEngine`), not the reverse.
- **Factory + interface pattern.** Consistent `createX()` factories (`createEventBus`, `createDependencyGraph`, `createMetadataRegistry`) keep construction explicit and testable.
- **Documented naming conventions.** `IntentName` union (`Domain.*`, `Application.*`, `Adapter.*`, `Workflow.*`) encodes hexagonal layers at the type level.

### Weaknesses

- **Does not dogfood Hexagonal + CQRS internally.** The kernel itself is a flat library — no command/query ports, no read models, no internal event sourcing. It *promotes* these patterns but does not *embody* them.
- **IntentRegistry and DependencyGraph are siloed.** `IntentRegistry.getAllRelationships()` exists, but nothing bridges it to `createDependencyGraph()`. The demo manually calls `graph.registerDependency()` — relationships declared via `defineIntent({ dependsOn })` never reach the graph automatically.
- **Global mutable singleton.** `defineIntent()` uses a module-level `defaultIntentRegistry`. Tests that need isolation must use `createIntentRegistry()` directly, but the ergonomic default path shares global state across the process.
- **`produces` option is semantically wrong.** In `IntentRegistry.define()`, `produces` entries are stored via `declareDependency(name, prod)` — same as `dependsOn`. A producer→product edge is modeled as a dependency, which inverts the intended semantics and will confuse graph analysis.
- **Saga is procedural, not event-driven.** `createSaga()` runs steps sequentially in a `for` loop. `SagaStep.onEvent` is declared in types but never used. Compensation is best-effort with swallowed errors.

**Verdict:** Structurally clean and evolvable, but **not yet architecturally self-consistent**. Subsystems exist side-by-side without integration glue.

---

## 2. Code Quality & Maintainability

### Strengths

- **Strict TypeScript.** `tsconfig.json` enables full strict mode (`noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, etc.).
- **Readable entry points.** `defineIntent`, `definePolicy`, `createEventBus` have JSDoc with multi-line `@example` blocks — good for humans and AI codegen.
- **Consistent naming.** `PolicyViolation`, `PublishedEventRecord`, `IntentCreator` — domain language is coherent.
- **Small, navigable codebase.** A new contributor (human or agent) can read all kernel source in under an hour.

### Weaknesses

- **Pervasive `any` at integration boundaries.** `Saga.run(initialPayload: any)`, `createSaga` context merging, demo `definePolicy({ check: (c: any) => ... })`, and `AICodeGate` policy context `({ source } as any)` reduce type safety where it matters most.
- **Silent error swallowing.** `EventBusImpl.publish()` catches handler exceptions and resolves to `Promise.resolve()` — failures are invisible unless the handler logs internally.
- **Loose error typing.** `PolicyEngine.enforce()` attaches violations via `(error as any).violations` instead of a typed `PolicyViolationError` class.
- **Hardcoded defaults.** `IntentRegistry` sets `metadata.source: 'unknown'` on every event — callers must override at publish time; no registry-level default source.
- **No structured logging interface.** `onPublish` is the only observability hook; no `onError`, `onSoftViolation`, or `onHandlerFailure`.

**Verdict:** Good baseline quality for v0.1, but **integration seams need stronger typing and explicit error surfaces** before agents can safely extend the system.

---

## 3. Enforcement Strength

### Strengths

- **PolicyEngine is solid.** Hard policies throw with aggregated messages; soft policies collect without throwing. Duplicate policy names are rejected. Tests cover pass/fail/enforce paths (`PolicyEngine.test.ts`, 7 tests).
- **Publish-time enforcement.** `EventBus` calls `policyEngine.enforce()` before recording history or notifying subscribers — hard violations block the event (verified in `createEventBus.test.ts`).
- **Graph cycle detection.** `DependencyGraph.detectViolations()` includes a default cycle rule plus pluggable custom rules.
- **Adapter contract check.** `createAdapter()` validates `requiredKeys` at construction; `checkContract()` provides a non-throwing variant.

### Weaknesses

- **Enforcement is entirely opt-in.** No built-in policies for layer violations (e.g., `Domain.*` must not depend on `Adapter.*`). An application can use Ark with zero policies and get no governance.
- **Raw event bypass.** `bus.publish(rawDomainEvent)` skips intent registry — there is no validation that `event.intent` was registered.
- **Intent naming not runtime-validated.** `IntentName` template literals are compile-time hints only; `defineIntent('Random.String')` works because of `(string & {})` escape hatch.
- **AI Code Gate intent check is a no-op.** `AICodeGate.ts` lines 70–72: the intent allowlist block is empty with a comment "just informational; not failing unless policy says so" — registered intents are never validated.
- **Ports are type-erasures.** `definePort<T>()` returns `{ name } as Port<T>` — no runtime contract beyond optional `requiredKeys` string list.
- **Graph rules are disconnected from policies.** `detectViolations()` and `PolicyEngine` are separate systems; architectural rules must be duplicated to enforce at both graph-analysis and runtime-publish time.

**Verdict:** Core enforcement mechanics work, but the system is **easy to bypass** and provides **no default architectural guardrails**. Not yet "hard-to-bypass."

---

## 4. Event System & Workflow Capabilities

### Strengths

- **Typed publish/subscribe.** `IntentCreator` + payload overload is ergonomic and type-safe. Both creator and string intent name subscription work.
- **Metadata enrichment.** `correlationId`, `causationId`, `source`, `occurredAt` are merged with sensible defaults — foundation for distributed tracing.
- **Publish history.** `getHistory()` returns `PublishedEventRecord[]` with `subscribersNotified` count — useful for tests and agent observability.
- **Async-safe.** `publish()` awaits all handler promises via `Promise.all`.

### Weaknesses

- **No event replay.** History is append-only with no `replay(from?, filter?)` API for recovery or agent debugging.
- **No middleware pipeline.** Cannot compose cross-cutting concerns (logging, metrics, auth) without wrapping the bus.
- **Handler failures are silent.** See §2 — no dead-letter queue, no `onHandlerError` callback.
- **Saga limitations.** No persistence, no state machine, no timeouts, no idempotency keys, no step status tracking. `onEvent` in `SagaStep` is unused. Compensation test does not exist (`saga.test.ts` has 1 happy-path test only).
- **O(n) subscriber lookup.** `subscriptions.filter(s => s.intentName === event.intent)` on every publish — fine at small scale, no index.
- **Soft policy violations invisible in EventBus.** `enforce()` returns soft violations but EventBus discards the result — no hook to observe warnings.

**Verdict:** Event bus is a **solid MVP** for in-process domain events. Saga/workflow support is **demonstration-level**, not production-ready for long-running agent-orchestrated processes.

---

## 5. Metadata & Extensibility System

### Strengths

- **Declarative entity model.** `EntityMeta` with `fields`, optional `rules`, and index signature `[key: string]: unknown` allows extension without schema changes.
- **Simple registry API.** `entity()`, `getEntity()`, `listEntities()` — minimal and predictable.
- **Field-level metadata.** `identity`, `required`, custom keys on `FieldMeta` support codegen and validation scenarios.

### Weaknesses

- **Rules are inert.** `EntityMeta.rules` is an array of `{ name, description? }` — never evaluated by any kernel component.
- **No entity relationships.** Cannot declare `Order belongs_to Customer` or foreign-key semantics.
- **No export format.** No `toJSON()`, `toJsonSchema()`, or agent-consumable manifest from metadata registry.
- **No link to intents/events.** `OrderPlaced` intent and `Order` entity metadata are independent — agents cannot discover which events affect which entities.
- **No versioning or migration.** Overwriting `entity()` replaces in place with no history.

**Verdict:** Adequate as a **data holder** for v0.1, but **not yet a powerful extensibility system** for dynamic or AI-driven domain extension.

---

## 6. AI & Agent Readiness (Critical)

### Strengths

- **Semantic intent naming.** Fully-qualified names (`Domain.Order.OrderPlaced`) are machine-readable and namespace-safe — excellent contract foundation.
- **Callable intent creators.** `OrderPlaced({ orderId })` is unambiguous for codegen — agents can import and invoke without string literals.
- **Extensible AI Code Gate.** Accepts custom `policies`, `forbiddenPatterns`, and `intents` — designed as a plugin surface, not a monolith.
- **Graph export.** `toMermaid()` and `toJSON()` produce visualizable artifacts agents can reason about.
- **JSDoc examples on core APIs.** `defineIntent`, `definePolicy` include copy-pasteable examples — reduces agent hallucination risk.

### Weaknesses

- **No machine-readable manifest.** Agents cannot call a single API to discover all registered intents, policies, ports, entities, and relationships. Each registry is isolated.
- **AICodeGate.validate() ignores `context` parameter.** Interface declares `validate(source, context?)` but implementation only uses `source` — extension point is dead.
- **Intent allowlist enforcement stubbed.** See §3 — the most agent-relevant gate feature is unimplemented.
- **No structured violation output for remediation.** Violations are `string[]`, not `{ code, message, location?, suggestion? }` — agents cannot auto-fix.
- **No observability trace format.** No standard JSON trace event (`{ type, intent, correlationId, violations, timestamp }`) for agent monitoring.
- **No documented extension-point interfaces.** No `ArkObserver`, `AIGatePlugin`, or `PolicyProvider` types for external AI layers to implement.
- **Runtime policies and AI gate policies are separate.** An agent defining policies for `PolicyEngine` must separately register them for `AICodeGate` — no shared registry.

**Verdict:** Ark has the **right conceptual primitives** for agent readiness but lacks the **contract packaging, observability signals, and extension interfaces** that would make it reliably consumable by AI systems at scale.

---

## 7. Tests, Documentation & Usability

### Strengths

- **46 tests, 13 files, all passing.** Unit tests per module + one integration test + publish smoke test.
- **Real-path testing.** Tests import from `src/index` and exercise actual factories — not reimplemented logic.
- **Runnable demo.** `examples/basic/index.ts` exercises intents, bus, policies, graph, metadata, adapters, saga, and prints observable output.
- **README quick start.** Installation, philosophy, feature table, and code example present.

### Weaknesses

- **Missing negative-path coverage.** No tests for: saga compensation, handler errors, soft policy warnings in EventBus, graph custom rules, metadata edge cases, intent duplicate registration via `defineIntent` global registry.
- **Integration test is shallow.** `full-features.test.ts` asserts counts (`received.length === 1`) but not semantic correctness of graph edges, metadata fields, or policy messages.
- **No API reference document.** JSDoc exists in source but no generated or curated `docs/api.md`.
- **README references session artifacts.** "See the detailed plan in the session notes" — not useful for library consumers.
- **No architecture diagram.** New users/agents must read source to understand subsystem relationships.
- **No agent-oriented guide.** No section on "how to extend Ark safely" or "contract discovery for codegen."

**Verdict:** Test suite proves the happy path works. **Coverage gaps on enforcement, error paths, and agent contracts** leave production confidence incomplete.

---

## 8. Performance & Overhead

### Strengths

- **Zero runtime dependencies.** `package.json` `"dependencies": {}` — minimal install footprint, no supply-chain risk.
- **In-memory data structures.** `Map` and arrays throughout — appropriate for an in-process kernel.
- **Small bundle potential.** Kernel source is compact; `tsup` dual ESM/CJS build works.

### Weaknesses

- **No benchmarks.** Performance claims are unmeasured. Honest assessment: overhead is likely negligible for typical domain-event volumes, but this is an assumption.
- **Unbounded event history.** `history.push()` on every publish with no `maxHistorySize` option — memory grows linearly with event count. Problematic for long-running services and agent loops.
- **Linear subscriber scan.** No `Map<intentName, handlers[]>` index.
- **Naive cycle detection.** DFS with `stack.includes()` is O(V·depth) — acceptable for small graphs, not documented as a limitation.

**Verdict:** Overhead is **almost certainly acceptable** for intended use (in-process governance), but **unbounded history is a real production risk** that should be addressed before v1.0.

---

## Overall Scorecard

| Dimension | Rating | One-line summary |
|-----------|--------|------------------|
| Architectural Integrity | 🟡 Good structure, weak integration | Modules are clean; subsystems don't talk to each other |
| Code Quality | 🟡 Readable, loose at seams | Strict TS in core, `any` at boundaries |
| Enforcement Strength | 🟠 Opt-in only | Works when configured; trivially bypassed otherwise |
| Event System & Workflow | 🟡 Solid bus, thin saga | Bus is usable; workflows are demo-level |
| Metadata & Extensibility | 🟠 Data holder only | Extensible shape, no evaluation or export |
| AI & Agent Readiness | 🟠 Primitives yes, contracts no | Naming is great; manifest and gate are incomplete |
| Tests & Documentation | 🟡 Happy path covered | Missing negative paths and agent docs |
| Performance | 🟢 Likely fine | Unbounded history is the main concern |

**Overall:** Ark is a **well-structured v0.1 kernel** that needs **contract hardening, subsystem wiring, and agent-facing surfaces** to reach production-grade status.
