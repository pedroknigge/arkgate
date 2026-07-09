---
name: ark-fix
description: Resolve Ark architecture violations at the root cause — read importers and product context, design ports/adapters/moves/intent alignment. Never weaken the contract. CLI only validates.
arkVersion: 2.9.1
---

# /ark-fix — Fix architecture violations at the root

You fix violations Ark reports. Prefer structural fixes over silencing the gate.
**Read the surrounding product code** (callers, package role, feature ownership) — not only
the two files on the violation edge.


## Dual engine (mandatory)

| Engine | Role |
|--------|------|
| **Deterministic** | Violation list, plan kinds, post-edit `ark-check` |
| **Exploratory** | Why this edge exists in *this* product; better home; manifiesto if the rule is business |

## Related onboarding

- **Greenfield:** `/ark-architect` or `ark-check --recommend` / `ark start`.
- **Brownfield:** `/ark-adopt` — match contract to reality; do not force a starter preset.
- **Map first:** `/ark-explore` when the violation is one of many structural smells.
- **peerIsolation / cross-slice:** always **judgment** — extract to shared, events/ports, or redesign ownership. Never auto-apply cross-feature or cross-context moves.
- **`vertical-slice` ownership:** feature code stays under `src/features/<slice>/…` (no sibling-slice imports); shared primitives in `src/shared/`; infra in `src/lib/`; shell in `src/app/`. Cross-feature edges are peerIsolation — extract shared or use events/ports.
- **`ddd-bounded-contexts` ownership:** code under `src/contexts/<context>/{domain,application,infrastructure,presentation}/`; shared kernel only under `src/shared/kernel/`. Cross-context imports (same or cross technical layer) are peerIsolation — integrate via application APIs/events, not peer technical layers.
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
