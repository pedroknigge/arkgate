<div align="center">

# Structrail — Architecture Co-pilot for AI TypeScript

**One contract. One gate. One co-pilot.**

Your AI writes most of the code. Structrail keeps that code inside an architecture you can trust —
and makes sure a “green” check means something real.

<!-- legacy-identity:start external-cutover -->
[![CI](https://github.com/pedroknigge/arkgate/actions/workflows/ci.yml/badge.svg)](https://github.com/pedroknigge/arkgate/actions/workflows/ci.yml)
<!-- legacy-identity:end -->
[![npm](https://img.shields.io/npm/v/structrail?color=cb3837&label=npm)](https://www.npmjs.com/package/structrail)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js)
![TS 5–7](https://img.shields.io/badge/TypeScript-5%20%7C%206%20%7C%207-3178c6?logo=typescript)

</div>

---

## The only flow (humans and agents)

If you remember nothing else:

```text
1.  npx structrail start          ← walk tree → contract → **day-zero origin** → gates
2.  /structrail-autopilot             ← explore first, dual plan, safe fixes, leave gates on
3.  npx structrail-check --doctor ← “where am I?” anytime (one status screen)
```

| Stuck on… | Do this |
|-----------|---------|
| Gate failed after an edit | `/structrail-fix` |
| “Where does this new file go?” | `/structrail-place` |
| Contract globs / layers wrong | `/structrail-contract` |
| New Structrail version | `/structrail-upgrade` |

**Everything else is optional.** You do not need to learn “modes”, 11 skills, or the runtime
kernel to get value. Agents that are unsure should **only** run `/structrail-autopilot` (or the three
commands above).

---

## What it is (30 seconds)

**Structrail** = a machine-readable architecture file (`structrail.config.json`) enforced at CI, with
host-specific protection while an agent writes:

| When | Tool |
|------|------|
| **While the AI writes** | Hard PreToolUse block on Claude/Grok; advisory MCP on Cursor/Codex |
| **Before merge** | `structrail-check` CI check; merge blocking requires it as a required status |

Optional later: the **experimental** runtime kernel (`createStructrailKernel`) if you want to evaluate
event/intent governance. It is not required for gate adoption.

It is **not** a web framework, ORM, or job runner.

![Write gate: agent blocked, then self-corrects](docs/assets/structrail-write-gate.svg)

---

## Who it’s for

Same start for almost everyone: **`npx structrail start` → `/structrail-autopilot`**.

| You are… | Same start, then… |
|----------|-------------------|
| Builder with AI | Stay on autopilot until doctor is happy |
| Tech lead on a messy monorepo | Autopilot (or deeper `/structrail-adopt` if you want a focused brownfield pass) |
| Power user | Same flow; use `structrail-check --plan` / `--coverage` when you want the raw sensor |

**Not for:** no TypeScript, “just one lint rule”, or looking for an app framework.

---

## Status, not settings (“modes”)

`structrail-check --doctor` may say **Suggest / Adapt / Enforce**. That is a **status light**, not a
mode you configure:

| Light | Means | Your move |
|-------|--------|-----------|
| **Suggest** | New/thin project | Finish `start` + autopilot |
| **Adapt** | Not fully protected yet | Keep autopilot / adopt until clean |
| **Enforce** | Contract coverage is honest and checked edges are clean | Keep the host-appropriate write path; require the CI status if it must block merges |

You **arrive** at Enforce. You never “turn on Enforce”.

---

## Upgrading from `ark-runtime-kernel`?

**Same product**, new package name. Config and `/structrail-*` skills stay.

```bash
npm uninstall ark-runtime-kernel && npm install -D structrail
npx structrail-check --install-agent-gates --force
npx structrail-check --doctor
```

Full checklist (CI, MCP, Codex, imports): **[docs/migrate-from-ark-runtime-kernel.md](docs/migrate-from-ark-runtime-kernel.md)**.

---

## Start in one minute

```bash
npm install -D structrail typescript
npx structrail start                 # contract → day-zero origin → gates + plan
# in agent:
#   /structrail-autopilot
npx structrail-check --doctor        # status light + next action
```

**npm / pnpm / yarn.** No install lifecycle scripts.

<!-- legacy-identity:start v3-compatibility removal=v4 -->
Migrating from ArkGate v2? The deprecated `arkgate@3` wrapper retains `arkgate*`, `ark*`,
`ark.config.json`, `ARK_*`, `ark://…`, `ark_*`, and `/ark-*` for all of v3. New work should use
Structrail names. See the [v3 migration guide](docs/migrations/arkgate-to-structrail.md).
<!-- legacy-identity:end -->

<details>
<summary>What <code>/structrail-autopilot</code> does under the hood (optional detail)</summary>

1. Setup if needed (`structrail start` — contract, then **day-zero origin**, then gates).
2. **Explore pass** (decision-grade map of *this* product; field path when demos exist).
3. **Dual plan:** **A** remediation from `--plan` (mechanical-safe only by default); **B** pattern/evolution bets (never auto-applied as mechanical-safe). Empty plan ≠ “healthy” without explore/B.
4. Apply A → re-check; judgment only when you ask for full apply.
5. Gates on + latest report (evolution vs frozen origin).

Standalone recon without applying: `/structrail-explore`.

</details>

<details>
<summary>Manual / power-user CLI only</summary>

```bash
npx structrail init
npx structrail-check
npx structrail-check --plan
npx structrail-check --coverage
```

</details>

---

## Other skills (only when you need them)

Install once: `npx structrail-check --install-agent-gates`
(`--tools claude,cursor,codex,grok` to pick hosts.)

**Default is always `/structrail-autopilot`.** The rest are escapes, not a second curriculum.
Generated `AGENTS.md` includes a **skill routing table** (trigger → skill). Skills are
**dual-engine** (CLI sensor + read real source) and end with a fixed **completion contract**;
critical handoffs say **STOP** and name the next skill (hosts must follow — markdown cannot chain calls).
When the host allows it, skills may **fan out parallel subagents** (disjoint scopes);
otherwise they **fall back to sequential**.

**Write path (Track W):** Prefer MCP **`structrail_prepare_write`** when you have a snippet (place +
constrain + validate + optional `autoPatch` + `judgmentBrief`). PreToolUse hooks with
`--hook-repair` on Claude/Grok emit machine-readable repair payloads on deny (still hard block;
never silent write). Cursor/Codex MCP calls remain advisory. See
[docs/ai-gates.md](docs/ai-gates.md).

| Need | Skill |
|------|--------|
| Only the apply loop (plan already exists) | `/structrail-loop` |
| Empty greenfield shape/scaffold | `/structrail-architect` |
| Deep brownfield / manifest mining alone | `/structrail-adopt` |
| Exploratory map of the real product (no apply) | `/structrail-explore` |
| New file placement | `/structrail-place` |
| Gate violation on a change | `/structrail-fix` |
| Design trade-offs within the contract (no package LLM) | `/structrail-think` |
| Edit `structrail.config.json` safely | `/structrail-contract` |
| Plain-language tour of the report | `/structrail-explain` |
| Deep coverage + opportunities audit | `/structrail-coverage` |
| Evaluate the experimental runtime against hand-rolled bus/outbox (TS) | `/structrail-runtime` |
| Bump Structrail + refresh active host (defer Codex when not on Codex) | `/structrail-upgrade` |

### Host enforcement support

<!-- structrail-host-support:start -->
| Host | Local write boundary | MCP validation | CI / merge path | Repair payload |
|------|----------------------|----------------|-----------------|----------------|
| Claude Code | Hard block for PreToolUse `Write` / `Edit` / `MultiEdit` | Advisory; the agent must call it | Available `structrail-check --strict-merge` check | Emitted on hook deny; host must re-inject |
| Grok Build | Hard block for PreToolUse `write` / `search_replace` (plus aliases) | Advisory; the agent must call it | Available `structrail-check --strict-merge` check | Emitted on hook deny; host must re-inject |
| Cursor | No hard hook; MCP/rules are advisory | Advisory; the agent must call it | Available `structrail-check --strict-merge` check | No hard-boundary payload |
| OpenAI Codex | No hard hook; MCP/rules are advisory | Advisory; the agent must call it | Available `structrail-check --strict-merge` check | No hard-boundary payload |

This table describes the supported profile **after its files are installed and the host loads/trusts them**. A hard local boundary covers only the listed hook operations; alternate tools, direct filesystem writes, and human edits still rely on CI. MCP validation is advisory because the agent must call it. The CI check blocks a merge only when the repository makes that status required. Repair payloads never write code silently: the host must re-inject the candidate and Structrail revalidates it. Run `structrail-check --doctor` for the evidence actually detected in the current repository.
<!-- structrail-host-support:end -->

Detailed setup: [docs/ai-gates.md](docs/ai-gates.md).

---

## How it works (short)

```
structrail.config.json
      │
      ├─► Write path (structrail-mcp)  — hard hook or advisory MCP, by host
      ├─► CI check (structrail-check)  — merge block only when status is required
      └─► Runtime kernel            — experimental opt-in; gates do not need it
```

- **Presets:** hexagonal, layered, feature-sliced, monorepo, ui-surface, vertical-slice, ddd-bounded-contexts (+ aliases clean-architecture / onion-architecture). Layers start optional; doctor suggests tightening populated cores. Cross-slice / cross-context bans use optional `peerIsolation` rules.
- **Frameworks:** Nest / Next / express / library layouts get sensible globs on init so day-one coverage is real.
- **Brownfield:** baseline ratchet, refuse to freeze a wrong contract, `/structrail-adopt` for mature trees.
- **Agents:** skills install into Claude / Cursor / Codex / Grok; `structrail start` freezes **day-zero origin** under `.ark/reports/` **before** agent docs/CI templates.
- **Write protocol (2.10 / Track W):** mechanical-safe **autoPatch** on the write gate (`import type`); MCP **`structrail_prepare_write`** (place + validate + patch + judgmentBrief); opt-in hook **`--hook-repair`** (`STRUCTRAIL_REPAIR_JSON`); doctor **`writePath`** (repair vs reject-only); loop-cost eval (`npm run eval:loop-cost`). Port-proof inject is **judgment** (arity change), not silent auto-apply.
- **Fail-closed CI (2.11):** `--strict-merge` combines config coverage, shared gate-file
  presence, and bypass diagnostics for dynamic imports, TypeScript suppressions, explicit `any`
  casts, InMemory runtime defaults, and disabled peer isolation. `--strict` is a compatibility
  alias. Neither requires an editor hook; use `--require-write-hook claude|grok` when that local
  guarantee is part of the check.
- **Trust / coverage (2.12):** package unit-test floors on the broad product surface
  (statements/lines **≥80%**, branches/functions **≥85%**; enforcement-critical modules **≥95%**
  branch). Explore dual-plan + day-zero origin first (see above). Roadmap next: Q2 repair dogfood matrix.
- **TypeScript:** project compilers 5.x / 6.x / 7.x — gate falls back to a nested JS-API TypeScript when TS 7’s main export is version-only ([docs/typescript-support.md](docs/typescript-support.md)).

### Why not only ESLint / dependency-cruiser / Nx?

| | Structrail | Typical boundary linter |
|--|:---:|:---:|
| CI import rules | ✅ | ✅ |
| Hard-block supported-host AI writes before they land | ✅ (Claude/Grok hooks) | ❌ |
| Contract agents can read (`structrail://manifest`) | ✅ | ❌ |
| Placement tools (`structrail_place`, …) | ✅ | ❌ |
| Honest governed % + adoption path | ✅ | ❌ |
| Classified plan (`mechanical-safe` / judgment) | ✅ | ❌ |
| TypeScript 5 / 6 / 7 project compilers | ✅ | varies |
| Adoption scorecard (hosts / MCP / origin) | ✅ | ❌ |
| **Editor ESLint same layer contract as CI** | ✅ (`structrail/eslint`) | varies |

---

## Common commands

```bash
npx structrail start                         # guided setup: contract → origin → gates → plan
npx structrail-check --doctor                # health + Adoption gaps (not just fitness)
npx structrail-check --doctor --json         # machine-readable doctor.adoption
npx structrail-check --strict                # fail-closed CI + installed-gate/safety checks
npx structrail-check --plan                  # safe-to-auto-fix vs your call
npx structrail-check --coverage              # Governed: N%
npx structrail-check --report structrail-report.html  # showcase HTML (opens in browser on local TTY; --no-open to skip)
npx structrail-check --baseline              # only NEW violations fail
npx structrail upgrade                       # package + gates/skills + MCP/Codex normalize
```

CI (example):

```yaml
- run: npx structrail-check --root . --config structrail.config.json --strict
```

<!-- legacy-identity:start external-cutover -->
# Current repository slug until the external cutover:
```yaml
- uses: pedroknigge/arkgate@<tag-or-SHA>  # runs that checked-out revision
```
<!-- legacy-identity:end -->

---

## Optional experimental runtime kernel

Gates need **no app code changes**. The runtime API is currently **experimental** and is not a
production-readiness claim. If you want to evaluate runtime intent/event contracts, use the
opt-in subpath (preferred):

```ts
import { createStrictStructrailKernelFromConfig } from 'structrail/runtime';
// see docs/production-hardening.md and docs/package-surface.md
```

Root `import { … } from 'structrail'` still re-exports kernel symbols for compatibility
in this major; use `structrail/runtime` when evaluating the experimental surface.

NestJS: `structrail/nestjs` (optional peer `@nestjs/common`).

### Durability stance (built-in stores)

The kernel’s default stores (`InMemoryOutboxStore`, `InMemoryAuditStore`,
`InMemoryReadModelStore`, `InMemoryWorkflowStore`) are **reference in-memory only**:
fine for tests, demos, and single-process local work — they **do not** survive restarts
and are **not** production durability. Implement the store interfaces (or inject your own)
for real systems. Details: [docs/production-hardening.md](docs/production-hardening.md).

---

## Documentation

| Audience | Link |
|----------|------|
| New builders (plain language) | [docs/enthusiast/](docs/enthusiast/README.md) |
| **Package surface (stable vs experimental)** | [docs/package-surface.md](docs/package-surface.md) |
| Wire Claude / Cursor / Codex / Grok + **ESLint (CI-parity)** | [docs/ai-gates.md](docs/ai-gates.md) |
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
npm run check:architecture   # Structrail gates itself
```

**npm:** [`structrail`](https://www.npmjs.com/package/structrail)
**Product:** **Structrail** — architecture co-pilot / gate for AI TypeScript (not a runtime kernel).
CLI: `structrail` · `structrail-check` · `structrail-mcp`.
MCP registry: `io.github.pedroknigge/structrail`.

<!-- legacy-identity:start external-cutover -->
**Source during the gated external cutover:**
[github.com/pedroknigge/arkgate](https://github.com/pedroknigge/arkgate).
No Structrail domain is advertised until reservation and legal checks are recorded.
<!-- legacy-identity:end -->

Node ≥ 18 · **MIT**.

---

**Structrail doesn’t invent your product. It keeps AI-generated TypeScript inside an architecture you can trust — and tells you when it isn’t really enforcing anything yet.**
