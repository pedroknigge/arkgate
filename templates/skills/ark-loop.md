---
name: ark-loop
description: Shortcut to /ark-autopilot for illegal-import fixes. CLI validates — you edit code.
---

# /ark-loop — Shortcut to /ark-autopilot

**Not a first-class door.** One-release redirect. Driving `--plan` to `goal.met` is
**`/ark-autopilot`**. Do that job now.
Contener · Guiar · Ordenar — this leftover name is not a star.

## When / not when

| Use this leftover name when… | Prefer instead |
|------------------------------|----------------|
| Plan A has steps; drive to `goal.met` | **`/ark-autopilot`** |
| Map only | `/ark-explore` |
| Session 0 | `/ark-adopt` |

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

## Subagent fan-out (optional, host-dependent)

If the host supports **parallel subagents**, fan out read-only scouts; otherwise
**fall back to sequential**. Never weaken the gate.

## Related onboarding

- **Greenfield:** `/ark-adopt` or `ark-check --recommend` / `ark start`.
- **Brownfield:** `/ark-adopt`.

## Mechanical-edit hygiene (outcome gate)

Leftover name, same edit bar as `/ark-autopilot` if you still land here.

- Header injection must **merge into the existing doc comment**; the kept result has one `/**`, not stacked headers.
- Route completion or movement must **preserve the original typed `defineRoute<…>(opts, handler)` call**; reconstruct that call instead of extracting untyped opts/handler constants that drop generics or contextual typing.
- A convention-only `*-data.ts` stub is not a fix: move the real code or **leave the placeholder file uncreated**; never write `import "server-only"; export {}` as an empty naming token.
- Keep the edit only when the **previously clean file stays typecheck-clean**. Otherwise roll it back and treat the change as judgment.

## Steps

1. `--plan --json`. Open every `steps[]` file.
2. If one edge dominates: **STOP — do not continue this skill as complete.**
   **STOP — concentrated edge:** execute **`/ark-adopt`**.
3. If empty cores + I/O under Application: **STOP — do not continue this skill as complete.**
   **STOP — false-green:** execute **`/ark-adopt`**.
4. Else execute **`/ark-autopilot`** (mechanical-safe + judgment). Extraction card for Shape B.

## Completion contract (skill incomplete if missing)

Skill incomplete if missing any field below.

### Completion
- **Sensor:** commands/tools run
- **Opened:** real paths read (or `n/a` only if pure install/upgrade with no source analysis)
- **Result:** one-line outcome
- **Planes:** one-line split of residual **[Layer]** vs **[ArkRules]** vs **[ArkRun]** vs **[ArkOrder]** (or `n/a` if unused)
- **Compass:** top residual lenses | `n/a`
- **Handoff:** `/ark-autopilot` / `/ark-explore` / `none`
- **Incomplete?** `no` | `yes — <what is missing>`
