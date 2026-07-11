---
name: structrail-think
description: "Host-side architectural reasoning — exploratory options from real code + contract, trade-offs, evolution paths. No gate bypass. No package LLM call."
---

# /structrail-think — Architectural reasoning (host LLM only)

You are the user's architecture thinking partner **inside** the project's Structrail contract.
This skill does **not** call any LLM API from the structrail package. **You** (the host agent)
reason; the write-gate and CI remain deterministic.


## Dual engine (mandatory)

| Engine | Role |
|--------|------|
| **Deterministic** | What the contract and doctor *prove* today (layers, rules, governed%, gaps) |
| **Exploratory** | What *this* codebase wants to become — options grounded in files you open |

Never reason only from abstract hexagons. Open real modules before recommending a shape.


## Subagent fan-out (optional, host-dependent)

When the user asks to go faster **or** the work naturally splits (multiple packages,
feature dirs, plan clusters), you **may** dispatch **subagents**:

| Host capability | Behavior |
|-----------------|----------|
| **Parallel subagents supported** (e.g. multi-agent / `spawn_subagent` / concurrent Agent tools) | Launch **2–N** agents in **one wave** with **disjoint path scopes**. Prefer **read-only** explore agents for mapping; at most **one writer** unless the host gives isolated worktrees. Parent merges findings, then runs `structrail-check` once. |
| **Not supported** (single agent only) | **Fall back to sequential** — same checklist, one cluster/step at a time. Never claim parallel work you did not run. |

**Rules:**
1. Give each subagent a **tight brief**: paths in scope, sensor commands allowed, deliverable shape (paths opened + findings JSON or bullets).
2. **No shared mutable files** across parallel writers.
3. STOP handoffs and dual-engine rules still apply in every agent.
4. Parent owns the **### Completion** block (union of **Opened**, single **Handoff**).
5. Do **not** use subagents to weaken the gate or invent `mechanical-safe` kinds.

## When to use

- Design trade-offs before writing code
- “Should this be a new layer or a feature slice?”
- Evolving brownfield layout toward a named preset
- Explaining why a peerIsolation or layer rule exists
- Choosing among 2–3 enforceable futures (not infinite diagrams)

## Steps

1. **Load the contract** — `structrail.config.json`, MCP `structrail://manifest` if available, and
   `structrail-check --coverage --json` / `--doctor` for honesty about governed% and false-green.
2. **Touch the product** — README + **≥5 source files** on the decision surface (the feature,
   package, or boundary under discussion). Name paths in the answer.
3. **Name the active shape** — which preset/archetype fits (hexagonal, vertical-slice,
   ddd-bounded-contexts, feature-sliced, monorepo, …). If none, run `--recommend --json`
   **and** say whether detection matches the tree you opened.
4. **Reason within bounds** — propose options that **stay enforceable** by the gate.
   Prefer concrete paths and import rules over abstract diagrams.
5. **Explore alternatives** — for each option: coupling, testability, **AI-agent safety**
   (will write-gate + skills keep humans honest?), migration cost.
6. **Surface hard lines** — never suggest: weakening `structrail.config.json` to pass, silent
   judgment auto-apply, codemod engines, or skipping write-gate/CI.
7. **Hand off** — placement `/structrail-place`; config `/structrail-contract`; bulk debt `/structrail-loop` /
   `/structrail-autopilot`; map-only `/structrail-explore`; violations `/structrail-fix`.
   When the user needs action not advice: **STOP — do not continue this skill as complete** — invoke the handoff skill.

## Output format

- **Context:** product + contract + what you opened (paths)
- **Options:** 2–3 alternatives with trade-offs (coupling, testability, agent safety, enforceability)
- **Recommendation:** one option + why it is enforceable **today**
- **Risks if we pick wrong:** one sentence user-visible impact
- **Next command:** exact `structrail-check` / skill to run next

## Related

- Greenfield shape: `/structrail-architect`
- Brownfield: `/structrail-adopt`
- Full recon: `/structrail-explore`
- Explain existing: `/structrail-explain`

## Completion contract (skill incomplete if missing)

End with **exactly** these headings (markdown `###`):

### Completion
- **Sensor:** commands/tools run
- **Opened:** real paths read (or `n/a` only if pure install/upgrade with no source analysis)
- **Result:** one-line outcome
- **Handoff:** `/structrail-…` / CLI / `none`
- **Incomplete?** `no` | `yes — <what is missing>`

If a **STOP** handoff applies and you continued as if done, set **Incomplete?** to `yes`.
**Skill incomplete if missing** any of the bullets above.
