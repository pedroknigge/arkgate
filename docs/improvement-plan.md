# Ark Governance Roadmap

> **v1.0.0 Release-time Snapshot / Assessment** (2026-07-01). This document reflects the roadmap and baseline view captured at v1.0.0 release. Multiple phases (including static governance, source-bound publishers, AI gate AST parity, and profile support) were delivered as part of reaching the v1.0.0 baseline.

**Date:** 2026-07-01  
**Current version:** 1.0.0  
**Purpose:** Move Ark from a strong event/intent governance kernel plus partial static checks
to a broader architectural governance system that is honest about what it can enforce.

## Current Baseline

Ark v1.0.0 has meaningful strict runtime governance:

- `createArkKernel()` is strict by default.
- Event publication validates registered intents, known sources, event contracts, policies,
  and observed layer flow before subscriber delivery.
- The built-in 11-layer profile uses a strict cross-layer deny matrix with explicit
  allowed flows.
- `ark-check` uses the TypeScript AST and TypeScript module resolution for configured
  import and intent-reference checks.
- Manifest, observability, MCP, ESLint, audit, workflow, projection, outbox, metadata,
  and test-harness surfaces exist.

The main remaining gap is scope: Ark strongly governs the paths routed through it, but
direct calls, dependency injection, raw infrastructure access, external brokers, and
unclassified files remain outside runtime control unless static governance or project
conventions cover them.

v1.0.0 shipped the Phase 1–3 core items plus partial 4/5: strict-by-default kernels (`createArkKernel`, `createStrictArkKernel`), source-bound `publisher()`, expanded `ark-check` (TS-resolved imports including dynamic/require, raw publish flagging, source metadata enforcement, layer mismatch, config warnings with --strict-config), 11-layer profile + generators, AICodeGate AST publish checks when TS passed, MCP hook parity, and port/adapter metadata.

## Seven-Phase Plan

### Phase 1: Operational Honesty and Config Validation

Goal: remove ambiguity between the docs, defaults, and real enforcement scope.

- Keep documentation aligned with version and strict defaults.
- Document what Ark does and does not govern.
- Report `ark-check` warnings for missing layers, unclassified files, layer patterns with
  no matches, and rules that reference unknown layers.
- Keep config warnings advisory by default; support `--strict-config` for CI hardening.

### Phase 2: Make `ark-check` the Primary Static Governance Engine

Goal: cover more architecture bypasses outside the EventBus.

- Detect dynamic imports, `require()`, re-exports, raw publishes, publish calls without
  source metadata, suspicious source literals, and intent references.
- Improve monorepo and package-boundary support.
- Produce stable JSON diagnostics with rule ids, severity, source location, and fix
  guidance.

### Phase 3: Source Authenticity

Goal: stop treating `metadata.source` as fully trusted caller input.

- Introduce scoped publishers or source-bound event bus capabilities.
- Make the recommended API stamp `metadata.source` internally.
- Detect source spoofing in strict runtime paths and static checks where file layer
  context is available.

### Phase 4: Operational 11-Layer Profile

Goal: make the built-in profile usable for real projects without hand-writing the full
configuration.

- Add profile-backed config generation or sync helpers.
- Map common folder conventions to the 11 built-in layers.
- Ensure static rules, runtime profile rules, MCP, and manifest consumption all use the
  same layer/rule source.

### Phase 5: AST-Backed AI Gate and MCP Parity

Goal: make AI write-path governance use the same analyzer semantics as CI.

- Replace or augment `AICodeGate` regex heuristics with shared AST-backed checks.
- Share analyzer logic between `ark-check`, `AICodeGate`, and `ark-mcp`.
- Add parity tests so code blocked by CI is also blocked by the MCP write-path gate.

### Phase 6: Ports and Adapters Governance

Goal: govern dependency inversion, not only event publication.

- Register port ownership and allowed adapter implementations.
- Detect direct imports of adapter implementations where ports should be used.
- Validate adapter-to-port relationships and layer direction.

### Phase 7: Production Hardening

Goal: improve operational readiness without pretending Ark is durable infrastructure.

- Strengthen event contracts with nested schemas, arrays, enums, and compatibility checks.
- Provide production-store adapters or recipes for audit, outbox, projections, and
  workflow snapshots.
- Mark in-memory stores clearly as development/test defaults.

## Release Targets (v1.0.0 baseline view, updated for shipped reality)

| Version | Focus | Status at v1.0 |
|---------|-------|----------------|
| 1.0.0 | Phase 1 (operational honesty, config validation + --strict-config + warnings) + Phase 2 (ark-check broader static: dynamic imports/require, raw publish, missing source, source-layer mismatch, intent refs) + Phase 3 (source-bound publishers + SourceMetadataOverrideError) + Phase 4/5 partial (operational 11-layer profile + `createElevenLayerArkConfig` + `--print-config`, AICodeGate AST-backed publish checks + MCP parity) + basic ports/adapters metadata | Shipped (see Current Baseline) |
| 1.x+ | Phase 6 full (ports/adapters governance) + Phase 7 (production hardening stores/recipes, deeper contracts) + remaining monorepo / deeper static / durability work | Future |

Many Phase 2–5 items advanced into the v1.0.0 release. The "remaining gap" is still scope (not everything is routed through Ark).

## Non-Goals

- Adding runtime dependencies to the core package.
- Becoming a full TypeScript compiler plugin.
- Owning distributed workflow orchestration.
- Replacing durable queues, databases, observability backends, or compliance systems.

## Governance Principle

Ark should be positioned as three coordinated layers:

1. Runtime kernel: EventBus, policies, contracts, observed flows, audit, and drift.
2. Static governance: `ark-check` as the main repository-wide architecture gate.
3. AI governance: MCP and AICodeGate using the same analyzer semantics as CI.
