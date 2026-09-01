<div align="center">

# ArkGate — Write. Check. Ship.

**When the agent writes a bad import, the write doesn’t land. The same check fails the pull request.**

Not an API Gateway. Not a folder linter. If the check is not required on the PR, the config
is just documentation.

AI can build fast—and make a mess just as fast.

Keep the product easy to understand, change, and trust.

ArkGate stops bad shortcuts. ArkRules protects how each part should behave. ArkRun keeps work moving. ArkOrder protects the few big choices that should not change by accident.

Safer changes, fewer surprises, and extra protection only when you choose it.

Works with Cursor, Claude, Codex, and Grok.

[![Website](https://img.shields.io/badge/website-arkgate.online-0a0a0a)](https://www.arkgate.online/)
[![CI](https://github.com/pedroknigge/arkgate/actions/workflows/ci.yml/badge.svg)](https://github.com/pedroknigge/arkgate/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/arkgate?color=cb3837&label=npm)](https://www.npmjs.com/package/arkgate)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js)
![TS 5–7](https://img.shields.io/badge/TypeScript-5%20%7C%206%20%7C%207-3178c6?logo=typescript)

```text
  ┌─────────┐     ┌─────────┐     ┌─────────┐
  │  WRITE  │────▶│  CHECK  │────▶│  SHIP   │
  │  agent  │     │  block  │     │  merge  │
  └─────────┘     └────┬────┘     └─────────┘
                       │
                       ▼
                 bad import
                 doesn't land
```

</div>

> **ArkGate 4.8.5** is on npm `latest`. This tree is **4.8.6** (prepared patch; not published).
> Write. Check. Ship. Adopted = required GitHub
> status running `arkgate-check --strict-merge`, or an explicit `advisory-only` stance.
> Status is compact (`arkgate-check --doctor`; `--all` for Details). Optional **ArkRun**
> (`arkgate/runtime`) is an in-memory runtime — not Postgres. Optional **ArkOrder**
> (`arkgate/order`) stops the agent rewriting the few slow product decisions as CRUD;
> later pattern change is `proposeRelease` then `apply`.
> `@arkgate/runtime` is deprecated.
> [4.8.6](docs/releases/4.8.6.md) · [4.8.5](docs/releases/4.8.5.md) · [4.8.4](docs/releases/4.8.4.md) · [4.8.3](docs/releases/4.8.3.md) · [4.8.2](docs/releases/4.8.2.md) · [4.8.1](docs/releases/4.8.1.md) · [4.8.0](docs/releases/4.8.0.md) · [Docs hub](docs/README.md) · [Voice](docs/product-voice.md)

---

## Choose your path

| You are… | Go here |
|----------|---------|
| **Anyone** (ship with AI, minimal jargon) | **[Use ArkGate](docs/use.md)** |
| **Developer** (hosts, CI, config, brownfield) | **[Develop with ArkGate](docs/develop.md)** |
| **Contributor** (improve this library) | **[CONTRIBUTING](CONTRIBUTING.md)** |

Full map: **[docs/README.md](docs/README.md)**

---

## Start in one minute

```bash
npm install -D arkgate typescript
npx arkgate start                 # preview files + commands
npx arkgate start --apply         # compact config + host router + CI plan
npx arkgate-check --doctor        # status — one next step
npx arkgate-check --doctor --all  # full details
```

That is the product. Stuck? Run status (`--doctor`) and do action **#1**.

```text
start → doctor → new files in the right folder
              ↘ leftover mess: map, then one small refactor
```

Keep the rules file out of product PRs. Local check:
`ark-check --changed --base origin/dev`. Changing the rules themselves uses `--contract-session`.

Aliases `ark` / `ark-check` / `ark-mcp` still work. npm / pnpm / yarn. No install lifecycle scripts
— and none on pack or prepare either, so `pnpm add git+https://github.com/pedroknigge/arkgate`
installs at a pinned commit with no `allowBuilds` entry. A git install gives you the CLIs and the
schemas; the library, MCP and ESLint entry points live in the built `dist/` and come from npm.
See [docs/package-surface.md](docs/package-surface.md#installing-from-git).

![Write gate: agent blocked, then self-corrects](docs/assets/ark-write-gate.svg)

---

## What it is

```text
  src/domain/order.ts
       │  import { db } from "../infra/postgres"
       ▼
  ┌──────────────────────────────────────────┐
  │  CHECK                                   │
  │  Domain ─✕─▶ Infrastructure              │
  │  write doesn't land · PR check fails     │
  └──────────────────────────────────────────┘
```

When the agent writes a bad import, the write doesn’t land.
The same check fails the pull request. That is **ArkGate** — import rules, always on
once you adopt. The other three are optional.

| | Role | When |
|--|------|------|
| **While the agent writes** | The write doesn’t land on supported hosts; warning only elsewhere | Always (ArkGate) |
| **Before merge** | `arkgate-check` as a **required** CI status | Always (ArkGate) |
| **ArkRules** | Optional policies *inside* a layer | When you ask |
| **ArkRun** | Optional experimental runtime (`arkgate/runtime`) | Off unless you turn it on |
| **ArkOrder** | Stops the agent rewriting the few slow product decisions as CRUD (`arkgate/order`). Valve: first `release()`, later ξ is `proposeRelease` then `apply` | Off unless you turn it on |

Layers (who may import whom) always run. ArkRules, ArkRun, and ArkOrder change no
inter-layer verdict when absent. Label leftovers **`[Layer]`** vs **`[ArkRules]`** vs
**`[ArkRun]`** vs **`[ArkOrder]`**.
Details: [configuration](docs/configuration.md) · [use](docs/use.md).

**Not** an API Gateway, a folder linter, a web framework, ORM, or job runner.
ArkRun is in-memory — local and tests, not Postgres. ArkOrder does not replace
import rules: layers can be green while the agent still PATCHes the billing plan
like a seat count.

**Name note:** npm package `arkgate` — not affiliated with the separate Archgate CLI project.

### When not to adopt

ArkGate is overkill for small trees with **no AI agents** and **no multi-layer boundaries**, for
single-developer hobby CRUDs under no integration pressure, and for teams that will not maintain
`ark.config.json` or a **required** CI status running `arkgate-check --strict-merge`. Without that
status the rules file is just documentation — stay with a boundary linter alone (see
[Why not only ESLint / Nx / cruiser?](#why-not-only-eslint--nx--cruiser)).
Anyone path: [docs/use.md — When not to adopt](docs/use.md#when-not-to-adopt). Limits of a green
check: [4.3.0 — What ArkGate is / isn't](docs/releases/4.3.0.md#what-arkgate-is--isnt).

---

## Why it exists

AI coding agents generate code at unprecedented speeds. However, they tend to take the shortest path to solve a problem. If an agent needs data in a Domain layer, it might directly import a database adapter. Left unchecked, this creates spaghetti code and technical debt at light speed.

Traditional linters catch these architectural violations in CI *after* the agent has finished its work, breaking the flow.

ArkGate solves this by shifting the check to the exact moment of writing:

1. **Fail fast at the write boundary.** Through IDE hooks and MCP, ArkGate intercepts the file write. If the agent writes a bad import, the write doesn't land. The agent gets immediate feedback and can self-correct before saving to disk.
2. **The check is the single source of truth.** A simple `ark.config.json` defines your layers and allowed edges.
3. **Honest reporting.** Green imports do not equal elegant design. ArkGate separates structural correctness from design smells, providing an improvement compass to guide leftover design work without blocking the PR.

---

## Status lights (not settings)

```text
  [ Setup ] ──▶ [ In progress ] ──▶ [ Ready ]
                                      │
                                      └── Ready · needs a refactor
```

| Light | Means | Your move |
|-------|--------|-----------|
| **Setup** | Thin / new tree | Finish `start` → status |
| **In progress** | Not fully protected | Status action #1 |
| **Ready** | Honest import edges, and no new UI business-rule files vs merge-base | Keep write path + CI |
| **Ready · needs a refactor** | Edges clean; leftover design work remains | One small change — not “done” |

Details: [docs/use.md](docs/use.md).

---

## Host enforcement support

<!-- arkgate-host-support:start -->
| Host | Local write boundary | MCP validation | CI / merge path | Repair payload |
|------|----------------------|----------------|-----------------|----------------|
| Claude Code | **Hard** block for listed ops (PreToolUse `Write` / `Edit` / `MultiEdit`) when installed + trusted | Advisory; the agent must call it | **Required GitHub status context** running `arkgate-check --strict-merge` (alias `ark-check`) | Emitted on hook deny; host must re-inject (hard path when installed + trusted) |
| Grok Build | **Hard** block for listed ops (PreToolUse `write` / `search_replace` (plus aliases)) when installed + trusted | Advisory; the agent must call it | **Required GitHub status context** running `arkgate-check --strict-merge` (alias `ark-check`) | Emitted on hook deny; host must re-inject (hard path when installed + trusted) |
| Google Antigravity | **Hard** block for listed ops (PreToolUse `write_to_file` / `replace_file_content` / `multi_replace_file_content`) when installed + trusted | Advisory; the agent must call it | **Required GitHub status context** running `arkgate-check --strict-merge` (alias `ark-check`) | Emitted on hook deny; host must re-inject (hard path when installed + trusted) |
| Cursor | **Hard** block for listed ops (preToolUse `Write` / `StrReplace`) when installed + trusted | Advisory; the agent must call it | **Required GitHub status context** running `arkgate-check --strict-merge` (alias `ark-check`) | Envelope may emit (`--hook-repair`); reinjection **not** guaranteed |
| OpenAI Codex | **Hard** block for listed ops (PreToolUse `apply_patch` in Codex CLI and local ChatGPT Desktop/App Server) when installed + trusted | Advisory; the agent must call it | **Required GitHub status context** running `arkgate-check --strict-merge` (alias `ark-check`) | Envelope may emit (`--hook-repair`); reinjection **not** guaranteed |
| OpenCode | **Advisory / best-effort** at write (MCP + optional plugin; not a hard boundary) | Advisory; the agent must call it | **Required GitHub status context** running `arkgate-check --strict-merge` (alias `ark-check`) | No hard-boundary payload |

**Read the CI column:** for every host, the repository-wide hard guarantee is a **required**
GitHub **status context** that runs the CLI — not “CI file present,” and not the CLI binary name alone.
Codex hard write covers only a complete local `apply_patch`; Cursor covers only listed
`preToolUse` ops. In both cases the project hook must be installed + trusted, while shell/direct
filesystem writes, hosted or specialized opt-out paths, and human edits still rely on CI.

This table describes the supported profile **after its files are installed and the host loads/trusts them**. A hard local boundary covers only the listed hook operations; alternate tools, direct filesystem writes, and human edits still rely on CI. MCP validation is advisory because the agent must call it. The CI check blocks a merge only when the repository makes that status required. Repair **envelopes** may be emitted without reinjection being guaranteed; silent auto-apply never happens. Run `arkgate-check --doctor` (or `ark-check --doctor`) for the evidence actually detected in the current repository.
<!-- arkgate-host-support:end -->

#### Why required CI is the hard line

The split above is a deliberate trade-off, not a gap. ArkGate validates at the earliest boundary
each host offers and enforces at the earliest boundary a repository can make non-bypassable: the
required merge status. Hard hooks (Claude Code, Grok Build, Google Antigravity, Cursor, and
Codex’s complete local `apply_patch`) deny their listed write operations at write time; advisory
surfaces (MCP, rules, OpenCode plugins) warn the agent while it works. But any local boundary can
be routed around — another tool, a hosted/specialized path, a direct filesystem write, or a human
edit — so the only guarantee ArkGate claims for every path is the
`arkgate-check --strict-merge` check, and only when the repository makes that status required.
Local checks optimize feedback speed; required CI owns correctness.

A useful consequence: the rules file doubles as a pressure sensor. Recurring violations or baseline
exceptions concentrated on one layer edge are evidence that the current design stopped fitting the
code — a reason to reshape the rules deliberately (start with `/ark-explore`), never to weaken
the check.

Setup per host: [docs/ai-gates.md](docs/ai-gates.md) · Develop path: [docs/develop.md](docs/develop.md)

For authoritative MCP contract evidence, call `ark_identity` with the exact project root, then
call `ark_manifest` with that root plus the returned project id. A contained descendant requires
the matching id. The legacy `ark://manifest` resource remains compatibility-only and always
unverified/non-authoritative because standard `resources/read` cannot portably carry that
expectation.

---

## Why not only ESLint / Nx / cruiser?

| | ArkGate | Typical boundary linter |
|--|:---:|:---:|
| CI import rules | ✅ | ✅ |
| Hard-block AI writes on supported hosts | ✅ | ❌ |
| Project-bound rules agents can read (`ark_manifest`) | ✅ | ❌ |
| Placement + preflight for multi-file changes | ✅ | ❌ |
| Honest governed % + dual plan (edges vs shape) | ✅ | ❌ |
| Opt-in intra-layer ArkRules (structure + invariants) | ✅ | ❌ |
| Stops agents rewriting slow product decisions as CRUD (ArkOrder) | ✅ | ❌ |
| Incomplete analysis cannot look green | ✅ | varies |

---

## Common commands

```bash
npx arkgate start --apply
npx arkgate status --json          # session/project snapshot (identity, activation, last check)
npx arkgate-check --doctor
npx arkgate-check --plan
npx arkgate-check --coverage
npx arkgate-check --path-drift --base-ref origin/main   # stale paths in strings/comments after a rename
npx arkgate-check --sensors        # which sensors can EVER be enforced, and which of your rules can be promoted
npx arkgate-check --promote        # what enforcing each advisory rule would cost, from one run
npx arkgate-check --strict-merge   # CI / required status
npx arkgate-check --install-agent-gates --tools claude,cursor,codex,grok,antigravity
# optional: refresh shared home skills (Claude/Grok/Antigravity/Codex; never downgrades)
# npx arkgate-check --install-agent-gates --skills-only --agent-homes --force
# optional: same 13 skills via Agent Skills ecosystem (no new names)
# npx skills add ./node_modules/arkgate/templates/agent-skills
# optional ArkRun: poll the loopback inspector (ANSI TUI — not a gate)
# npx ark-dashboard --url http://127.0.0.1:<port>/snapshot
```

More: [docs/develop.md](docs/develop.md) · skills install: [docs/agent-guide.md](docs/agent-guide.md#install-skills-ark-and-ecosystem) · enthusiast track: [docs/enthusiast/](docs/enthusiast/README.md)

---

## Optional ArkRun

Gates need **no** app runtime. Skip this unless you want an optional runtime
for decoupling.

**ArkRun** (`arkgate/runtime`, same npm package) is that runtime. Each
`createStrictArkKernel()` call is a new instance — no process singleton. Data
lives in memory and **dies on restart**. Fine for local. Not Postgres, not an
outbox, not Temporal. `@arkgate/runtime` is deprecated.

### Dev inspector and observability dashboard

Opt-in `startInspector()` binds **loopback only** (`127.0.0.1`), refuses
`NODE_ENV=production`, and serves JSON facts — not a TUI. Alongside
`GET /snapshot`, `GET /events` (SSE), and `GET /graph`, the inspector exposes
queue monitors:

| Path | Body (JSON) |
|------|-------------|
| `GET /outbox` | Pending/failed outbox **summaries** + counts (`available`, `pendingCount`, `failedCount`, `pending`, `failed`) — no event payloads |
| `GET /workflows` | Workflow **summaries** + counts (`available`, `total`, `runningCount`, …, `workflows`) |

Poll those facts from the dual bins **`ark-dashboard`** / **`arkgate-dashboard`**
(`bin/ark-dashboard.mjs`). ANSI + polling only (no React/Ink/Blessed). Point
`--url` / `-u` at the inspector snapshot (default
`http://127.0.0.1:3000/snapshot`); the dashboard also fetches sibling `/outbox`
and `/workflows`. `--interval` / `-i` is clamped to 200–60000 ms (default 2000).
Also available as `ark dashboard` / `arkgate dashboard` (passthrough to the same bin). Kernel stays
JSON-only; presentation stays in `bin/`.

### Durability stance

Default stores (`InMemoryEventBuffer`, `InMemoryAuditStore`, `InMemoryReadModelStore`,
`InMemoryWorkflowStore`) are **reference in-memory only**. Fine for tests. They
**do not** survive restarts and are **not** production durability. Wire real store
interfaces for production. Details: [docs/production-hardening.md](docs/production-hardening.md).

---

## Optional ArkOrder

Layers stop a bad import. They do not stop a *legal* import that overwrites the
billing plan.

If the product can name a few slow decisions in an afternoon — plan, cycle,
tenancy; a clinical protocol; match rules — an agent will still ship one PUT
that changes them together with seats and invoices. The write gate stays green
because “what may be the plan” was never a rule.

**ArkOrder** (`arkgate/order`) is that rule. Off unless you add `arkOrder`.
Name the slow keys (`xiKeys`: plan, protocol, cost-code bound — not `projectId`).
A status you can recompute from data you already have is not a slow decision. Derive it. Do not freeze it.
Posting an invoice is absorbed. Changing plan is `proposeRelease` then `apply`.
`refreshSigma`; ingest residual `absorb | escalate_up | hold` + `reasonCode`;
capacity pack as data; in-memory `ReleaseStore`; `ingestTravelAction`; ArkRun
`decisionTape`. A generic `update` of the plan does not land. A use-case that
PATCHes those keys through Prisma is named. Same npm package.
In-memory. Not durable. Does not replace ArkRun.
**ArkOrder freezes the pattern through a valve. ArkRun is how the residual travels.**

Copy [examples/arkorder-billing/](examples/arkorder-billing/) and rename the
three keys. Compact starters leave it off. Details:
[ArkOrder](docs/arkorder.md) · [configuration](docs/configuration.md) ·
[package surface](docs/package-surface.md).

---

## Documentation

| Audience | Link |
|----------|------|
| **Docs hub** | [docs/README.md](docs/README.md) |
| Anyone | [docs/use.md](docs/use.md) |
| Developers integrating ArkGate | [docs/develop.md](docs/develop.md) |
| Contributors to this library | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Host install detail | [docs/ai-gates.md](docs/ai-gates.md) |
| Config · package surface · TS | [configuration](docs/configuration.md) · [package-surface](docs/package-surface.md) · [typescript-support](docs/typescript-support.md) |
| Brownfield | [docs/brownfield-adoption.md](docs/brownfield-adoption.md) |
| Security | [SECURITY.md](SECURITY.md) |
| Tree prepared (4.8.6, not published) | [docs/releases/4.8.6.md](docs/releases/4.8.6.md) · [CHANGELOG](CHANGELOG.md) |
| Current published (4.8.5 on npm `latest`) | [docs/releases/4.8.5.md](docs/releases/4.8.5.md) · [CHANGELOG](CHANGELOG.md) |
| Prior published (4.8.4) | [docs/releases/4.8.4.md](docs/releases/4.8.4.md) |
| Prior published (4.8.3) | [docs/releases/4.8.3.md](docs/releases/4.8.3.md) |
| Prior published (4.8.2) | [docs/releases/4.8.2.md](docs/releases/4.8.2.md) |
| Prior published (4.8.1) | [docs/releases/4.8.1.md](docs/releases/4.8.1.md) |
| Prior published (4.8.0) | [docs/releases/4.8.0.md](docs/releases/4.8.0.md) |
| Prior published (4.7.6) | [docs/releases/4.7.6.md](docs/releases/4.7.6.md) |
| Prior published (4.7.5) | [docs/releases/4.7.5.md](docs/releases/4.7.5.md) |
| Prior published (4.7.3) | [docs/releases/4.7.3.md](docs/releases/4.7.3.md) |
| Prior published (4.7.2) | [docs/releases/4.7.2.md](docs/releases/4.7.2.md) |
| Prior published (4.7.1) | [docs/releases/4.7.1.md](docs/releases/4.7.1.md) |
| Prior published (4.7.0) | [docs/releases/4.7.0.md](docs/releases/4.7.0.md) |
| Prior published (4.6.7) | [docs/releases/4.6.7.md](docs/releases/4.6.7.md) |
| Prior published (4.6.6) | [docs/releases/4.6.6.md](docs/releases/4.6.6.md) |
| Prior published (4.6.5) | [docs/releases/4.6.5.md](docs/releases/4.6.5.md) |
| Prior published (4.6.3) | [docs/releases/4.6.3.md](docs/releases/4.6.3.md) |
| Prior (4.6.2) | [docs/releases/4.6.2.md](docs/releases/4.6.2.md) |
| Prior (4.6.1) | [docs/releases/4.6.1.md](docs/releases/4.6.1.md) |
| Prior (4.6.0) | [docs/releases/4.6.0.md](docs/releases/4.6.0.md) |
| Prior (4.5.7) | [docs/releases/4.5.7.md](docs/releases/4.5.7.md) |
| Prior (4.5.0) | [docs/releases/4.5.0.md](docs/releases/4.5.0.md) |
| Prior (4.4.0) | [docs/releases/4.4.0.md](docs/releases/4.4.0.md) |
| Prior (4.3.0) | [docs/releases/4.3.0.md](docs/releases/4.3.0.md) |
| Prior (4.2.1) | [docs/releases/4.2.1.md](docs/releases/4.2.1.md) |
| Previous (4.2.0) | [docs/releases/4.2.0.md](docs/releases/4.2.0.md) |
| Previous (4.1.1) | [docs/releases/4.1.1.md](docs/releases/4.1.1.md) |
| Previous (4.1.0) | [docs/releases/4.1.0.md](docs/releases/4.1.0.md) |
| Previous patch (4.0.1) | [docs/releases/4.0.1.md](docs/releases/4.0.1.md) |
| Previous (4.0.0) | [docs/releases/4.0.0.md](docs/releases/4.0.0.md) |
| Previous (3.9.2) | [docs/releases/3.9.2.md](docs/releases/3.9.2.md) |
| History / maintainer evidence | [docs/archive/](docs/archive/README.md) |

---

## Contribute to this library

```bash
git clone https://github.com/pedroknigge/arkgate
cd arkgate && npm ci && npm run build
npm test && npm run check:architecture
```

Full guide: [CONTRIBUTING.md](CONTRIBUTING.md) · queue: [ROADMAP.md](ROADMAP.md)

---

**Website:** [arkgate.online](https://www.arkgate.online/) · **npm:** [`arkgate`](https://www.npmjs.com/package/arkgate)  
**MCP:** [`io.github.pedroknigge/arkgate`](https://registry.modelcontextprotocol.io/)  
Node ≥ 18 · **MIT**

**Ark doesn’t invent your product. It rejects the illegal write — and tells you when it isn’t really enforcing anything yet.**
