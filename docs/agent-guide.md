# ArkGate — Agent Integration Guide

**ArkGate** (`arkgate`) — architecture co-pilot for AI TypeScript. This guide describes how AI
agents and codegen tools safely interact with the write gate, MCP tools, and `/ark-*` skills.

CLI names: prefer **`arkgate` / `arkgate-check` / `arkgate-mcp`**; aliases `ark` / `ark-check` /
`ark-mcp` still work for one major. TypeScript **5.x / 6.x / 7.x** as the project compiler:
see [typescript-support.md](typescript-support.md).

## Architecture playbook and `ark-check --recommend`

Before generating project structure, agents should read the **tool-agnostic application
shape** that fits the repository — not a vendor stack label. Ark ships a versioned playbook
at `templates/architecture-playbook.json` (also in the npm package under `templates/`).

Each of the ten archetypes (`crud-product`, `api-backend`, `frontend-surface`,
`library-sdk`, `cli-utility`, `worker-pipeline`, `event-coordinator`,
`integration-bridge`, `multi-app-workspace`, `prototype-spike`) maps to:

- a named Ark preset (`hexagonal`, `layered`, `feature-sliced`, or `monorepo`),
- phased 11-layer adoption (phase 1–3),
- plain-language analogy and anti-patterns,
- optional book references for depth only.

Scoring is **deterministic**: repo shape signals (workspaces, UI dirs, API surface,
persistence, jobs, workflows, CLI `bin`, source-file count, …) are matched against the
playbook. Framework packages may appear as secondary `toolHints` in JSON output — never as
the primary archetype id.

All playbook labels, analogies, anti-patterns, and `--recommend` prose are **English**
(`locale: "en"` in the playbook). Agents should present them as-is unless a future locale
pack is explicitly loaded.

### Terminal

```bash
npx ark-check --recommend
npx ark-check --recommend --json
```

`--recommend` does not require `ark.config.json`. It exits `0` and prints a progressive
adoption plan: archetype id, preset, `confidence`, `runnerUp`, `why` (shape signals),
`adoptInOrder.phase1`, `firstCommand` (`ark init --archetype …`), and `checkCommand`.

Human output highlights phase-1 layers and the analogy; JSON is the stable contract for
MCP `ark_recommend` and the `/ark-architect` skill.

### Terminal onboarding (Phase B)

```bash
npx ark init --archetype crud-product --yes   # non-interactive: shape → preset → gates → strict check
npx ark init                                    # TTY wizard: pick application shape (1–8), not a framework
npx ark-check --doctor                          # includes "New here?" when coverage is low or config is fresh
npx ark-check --report beginner.html --beginner # simplified HTML for enthusiasts
npx ark-check --watch                           # debounced re-check when governed files change
```

`ark init --archetype <id>` maps playbook ids to named presets (`hexagonal`, `layered`,
`feature-sliced`, `monorepo`). With `--yes` and no archetype, Ark auto-selects from
`--recommend` scoring.

`ark-check --json` violations include enthusiast-oriented fields when present:
`fixClass` (e.g. `port-inversion`, `file-move`), `effort` (`small` | `medium`), and
`enthusiastHint` (plain English). `--doctor --json` exposes `doctor.newHere` with
`recommendCommand` and `initCommand` when the nudge applies.

### Deploy-path quality (lint/types before the host build)

Some frameworks run **ESLint and/or typecheck inside the production build** (Next.js by
default: “Linting and checking validity of types”). Architecture can be green while the
**deploy host** is the first place a `no-explicit-any` or unused-import error appears.

Ark does **not** reimplement general ESLint rules. `--doctor` / adoption gaps **do**
detect, for **any** consumer repo (framework signals only — deps, scripts, CI files):

| Gap id | When |
|--------|------|
| `deploy-path-lint-script-missing` | Build embeds ESLint; no `lint` / `eslint` script |
| `deploy-path-lint-not-in-ci` | Lint script exists; CI workflows never run it |
| `deploy-path-lint-no-ci` | Build embeds ESLint; no CI workflows at all |
| `deploy-path-typecheck-script-missing` | Build typechecks; no `typecheck` script |
| `deploy-path-typecheck-not-in-ci` | Typecheck script exists; CI never runs it |

Respects `eslint.ignoreDuringBuilds: true` in `next.config.*`. Recommended pre-merge
order (universal): `lint` → `typecheck` → `arkgate-check` / `check:architecture` → `build`.

### Empty scope, include roots, and contract adopt

When `include` matches **zero** TS/JS files, plan/doctor treat that as **not done**
(`goal.emptyScope`, adoption gap `empty-scope`) — never “clean architecture.”

