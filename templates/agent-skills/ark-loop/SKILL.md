---
name: ark-loop
description: Shortcut to /ark-autopilot for driving plan A to zero. Deprecated as a first-class door. CLI validates — you edit code.
---

# /ark-loop — Shortcut to /ark-autopilot

**Deprecated as a first-class door.** Driving `--plan` to `goal.met` is **`/ark-autopilot`**.
Do that job now. Auto-apply only the four `mechanical-safe` kinds; judgment you write.

## Autonomy contract

Invoking this leftover name **is** the approval to apply plan A. Open every step file.
Write. Re-check. Empty plan A + leftover design → **`/ark-explore`** then **`/ark-autopilot`**
for one extraction card (never mechanical-safe B).

## When / not when

| Use this leftover name when… | Prefer instead |
|------------------------------|----------------|
| Plan A has steps; drive to `goal.met` | **`/ark-autopilot`** |
| Mechanical-safe + judgment apply | Map only → `/ark-explore`; session 0 → `/ark-adopt` |

## Dual engine (mandatory)

| Engine | Role |
|--------|------|
| **Deterministic** | Only the four `mechanical-safe` kinds auto-apply; plan tags; gate re-check |
| **Exploratory** | Read sources; detect concentrated edges / false-green before grinding |

The CLI is a **sensor**, never the whole job. Claiming done without the exploratory bar for this skill is **incomplete**.

## MCP workspace binding (mandatory)

Before any `ark_*` MCP tool, call `ark_identity` with `project.expectedRoot` set to the exact
workspace root. Continue only when `binding.status === "matched"` and `authoritative === true`;
retain `projectIdentity.projectId`, then pass both `expectedRoot` and `expectedProjectId` under
`project` on every later MCP call. If identity is missing, mismatched, unverified, or the root is
uncertain, do not consume MCP analysis: use the workspace-local CLI and report that MCP
restart/retargeting is required. `ark://manifest` never satisfies this preflight.

Atomic multi-file work uses **`ark_prepare_change`** with the same matched `project` envelope.

## Dual plane — layers + ArkRules (mandatory, except /ark-runtime)

Label findings **`[Layer]`** vs **`[ArkRules]`**. Never invent `mechanical-safe` kinds.

## Subagent fan-out (optional, host-dependent)

If the host supports **parallel subagents**, fan out read-only scouts; otherwise
**fall back to sequential**. Never weaken the gate.

## Related onboarding

- **Greenfield:** `/ark-adopt` or `ark-check --recommend` / `ark start`.
- **Brownfield:** `/ark-adopt`.

## Steps

1. `--plan --json`. Open every `steps[]` file.
2. If one edge dominates: **STOP — do not continue this skill as complete.**
   **STOP — concentrated edge:** execute **`/ark-adopt`**.
3. If empty cores + I/O under Application: **STOP — do not continue this skill as complete.**
   **STOP — false-green:** execute **`/ark-adopt`**.
4. Else execute **`/ark-autopilot`** (mechanical-safe + judgment). Extraction card for Shape B.

## Mechanical-edit hygiene (outcome gate)

- Header injection must **merge into the existing doc comment**; the kept result has one `/**`, not stacked headers.
- Route completion or movement must **preserve the original typed `defineRoute<…>(opts, handler)` call**; reconstruct that call instead of extracting untyped opts/handler constants that drop generics or contextual typing.
- A convention-only `*-data.ts` stub is not a fix: move the real code or **leave the placeholder file uncreated**; never write `import "server-only"; export {}` as an empty naming token.
- Keep the edit only when the **previously clean file stays typecheck-clean**. Otherwise roll it back and treat the change as judgment.

## Completion contract (skill incomplete if missing)

Skill incomplete if missing any field below.

### Completion
- **Sensor:** commands/tools run
- **Opened:** real paths read (or `n/a` only if pure install/upgrade with no source analysis)
- **Result:** one-line outcome
- **Planes:** one-line split of residual **[Layer]** vs **[ArkRules]** (or `n/a` if unused)
- **Compass:** top residual lenses | `n/a`
- **Handoff:** `/ark-autopilot` / `/ark-explore` / `none`
- **Incomplete?** `no` | `yes — <what is missing>`
