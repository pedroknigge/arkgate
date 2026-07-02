# Ark - Architectural Runtime Kernel

[![CI](https://github.com/pedroknigge/ark/actions/workflows/ci.yml/badge.svg)](https://github.com/pedroknigge/ark/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Make your architecture a machine-readable contract that AI agents and CI must obey — enforced when code is written, when it merges, and while it runs.**

Published package name: `ark-runtime-kernel`. Zero runtime dependencies.

Most architecture "enforcement" is a diagram and a review checklist. Ark turns the same rules into three executable gates that share one config:

1. **Write time** — `ark-mcp` exposes your architecture over MCP; bind its `validate_code` tool to your agent's pre-write hook and architecturally invalid generated code is blocked before it lands on disk.
2. **Merge time** — `ark-check` resolves every import through the TypeScript module resolver and fails CI on cross-layer violations and governance-coverage gaps.
3. **Runtime** — an optional in-process kernel enforces event contracts, intent registration, and observed layer flow on the paths you route through it.

## 60-second setup

```bash
npm install -D ark-runtime-kernel typescript

# 1. Generate ark.config.json from the layer directories your repo already has
npx ark-check --init

# 2. Gate CI: fails on violations and (with --strict-config) on coverage gaps
npx ark-check --root . --config ark.config.json --strict-config

# 3. Gate your AI agent's write path (see "AI write-path gate" below)
npx ark-mcp --root . --config ark.config.json
```

`--init` detects conventional layer directories (`src/domain`, `src/application`, `src/adapters/persistence`, ...), writes a config covering only the layers that actually exist, and lists the directories that remain ungoverned so coverage gaps are explicit from day one.

> **Current status:** v1.0.0 strict in-process governance kernel plus CI and AI write-path gates. `createArkKernel()` now uses hardened defaults: strict event contracts, known-source enforcement, and hard observed layer-flow enforcement unless explicitly relaxed. `createStrictArkKernel()` remains the explicit strict factory, while `createLenientArkKernel()` exists for migration/legacy paths. `ark-check` resolves imports through the TypeScript module resolver, checks configured layer imports and intent references, and reports non-blocking config warnings for incomplete layer coverage. `ark-mcp` exposes the same architecture contract to AI write-path hooks. Ark is useful today as an event/intent governance kernel plus static governance aid, but it is still not a database, distributed queue, complete semantic analyzer, source-authenticity system, or OpenTelemetry implementation.

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
- `ark-check` reports configuration coverage warnings, including unclassified files and rules that reference unknown layers
- `ark-runtime-kernel/eslint` can flag common bypass patterns during development

Enforcement is only as strong as the paths you wire through Ark. Code that bypasses Ark directly is outside this runtime contract unless you also cover it through registry rules, graph declarations, CI checks, or `AIGateExtension` analyzers.

### Enforcement scope (be explicit)

Ark governs the **event/intent runtime** it mediates, and the rest of the codebase **by contract + CI + drift**. Concretely:

- **Hard-failed at runtime** (on the governed publish path): unregistered/misnamed intents, unknown event sources, event-contract breaches, hard policy violations, and observed producer→event flows that cross a forbidden layer boundary.
- **Observable** (recorded, not blocked): soft policy/layer violations and declared-vs-observed drift via `ark.observability.report()`.
- **Covered at CI (not runtime)** via `ark-check` / ESLint, if wired: direct cross-layer imports — now resolved through your `tsconfig` (relative, path-alias, and package imports), plus string intent references. `ark-check` also reports warnings when the config leaves files or layers outside governance.
- **Still out of scope entirely**: direct DB/HTTP calls and coupling that neither transits the event bus nor appears as an import (e.g. runtime DI wiring, reflection).

Ark is unavoidable **only on the paths you route through it**. Treat it as the runtime kernel for your event/intent layer plus a machine-readable architectural contract (`createArkManifest()`) that CI and AI agents enforce against — not as an OS-style choke point over all code.

## What Ark Provides

The static gates (`ark-check`, `ark-mcp`, the ESLint plugin) work standalone with just an `ark.config.json` — no runtime adoption required. The runtime primitives below are the optional deeper layer for teams that also want the architecture enforced inside the running system.

| Primitive | Purpose |
|-----------|---------|
| Intent Registry | Defines semantic system intents and validates naming/registration |
| Ark Kernel | Wires registry, graph, policies, event bus, audit, event contracts, outbox, projections, metadata, and workflow with strict defaults |
| 11-Layer Profile | Provides governed layer taxonomy for Hexagonal + Event-Driven systems |
| Policy Engine | Evaluates hard and soft architectural policies, including profile-driven layer rules |
| Observed-Flow Layer Enforcement | Checks each published event's real producer→event flow against the profile at runtime (`off` / `soft` / `hard`); strict kernels default to `hard` |
| Event Bus | Publishes typed domain events with strict registry checks, source validation, contract validation, traces, audit, outbox handoff, and history |
| Event Interceptors | Add-only payload enrichment before delivery, with audit/trace records and contract protection |
| Event Contracts | Validates event versions and payload shape before publish, including nested object fields, typed arrays, and enum values |
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

Ports can also carry ownership metadata and adapter allowlists:

```ts
const OrderRepo = definePort<OrderRepoPort>('OrderRepo', {
  ownerLayer: 'ApplicationOrchestration',
  intent: 'Application.Port.OrderRepo',
  allowedAdapters: ['Adapter.Persistence.SqlOrderRepo'],
});

createAdapter(OrderRepo, sqlRepo, {
  name: 'Adapter.Persistence.SqlOrderRepo',
  layer: 'PersistenceAdapters',
  requiredKeys: ['find'],
});
```

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

Use `createArkKernel()` or `createStrictArkKernel()` for the strict runtime path. Both are strict by default in v1.0. Use `createLenientArkKernel()` only for explicit migration paths.

```ts
import {
  createArkKernel,
} from 'ark-runtime-kernel';

const ark = createArkKernel({ maxHistorySize: 500 });

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

const placeOrderPublisher = ark.publisher('Application.PlaceOrder');

await placeOrderPublisher.publish(OrderPlaced, { orderId: 'o1', amount: 99 }, {
  eventVersion: '1',
  correlationId: 'corr-1',
});

console.log(await ark.projections.getState('OrderReadModel'));
console.log(await ark.auditTrail.query({ correlationId: 'corr-1' }));
console.log(await ark.outbox.list('pending'));
console.log(ark.observability.report());
console.log(JSON.stringify(ark.manifest().toJSON(), null, 2));
```

See `examples/basic/` for a runnable version.

### Source-bound publishers

Strict kernels still accept direct `eventBus.publish(...)` for compatibility, but the
recommended path is a source-bound publisher:

```ts
const publisher = ark.publisher('Application.PlaceOrder');

await publisher.publish(OrderPlaced, { orderId: 'o1', amount: 99 }, {
  eventVersion: '1',
});
```

The publisher stamps `metadata.source` internally and rejects attempts to override it with
another source. This reduces source spoofing on the governed runtime path; static checks
still help catch suspicious manual source literals in direct publish calls.

## AI-Augmented Development

Ark does not generate code. It gives generated code something concrete to obey.

`createArkManifest().toJSON()` exports the current architectural contract so agents can inspect registered intents, relationships, policies, entities, graph data, layers, event contracts, and projections before editing. `createAICodeGate()` provides fast checks for unknown intents, forbidden patterns, and layer reference violations when paired with `elevenLayerProfile`. Pass the `typescript` module to enable additional AST-backed publish checks without adding a runtime dependency to Ark.

For CI, use `ark-check` with an explicit layer configuration:

```bash
npx ark-check --root . --config ark.config.json
```

To bootstrap `ark.config.json` from your repo's actual directory layout:

```bash
npx ark-check --init
```

Or to start from the full built-in 11-layer profile template:

```bash
npx ark-check --print-config eleven-layer > ark.config.json
```

`ark-check` requires TypeScript to be available in the consuming project. It parses source with the TypeScript AST and resolves imports through the TypeScript module resolver against your `tsconfig.json` — relative, path-alias, package imports, dynamic `import()`, and `require()` — plus string intent references. It also flags raw `publish()` calls, publish calls missing `metadata.source`, and source intent literals whose layer does not match the publishing file. It resolves modules the way your build does, but does not yet perform full type-graph/symbol analysis (e.g. cross-layer *type-only* references beyond the import specifier).

`ark-check --json` includes `warnings` for governance coverage risks such as missing layers, unclassified included files, layer patterns that match no files, and rules that reference unknown layers. These warnings do not fail the check by default; pass `--strict-config` to make them fail CI.

For editor/CI linting, use the optional ESLint subpath:

```js
// eslint.config.js
import ark from 'ark-runtime-kernel/eslint';

export default [
  ark.configs.recommended,
];
```

The bundled rules are intentionally narrow: `ark/no-domain-infra-imports`, `ark/no-raw-event-publish`, and `ark/require-publish-source`.

### AI write-path gate (`ark-mcp`)

`ark-check` and the ESLint plugin catch violations at CI. The write-path gate catches them
one step earlier — at the moment an agent writes a file. It has two integration surfaces
that share the same config and gate.

**1. Pre-write hook (blocks invalid writes).** `ark-mcp --hook` runs one-shot: it reads a
PreToolUse payload from stdin, validates the file content the Write/Edit is about to
produce, and exits `2` with the violations on stderr when the write must be blocked.
Edits are validated against the post-edit file state, not the snippet in isolation.
Working Claude Code configuration (`.claude/settings.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "npx ark-mcp --hook --root \"$CLAUDE_PROJECT_DIR\""
          }
        ]
      }
    ]
  }
}
```

When a write is blocked, the violations are fed back to the model as context, so the agent
fixes the code and retries instead of landing the violation. Non-source files, tools other
than Write/Edit/MultiEdit, files outside `--root`, and malformed payloads are always
allowed through — plumbing problems never block the agent.

**2. MCP server (contract + on-demand validation).** Run without `--hook` and `ark-mcp`
serves JSON-RPC over stdio (zero dependencies):

```bash
npx ark-mcp --root . --config ark.config.json [--manifest ark.manifest.json]
```

- resource `ark://manifest` — the architectural contract (layers + rules, or your project
  manifest) for agents to read before generating code.
- tool `validate_code` — validates a source snippet against the architecture and returns
  `{ valid, violations }` (with `isError` set when invalid).

Register it for a project in `.mcp.json`:

```json
{
  "mcpServers": {
    "ark": { "command": "npx", "args": ["ark-mcp", "--root", ".", "--config", "ark.config.json"] }
  }
}
```

When TypeScript is available in the project, `ark-mcp` uses AICodeGate's AST-backed publish
checks in addition to the lightweight source checks — in both modes.

### Mandatory CI gate

Run `ark-check` in CI so a layer violation blocks the merge (it exits non-zero on any
violation). Ark ships a reference workflow in `.github/workflows/ci.yml` and dogfoods itself
via `ark.config.json`:

```bash
npm run check:architecture   # ark-check --root . --config ark.config.json --strict-config
```

Ark's own config classifies 100% of `src/` (domain, kernel, and tooling layers) and runs with `--strict-config`, so an unclassified file or a rule referencing an unknown layer fails Ark's own CI.

The checker exits non-zero on architecture violations. Configuration warnings are advisory unless `--strict-config` is used:

```bash
npx ark-check --root . --config ark.config.json --strict-config
```

## Design Constraints

- Zero runtime dependencies
- Strict TypeScript
- Explicit wiring over magic
- No experimental decorators
- Works in Node.js and modern bundlers
- Dual ESM + CommonJS output
- Enforcement is deliberate: wire registries, policies, and graphs where boundaries matter
- Static checks require a project-specific `ark.config.json`; files not matched to a configured layer are outside import-boundary enforcement
- ESLint checks are heuristics and complement runtime enforcement; they do not replace `ark-check`

## Documentation

- [Evaluation Report](docs/evaluation-report.md)
- [Improvement Plan](docs/improvement-plan.md)
- [Production Hardening](docs/production-hardening.md)
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
