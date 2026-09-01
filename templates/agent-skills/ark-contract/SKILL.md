---
name: ark-contract
description: Shortcut — edit the rules file or extra rules. Use /ark-adopt or /ark-autopilot.
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
| Layers / include / ArkRules / **ArkRun extra** / **ArkOrder extra** need an edit | **`/ark-adopt`** (path, first `arkRun` / first `arkOrder`) or **`/ark-autopilot`** (tighten) |
| False-green / concentrated edge | **`/ark-adopt`** — write the honest config |
| Kernel extra / one kernel candidate | **`/ark-runtime`** — leftover name; wires `arkgate/runtime`, not a second package |

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

## Dual plane — layers + extras (mandatory, except /ark-runtime)

Label findings **`[Layer]`** vs **`[ArkRules]`** vs **`[ArkRun]`** vs **`[ArkOrder]`**. Absence of extras is valid and silent. First-time extra is **`/ark-adopt`** (advisory). Wire one kernel candidate with **`/ark-runtime`**. New kernel-managed / plane-root file with **`/ark-place`**. Grind skip clusters with **`/ark-autopilot`**. Do not invent `/ark-run` or `/ark-order`. Skills never enforce.

Application / Features may declare advisory **`writes-via-aggregate`**: a use-case that imports a persistence driver and calls `.insert` / `.create` / `INSERT INTO` is the skip. Persistence adapters stay the write edge. Do not add `Externals/` or `admission.ts` as contract law.

When `arkOrder` is on, name **`xiKeys`** (3–5 slow product decisions). Membership ids and recomputable statuses are not keys: derive a status on read or fold it from ingest instead. A use-case that persists those keys is `ARKORDER_XI_FIELD_WRITE`. First freeze is `release()`; later ξ is `proposeRelease` then `apply`; `refreshSigma`; ingest residual `absorb | escalate_up | hold` + `reasonCode`; capacity pack as data; in-memory `ReleaseStore`; ArkRun `decisionTape`. Copy [examples/arkorder-billing/](../../../examples/arkorder-billing/) and rename the three keys. The check remains silent on semantic entailment.

## Subagent fan-out (optional, host-dependent)

If the host supports **parallel subagents**, fan out read-only scouts; otherwise
**fall back to sequential**. Never weaken the gate.

## Related onboarding

- **Greenfield:** `/ark-adopt` or `ark-check --recommend` / `ark start`.
- **Brownfield:** `/ark-adopt` — match config to reality.

## Steps

1. If the path is missing or lying → execute **`/ark-adopt`** (including first advisory `arkRun` / first advisory `arkOrder`).
2. If the path is honest and you are tightening rules or extras (`arkRun` / `arkOrder`) → execute **`/ark-autopilot`**.
3. One kernel candidate (extra already on) → **`/ark-runtime`**. `ark-check --strict-config`.

## Completion contract (skill incomplete if missing)

Skill incomplete if missing any field below.

### Completion
- **Sensor:** commands/tools run
- **Opened:** real paths read (or `n/a` only if pure install/upgrade with no source analysis)
- **Result:** one-line outcome
- **Planes:** one-line split of residual **[Layer]** vs **[ArkRules]** vs **[ArkRun]** vs **[ArkOrder]** (or `n/a` if unused)
- **Compass:** top residual lenses | `n/a`
- **Handoff:** `/ark-adopt` / `/ark-autopilot` / `none`
- **Incomplete?** `no` | `yes — <what is missing>`
