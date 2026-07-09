<div align="center">

# ArkGate — Architecture Co-pilot for AI TypeScript

**Write gate · CI gate · co-pilot** for TypeScript projects that use AI agents.

Your AI writes most of the code. **ArkGate** keeps that code inside an architecture you can
trust — and makes sure a “green” check means something real.

[![CI](https://github.com/pedroknigge/arkgate/actions/workflows/ci.yml/badge.svg)](https://github.com/pedroknigge/arkgate/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/arkgate?color=cb3837&label=npm)](https://www.npmjs.com/package/arkgate)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js)
![TS 5–7](https://img.shields.io/badge/TypeScript-5%20%7C%206%20%7C%207-3178c6?logo=typescript)

</div>

---

## What it is

**ArkGate** is a **machine-readable architecture contract** for TypeScript, enforced in three places:

| When | Tool | What happens |
|------|------|----------------|
| **While the AI writes** | `arkgate-mcp` (write gate) | Blocks bad edits; agent self-corrects |
| **Before merge** | `arkgate-check` (CI) | Full TypeScript import graph + rules |
| **At runtime** *(optional)* | `createArkKernel()` | Event/intent governance if you opt in |

One file drives all of it: **`ark.config.json`**.

It is **not** a web framework, ORM, or job runner — and the optional runtime kernel is not
the product. The product is the **agent-native architecture gate** (write path + CI + plan/loop)
plus tools agents can read *before* generating code (`ark_place`, `ark://manifest`, …).

![Write gate: agent blocked, then self-corrects](docs/assets/ark-write-gate.svg)

---

## Who it’s for

| You are… | You want… | Start with |
|----------|-----------|------------|
| **Builder with AI** (not necessarily an architect) | Order without learning “hexagonal” first | `npx arkgate start` → `/ark-autopilot` |
| **Engineer / tech lead** | A strict contract, CI, baselines, precise control | `ark init` + `ark-check` + write gate |
| **Team on a messy repo** | Truth about coverage + a cleanup path, not a false green | `ark-check --coverage` → `/ark-adopt` |

**Not for:** projects with no TypeScript, people who only want a one-off lint rule and no agent workflow, or anyone looking for an app framework.

---

## What you get (in plain language)

1. **A shape** — Ark looks at your repo (Nest, Next, API, library, …) and suggests how to organize it.
2. **Guardrails** — config + agent gates + CI so new code can’t quietly break layers.
3. **A plan** — what’s safe for an agent to fix vs what needs your decision (`mechanical-safe` vs judgment).
4. **Honesty** — if Ark only governs 10% of the tree, it says so. “Clean” with almost no coverage is not success.
5. **Adoption health** — `arkgate-check --doctor` checks co-pilot completeness (hosts, MCP argv, Codex home, core-layer optionality, origin report) **separately** from the 0–100 fitness score.

Three **operating modes** (not “user types”) on the same contract:

| Mode | Meaning |
|------|---------|
| **Suggest** | Install a starting shape |
| **Adapt** | Match the contract to real folders / raise coverage |
| **Enforce** | Gates actually protect you |

---

## Upgrading from `ark-runtime-kernel`?

**Same product**, new package name. Config and `/ark-*` skills stay.

```bash
npm uninstall ark-runtime-kernel && npm install -D arkgate
npx arkgate-check --install-agent-gates --force
npx arkgate-check --doctor
```

Full checklist (CI, MCP, Codex, imports): **[docs/migrate-from-ark-runtime-kernel.md](docs/migrate-from-ark-runtime-kernel.md)**.

---

## Start in one minute

```bash
npm install -D arkgate typescript
npx arkgate start          # look at the project → setup → plan (plain language)
# (aliases: ark start / ark-check / ark-mcp still work)
```

Then, in your agent (Claude / Cursor / Codex / **Grok** / …):

```text
/ark-autopilot
```

That is the **co-pilot**: set up → plan → apply safe fixes (validated, reversible) → propose the rest → leave gates on.

**Prefer manual control?**

```bash
npx arkgate init              # config + gates
npx arkgate-check             # CI gate
npx arkgate-check --plan      # classified fix list
npx arkgate-check --coverage
```

Works with **npm, pnpm, and yarn**. No install lifecycle scripts (safe for hardened CI).

---

## Agent skills (`/ark-*`)

Install with agent gates:

```bash
npx arkgate-check --install-agent-gates
# or pick hosts: --tools claude,cursor,codex,grok
```

| Skill | What it does |
|-------|----------------|
| **`/ark-autopilot`** | End-to-end co-pilot: setup → plan → safe auto-fixes → propose the rest → leave gates on |
| **`/ark-loop`** | Drive the plan in a worktree; auto-apply only `mechanical-safe` (type-only move, pure-type file relocate, `import type` of pure-type modules) |
| **`/ark-architect`** | Greenfield: pick application shape, phase-1 layers, scaffold, verify honestly |
| **`/ark-adopt`** | Brownfield: match contract to reality, raise coverage, freeze only real debt |
| **`/ark-contract`** | Safely edit `ark.config.json` (smallest change, strict re-check) |
| **`/ark-place`** | Where does this new artifact go? Layer, path, naming — then scaffold |
| **`/ark-fix`** | Fix violations at the source (no disable comments, no gate weakening) |
| **`/ark-explain`** | Explain the current contract, coverage, and report in plain language |
| **`/ark-coverage`** | Audit which Ark capabilities you are not using yet |
| **`/ark-runtime`** | Opt-in: migrate hand-rolled bus/outbox/sagas onto the runtime kernel |
| **`/ark-upgrade`** | Bump the package and refresh gates + skills for every agent host (also normalizes MCP bins + Codex home) |

Supported agent hosts for full MCP/hook gates: **Claude Code**, **Cursor**, **OpenAI Codex**, **Grok Build**. Instruction-tier hosts (Windsurf, Cline, Copilot, …) get rule files. See [docs/ai-gates.md](docs/ai-gates.md).

After upgrade, run **`npx arkgate-check --doctor`**: it flags incomplete hosts, dual `ark-mcp`/`arkgate-mcp` args, Codex home pointing at a temp path, core layers still `optional` while populated, and a missing origin report.

---

## How it works (short)

```
ark.config.json
      │
      ├─► Write gate (arkgate-mcp)  — agent PreToolUse / MCP tools
      ├─► CI gate (arkgate-check)   — PR / main
      └─► Runtime kernel (opt-in)   — only if you call it
```

- **Presets:** hexagonal, layered, feature-sliced, monorepo (layers start optional; doctor suggests tightening populated cores).
- **Frameworks:** Nest / Next / express / library layouts get sensible globs on init so day-one coverage is real.
- **Brownfield:** baseline ratchet, refuse to freeze a wrong contract, `/ark-adopt` for mature trees.
- **Agents:** skills install into Claude / Cursor / Codex / Grok; `ark start` freezes an origin report under `.ark/reports/`.
- **TypeScript:** project compilers 5.x / 6.x / 7.x — gate falls back to a nested JS-API TypeScript when TS 7’s main export is version-only ([docs/typescript-support.md](docs/typescript-support.md)).

### Why not only ESLint / dependency-cruiser / Nx?

| | ArkGate | Typical boundary linter |
|--|:---:|:---:|
| CI import rules | ✅ | ✅ |
| Block **AI writes** before they land | ✅ | ❌ |
| Contract agents can read (`ark://manifest`) | ✅ | ❌ |
| Placement tools (`ark_place`, …) | ✅ | ❌ |
| Honest governed % + adoption path | ✅ | ❌ |
| Classified plan (`mechanical-safe` / judgment) | ✅ | ❌ |
| TypeScript 5 / 6 / 7 project compilers | ✅ | varies |
| Adoption scorecard (hosts / MCP / origin) | ✅ | ❌ |

---

## Common commands

```bash
npx arkgate start                         # guided setup + plan + origin report
npx arkgate-check --doctor                # health + Adoption gaps (not just fitness)
npx arkgate-check --doctor --json         # machine-readable doctor.adoption
npx arkgate-check --plan                  # safe-to-auto-fix vs your call
npx arkgate-check --coverage              # Governed: N%
npx arkgate-check --report ark-report.html  # showcase HTML + Adoption card + origin/latest
npx arkgate-check --baseline              # only NEW violations fail
npx arkgate upgrade                       # package + gates/skills + MCP/Codex normalize
```

CI (example):

```yaml
- run: npx arkgate-check --root . --config ark.config.json --strict-config
# or: uses: pedroknigge/arkgate@main
```

---

## Optional: runtime kernel

Gates need **no app code changes**. If you also want runtime intent/event contracts:

```ts
import { createStrictArkKernelFromConfig } from 'arkgate';
// see docs/production-hardening.md and package exports
```

NestJS: `arkgate/nestjs` (optional peer `@nestjs/common`).

---

## Documentation

| Audience | Link |
|----------|------|
| New builders (plain language) | [docs/enthusiast/](docs/enthusiast/README.md) |
| Wire Claude / Cursor / Codex / Grok | [docs/ai-gates.md](docs/ai-gates.md) |
| **TypeScript 5 / 6 / 7 support** | [docs/typescript-support.md](docs/typescript-support.md) |
| Migrate from `ark-runtime-kernel` | [docs/migrate-from-ark-runtime-kernel.md](docs/migrate-from-ark-runtime-kernel.md) |
| Messy existing repo | [docs/brownfield-adoption.md](docs/brownfield-adoption.md) |
| Agent / MCP tools | [docs/agent-guide.md](docs/agent-guide.md) |
| Demos | [docs/demos/](docs/demos/) |
| Examples | [examples/](examples/README.md) |
| Roadmap | [ROADMAP.md](ROADMAP.md) · [Changelog](CHANGELOG.md) |

---

## Develop this repo

```bash
npm ci && npm run build
npx vitest run
npm run typecheck
npm run check:architecture   # Ark gates itself
```

**npm:** [`arkgate`](https://www.npmjs.com/package/arkgate) · formerly `ark-runtime-kernel`  
**Product:** **ArkGate** — architecture co-pilot / gate for AI TypeScript (not a runtime kernel).  
CLI: `arkgate` · `arkgate-check` · `arkgate-mcp` (aliases `ark` / `ark-check` / `ark-mcp` still work for one major).  
MCP registry: `io.github.pedroknigge/arkgate`.

Node ≥ 18 · **MIT**.

---

**Ark doesn’t invent your product. It keeps AI-generated TypeScript inside an architecture you can trust — and tells you when it isn’t really enforcing anything yet.**