```bash
npx ark-check --suggest-include --json    # workspaces + nested package.json+TS roots
npx ark-check --adopt-contract --write  # expand include + UI patterns (no rule weakening)
npx ark-check --coverage
```

Polyglot repos: Ark only governs TypeScript/JS. Point include at package roots that have sources.

### Presets

- `hexagonal` / `layered` / `feature-sliced` / `monorepo` / **`ui-surface`** (UI/Vite/Remotion-style hooks+lib+routes+components)

### Cycle policy

```json
{ "cyclePolicy": "strict" }
```

- `strict` (default): value cycles fail the check  
- `soft` / `framework-soft`: value cycles are **warnings** only  
- `off`: skip cycle detection  

Type-only edges never form cycles (codegen-safe).

### Generated files and type-only cycles

By default Ark **does not scan** common codegen paths:

- `**/*.gen.ts`, `**/*.gen.tsx`
- `**/*.generated.ts`, `**/*.generated.tsx`

Override with `"excludeGenerated": false` or extend with top-level `"exclude": ["**/vendor/**"]`
in `ark.config.json`.

**Circular dependencies** are computed on **value/runtime** import edges only. A cycle
closed solely by `import type` (common with generated route trees) is **not** reported as
`CIRCULAR_DEPENDENCY`. Value cycles still fail.

### MCP `ark_recommend` and `/ark-architect` (Phase C)

The `ark-mcp` server exposes **`ark_recommend`** — same JSON as
`ark-check --recommend --json`. Call it (or invoke `/ark-architect`) before
generating project structure on greenfield or early-adoption repos.

`ark-mcp --session-context` appends a one-line enthusiast hint when governed
coverage is low or the config is fresh:

```
New to Ark? Run /ark-architect or: ark-check --recommend
```

The `/ark-architect` skill ships in `templates/skills/ark-architect.md` and installs
via `ark-check --install-agent-gates`.

### Adoption plan artifact (Phase E)

```bash
npx ark-check --recommend --write-plan
# writes ark-adoption-plan.json (optional commit; never weakens the gate)
```

Includes `archetype`, `preset`, `adoptInOrder`, `galleryStarter`, and suggested
`policyPack` (`enthusiast-<preset>`).

### Enthusiast policy packs (Phase E)

```bash
npx ark-check --list-policy-packs
npx ark-check --apply-policy-pack enthusiast-hexagonal   # or layered, feature-sliced, monorepo
```

Packs delegate to the same preset factories as `ark init --preset`; layer
descriptions are shorter enthusiast copy. Metadata: `templates/policy-packs/`.

### Enthusiast documentation track

Diátaxis pages under [docs/enthusiast/](enthusiast/README.md) — tutorial, how-to,
reference, and explanation for the full path (recommend → init → gallery → gates → verify).

### Agent workflow (before codegen)

1. Run `ark-check --recommend --json` or MCP `ark_recommend`.
2. Read `archetype`, `preset`, and `adoptInOrder.phase1` — scaffold only those directories first.
3. Run `ark init --archetype <id> --yes`, `--apply-policy-pack enthusiast-<preset>`, or `ark init --preset <preset> --yes` when no `ark.config.json` exists.
4. Optional: `--write-plan` for `ark-adoption-plan.json`; copy a gallery starter from `examples/README.md`.
5. Use `/ark-place` or `ark_place` for individual files after the contract exists.
6. Verify with `ark-check --root . --config ark.config.json --strict-config`.

Do not invent layers outside the 11-layer profile or named presets. Unrecognized
directories (`utils/`, `lib/`) must be classified explicitly via `/ark-contract`.

**Brownfield** (existing messy repo): use `/ark-adopt` and [brownfield-adoption.md](brownfield-adoption.md), not `/ark-architect`.

## Supported agent hosts

Wire write-gate + MCP + `/ark-*` skills with:

```bash
npx arkgate-check --install-agent-gates --tools claude,cursor,codex,grok
# alias: npx ark-check --install-agent-gates --tools claude,cursor,codex,grok
```

| Host | Write gate | MCP | Skills path |
|------|------------|-----|-------------|
| Claude Code | PreToolUse hook | `.mcp.json` / `claude mcp add` | `.claude/skills/<name>/SKILL.md` |
| Cursor | Advisory (rules + MCP) | `.cursor/mcp.json` | `.cursor/commands/` |
| OpenAI Codex | MCP + CI | `~/.codex/config.toml` | `$CODEX_HOME/prompts` (`--codex-home`) |
| **Grok Build** | PreToolUse hook (`.grok/hooks/`) | `.grok/config.toml` + `.mcp.json` | `.grok/skills/<name>/SKILL.md` |

