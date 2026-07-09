---
name: ark-fix
description: Resolve Ark architecture violations at the root cause — ports, adapters, moves, intent/manifest alignment. Never weaken the contract. Read the real code; CLI only validates.
---

# /ark-fix — Fix architecture violations at the root

You fix violations Ark reports. Prefer structural fixes over silencing the gate.


## Related onboarding

- **Greenfield:** `/ark-architect` or `ark-check --recommend` / `ark start`.
- **Brownfield:** `/ark-adopt` — match contract to reality; do not force a starter preset.
- **Default path:** `ark start` → `/ark-autopilot` → `ark-check --doctor`.

## Anti-wrapper rule (mandatory)

**Forbidden:** only listing violations from JSON without reading importers/targets.

**Required:**
1. Run `ark-check` as **sensor** (and `--plan --json` if multi-step) — CLI validates; you remediate.
2. **Read** each violated file and its import target.
3. **“Así te lo re-soluciono”** — concrete change before editing.
4. After edits: `ark-check --strict-config` (and baseline if configured).

## Common fix patterns

| Symptom | Fix |
|---------|-----|
| App → Presentation type-only | Extract type to application/core; re-export from UI |
| App → Presentation value (UI in core) | Move component wrappers to presentation |
| Domain → outer layer | Port/interface in Domain; adapter outside; or relocate false Domain file (`**/types.ts` trap) |
| Intent prefix mismatch | Rename intent to layer’s `intentPrefixes` or fix prefix in config via `/ark-contract` |
| Forbidden global in Domain | Inject a port (Clock, Id, Http) — don’t allow `Date.now` in Domain |
| Concentrated edge wall | Stop grinding; `/ark-contract` facade/surface split |

## Manifiesto

If the “fix” is really a missing business intent or Domain home for a rule:

- Propose intent name + layer placement.
- Register / place code so `ark://manifest` / config can enforce it.
- Do not only delete the import.

## Rules

- No `ark-*-disable`, no allowing a bad edge “to finish”, no baselining a **new** violation you introduced.
- Prefer mechanical-safe kinds when the plan tags them; otherwise design judgment carefully.
- Code only — no DB migrations unless user asked.

## Done

- Targeted violations gone; no new ones.
- Report: what moved, what was intentional default, what needs user decision.
