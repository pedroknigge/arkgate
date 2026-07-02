# Ark Library Evaluation Report

> **v1.0.0 Release-time Snapshot / Assessment** (2026-07-01). Historical evaluation report captured at the v1.0.0 release.

**Evaluator:** Direct code analysis  
**Date:** 2026-07-01  
**Version analyzed:** 1.0.0 (`ark-runtime-kernel`)  
**Method:** Source, CLI, tests, and package metadata inspection. Marketing claims are not used as evidence.

## Executive Summary

Ark is a useful zero-dependency architectural governance kernel for event/intent-driven
TypeScript systems. Its strongest guarantees apply to the governed publish path:
registered intents, known event sources, event contracts, hard/soft policies, and observed
producer-to-event layer flow.

**Maturity score:** 6.5/10 as a broad architectural enforcement tool.

The implementation is stronger than a typical lightweight architecture helper, but it is
not a complete architectural firewall. It governs what is routed through Ark and what
static tooling can classify. Direct calls, dependency injection, external brokers, raw
database access, and unclassified files remain outside runtime control.

## What Works Well Today

- `createArkKernel()` is strict by default in v1.0.0.
- `createStrictArkKernel()` explicitly preserves the hardened path.
- `createLenientArkKernel()` gives migration paths a named opt-out.
- Strict event publication validates:
  - intent naming and registration;
  - registered `metadata.source`;
  - event contracts and versions;
  - add-only interceptor results;
  - observed layer flow before graph/history/outbox/subscriber side effects.
- The 11-layer profile is a strict cross-layer deny matrix with explicit allowed flows.
- The 11-layer profile can generate a starter `ark.config.json` through
  `createElevenLayerArkConfig()` or `ark-check --print-config eleven-layer`.
- `ark-check` uses the TypeScript AST and TypeScript module resolution for static import
  checks and intent-reference checks.
- `ark-check` can consume manifest architecture rules/prefixes.
- `ark-check` reports config coverage warnings for missing/partial layers, unclassified
  files, unmatched layer patterns, duplicate layers, and unknown rule layers.
- Policy evaluation is simple and reliable: hard violations throw, soft violations are
  observable.
- Manifest export is useful for humans, CI, and agents.
- Observability reports declared-vs-observed production drift.
- MCP and AICodeGate provide an early write-path feedback surface for AI-assisted work.
- Ports/adapters can carry ownership metadata and adapter allowlists.

## Important Limits

- Runtime governance applies only to code that calls Ark's EventBus.
- Direct `eventBus.publish(...)` still accepts caller-provided `metadata.source`. Ark now
  provides source-bound publishers that stamp source internally and reject overrides, but
  teams must adopt that API on the governed path.
- `ark-check` covers configured import/export edges and intent references. It is not yet a
  full call-graph, DI, type-symbol, or package-boundary analyzer.
- AICodeGate still has heuristic source-string checks by default, but now supports optional
  TypeScript AST checks for publish misuse when callers pass the `typescript` module.
- ESLint rules are intentionally narrow guardrails.
- Event contracts cover field types, nested object fields, typed arrays, and enum values,
  but they are still intentionally lighter than JSON Schema or Zod.
- Workflow, projection, audit, and outbox defaults are in-memory and should be treated as
  development/test defaults unless callers provide production stores.

## Realistic Governance Scope

Ark can strongly govern:

- event publication through the strict kernel;
- registered intent naming and event contracts;
- observed source-to-event layer flow;
- declared intent relationships and graph-based policy inputs.

Ark can moderately govern:

- static imports and intent references in files classified by `ark.config.json`;
- AI-generated snippets routed through MCP/AICodeGate.

Ark does not currently govern by itself:

- direct method calls;
- runtime dependency injection wiring;
- raw DB/HTTP calls;
- external message broker publishes;
- service-to-service boundaries;
- code files excluded from or unclassified by static config.

For a typical project, realistic architectural coverage is around 25-40% without deep
project-specific adoption. That coverage improves when teams route events through Ark,
classify all source files, fail CI on config warnings, and bind MCP validation to AI
write hooks.

## Production Readiness

Ark is production-useful as an additional governance layer for human teams and
AI-assisted development. It should not be positioned as the only architectural enforcement
mechanism in complex systems.

Recommended production posture:

- use `createArkKernel()` or `createStrictArkKernel()`;
- prefer `ark.publisher(sourceIntent).publish(...)` over direct publish calls;
- register all producer and event intents;
- register event contracts;
- run `ark-check` in CI;
- use `--strict-config` after the layer map is complete;
- bind `ark-mcp validate_code` to AI write/edit hooks;
- provide durable stores for audit, outbox, projection, and workflow state where needed.

## Priority Recommendations

1. Keep documentation aligned with code defaults and limits.
2. Expand `ark-check` into the main static governance engine.
3. Add source-authenticity APIs so publishers cannot freely spoof `metadata.source`.
4. Continue improving profile synchronization for existing projects beyond the current
   generated starter config.
5. Continue expanding AST-backed AI checks beyond publish misuse and keep MCP/CI parity
   tests in place.
6. Continue deepening ports/adapters governance beyond the current metadata and allowlist
   checks.
7. Continue production hardening with real storage adapters outside the zero-dependency
   core.
