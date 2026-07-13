---
name: ark-think
description: Host-side architectural reasoning — 2–3 enforceable options from real code + contract for ONE decision. Not full recon (use /ark-explore). No gate bypass. No package LLM call.
arkVersion: 3.0.0
---

# /ark-think — Architectural reasoning (host LLM only)

You are the user's architecture thinking partner **inside** the project's Ark contract.
This skill does **not** call any LLM API from the arkgate package. **You** (the host agent)
reason; the write-gate and CI remain deterministic.

## When / not when

| Use `/ark-think` when… | Do **not** use it when… |
|------------------------|-------------------------|
| One decision: new layer vs slice, port vs shared, peerIsolation choice | Full map / ranked residual / dual-plan seed → `/ark-explore` |
| 2–3 options already bounded by a known surface | Apply remediation → `/ark-fix` / `/ark-loop` / `/ark-autopilot` |
| Trade-offs before writing a **new** feature | Brownfield contract wrong / false-green → `/ark-adopt` then `/ark-contract` |
| Explain *why* a rule exists in *this* tree | HTML tour → `/ark-explain`; fitness numbers → `/ark-coverage` |

If you lack a product map and the tree is messy: run a **compressed** explore pass first
(≥8 files) **or** **STOP** and invoke `/ark-explore` — do not invent options from diagrams alone.

## Dual engine (mandatory)

| Engine | Role |
|--------|------|
| **Deterministic** | What the contract and doctor *prove* today (layers, rules, governed%, gaps) |
| **Exploratory** | What *this* decision surface wants — options grounded in files you open |

Never reason only from abstract hexagons. Open real modules before recommending a shape.

## Subagent fan-out (optional, host-dependent)

When the user asks to go faster **or** the work naturally splits (multiple packages,
feature dirs, plan clusters), you **may** dispatch **subagents**:

| Host capability | Behavior |
|-----------------|----------|
| **Parallel subagents supported** (e.g. multi-agent / `spawn_subagent` / concurrent Agent tools) | Launch **2–N** agents in **one wave** with **disjoint path scopes**. Prefer **read-only** explore agents for mapping; at most **one writer** unless the host gives isolated worktrees. Parent merges findings, then runs `ark-check` once. |
| **Not supported** (single agent only) | **Fall back to sequential** — same checklist, one cluster/step at a time. Never claim parallel work you did not run. |

**Rules:**
1. Give each subagent a **tight brief**: paths in scope, sensor commands allowed, deliverable shape (paths opened + findings JSON or bullets).
2. **No shared mutable files** across parallel writers.
3. STOP handoffs and dual-engine rules still apply in every agent.
4. Parent owns the **### Completion** block (union of **Opened**, single **Handoff**).
5. Do **not** use subagents to weaken the gate or invent `mechanical-safe` kinds.

## Steps

1. **Load the contract** — `ark.config.json`, MCP `ark://manifest` if available, and
   `ark-check --coverage --json` / `--doctor` for honesty about governed% and false-green.
2. **Touch the decision surface** — README skim + **≥5 source files** on the feature/package/boundary
   under discussion. Name paths in the answer.
3. **Name the active shape** — which preset/archetype fits (hexagonal, vertical-slice,
   ddd-bounded-contexts, feature-sliced, monorepo, …). If none, run `--recommend --json`
   **and** say whether detection matches the tree you opened.
4. **Name concurrent patterns** on the decision surface (if ≥2): which is **golden** vs legacy.
5. **Reason within bounds** — propose **2–3 options** that **stay enforceable** by the gate.
   Prefer concrete paths and import rules over abstract diagrams.
6. **Explore alternatives** — for each option: coupling, testability, **AI-agent safety**,
   migration cost, **pilot + kill-switch** if the option adds a layer or wall.
7. **Surface hard lines** — never suggest: weakening `ark.config.json` to pass, silent
   judgment auto-apply, codemod engines, or skipping write-gate/CI.
8. **Hand off** — placement `/ark-place`; config `/ark-contract`; bulk debt `/ark-loop` /
   `/ark-autopilot`; map-only `/ark-explore`; violations `/ark-fix`.
   When the user needs action not advice: **STOP — do not continue this skill as complete** — invoke the handoff skill.

## Output format

- **Context:** product + contract + what you opened (paths) + phase if known (Align/Stabilize/Shape)
- **Options:** 2–3 alternatives with trade-offs (coupling, testability, agent safety, enforceability)
- **Recommendation:** one option + why it is enforceable **today**
- **Pilot / kill-switch:** if the choice changes shape or adds a layer
- **Risks if we pick wrong:** one sentence user-visible impact
- **Next command:** exact `ark-check` / skill to run next

## Related

- Greenfield shape: `/ark-architect`
- Brownfield: `/ark-adopt`
- Full recon / dual-plan seed: `/ark-explore`
- Explain existing: `/ark-explain`

## Completion contract (skill incomplete if missing)

End with **exactly** these headings (markdown `###`):

### Completion
- **Sensor:** commands/tools run
- **Opened:** real paths read (or `n/a` only if pure install/upgrade with no source analysis)
- **Result:** one-line outcome
- **Handoff:** `/ark-…` / CLI / `none`
- **Incomplete?** `no` | `yes — <what is missing>`

If a **STOP** handoff applies and you continued as if done, set **Incomplete?** to `yes`.
**Skill incomplete if missing** any of the bullets above.
