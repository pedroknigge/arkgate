---
name: ark-contract
description: Safely edit ark.config.json (layers, rules, forbiddenGlobals, intent prefixes) and land business rules into the Ark manifest. Validated with strict ark-check. Deep source evidence required.
---

# /ark-contract — Change the architecture contract (safely)

The **one sanctioned way** to change layers/rules/`intentPrefixes`/includes.
Also used to **land mined business rules** into the executable manifest (`ark.config.json` + intent naming that `ark://manifest` exposes).


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

## Done

- Diff of `ark.config.json` explained in plain language.
- **Así te lo re-soluciono en el manifiesto** when intents/Domain were part of the request.
- Strict check result captured.
