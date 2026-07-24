<div align="center">

# ArkGate — Architecture Co-pilot for AI TypeScript

**One contract. One gate. One co-pilot.**

Your AI writes most of the code. ArkGate keeps that work inside an architecture you can trust —
and makes sure a “green” check means something real.

[![Website](https://img.shields.io/badge/website-arkgate.online-0a0a0a)](https://www.arkgate.online/)
[![CI](https://github.com/pedroknigge/arkgate/actions/workflows/ci.yml/badge.svg)](https://github.com/pedroknigge/arkgate/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/arkgate?color=cb3837&label=npm)](https://www.npmjs.com/package/arkgate)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js)
![TS 5–7](https://img.shields.io/badge/TypeScript-5%20%7C%206%20%7C%207-3178c6?logo=typescript)

</div>

> **ArkGate 3.9.2** is the next prepared patch (enforcement honesty: coverage/host write path,
> design-weak one-pilot coaching, advisory graph-blind). **npm `latest` is still 3.9.1** until
> publication succeeds. [3.9.2 notes](docs/releases/3.9.2.md) · [3.9.1](docs/releases/3.9.1.md) ·
> [Docs hub](docs/README.md)

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
npx arkgate start --apply         # compact contract + host router + CI plan
npx arkgate-check --doctor        # control plane: status light + primary next action
```

That is the product. Doctor is the control plane — when stuck, do **primary next action #1**.

```text
start → doctor → day-to-day (place + gate)
              ↘ optional /ark-autopilot after skill pack
```

Aliases `ark` / `ark-check` / `ark-mcp` still work. npm / pnpm / yarn. No install lifecycle scripts.

![Write gate: agent blocked, then self-corrects](docs/assets/ark-write-gate.svg)

---

## What it is

A machine-readable architecture file (`ark.config.json`) plus enforcement:

| When | Tool |
|------|------|
| **While the AI writes** | Hard PreToolUse on supported hosts; advisory MCP elsewhere |
| **Before merge** | `arkgate-check` as a **required** CI status |

**Not** a web framework, ORM, or job runner. Optional experimental runtime is separate and not required for the gate.

**Name note:** npm package `arkgate` — not affiliated with the separate Archgate CLI project.

---

## Status lights (not settings)

| Light | Means | Your move |
|-------|--------|-----------|
| **Suggest** | Thin / new tree | Finish `start` → doctor |
| **Adapt** | Not fully protected | Doctor action #1 |
| **Enforce** | Honest edges under the contract | Keep write path + CI |
| **Enforce · design-weak** | Edges clean; design residual remains | Shape residual — not “done” |

Details: [docs/use.md](docs/use.md).

---

## Host enforcement support

<!-- arkgate-host-support:start -->
| Host | Local write boundary | MCP validation | CI / merge path | Repair payload |
|------|----------------------|----------------|-----------------|----------------|
| Claude Code | **Hard** block for listed ops (PreToolUse `Write` / `Edit` / `MultiEdit`) when installed + trusted | Advisory; the agent must call it | **Required status** = hard merge boundary (`arkgate-check --strict-merge`) | Emitted on hook deny; host must re-inject |
| Grok Build | **Hard** block for listed ops (PreToolUse `write` / `search_replace` (plus aliases)) when installed + trusted | Advisory; the agent must call it | **Required status** = hard merge boundary (`arkgate-check --strict-merge`) | Emitted on hook deny; host must re-inject |
| Google Antigravity | **Hard** block for listed ops (PreToolUse `write_to_file` / `replace_file_content` / `multi_replace_file_content`) when installed + trusted | Advisory; the agent must call it | **Required status** = hard merge boundary (`arkgate-check --strict-merge`) | Emitted on hook deny; host must re-inject |
| Cursor | **Advisory only** at write (no hard hook) | Advisory; the agent must call it | **Required status** = hard merge boundary (same CI) | No hard-boundary payload |
| OpenAI Codex | **Advisory / best-effort** at write (not equivalent to Claude/Grok hard block) | Advisory; the agent must call it | **Required status** = hard merge boundary (same CI) | No hard-boundary payload |
| OpenCode | **Advisory / best-effort** at write (MCP + optional plugin; not a hard boundary) | Advisory; the agent must call it | **Required status** = hard merge boundary (same CI) | No hard-boundary payload |

**Read the CI column:** for every host, the repository-wide hard guarantee is a **required**
merge check — not “CI file present.” Cursor/Codex/OpenCode never get a fake hard write claim.

This table describes the supported profile **after its files are installed and the host loads/trusts them**. A hard local boundary covers only the listed hook operations; alternate tools, direct filesystem writes, and human edits still rely on CI. MCP validation is advisory because the agent must call it. The CI check blocks a merge only when the repository makes that status required. Repair payloads never write code silently: the host must re-inject the candidate and ArkGate revalidates it. Run `arkgate-check --doctor` for the evidence actually detected in the current repository.
<!-- arkgate-host-support:end -->

#### Why the hard guarantee lives at the merge gate

The split above is a deliberate trade-off, not a gap. ArkGate validates at the earliest boundary
each host offers and enforces at the earliest boundary a repository can make non-bypassable: the
required merge status. Hard hooks (Claude Code, Grok Build, Google Antigravity) deny the listed
write operations at write time; advisory surfaces (MCP, rules, OpenCode plugins) coach the agent
while it works. But any local boundary can be routed around — another tool, a direct filesystem
write, a human edit — so the only guarantee ArkGate claims for every path is the
`arkgate-check --strict-merge` check, and only when the repository makes that status required.
Local checks optimize feedback speed; the merge gate owns correctness.

A useful consequence: the contract doubles as a pressure sensor. Recurring violations or baseline
exceptions concentrated on one layer edge are evidence that the current design stopped fitting the
code — a reason to reshape the contract deliberately (start with `/ark-explore`), never to weaken
the gate.

Setup per host: [docs/ai-gates.md](docs/ai-gates.md) · Develop path: [docs/develop.md](docs/develop.md)

---

## Why not only ESLint / Nx / cruiser?

| | ArkGate | Typical boundary linter |
|--|:---:|:---:|
| CI import rules | ✅ | ✅ |
| Hard-block AI writes on supported hosts | ✅ | ❌ |
| Contract agents can read (`ark://manifest`) | ✅ | ❌ |
| Placement + preflight for multi-file changes | ✅ | ❌ |
| Honest governed % + dual plan (edges vs shape) | ✅ | ❌ |
| Incomplete analysis cannot look green | ✅ | varies |

---

## Common commands

```bash
npx arkgate start --apply
npx arkgate-check --doctor
npx arkgate-check --plan
npx arkgate-check --coverage
npx arkgate-check --strict-merge   # CI / required status
npx arkgate-check --install-agent-gates --tools claude,cursor,codex,grok
```

More: [docs/develop.md](docs/develop.md) · enthusiast track: [docs/enthusiast/](docs/enthusiast/README.md)

---

## Optional experimental runtime

Gates need **no** app runtime. The experimental `@arkgate/runtime` companion is separate and is not a production-readiness claim.

### Durability stance

Default stores (`InMemoryEventBuffer`, `InMemoryAuditStore`, `InMemoryReadModelStore`,
`InMemoryWorkflowStore`) are **reference in-memory only** — fine for tests and demos; they
**do not** survive restarts and are **not** production durability. Implement the store interfaces
for real systems. Details: [docs/production-hardening.md](docs/production-hardening.md).

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
| Latest release (3.9.1 on npm; 3.9.2 prepared) | [3.9.2](docs/releases/3.9.2.md) · [3.9.1](docs/releases/3.9.1.md) · [CHANGELOG](CHANGELOG.md) |
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

**Ark doesn’t invent your product. It keeps AI-generated TypeScript inside an architecture you can trust — and tells you when it isn’t really enforcing anything yet.**
