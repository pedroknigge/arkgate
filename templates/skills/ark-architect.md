---
name: ark-architect
description: Shortcut to /ark-adopt for a new tree. Deprecated as a first-class door.
---

# /ark-architect — Shortcut to /ark-adopt

**Not a first-class door.** One-release redirect. Session 0 is **`/ark-adopt`**.
Do that job now. Contener · Guiar · Ordenar — this leftover name is not a star.

## When / not when

| Use this leftover name when… | Prefer instead |
|------------------------------|----------------|
| Muscle memory / old docs say architect | **`/ark-adopt`** (greenfield + brownfield) |
| Empty tree needs a shape | Same — adopt writes the recommend result |

## Dual engine (mandatory)

| Engine | Role |
|--------|------|
| **Deterministic** | CLI / MCP / contract sensors — exit codes, plan kinds, coverage numbers, install status |
| **Exploratory** | You open **this** repo's real files and product surface before concluding |

The CLI is a **sensor**, never the whole job. Claiming done without the exploratory bar for this skill is **incomplete**.

## MCP workspace binding (mandatory)

Before any `ark_*` MCP tool, call `ark_identity` with `project.expectedRoot` set to the exact
workspace root. Continue only when `binding.status === "matched"` and `authoritative === true`;
retain `projectIdentity.projectId`, then pass both `expectedRoot` and `expectedProjectId` under
`project` on every later MCP call. If identity is missing, mismatched, unverified, or the root is
uncertain, do not consume MCP analysis: use the workspace-local CLI and report that MCP
restart/retargeting is required. `ark://manifest` never satisfies this preflight.

Then call **`ark_recommend`** with the same bound `project` envelope (or `ark-check --recommend`).

## Subagent fan-out (optional, host-dependent)

If the host supports **parallel subagents**, fan out read-only scouts; otherwise
**fall back to sequential**. Never weaken the gate.

## Steps

1. Bind MCP (`ark_identity` then `ark_recommend`) or run `ark-check --recommend`.
2. Execute **`/ark-adopt`** now (write the path, optional advisory extras).
3. New file → `/ark-place`. Map → `/ark-explore`. Apply → `/ark-autopilot`.
   Wire ArkRun → `/ark-runtime`. Wire ArkOrder → `/ark-order`.

## Completion contract (skill incomplete if missing)

Skill incomplete if missing any field below.

### Completion
- **Sensor:** commands/tools run
- **Opened:** real paths read (or `n/a` only if pure install/upgrade with no source analysis)
- **Result:** one-line outcome
- **Planes:** one-line split of residual **[Layer]** vs **[ArkRules]** vs **[ArkRun]** vs **[ArkOrder]** (or `n/a` if unused)
- **Compass:** top residual lenses | `n/a`
- **Handoff:** `/ark-adopt` / `/ark-place` / `none`
- **Incomplete?** `no` | `yes — <what is missing>`
