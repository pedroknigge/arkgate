---
name: ark-architect
description: Shortcut to /ark-adopt for greenfield shape. Deprecated as a first-class door. Do adopt’s job.
---

# /ark-architect — Shortcut to /ark-adopt

**Not a first-run door.** This leftover name is a shortcut. Session 0 is **`/ark-adopt`**.
Do that job now. Do not send the user to `/ark-contract` or `/ark-fix`.

## Autonomy contract

Invoking this skill **is** the approval to mark the path. Write `ark.config.json` and
phase-1 dirs in this turn. Then `ark-check`.

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

## Dual plane — layers + ArkRules (mandatory, except /ark-runtime)

Label findings **`[Layer]`** vs **`[ArkRules]`**. Absence of `arkRules` is valid.

## Subagent fan-out (optional, host-dependent)

If the host supports **parallel subagents**, fan out read-only scouts; otherwise
**fall back to sequential**. Never weaken the gate.

## Related onboarding

- **Greenfield:** this shortcut → **`/ark-adopt`** + `ark-check --recommend` / `ark start`.
- **Brownfield:** `/ark-adopt` — do not force a starter preset.

## Steps

1. Bind MCP (`ark_identity` then `ark_recommend`) or run `ark-check --recommend`.
2. Execute **`/ark-adopt`** autonomy: write the config, dirs, optional advisory ArkRules, gates.
3. `ark-check --strict-config`. Handoff `/ark-place` for new files.

## Completion contract (skill incomplete if missing)

Skill incomplete if missing any field below.

### Completion
- **Sensor:** commands/tools run
- **Opened:** real paths read (or `n/a` only if pure install/upgrade with no source analysis)
- **Result:** one-line outcome
- **Planes:** one-line split of residual **[Layer]** vs **[ArkRules]** (or `n/a` if unused)
- **Compass:** top residual lenses | `n/a`
- **Handoff:** `/ark-adopt` / `/ark-place` / `none`
- **Incomplete?** `no` | `yes — <what is missing>`
