<div align="center">

# Ark

**Architecture guardrails for TypeScript projects that use AI agents.**

Your AI writes most of the code. Ark makes sure that code still lands in the right place —
and that a “green” check means something real.

[![CI](https://github.com/pedroknigge/ark-runtime-kernel/actions/workflows/ci.yml/badge.svg)](https://github.com/pedroknigge/ark-runtime-kernel/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/ark-runtime-kernel?color=cb3837&label=npm)](https://www.npmjs.com/package/ark-runtime-kernel)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js)
![Zero deps](https://img.shields.io/badge/dependencies-0-success)

</div>

---

## What it is

Ark is a **machine-readable architecture contract** for TypeScript, enforced in three places:

| When | Tool | What happens |
|------|------|----------------|
| **While the AI writes** | `ark-mcp` (write gate) | Blocks bad edits; agent self-corrects |
| **Before merge** | `ark-check` (CI) | Full TypeScript import graph + rules |
| **At runtime** *(optional)* | `createArkKernel()` | Event/intent governance if you opt in |

One file drives all of it: **`ark.config.json`**.

It is **not** a web framework, ORM, or job runner. It is also more than a boundary linter:
agents get tools (`ark_place`, …) and a contract they can read *before* generating code.

![Write gate: agent blocked, then self-corrects](docs/assets/ark-write-gate.svg)

---

## Who it’s for

| You are… | You want… | Start with |
|----------|-----------|------------|
| **Builder with AI** (not necessarily an architect) | Order without learning “hexagonal” first | `npx ark start` → `/ark-autopilot` |
| **Engineer / tech lead** | A strict contract, CI, baselines, precise control | `ark init` + `ark-check` + write gate |
| **Team on a messy repo** | Truth about coverage + a cleanup path, not a false green | `ark-check --coverage` → `/ark-adopt` |

**Not for:** projects with no TypeScript, people who only want a one-off lint rule and no agent workflow, or anyone looking for an app framework.

---

## What you get (in plain language)

1. **A shape** — Ark looks at your repo (Nest, Next, API, library, …) and suggests how to organize it.
2. **Guardrails** — config + agent gates + CI so new code can’t quietly break layers.
3. **A plan** — what’s safe for an agent to fix vs what needs your decision.
4. **Honesty** — if Ark only governs 10% of the tree, it says so. “Clean” with almost no coverage is not success.

Three **operating modes** (not “user types”) on the same contract:

| Mode | Meaning |
|------|---------|
| **Suggest** | Install a starting shape |
| **Adapt** | Match the contract to real folders / raise coverage |
| **Enforce** | Gates actually protect you |

---

## Start in one minute

```bash
npm install -D ark-runtime-kernel typescript
npx ark start          # look at the project → setup → plan (plain language)
```

Then, in your agent (Claude / Cursor / Codex / …):

```text
/ark-autopilot
```

That is the **co-pilot**: set up → plan → apply safe fixes (validated, reversible) → propose the rest → leave gates on.

**Prefer manual control?**

```bash
npx ark init           # config + gates
npx ark-check          # CI gate
npx ark-check --plan   # classified fix list
npx ark-check --coverage
```

Works with **npm, pnpm, and yarn**. No install lifecycle scripts (safe for hardened CI).

---

## How it works (short)

```
ark.config.json
      │
      ├─► Write gate (ark-mcp)     — agent PreToolUse / MCP tools
      ├─► CI gate (ark-check)      — PR / main
      └─► Runtime kernel (opt-in)  — only if you call it
```

- **Presets:** hexagonal, layered, feature-sliced, monorepo (all layers optional).
- **Frameworks:** Nest / Next / express / library layouts get sensible globs on init so day-one coverage is real.
- **Brownfield:** baseline ratchet, refuse to freeze a wrong contract, `/ark-adopt` for mature trees.
- **Agents:** skills like `/ark-place`, `/ark-fix`, `/ark-loop`, `/ark-autopilot` — see [docs/ai-gates.md](docs/ai-gates.md).

### Why not only ESLint / dependency-cruiser / Nx?

| | Ark | Typical boundary linter |
|--|:---:|:---:|
| CI import rules | ✅ | ✅ |
| Block **AI writes** before they land | ✅ | ❌ |
| Contract agents can read (`ark://manifest`) | ✅ | ❌ |
| Placement tools (`ark_place`, …) | ✅ | ❌ |
| Honest governed % + adoption path | ✅ | ❌ |
| Zero runtime dependencies | ✅ | varies |

---

## Common commands

```bash
npx ark start                         # guided setup + plan
npx ark-check --doctor                # health + operating mode
npx ark-check --plan                  # safe-to-auto-fix vs your call
npx ark-check --coverage              # Governed: N%
npx ark-check --baseline              # only NEW violations fail
npx ark upgrade                       # update package + refresh gates/skills
```

CI (example):

```yaml
- run: npx ark-check --root . --config ark.config.json --strict-config
# or: uses: pedroknigge/ark-runtime-kernel@main
```

---

## Optional: runtime kernel

Gates need **no app code changes**. If you also want runtime intent/event contracts:

```ts
import { createStrictArkKernelFromConfig } from 'ark-runtime-kernel';
// see docs/production-hardening.md and package exports
```

NestJS: `ark-runtime-kernel/nestjs` (optional peer `@nestjs/common`).

---

## Documentation

| Audience | Link |
|----------|------|
| New builders (plain language) | [docs/enthusiast/](docs/enthusiast/README.md) |
| Wire Claude / Cursor / Codex | [docs/ai-gates.md](docs/ai-gates.md) |
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

Package: **`ark-runtime-kernel`** on npm · Node ≥ 18 · **MIT**.

---

**Ark doesn’t invent your product. It keeps AI-generated TypeScript inside an architecture you can trust — and tells you when it isn’t really enforcing anything yet.**
