<div align="center">

# 🏛️ Ark — Architectural Runtime Kernel

**Stop AI agents (and humans) from quietly breaking your architecture.**<br/>
One machine-readable contract — enforced at write time, merge time, and (optionally) runtime.<br/>
Ships a complete 11-layer architecture you can adopt one layer at a time.
Gates **Claude Code, Cursor, and Codex** natively — plus rule files for Windsurf, Cline, Copilot, Kiro, and Gemini CLI.

[![CI](https://github.com/pedroknigge/ark-runtime-kernel/actions/workflows/ci.yml/badge.svg)](https://github.com/pedroknigge/ark-runtime-kernel/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/ark-runtime-kernel?color=cb3837&label=npm)](https://www.npmjs.com/package/ark-runtime-kernel)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-first-3178c6?logo=typescript&logoColor=white)
![Zero deps](https://img.shields.io/badge/dependencies-0-success)

[2-Minute Setup](#2-minute-setup) · [Why Ark](#why-ark-and-not-just-a-linter) · [11 Layers](#batteries-included-the-11-layer-profile-all-optional) · [AI Write Gate](#the-ai-write-gate) · [CI Gate](#ark-check--the-ci-gate) · [Runtime Kernel](#the-runtime-kernel-opt-in) · [Docs](#documentation)

</div>

---

This is what happens when an agent tries to import a persistence adapter into your domain layer with Ark's write gate active:

![An AI agent is blocked from importing a persistence adapter into the domain layer, then self-corrects by defining a port](docs/assets/ark-write-gate.svg)

The agent doesn't just get blocked — it gets the violation as feedback, reads the architecture contract, and **fixes its own approach**. No review round-trip.

## 2-Minute Setup

No code changes. No new runtime. Just a config and a CI line.

```bash
npm install -D ark-runtime-kernel typescript
npx ark init                  # asks before generating config, agent gates, and CI templates
npx ark-check                 # done: cross-layer imports now fail the check
```

`ark init` detects your existing layer directories and suggests the missing ones from
Ark's default 11-layer profile (with their conventional directories), so you see the
full division before deciding what to adopt. On an empty project it generates the
complete profile with every layer optional: the check passes immediately, and each
layer starts being enforced as soon as its directory gains source files. Agents get
the same guidance — the `ark://manifest` resource includes `suggestedLayers`, and the
generated `AGENTS.md` carries the placement table, so an agent asked for a saga or a
background job knows where it belongs before writing it.

Adopting on a codebase that already has violations? Freeze them and ratchet down:

```bash
npx ark-check --update-baseline   # writes .ark-baseline.json — commit it
npx ark-check --baseline          # only NEW violations fail from now on
```

Then gate your agents (Claude Code shown; [Cursor / Codex / others](docs/ai-gates.md)). If you use
Codex in an Ark project, register the MCP server early so `ark://manifest` is available during
generation:

```json
// .claude/settings.json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Write|Edit|MultiEdit",
      "hooks": [{ "type": "command",
        "command": "npx ark-mcp --hook --root \"$CLAUDE_PROJECT_DIR\" --config ark.config.json" }]
    }]
  }
}
```

> The same `ark.config.json` powers every gate.

Or generate the starter agent and CI gate files:

```bash
npx ark-check --install-agent-gates
```

This writes opt-in templates for MCP discovery, Claude/Cursor rules, Codex config notes,
GitHub Actions, and agent instructions. Existing files are skipped unless you pass
`--force`.

The package `postinstall` only prints the next command; it never prompts or writes files
during `npm install`. Use `npx ark init --yes` for non-interactive setup.

### Updating Ark

For projects that already use Ark:

```bash
npm install -D ark-runtime-kernel@latest
npx ark-check --root . --config ark.config.json --strict-config
npm run check:architecture
```

This updates the local `ark`, `ark-check`, and `ark-mcp` binaries used by npm scripts
and CI. `npm run check:architecture` is the recommended alias, but it is optional:
the direct `npx ark-check --root . --config ark.config.json --strict-config` command
is the real check and works even if the alias has not been added yet.

The lockfile controls the version CI gets, so commit the updated `package-lock.json`,
`pnpm-lock.yaml`, or `yarn.lock`.

Generated setup files are intentionally not rewritten during package updates:
`AGENTS.md`, MCP config, Claude/Cursor settings, Codex notes, and GitHub Actions
templates stay under your project's control. To add any new starter templates:

```bash
npx ark-check --install-agent-gates
```

Existing files are skipped. To regenerate them from the latest templates, review
your local changes first, then run:

```bash
npx ark-check --install-agent-gates --force
```

## Why Ark (and not just a linter)?

If you only need import-boundary linting in CI, [dependency-cruiser](https://github.com/sverweij/dependency-cruiser), [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries), and Nx module boundaries are solid tools. Ark's reason to exist is the **write-time, agent-native half** they don't cover:

|                                         | Ark | dependency-cruiser | eslint-plugin-boundaries | Nx boundaries |
|-----------------------------------------|:---:|:---:|:---:|:---:|
| Cross-layer import checks in CI         | ✅ (TS resolver) | ✅ | ✅ | ✅ |
| Blocks AI agents **before** code lands (MCP + hook) | ✅ | ❌ | ❌ | ❌ |
| Machine-readable contract for agents (`ark://manifest`) | ✅ | ❌ | ❌ | ❌ |
| Injects the contract into agent context at session start | ✅ | ❌ | ❌ | ❌ |
| Forbidden ambient globals per layer (`Date.now` in domain, ...) | ✅ | ❌ | ➖ (generic ESLint) | ❌ |
| Event/intent governance (who may publish what) | ✅ | ❌ | ❌ | ❌ |
| Baseline ratchet for existing codebases | ✅ | ❌ | ➖ (via ESLint) | ❌ |
| Optional runtime enforcement            | ✅ | ❌ | ❌ | ❌ |
| Runtime dependencies                    | 0 | many | many | Nx |

**One config. Three enforcement moments:**

| Gate         | Tool          | When it runs                  | What it enforces                              |
|--------------|---------------|-------------------------------|-----------------------------------------------|
| **Write**    | `ark-mcp`     | Agent PreToolUse (Write/Edit) | Layer rules, unknown intents, forbidden patterns + globals |
| **Merge**    | `ark-check`   | CI (GitHub Actions etc.)      | Cross-layer imports + intent references (real TS resolver) + forbidden globals |
| **Runtime**  | `createArkKernel()` | Running process (opt-in) | Intent registry, event contracts, observed layer flow, policies |

## Batteries included: the 11-layer profile (all optional)

You don't have to design a layer model before adopting Ark — it ships a complete,
production-shaped division for Hexagonal + Event-Driven + DDD systems. Every layer is
**optional by design**: on a fresh project the strict check passes immediately, and each
layer starts being enforced the moment its directory gains source files. Adopt two
layers or all eleven; `ark.config.json` is always authoritative and you can rename,
remove, or re-map any of it.

| Layer | Conventional directories | Intent prefixes |
|-------|--------------------------|-----------------|
| DomainModel | `domain/` | `Domain.` |
| ApplicationOrchestration | `application/`, `app/` | `Application.` |
| PersistenceAdapters | `adapters/persistence/`, `repositories/`, ... | `Adapter.Persistence.`, `Adapter.Repository.` |
| IntegrationAdapters | `adapters/integration/`, `integrations/`, ... | `Adapter.Integration.`, `Adapter.External.` |
| WorkflowSagaEngine | `workflows/`, `sagas/` | `Workflow.` |
| BackgroundJobsScheduling | `jobs/`, `schedules/` | `Job.` |
| PresentationAdapters | `presentation/`, `adapters/api/`, ... | `Presentation.`, `Adapter.Api.`, ... |
| ReportingReadModels | `reporting/`, `read-models/`, `projections/` | `Reporting.` |
| ExtensibilityMetadata | `metadata/`, `extensions/` | `Metadata.` |
| SecurityAuditObservability | `security/`, `audit/`, `observability/` | `Security.`, `Audit.`, `Observability.` |
| Kernel | `kernel/` | `Kernel.` |

The default rule matrix is strict-deny: only the classic flows are open
(Presentation→Application, Application→Domain, Workflow→Application/Domain,
Jobs→Application) and everything else is a violation until you allow it explicitly.
The profile isn't just for the linter — agents get it too: `ark://manifest` lists the
layers your project hasn't adopted yet as `suggestedLayers`, so when an agent needs to
create its first saga or background job, it puts it in the conventional place and adds
the layer to the config instead of inventing an ungoverned location.

```bash
npx ark-check --print-config eleven-layer > ark.config.json   # the full profile, ready to edit
```

## The AI Write Gate

`ark-mcp` is a zero-dependency MCP server + one-shot hook:

- **`ark-mcp --hook`** — PreToolUse gate: computes the **post-edit** file content, validates it against your layers, exits 2 with the violations when the write must be blocked. The agent self-corrects.
- **`ark-mcp --session-context`** — SessionStart injection: prints a compact contract summary (layers, forbidden globals, baseline state) into the agent's context, so it knows the architecture from the first token instead of learning by rejection. Silent no-op outside Ark projects, so it can't leak into other repos.
- **`validate_code` tool** — on-demand validation of a snippet, for runtimes without hooks.
- **`ark://manifest` resource** — the architecture as JSON, so agents read the rules *before* generating code.

Copy-paste setups for **Claude Code, Cursor, and OpenAI Codex**, plus instruction-tier
rule files for **Windsurf, Cline, GitHub Copilot, and Kiro** (Gemini CLI reads the
generated `AGENTS.md` directly): [docs/ai-gates.md](docs/ai-gates.md).

## `ark-check` — The CI Gate

```bash
npx ark-check --root . --config ark.config.json --strict-config   # fail on coverage gaps too
npx ark-check --json                                              # machine-readable
npx ark-check --baseline                                          # ratchet mode
```

**What it catches (via real TypeScript module resolution — path aliases included):**

- Import/export violations (relative, aliases, packages, dynamic `import()`, `require`)
- String intent references across forbidden layers
- Raw `publish()` calls that bypass registered intent creators
- Missing / mismatched publish `source` metadata
- Forbidden ambient globals per layer (`fetch`, `Date.now`, `Math.random`, ...) — see below

Violations come with the layer edge, the resolved target, and a fix hint:

```
✖ LAYER_IMPORT_VIOLATION  src/domain/order.ts:3
  DomainModel → PersistenceAdapters  (src/adapters/persistence/pg-order-repository.ts)
  DomainModel must not import PersistenceAdapters.
  fix: Depend on a port/interface owned by an inner layer instead, or move this code.
```

### Domain purity: `forbiddenGlobals`

Import rules can't catch code that reaches for an ambient global — an agent can call
`fetch()` or `Date.now()` in your domain layer without importing anything. Declare the
globals a layer must not touch and both the write gate and CI enforce it:

```jsonc
// ark.config.json
{
  "name": "DomainModel",
  "patterns": ["src/domain/**"],
  "intentPrefixes": ["Domain."],
  "forbiddenGlobals": ["fetch", "process", "Date.now", "Math.random"]
}
```

```
✖ FORBIDDEN_GLOBAL  src/domain/order.ts:12
  DomainModel must not use the ambient global "Date.now".
  fix: Inject the capability through a port (e.g. a Clock, IdGenerator, or HttpPort).
```

Entries are either dotted (`"Date.now"` flags exactly that property access) or bare
(`"console"` flags `console.*`, `fetch(...)`, `new WebSocket(...)`). Detection is
positional, not scope-aware: mentions in types or import names are never flagged.
`npx ark init` seeds the domain layer with `["fetch", "process", "Date.now", "Math.random"]`
(a pure domain does no I/O and is deterministic); add `"console"` or any other global per
project. Violations participate in the `--baseline` ratchet like every other rule.

### GitHub Action

```yaml
- uses: pedroknigge/ark-runtime-kernel@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}   # comments violations on the PR
```

Inputs: `root`, `config`, `strict-config`, `baseline`, `version`.

### ESLint plugin (in-editor feedback)

```js
// eslint.config.js
import ark from 'ark-runtime-kernel/eslint';
export default [ark.configs.recommended];
```

Rules: `ark/no-domain-infra-imports`, `ark/no-raw-event-publish`, `ark/require-publish-source`,
`ark/no-forbidden-globals` (not in `recommended` — scope it to your layer directories):

```js
{
  files: ['src/domain/**'],
  rules: { 'ark/no-forbidden-globals': ['error', { globals: ['fetch', 'process', 'Date.now', 'Math.random'] }] },
}
```

## The Runtime Kernel (opt-in)

The gates above need **zero changes to your code**. When you also want *runtime* guarantees — registered intents only, payload contracts, observed producer→event layer flows — route your events through the kernel:

```ts
import { createArkKernel } from 'ark-runtime-kernel';

const ark = createArkKernel(); // strict defaults

const OrderPlaced = ark.registry.define<
  'Domain.Order.OrderPlaced',
  { orderId: string; amount: number }
>('Domain.Order.OrderPlaced');

ark.registry.define<'Application.PlaceOrder', { orderId: string }>(
  'Application.PlaceOrder',
  { produces: ['Domain.Order.OrderPlaced'] }
);

// Payload contracts: Ark's own schema format, or any Standard Schema
// validator (zod, valibot, arktype) via `standardSchema`.
ark.eventContracts.register({
  intent: 'Domain.Order.OrderPlaced',
  version: '1',
  allowAdditionalFields: false,
  schema: {
    orderId: { type: 'string', required: true },
    amount: { type: 'number', required: true },
  },
});

ark.projections.register({
  name: 'OrderIds',
  sourceIntents: ['Domain.Order.OrderPlaced'],
  initialState: { ids: [] as string[] },
  project: (event, state) => ({ ids: [...state.ids, event.payload.orderId as string] }),
});

const publisher = ark.publisher('Application.PlaceOrder');
await publisher.publish(OrderPlaced, { orderId: 'o1', amount: 129 }, { eventVersion: '1' });

ark.manifest().toJSON(); // the complete machine-readable contract
```

What it gives you: intent registry with produces/dependsOn, strict event bus (registered intents only, known sources), event contracts, hard/soft policies, observed layer-flow enforcement (`'hard' | 'soft' | 'off'`), projections, observability/drift reports, and pluggable audit/outbox/workflow interfaces (in-memory defaults — see [production hardening](docs/production-hardening.md)).

**Honest scope:** runtime enforcement covers governed paths only — what you route through Ark. Everything else is covered by the static gates.

### NestJS

```ts
import { ArkModule, InjectArk } from 'ark-runtime-kernel/nestjs';
import type { ArkKernel } from 'ark-runtime-kernel';

@Module({ imports: [ArkModule.forRoot()] })
export class AppModule {}

@Injectable()
export class PlaceOrderService {
  constructor(@InjectArk() private readonly ark: ArkKernel) {}
}
```

`@nestjs/common` is an optional peer dependency — the core stays zero-dependency.

## Documentation

- [AI Gates](docs/ai-gates.md) — copy-paste setups for Claude Code, Cursor, Codex, and any hook-capable runtime
- [Agent Integration Guide](docs/agent-guide.md) — manifest discovery and validation flows for agents
- [Production Hardening](docs/production-hardening.md) — durable store interfaces (`AuditStore`, `OutboxStore`, …)
- [Example Config](docs/ark-check-example.json) — a hand-curated `ark.config.json`
- [Runnable Examples](examples/) — including `examples/hexagonal-order-api/`, a full hexagonal API you can break on purpose
- [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

## Development

```bash
npm ci
npm run build              # ark-mcp loads dist/
npx vitest run
npm run typecheck
npm run check:architecture # Ark gates itself in CI
```

Release: `npm run release:npm` (verifies typecheck + tests + architecture gate, then publishes; `-- --dry` for a dry run).

## License

MIT © Pedro Knigge

---

**Ark doesn't generate architecture. It protects the architecture you already have — at the exact moments it matters most.**
