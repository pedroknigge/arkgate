---
name: ark-contract
description: Shortcut to /ark-adopt (session 0) or /ark-autopilot (later config tighten). Deprecated as a first-class door.
---

# /ark-contract — Shortcut to adopt / autopilot

**Not a first-run door.** This leftover name is a shortcut. Writing `ark.config.json` is
**`/ark-adopt`** at session 0 and **`/ark-autopilot`** afterward. Do that job now.

## Autonomy contract

Invoking this leftover name **is** the approval to write an honest config. Do not
preview-only. Never weaken the architecture config.

## When / not when

| Use this leftover name when… | Prefer instead |
|------------------------------|----------------|
| Layers / include / ArkRules need an edit | **`/ark-adopt`** (path) or **`/ark-autopilot`** (tighten) |
| False-green / concentrated edge | **`/ark-adopt`** — write the honest config |

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

## Dual plane — layers + ArkRules (mandatory, except /ark-runtime)

Label findings **`[Layer]`** vs **`[ArkRules]`**. Absence of `arkRules` is valid.

## Subagent fan-out (optional, host-dependent)

If the host supports **parallel subagents**, fan out read-only scouts; otherwise
**fall back to sequential**. Never weaken the gate.

## Related onboarding

- **Greenfield:** `/ark-adopt` or `ark-check --recommend` / `ark start`.
- **Brownfield:** `/ark-adopt` — match config to reality.

## Steps

1. If the path is missing or lying → execute **`/ark-adopt`**.
2. If the path is honest and you are tightening rules → execute **`/ark-autopilot`**.
3. `ark-check --strict-config`.

## Completion contract (skill incomplete if missing)

Skill incomplete if missing any field below.

### Completion
- **Sensor:** commands/tools run
- **Opened:** real paths read (or `n/a` only if pure install/upgrade with no source analysis)
- **Result:** one-line outcome
- **Planes:** one-line split of residual **[Layer]** vs **[ArkRules]** (or `n/a` if unused)
- **Compass:** top residual lenses | `n/a`
- **Handoff:** `/ark-adopt` / `/ark-autopilot` / `none`
- **Incomplete?** `no` | `yes — <what is missing>`