Full copy-paste setups: [ai-gates.md](ai-gates.md). Skill inventory: main [README](../README.md#agent-skills-ark-).

## Contract Discovery

Prefer `createStrictArkKernel()` for strict projects. It wires the registry, graph,
policies, event bus, audit trail, event contracts, outbox, observability,
projections, metadata, workflow engine, and 11-layer architecture profile:

```ts
import {
  createStrictArkKernel,
} from 'arkgate';

const ark = createStrictArkKernel();
// ... define intents, event contracts, metadata, projections, and workflows through ark.*

const contract = ark.manifest().toJSON();
// contract.intents, policies, entities, graph, architecture, eventContracts,
// contract.observability, projections
```

Agents should read `contract` and `ark.observability.report()` before generating or modifying code.

## Naming Conventions

| Prefix | Layer | Example |
|--------|-------|---------|
| `Domain.*` | Domain events & entities | `Domain.Order.OrderPlaced` |
| `Application.*` | Use cases / orchestration | `Application.PlaceOrder` |
| `Adapter.Persistence.*` | Persistence adapters | `Adapter.Persistence.OrderRepo` |
| `Adapter.Integration.*` | External integrations | `Adapter.Integration.PaymentGateway.Charge` |
| `Workflow.*` | Sagas / long-running processes | `Workflow.OrderFulfillment` |
| `Job.*` | Background jobs / scheduling | `Job.InventoryRebuild` |
| `Presentation.*` | UI/API adapters | `Presentation.Api.PlaceOrder` |
| `Reporting.*` | Read models / projections | `Reporting.OrderSummary` |
| `Metadata.*` | Metadata and extension contracts | `Metadata.OrderSchema` |
| `Security.*`, `Audit.*`, `Observability.*` | Cross-cutting concerns | `Audit.OrderHistory` |
| `Kernel.*` | Ark-owned governance signals | `Kernel.PolicyViolation` |

Declare relationships at definition time:

```ts
registry.define('Application.PlaceOrder', {
  dependsOn: ['Domain.Order.OrderPlaced'],
  produces: ['Domain.Order.OrderPlaced'],
});
```

Strict kernels also enforce the **observed** producer→event layer flow at publish time
(`enforceObservedLayerFlow: 'hard'` by default). If a published event's real source and
intent cross a forbidden layer boundary — e.g. a `Adapter.Persistence.*` source producing
a `Domain.*` event — the publish throws `ObservedLayerFlowViolationError` before the event
reaches history, outbox, or subscribers. Use `'soft'` to record `layer.observedViolation`
trace/audit records without blocking, or `'off'` to disable. Agents should name the event's
`source` honestly: it is checked against the layer matrix, not just the intent name.

Strict kernels also require published events to have a registered source intent
and a matching event contract:

```ts
const OrderPlaced = registry.define<
  'Domain.Order.OrderPlaced',
  { orderId: string; amount: number }
>('Domain.Order.OrderPlaced');

registry.define('Application.PlaceOrder', {
  produces: ['Domain.Order.OrderPlaced'],
});

ark.eventContracts.register({
  intent: 'Domain.Order.OrderPlaced',
  version: '1',
  allowAdditionalFields: false,
  schema: {
    orderId: { type: 'string', required: true },
    amount: { type: 'number', required: true },
  },
});

const publisher = ark.publisher('Application.PlaceOrder');

await publisher.publish(OrderPlaced, { orderId: 'o1', amount: 99 }, {
  eventVersion: '1',
});
```

Agents should prefer `ark.publisher(sourceIntent).publish(...)` over direct
`eventBus.publish(...)`. Source-bound publishers stamp `metadata.source` internally and
reject attempts to override it with a different source.

Interceptors may enrich event payloads, but they must remain add-only:

```ts
ark.eventBus.registerInterceptor(OrderPlaced, ({ intercept }) => {
  intercept({ auditTag: 'checkout' });
}, 'audit-tag');
```

If an interceptor overwrites an existing field or violates the registered event
contract, Ark records `interceptor.error` and keeps delivering the original event.

## Code Generation Validation

Use `createAICodeGate()` before merging agent-generated source snippets:

```ts
import * as ts from 'typescript';

const gate = createAICodeGate({
  intents: registry.list(),
  enforceIntentAllowlist: true,
  architectureProfile: elevenLayerProfile,
  typescript: ts,
  extensions: [/* optional external AST analyzers implementing AIGateExtension */],
});

const result = gate.validate(generatedSource, {
  filePath: 'src/domain/order.ts',
  agentId: 'agent-1',
  layer: 'DomainModel',
});
if (!result.valid) {
  for (const v of result.violations) {
    console.log(v.code, v.message, v.suggestion);
  }
}
```

Passing the `typescript` module enables built-in AST checks for raw publish calls, missing
`metadata.source`, and source-layer mismatches. `ark-mcp` enables these checks
automatically when TypeScript is available.

Violation codes (from `createAICodeGate`): `RAW_EVENT_PUBLISH`, `PUBLISH_MISSING_SOURCE`, `PUBLISH_SOURCE_LAYER_MISMATCH`, `FORBIDDEN_PATTERN`, `FORBIDDEN_SUBSTRING`, `FORBIDDEN_IMPORT`, `POLICY_VIOLATION`, `UNKNOWN_INTENT`, `LAYER_REFERENCE_VIOLATION`, `EXTENSION_ERROR`, `AST_ANALYZER_ERROR`.

Use `ark-check` in CI for repository-level checks that need real file paths:

```bash
npx ark-check --root . --config ark.config.json
```

Agents can generate a config from the project's actual directory layout instead of inventing layer mappings:

```bash
npx ark-check --init
```

Or print the full 11-layer template to adapt manually:

```bash
npx ark-check --print-config eleven-layer
```

Example config:

```json
{
  "include": ["src"],
  "layers": [
    {
      "name": "DomainModel",
      "patterns": ["src/domain/**"],
      "intentPrefixes": ["Domain."]
    },
    {
      "name": "PersistenceAdapters",
      "patterns": ["src/adapters/persistence/**"],
      "intentPrefixes": ["Adapter.Persistence."]
    },
    {
      "name": "ApplicationOrchestration",
      "patterns": ["src/application/**"],
      "intentPrefixes": ["Application."]
    }
  ],
  "rules": [
    {
      "from": "DomainModel",
      "to": "PersistenceAdapters",
      "allowed": false
    }
  ]
}
```

`ark-check` resolves imports through the TypeScript module resolver against your
`tsconfig.json` — relative, path-alias (e.g. `@infra/db`), package imports, dynamic
`import()`, and `require()` — plus string intent references. It also flags raw
`publish()` calls, publish calls without `metadata.source`, and source intent literals
whose resolved layer differs from the publishing file layer. Pass `--tsconfig <path>` to force one config
for every file; otherwise each source file uses the nearest `tsconfig.json` above it (like
`tsc`), so monorepos with per-package alias maps work under a single `--root`. It resolves
modules the way your build does, but is intentionally not yet a full type-graph analyzer
(cross-layer type-only references beyond the import specifier are out of scope).

Repeat runs are cached in `node_modules/.cache/ark-check.json` — unchanged files skip the
parse, while import edges always re-resolve against the live filesystem so the cache can
never hide a new violation. `--no-cache` disables it.

`ark-check --json` also reports `warnings` for incomplete governance coverage: missing
layers, unclassified included files, unmatched layer patterns, duplicate layers, and rules
that reference unknown layers. These are advisory by default. Use `--strict-config` once a
project is ready to fail CI on coverage gaps.

Use the optional ESLint plugin for fast local feedback aligned with CI:

```js
import ark from 'arkgate/eslint';

export default [
  ark.configs.recommended,
];
```

Rules: `ark/no-domain-infra-imports` (layer edges from `ark.config.json`, same semantics as
`arkgate-check`), `ark/no-forbidden-globals` (per-layer `forbiddenGlobals`),
`ark/no-raw-event-publish`, and `ark/require-publish-source`. See [ai-gates.md](ai-gates.md).

## Runtime Observability

The event bus exposes a standard trace format:

```ts
const bus = createEventBus({
  maxHistorySize: 1000,
  auditTrail,
  traceSinks: [(record) => otelBridge(record)],
  onSoftViolation: (result, event) => { /* advisory policies */ },
  onHandlerError: (err, event, intent) => { /* subscriber failures */ },
});

await bus.publish(intent, payload);
const trace = bus.getTrace();
// trace[].type includes 'event.published', 'event.rawPublish', 'event.intercepted',
// 'interceptor.error', 'policy.hardViolation', 'policy.softViolation', 'handler.error'
```

Native audit records are available through `auditTrail.query()`. Projection
state and checkpoints are available through `ProjectionRegistry`.

`ark.observability.report()` compares declared productions with observed runtime
flows. Use `observedButUndeclared` as a high-signal review queue for hidden coupling.

For tests, use `createArkTestHarness(ark)` to inspect events, traces, audit,
outbox, and observability snapshots without reaching into private internals.

## Extension Points (External Layers)

Implement these interfaces in **external** packages — not inside the Ark core:

| Interface | Purpose |
|-----------|---------|
| `AIGateExtension` | Plug in AST/semantic analyzers for codegen validation |
| `Policy` | Custom architectural rules via `definePolicy()` |
| `LayerFlowRule` | Layer isolation via `defineLayerPolicy()` |
| `WorkflowStore` | Persist workflow snapshots outside memory |
| `ReadModelStore` | Persist projection/read-model state outside memory |
| `AuditStore` | Persist audit records outside memory |
| `OutboxStore` | Persist event outbox records outside memory |
| `EventInterceptor` | Add-only event enrichment before delivery |

## Ports and Adapters

When generating adapter code, prefer ports with explicit ownership and allowlists:

```ts
const PaymentGateway = definePort<PaymentGatewayPort>('PaymentGateway', {
  ownerLayer: 'ApplicationOrchestration',
  intent: 'Application.Port.PaymentGateway',
  allowedAdapters: ['Adapter.Integration.StripePaymentGateway'],
});

createAdapter(PaymentGateway, stripeAdapter, {
  name: 'Adapter.Integration.StripePaymentGateway',
  layer: 'IntegrationAdapters',
  requiredKeys: ['charge'],
});
```

`createAdapter` rejects adapter names/intents not listed in `allowedAdapters`; use
`checkAdapterGovernance(adapter)` when a tool needs a non-throwing result.

Preset: `elevenLayerProfile` plus `defineArchitectureProfilePolicy()` forbids invalid declared dependencies across the 11-layer profile. `architecturalPolicies.cleanArchitectureMatrix()` remains available for the older four-prefix model.

Runtime support depth varies by design. Layers with dedicated kernel modules:
DomainModel/ApplicationOrchestration (intents, policies), WorkflowSagaEngine
(workflow engine), PersistenceAdapters (adapters, outbox), ReportingReadModels
(projections), ExtensibilityMetadata (metadata registry), SecurityAuditObservability
(audit trail, drift reporter), Kernel (event bus, graph, manifest).
PresentationAdapters, IntegrationAdapters, and BackgroundJobsScheduling are
**boundary-only on purpose**: Ark governs what they may import and publish, but does
not replace your web framework, HTTP clients, or job scheduler.

## Write-Path Gate (MCP)

The strongest place to constrain an AI agent is the moment it writes a file, not after.
`arkgate-mcp` / `ark-mcp` exposes ArkGate over MCP (JSON-RPC over stdio; gate host needs a
JS-API TypeScript — nested or project) so a host can gate
the write path:

```bash
npx ark-mcp --root . --config ark.config.json [--manifest ark.manifest.json]
```

- **Resource `ark://manifest`** — contract discovery. Serve your exported
  `ark.manifest().toJSON()` via `--manifest`, or omit it to get the 11-layer profile
  (layers + rules) as the default contract.
- **Tool `ark_recommend`** — no args. Returns the deterministic application-shape plan
  (archetype, preset, phased adoption, analogy). Same as `ark-check --recommend --json`.
- **Tool `validate_code`** — args `{ source, layer?, filePath? }`. Runs `createAICodeGate`
  against the profile and (when a manifest is provided) the registered intent allowlist.
  Returns `{ valid, violations, layer }`; `isError` is `true` when invalid. If `layer` is
  omitted it is inferred from `filePath` via the config's layer patterns.

For hook-based enforcement, `ark-mcp --hook` runs one-shot: it reads a PreToolUse payload
from stdin, validates the post-edit file content, and exits `2` with violations on stderr
to block the write (`0` to allow). Working Claude Code configuration
(`.claude/settings.json`):

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

Register the server itself in `.mcp.json` so the agent can read `ark://manifest` and call
`validate_code` on demand:

```json
{
  "mcpServers": {
    "ark": { "command": "npx", "args": ["ark-mcp", "--root", ".", "--config", "ark.config.json"] }
  }
}
```

This makes the manifest + AI gate an enforced checkpoint rather than a library the agent
must remember to call.

## Recommended Agent Workflow

1. **Read** manifest via `ark.manifest().toJSON()`
2. **Generate** code using registered intents, profiles, metadata, projections, and workflow definitions
3. **Validate snippets** with `createAICodeGate().validate(source, { layer })`
4. **Validate repository** with `ark-check --root . --config ark.config.json`
5. **Lint** with `arkgate/eslint` recommended rules
6. **Wire** relationships via `registry.define(..., { dependsOn, produces })`
7. **Register** event contracts before publishing in strict mode
8. **Observe** runtime via `bus.getTrace()`, `auditTrail.query()`, outbox records, projection checkpoints, and `ark.observability.report()`
