# Ark - Architectural Runtime Kernel

**Zero-dependency runtime governance kernel for Hexagonal + Event-Driven + DDD systems.**

Published package name: `ark-runtime-kernel`.

Ark exists so architecture is not only a documented intention, but an actively protected runtime property. It helps teams define, enforce, and observe architectural boundaries while a system is running, especially in codebases where changes are frequent and part of the code may be generated or modified by AI agents.

> **Current status:** v0.7.0 strict in-process governance kernel plus CI checks. v0.7 upgrades the `ark-check` CI gate to resolve **all** import specifiers — relative, tsconfig path-aliases, and packages — via the TypeScript module resolver, so cross-layer imports through aliases (the majority in real repos) are finally caught, not just relative ones. v0.6 added **runtime enforcement of observed layer flows**: strict kernels check the real producer→event flow of every published event against the 11-layer profile and reject (or flag) events that cross a forbidden boundary — enforcement over what the system *did*, not only over what was *declared*. Ark also includes an 11-layer architecture profile, native audit/history, workflow/saga support, projection/read-model utilities, event contracts, event interceptors, a basic outbox store, observed-vs-declared observability reports, a test harness, layer-aware AI code checks, an AST-based `ark-check` CLI, an `ark-runtime-kernel/eslint` plugin, and `createStrictArkKernel()` for stricter runtime wiring. Ark is still not a database, distributed queue, type-aware semantic analyzer, or OpenTelemetry implementation.

## The Problem

Architecture in medium and large systems tends to decay over time. Most violations are not intentional: a local change looks reasonable, but it crosses a boundary the global architecture depends on.

That creates growing coupling, weaker layer boundaries, lower visibility, and architectural entropy. Diagrams, reviews, linters, and team discipline help, but they keep architecture mostly passive. They do not make it a protected property of the running system.

Ark moves architectural contracts into the runtime path.

## Mission

Ark is a runtime governance layer for software architecture.

It does not own business logic. It protects the structural rules that business logic must respect:

- which intents exist
- which events may be published or subscribed to
- which event contracts and source intents are valid
- which dependencies are allowed between architectural layers
- which violations are hard failures and which are observable warnings
- which contracts should be exported for tools, documentation, and AI agents

In practice, Ark acts as an architectural immune system: when configured rules are violated, the system responds predictably through typed errors, soft-violation hooks, trace records, or bounded history.

## Runtime and CI Enforcement

Ark focuses on real enforcement in runtime, not only guidance during development.

When critical interactions go through Ark:

- hard policies throw `PolicyViolationError`
- strict registries reject unregistered or invalid intent names on publish/subscribe
- strict event contracts reject missing or invalid payload contracts
- known-source enforcement rejects event metadata from unregistered sources
- event interceptors can enrich payloads without overwriting existing fields
- layer policies can block invalid declared dependencies
- observed-flow layer enforcement rejects (or flags) real producer→event flows that cross a forbidden layer boundary at publish time
- soft violations are observable through hooks and traces
- event history and trace records make architectural behavior inspectable
- observability reports show declared-vs-observed flow drift
- manifests expose the current architectural contract to tools and agents
- `ark-check` can fail CI on configured layer import and intent-reference violations
- `ark-runtime-kernel/eslint` can flag common bypass patterns during development

Enforcement is only as strong as the paths you wire through Ark. Code that bypasses Ark directly is outside this runtime contract unless you also cover it through registry rules, graph declarations, CI checks, or `AIGateExtension` analyzers.

### Enforcement scope (be explicit)

Ark governs the **event/intent runtime** it mediates, and the rest of the codebase **by contract + CI + drift**. Concretely:

