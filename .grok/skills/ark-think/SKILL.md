---
name: ark-think
description: "Host-side architectural reasoning — exploratory options from real code + contract, trade-offs, evolution paths. No gate bypass. No package LLM call."
arkVersion: 2.9.1
---

# /ark-think — Architectural reasoning (host LLM only)

You are the user's architecture thinking partner **inside** the project's Ark contract.
This skill does **not** call any LLM API from the arkgate package. **You** (the host agent)
reason; the write-gate and CI remain deterministic.


## Dual engine (mandatory)

| Engine | Role |
|--------|------|
| **Deterministic** | What the contract and doctor *prove* today (layers, rules, governed%, gaps) |
| **Exploratory** | What *this* codebase wants to become — options grounded in files you open |

Never reason only from abstract hexagons. Open real modules before recommending a shape.

## When to use

- Design trade-offs before writing code
- “Should this be a new layer or a feature slice?”
- Evolving brownfield layout toward a named preset
- Explaining why a peerIsolation or layer rule exists
- Choosing among 2–3 enforceable futures (not infinite diagrams)

## Steps

1. **Load the contract** — `ark.config.json`, MCP `ark://manifest` if available, and
   `ark-check --coverage --json` / `--doctor` for honesty about governed% and false-green.
2. **Touch the product** — README + **≥5 source files** on the decision surface (the feature,
   package, or boundary under discussion). Name paths in the answer.
3. **Name the active shape** — which preset/archetype fits (hexagonal, vertical-slice,
   ddd-bounded-contexts, feature-sliced, monorepo, …). If none, run `--recommend --json`
   **and** say whether detection matches the tree you opened.
4. **Reason within bounds** — propose options that **stay enforceable** by the gate.
   Prefer concrete paths and import rules over abstract diagrams.
5. **Explore alternatives** — for each option: coupling, testability, **AI-agent safety**
   (will write-gate + skills keep humans honest?), migration cost.
6. **Surface hard lines** — never suggest: weakening `ark.config.json` to pass, silent
   judgment auto-apply, codemod engines, or skipping write-gate/CI.
7. **Hand off** — placement `/ark-place`; config `/ark-contract`; bulk debt `/ark-loop` /
   `/ark-autopilot`; map-only `/ark-explore`; violations `/ark-fix`.
   When the user needs action not advice: **STOP — do not continue this skill as complete** — invoke the handoff skill.

## Output format

- **Context:** product + contract + what you opened (paths)
- **Options:** 2–3 alternatives with trade-offs (coupling, testability, agent safety, enforceability)
- **Recommendation:** one option + why it is enforceable **today**
- **Risks if we pick wrong:** one sentence user-visible impact
- **Next command:** exact `ark-check` / skill to run next

## Related

- Greenfield shape: `/ark-architect`
- Brownfield: `/ark-adopt`
- Full recon: `/ark-explore`
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
