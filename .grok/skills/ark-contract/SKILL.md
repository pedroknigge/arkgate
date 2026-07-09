---
name: ark-contract
description: Safely edit ark.config.json (layers, rules, forbiddenGlobals, intent prefixes) and land business rules into the Ark manifest. Validated with strict ark-check. Deep source evidence required.
arkVersion: 2.9.1
---

# /ark-contract — Change the architecture contract (safely)

The **one sanctioned way** to change layers/rules/`intentPrefixes`/includes.
Also used to **land mined business rules** into the executable manifest (`ark.config.json` + intent naming that `ark://manifest` exposes).


## Dual engine (mandatory)

| Engine | Role |
|--------|------|
| **Deterministic** | CLI / MCP / contract sensors — exit codes, plan kinds, coverage numbers, install status |
| **Exploratory** | You open **this** repo's real files and product surface before concluding |

The CLI is a **sensor**, never the whole job. Claiming done without the exploratory bar for this skill is **incomplete**.


## Subagent fan-out (optional, host-dependent)

If the host supports **parallel subagents** and the task splits cleanly (e.g. multiple
dirs to sample), fan out read-only scouts; otherwise **fall back to sequential**.
Parent merges and still emits the **### Completion** contract. Never parallel-write
the same files or weaken the gate.

## Related onboarding

- **Greenfield:** `/ark-architect` or `ark-check --recommend` / `ark start`.
- **Brownfield:** `/ark-adopt` — match contract to reality; do not force a starter preset.
- **Default path:** `ark start` → `/ark-autopilot` → `ark-check --doctor`.

## Anti-wrapper rule (mandatory)

**Forbidden:** editing globs from vibes without reading the directories those globs claim to cover.

**Required:**
1. Snapshot before using CLI as **sensor**: coverage + check JSON.
2. **Read source** in dirs you reclassify (sample files).
3. **“Así te lo re-soluciono”** — exact JSON fields + which files become governed/ungoverned.
4. After write: `ark-check --strict-config` must be the validation gate (dead pattern noise is advisory; unclassified + real violations still matter).

## What you may edit

- `include` / `exclude`
- `layers[]` (`name`, `patterns`, `optional`, `forbiddenGlobals`, `intentPrefixes`, layer `exclude`)
- `rules[]` (from/to/allowed)
- Never: disable the check, delete CI gates, or add blanket `allowed: true` for a bad edge without a facade design

## Steps

1. **Snapshot** — coverage governed%, unclassified samples, current violations.
2. **Smallest edit** for the user intent:
   - New layer + neighbor rules
   - Expand patterns for ungoverned dirs (`suggestions` from coverage)
   - Facade: public surface patterns more specific than internals
   - **Business rules → manifiesto:**
     - Add/adjust `intentPrefixes` (`Domain.`, `Application.`, …)
     - Point Domain patterns at real pure folders (`**/domain/**`, not bare `**/types.ts`)
     - Document proposed intent names for the app to register (kernel) or for agents to use
3. **Impact** — re-run coverage/check; report before/after governed% and violation delta.
4. **Rollback** if strict fails for reasons other than pre-existing debt the user accepted.

## Operating modes

Contract edits are most common in **Align (Adapt)**. In **Guard (Enforce)**, treat edits as high-risk product decisions.

## Critical handoffs

- After contract is honest but residual violations remain: **STOP — do not continue this skill as complete.** **STOP — bulk residual debt: invoke /ark-loop or /ark-autopilot** instead of ad-hoc multi-file grinding without a plan.
- New artifact home after reclassify: **STOP — do not continue this skill as complete.** **STOP — new file placement: invoke /ark-place** when the user needs a new artifact home.

## Done

- Diff of `ark.config.json` explained in plain language.
- **Así te lo re-soluciono en el manifiesto** when intents/Domain were part of the request.
- Strict check result captured.

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