- **Hard-failed at runtime** (on the governed publish path): unregistered/misnamed intents, unknown event sources, event-contract breaches, hard policy violations, and — new in v0.6 — observed producer→event flows that cross a forbidden layer boundary.
- **Observable** (recorded, not blocked): soft policy/layer violations and declared-vs-observed drift via `ark.observability.report()`.
- **Covered at CI (not runtime)** via `ark-check` / ESLint, if wired: direct cross-layer imports — now resolved through your `tsconfig` (relative, path-alias, and package imports), so most real cross-layer imports are caught at merge time.
- **Still out of scope entirely**: direct DB/HTTP calls and coupling that neither transits the event bus nor appears as an import (e.g. runtime DI wiring, reflection).

Ark is unavoidable **only on the paths you route through it**. Treat it as the runtime kernel for your event/intent layer plus a machine-readable architectural contract (`createArkManifest()`) that CI and AI agents enforce against — not as an OS-style choke point over all code.

## What Ark Provides

| Primitive | Purpose |
|-----------|---------|
| Intent Registry | Defines semantic system intents and validates naming/registration |
| Strict Ark Kernel | Wires registry, graph, policies, event bus, audit, event contracts, outbox, projections, metadata, and workflow with strict defaults |
| 11-Layer Profile | Provides governed layer taxonomy for Hexagonal + Event-Driven systems |
| Policy Engine | Evaluates hard and soft architectural policies, including profile-driven layer rules |
| Observed-Flow Layer Enforcement | Checks each published event's real producer→event flow against the profile at runtime (`off` / `soft` / `hard`); strict kernels default to `hard` |
| Event Bus | Publishes typed domain events with strict registry checks, source validation, contract validation, traces, audit, outbox handoff, and history |
| Event Interceptors | Add-only payload enrichment before delivery, with audit/trace records and contract protection |
| Event Contracts | Validates event versions and payload shape before publish |
| Outbox | Provides a basic pluggable outbox handoff for dispatched event records |
| Workflow Engine | Runs in-process workflows/sagas with snapshots, retries, timeouts, compensation, audit, and pluggable stores |
| Audit Trail | Stores native audit/history records for events, policies, handlers, workflows, projections, and metadata |
| Dependency Graph | Models declared relationships, event flow, Mermaid output, and layer-grouped Mermaid views |
| Read Models / Projections | Applies events to lightweight read models with checkpoints and pluggable stores |
| Metadata System | Describes entities, fields, rules, ownership, versions, entity-intent links, and validation issues |
| Ark Manifest | Exports a machine-readable architectural contract, including layers, event contracts, policies, and projections |
| Observability Reporter | Compares declared productions against observed runtime event flows |
| Test Harness | Exposes events, traces, audit records, outbox records, and observability snapshots for tests |
| AI Code Gate | Checks generated/reviewed code for unknown intents, forbidden patterns, and layer reference violations |
| Static Architecture Checker | `ark-check` uses the TypeScript AST to detect configured layer import and intent-reference violations in CI |
| ESLint Plugin | Optional development-time guardrails for domain imports and unsafe publish calls |

## What Ark Is / Is Not

| Ark is | Ark is not |
|--------|------------|
| A runtime and CI governance kernel | A database or persistence engine |
| A way to make architecture enforceable and observable | A complete distributed workflow platform |
| A contract surface for humans and AI agents | A replacement for domain logic |
| A policy and intent enforcement layer | A complete type-aware static analysis platform |
| Zero-dependency TypeScript infrastructure | A full OpenTelemetry implementation |
| A projection utility for read models | A query API or reporting database |

## Installation

```bash
npm install ark-runtime-kernel
```

## Quick Start - Strict Kernel

Use `createStrictArkKernel()` when you want the strictest runtime path by default:

