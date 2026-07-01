# Ark — Architectural Runtime Kernel

**Zero-dependency governance kernel for Hexagonal + Event-Driven + DDD systems.**

Ark provides **intent naming**, **policy enforcement**, **event bus observability**, **dependency graphs**, and **agent-oriented contract export**. It helps teams (and AI codegen tools) keep architecture explicit and enforceable — it does **not** implement CQRS read/write models or a full hexagonal runtime.

> **Current Status:** v0.2 governance kernel — production-usable with strict registry wiring; not a CQRS framework or full hexagonal runtime.

## Philosophy

- Ruthless simplicity
- No runtime dependencies
- Types first + runtime guards when `strictRegistry` is enabled
- Explicit over magical (no experimental decorators)
- Opt-in enforcement — policies and registry must be wired deliberately

## What Ark Is / Is Not

| Ark provides | Ark does not provide |
|--------------|---------------------|
| Semantic intent registry + naming validation | CQRS command/query buses or read models |
| Hard/soft policy engine on event publish | Automatic hexagonal layer isolation without wiring |
| Event bus with history, traces, strict registry mode | AST-based static analysis (use `AIGateExtension` plugins) |
| Dependency graph + manifest export for agents | Distributed sagas or persistence |

## Installation

```bash
npm install ark
```

## Quick Start — Strict Enforcement Example

Use an isolated `IntentRegistry` (not the global `defineIntent` singleton) and pass it to the bus so layer policies and registry validation actually work:

```ts
import {
  createIntentRegistry,
  createEventBus,
  definePolicy,
  createDependencyGraph,
  syncRegistryToGraph,
  createArkManifest,
  architecturalPolicies,
} from 'ark';

const registry = createIntentRegistry();
const OrderPlaced = registry.define<
  'Domain.Order.OrderPlaced',
  { orderId: string; amount: number }
>('Domain.Order.OrderPlaced');

const graph = createDependencyGraph();
syncRegistryToGraph(registry, graph);

const bus = createEventBus({
  intentRegistry: registry,       // enables strictRegistry (default: true)
  dependencyGraph: graph,           // required for layer policies to inspect edges
  maxHistorySize: 500,
  policies: [
    definePolicy({
      name: 'Positive amounts',
      severity: 'hard',
      check: (ctx: { event: { payload: { amount: number } } }) =>
        ctx.event.payload.amount >= 0,
    }),
    architecturalPolicies.cleanArchitectureMatrix(),
  ],
});

bus.subscribe(OrderPlaced, (e) => console.log('Placed:', e.payload.orderId));

// Three-arg publish: creator + payload + metadata
await bus.publish(OrderPlaced, { orderId: 'o1', amount: 99 }, { source: 'App.Orders' });

const manifest = createArkManifest({ registry, graph });
console.log(JSON.stringify(manifest.toJSON(), null, 2));
```

See `examples/basic/` for a runnable version.

**Documentation:**
- [Evaluation Report](docs/evaluation-report.md)
- [Improvement Plan](docs/improvement-plan.md)
- [Agent Integration Guide](docs/agent-guide.md)
- [Final Summary](docs/final-summary.md)

## AI Code Gate (Heuristic)

`createAICodeGate()` performs **regex and string-literal scanning** — not semantic analysis. Treat it as a fast pre-merge heuristic; plug in `AIGateExtension` implementations for AST-level checks in CI.

## Why Ark?

Modern enterprise systems suffer from architecture drift, especially when AI helps write code.

Ark provides a **governance kernel** that:

- Gives every important concept a semantic name (Intent)
- Lets you declare hard and soft architectural policies
- Makes Domain Events the primary communication mechanism with full history
- Builds dependency + event flow graphs (Mermaid + JSON)
- Exports a machine-readable manifest for AI agents
- Validates generated code heuristically before merge

## Design Constraints

- **Zero runtime dependencies**
- Works in Node.js and bundlers (Vite, esbuild, etc.)
- Strict TypeScript
- Dual ESM + CommonJS output
- Enforcement is opt-in but hard to bypass when `strictRegistry` + policies are wired

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

`package.json` in the repo is the dev manifest. `npm pack` strips devDependencies for the published tarball only.

## License

MIT

---

**Built to protect architecture — not to replace your domain logic.**
