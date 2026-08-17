---
name: ark-fix
description: Shortcut to /ark-autopilot for a small violation cluster. Deprecated as a first-class door.
---

# /ark-fix — Shortcut to /ark-autopilot

**Not a first-run door.** This leftover name is a shortcut. Gate violations are
**`/ark-autopilot`**. Do that job now. CLI only validates.

## Autonomy contract

Invoking this leftover name **is** the approval to write the fix. Open importers,
design the port/move, apply, `ark-check`. Never weaken the config. Never invent
`mechanical-safe` kinds.

## When / not when

| Use this leftover name when… | Prefer instead |
|------------------------------|----------------|
| One change / small cluster just failed the gate | **`/ark-autopilot`** |
| Judgment design for a known violation | Session 0 / false-green → **`/ark-adopt`** |

## Plan B one-pilot checklist (when leftover design, not a single edge)

Empty plan A + leftover design work is **not** architecture finished. One pilot only.
Write an **extraction card** (`docs/brownfield-adoption.md` §6) — never mechanical-safe,
never silent B apply. **Kill-switch** required. `multiPilotBatchForbidden` — never
multi-pilot batch.

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

Label findings **`[Layer]`** vs **`[ArkRules]`**. Structure sensor fixes are judgment.

## Subagent fan-out (optional, host-dependent)

If the host supports **parallel subagents**, fan out read-only scouts; otherwise
**fall back to sequential**. Never weaken the gate.

## Related onboarding

- **Greenfield:** `/ark-adopt` or `ark-check --recommend` / `ark start`.
- **Brownfield:** `/ark-adopt`.

## Steps

1. Sensor: `ark-check` / `--plan --json`.
2. If false-green or concentrated edge: **STOP — do not continue this skill as complete.**
   **STOP — false-green:** / **STOP — concentrated edge:** execute **`/ark-adopt`** in this turn.
3. Otherwise execute **`/ark-autopilot`** for the cluster (extraction card if Shape).
4. Re-check.

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
- **Handoff:** `/ark-autopilot` / `/ark-adopt` / `none`
- **Incomplete?** `no` | `yes — <what is missing>`