```ts
import {
  createStrictArkKernel,
} from 'ark-runtime-kernel';

const ark = createStrictArkKernel({ maxHistorySize: 500 });

const OrderPlaced = ark.registry.define<
  'Domain.Order.OrderPlaced',
  { orderId: string; amount: number }
>('Domain.Order.OrderPlaced');

ark.registry.define<'Application.PlaceOrder', { orderId: string }>(
  'Application.PlaceOrder',
  { produces: ['Domain.Order.OrderPlaced'] }
);

ark.eventContracts.register({
  intent: 'Domain.Order.OrderPlaced',
  version: '1',
  allowAdditionalFields: false,
  schema: {
    orderId: { type: 'string', required: true },
    amount: { type: 'number', required: true },
    observedBy: { type: 'string' },
  },
});

ark.projections.register<{ orderIds: string[] }>({
  name: 'OrderReadModel',
  sourceIntents: ['Domain.Order.OrderPlaced'],
  initialState: { orderIds: [] },
  project: (event, state) => ({
    orderIds: [...state.orderIds, event.payload.orderId as string],
  }),
});

ark.eventBus.registerInterceptor(OrderPlaced, ({ intercept }) => {
  intercept({ observedBy: 'ark' });
}, 'demo-interceptor');

ark.eventBus.subscribe(OrderPlaced, (event) => {
  console.log('Placed:', event.payload.orderId);
});

await ark.eventBus.publish(
  OrderPlaced,
  { orderId: 'o1', amount: 99 },
  {
    source: 'Application.PlaceOrder',
    eventVersion: '1',
    correlationId: 'corr-1',
  }
);

console.log(await ark.projections.getState('OrderReadModel'));
console.log(await ark.auditTrail.query({ correlationId: 'corr-1' }));
console.log(await ark.outbox.list('pending'));
console.log(ark.observability.report());
console.log(JSON.stringify(ark.manifest().toJSON(), null, 2));
```

See `examples/basic/` for a runnable version.

## AI-Augmented Development

Ark does not generate code. It gives generated code something concrete to obey.

`createArkManifest().toJSON()` exports the current architectural contract so agents can inspect registered intents, relationships, policies, entities, graph data, layers, event contracts, and projections before editing. `createAICodeGate()` provides fast string/regex checks for unknown intents, forbidden patterns, and layer reference violations when paired with `elevenLayerProfile`.

For CI, use `ark-check` with an explicit layer configuration:

```bash
npx ark-check --root . --config ark.config.json
```

`ark-check` requires TypeScript to be available in the consuming project. It parses source with the TypeScript AST and resolves imports through the TypeScript module resolver against your `tsconfig.json` — relative, path-alias, and package imports — plus string intent references. It resolves modules the way your build does, but does not yet perform full type-graph/symbol analysis (e.g. cross-layer *type-only* references beyond the import specifier).

For editor/CI linting, use the optional ESLint subpath:

```js
// eslint.config.js
import ark from 'ark-runtime-kernel/eslint';

export default [
  ark.configs.recommended,
];
```

The bundled rules are intentionally narrow: `ark/no-domain-infra-imports`, `ark/no-raw-event-publish`, and `ark/require-publish-source`.

## Design Constraints

- Zero runtime dependencies
- Strict TypeScript
- Explicit wiring over magic
- No experimental decorators
- Works in Node.js and modern bundlers
- Dual ESM + CommonJS output
- Enforcement is deliberate: wire registries, policies, and graphs where boundaries matter
- Static checks require a project-specific `ark.config.json`
- ESLint checks are heuristics and complement runtime enforcement; they do not replace `ark-check`

## Documentation

- [Evaluation Report](docs/evaluation-report.md)
- [Improvement Plan](docs/improvement-plan.md)
- [Agent Integration Guide](docs/agent-guide.md)
- [ark-check Config Example](docs/ark-check-example.json)
- [System Readiness Assessment](docs/system-readiness.md)
- [Final Summary](docs/final-summary.md)

## Development

```bash
npm install
npm run typecheck
npm run check:architecture
npm test
npm run build
```

`package.json` is the development manifest. `npm pack` builds the published tarball.

## License

MIT

---

**Built to protect architecture in runtime, not to replace your domain logic.**
