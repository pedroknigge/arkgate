<div align="center">

# ArkGate — Write. Check. Ship.

**When the agent writes a bad import, the write doesn’t land. The same check fails the pull request.**

[![Website](https://img.shields.io/badge/website-arkgate.online-0a0a0a)](https://www.arkgate.online/)
[![CI](https://github.com/pedroknigge/arkgate/actions/workflows/ci.yml/badge.svg)](https://github.com/pedroknigge/arkgate/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/arkgate?color=cb3837&label=npm)](https://www.npmjs.com/package/arkgate)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js)
![TS 5–7](https://img.shields.io/badge/TypeScript-5%20%7C%206%20%7C%207-3178c6?logo=typescript)

</div>

ArkGate is import rules for AI-written TypeScript. **Contener · Guiar · Ordenar**: contain what the AI may write, and in what shape. Guide the next step. Order leftover mess toward a clean tree, a little at a time.

<a id="less-spaghetti-after-the-gate-is-green"></a>

## Why

AI takes the shortest path. One bad import lands, then another, and the product gets harder to change. A linter that runs only after the agent finishes sees the mess too late.

Design the boundary before you implement. Put a small interface in front of the work and keep the detail behind it. When leftover mess remains, the honest light is **needs a refactor**. Weakening the rules to paint the check green leaves that design unfinished.

## Try it

One command. Preview only — no files change. npm `latest` is **4.8.20**:

```bash
npx arkgate@4.8.20 start
```

## What a red result looks like

After a rules file exists, a domain file that imports infrastructure fails the check (exit 1). This is real output from `arkgate-check` on arkgate@4.8.20:

```text
✖ LAYER_IMPORT_VIOLATION  src/domain/order.ts:1
  DomainModel → Infrastructure  (src/infra/db.ts)
  DomainModel must not import Infrastructure.
  Next action: Classify the import: if it is constants/types/pure, adopt into DomainModel or SharedKernel; define a port only if the target is a real use-case. Then preflight again.

✖ 1 violation(s).
```

Do that next action. Classify the import, or introduce a port when the dependency is a real use case. Then run the check again.

That red line is the check. It does not stop every write. On Cursor, a hook without `failClosed: true` is fail-open: if the checker cannot run, the write still lands. Shell writes, hosted tools, and human edits are outside the local hook. The hard line for every path is a **required** GitHub status running `arkgate-check --strict-merge`. Until that status is required, the rules file is just documentation.

Anyone: [Use ArkGate](docs/use.md) · Developers: [Develop](docs/develop.md) · This library: [CONTRIBUTING](CONTRIBUTING.md)

---

## Appendix

The minute above is the product. Below is reference: the longer introduction, what this is not, hosts, commands, extras, and where release history lives.

## Choose your path

| You are… | Go here |
|----------|---------|
| **Anyone** (ship with AI, minimal jargon) | **[Use ArkGate](docs/use.md)** |
| **Developer** (hosts, CI, config, brownfield) | **[Develop with ArkGate](docs/develop.md)** |
| **Contributor** (improve this library) | **[CONTRIBUTING](CONTRIBUTING.md)** |

Full map: **[docs/README.md](docs/README.md)**

## The longer introduction

AI can build fast—and make a mess just as fast.

Keep the product easy to understand, change, and trust.

Contain what the AI may write, and in what shape. Guide you with proven patterns and one next step. Order leftover mess toward a clean tree, a little at a time.

Safer changes, fewer surprises, and extra protection only when you choose it.

That is **Contener · Guiar · Ordenar**.

## What this is not

Not an API Gateway. Not a folder linter. If the check is not required on the PR, the config
is just documentation.

ArkGate is not a web framework, ORM, or job runner. The npm package is `arkgate` — not affiliated with the separate Archgate CLI project.

ArkRun is an optional experimental runtime. In-memory. Not Postgres. `@arkgate/runtime` is deprecated. ArkOrder does not replace import rules: layers can be green while the agent still rewrites the billing plan like a seat count.

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
once you adopt (**Contener**). The other three are optional.

| | Role | When |
|--|------|------|
| **While the agent writes** | The write doesn’t land on supported hosts; warning only elsewhere | Always (ArkGate) |
| **Before merge** | `arkgate-check` as a **required** CI status | Always (ArkGate) |
| **ArkRules** | Optional policies *inside* a layer (**Contener** — shape) | When you ask |
| **ArkRun** | Optional experimental runtime (`arkgate/runtime`) (**Guiar**) | Off unless you turn it on |
| **ArkOrder** | Extra for the few big choices — billing plan, not seat counts (`arkgate/order`) (**Ordenar**) | Off unless you turn it on |

Layers (who may import whom) always run. ArkRules, ArkRun, and ArkOrder change no
inter-layer verdict when absent. Label leftovers **`[Layer]`** vs **`[ArkRules]`** vs
**`[ArkRun]`** vs **`[ArkOrder]`**.
Details: [configuration](docs/configuration.md) · [use](docs/use.md).

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

![Write gate: agent blocked, then self-corrects](docs/assets/ark-write-gate.svg)

Adopted means a required GitHub status running `arkgate-check --strict-merge`, or an explicit `advisory-only` stance. Status is compact (`arkgate-check --doctor`; `--all` for details).

### When not to adopt

ArkGate is overkill for small trees with **no AI agents** and **no multi-layer boundaries**, for
single-developer hobby CRUDs under no integration pressure, and for teams that will not maintain
`ark.config.json` or a **required** CI status running `arkgate-check --strict-merge`. Without that
status the rules file is just documentation — stay with a boundary linter alone (see
[Why not only ESLint / Nx / cruiser?](#why-not-only-eslint--nx--cruiser)).
Anyone path: [docs/use.md — When not to adopt](docs/use.md#when-not-to-adopt). Limits of a green
check: [4.3.0 — What ArkGate is / isn't](docs/releases/4.3.0.md#what-arkgate-is--isnt).

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

## Start in one minute

```bash
npx arkgate start                 # preview files + commands
npx arkgate start --apply         # compact config + host router + CI plan
npx --package=arkgate arkgate-check --doctor        # status — one next step
npx --package=arkgate arkgate-check --doctor --all  # full details
```

`start --apply` pins arkgate with this repo's package manager (`pnpm add -w` / `yarn add -W` at a workspace root). Do not run `npm install -D arkgate` at a `workspace:*` root — npm rejects that protocol. After a local install, `npx arkgate-check --doctor` also works. `arkgate-check` is a command in the `arkgate` package, not its own npm package. If pnpm Age (`minimumReleaseAge`) blocks a brand-new release, keep using `npx --package=arkgate@<version>` — do not re-run the same add. Put arkgate on `minimumReleaseAgeExclude` in pnpm config or `pnpm-workspace.yaml` (a CLI flag is not enough), or wait until the package is mature.

`start --apply` refuses when projected governed coverage is below 50% or
shape confidence is weak (below 0.6 with coverage under 80%), or when the
planned write is too big for compact start (more than 8 gate files or 32 KB).
That lock is deliberate. Coverage/shape: lock with `--archetype <id>`,
`--preset <name>`, or `--force`. Size: `--force` does not unlock. Next:
`npx arkgate-check --init`. Or inspect ranked shapes with
`npx arkgate-check --recommend`.

That is the fuller path. Stuck? Run status (`--doctor`) and do action **#1**.

```text
start → doctor → new files in the right folder
              ↘ leftover mess: map, then one small refactor
```

Keep the rules file out of product PRs. Local check:
`ark-check --local --base origin/dev` (same as `--changed`; refused with
`--strict-merge`). Changing the rules themselves uses `--contract-session`.

Aliases `ark` / `ark-check` / `ark-mcp` still work. npm / pnpm / yarn. No install lifecycle scripts
— and none on pack or prepare either, so `pnpm add git+https://github.com/pedroknigge/arkgate`
installs at a pinned commit with no `allowBuilds` entry. A git install gives you the CLIs and the
schemas; the library, MCP and ESLint entry points live in the built `dist/` and come from npm.
See [docs/package-surface.md](docs/package-surface.md#installing-from-git).

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
`preToolUse` ops with `failClosed: true`. A Cursor hook without that flag is fail-open
(if the checker cannot run, the write still lands). In both cases the project hook must be
installed + trusted, while shell/direct
filesystem writes, hosted or specialized opt-out paths, and human edits still rely on CI.

This table describes the supported profile **after its files are installed and the host loads/trusts them**. A hard local boundary covers only the listed hook operations; alternate tools, direct filesystem writes, and human edits still rely on CI. **Write-gate order:** install and trust the host pre-hook first. MCP prepare is fallback when that path is missing or fail-open. MCP validation is advisory because the agent must call it. The CI check blocks a merge only when the repository makes that status required. Repair **envelopes** may be emitted without reinjection being guaranteed; silent auto-apply never happens. Run `arkgate-check --doctor` (or `ark-check --doctor`) for the evidence actually detected in the current repository.
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
| Stops rewriting a big product choice like billing plan (ArkOrder) | ✅ | ❌ |
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
# optional: closed skill catalog via Agent Skills ecosystem (ARK_SKILL_NAMES)
# npx skills add ./node_modules/arkgate/templates/agent-skills
# optional ArkRun: poll the loopback inspector (ANSI TUI — not a gate)
# npx ark-dashboard --url http://127.0.0.1:<port>/snapshot
```

More: [docs/develop.md](docs/develop.md) · skills install: [docs/agent-guide.md](docs/agent-guide.md#install-skills-ark-and-ecosystem) · enthusiast track: [docs/enthusiast/](docs/enthusiast/README.md)

## Other skills, only when you need them

Day-to-day work uses the compact router and status. The full `/ark-*` pack is expert depth: install it when you want a guided next step, not as the first action. Catalog and install paths: [Install skills — Ark and ecosystem](docs/agent-guide.md#install-skills-ark-and-ecosystem).

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

Layers stop a bad import. ArkOrder stops rewriting a big product choice — like
the billing plan — as if it were a seat count. Change those choices through a
valve, not a generic update.

Off unless you add `arkOrder`. Same npm package (`arkgate/order`). In-memory.
Not a service. Does not replace ArkGate or ArkRun.

Name the few choices (`xiKeys`: plan, cycle, tenancy — not seat counts). First
freeze is `release()`. Later change is `proposeRelease` then `apply`. A generic
`update` does not land.

Proof path (GitHub, not the npm tarball):
[examples/arkorder-billing](https://github.com/pedroknigge/arkgate/tree/main/examples/arkorder-billing)
— first freeze is `release()`; later plan change is `proposeRelease` then `apply`.
Gallery index:
[examples/README.md](https://github.com/pedroknigge/arkgate/blob/main/examples/README.md).
Compact starters leave the extra off. Details: [ArkOrder](docs/arkorder.md).

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
| Release history | [CHANGELOG.md](CHANGELOG.md) · [site changelog](https://www.arkgate.online/changelog/) · [docs hub index](docs/README.md#history-and-maintainer-material) |
| History / maintainer evidence | [docs/archive/](docs/archive/README.md) |

Version notes live in [CHANGELOG.md](CHANGELOG.md) and on the [site changelog](https://www.arkgate.online/changelog/). The docs hub keeps the per-version index: [History and maintainer material](docs/README.md#history-and-maintainer-material).

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
