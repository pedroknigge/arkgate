---
name: ark-fix
description: Resolve Ark architecture violations at the root cause — read importers and product context, design ports/adapters/moves/intent alignment. Never weaken the contract. CLI only validates.
---

# /ark-fix — Fix architecture violations at the root

You fix violations Ark reports. Prefer structural fixes over silencing the gate.
**Read the surrounding product code** (callers, package role, feature ownership) — not only
the two files on the violation edge.

## When / not when

| Use `/ark-fix` when… | Do **not** use it when… |
|----------------------|-------------------------|
| One change / small cluster just failed the gate | Bulk residual / many edges → `/ark-loop` or `/ark-autopilot` |
| Need a structural fix (port, move, intent rename) | Map residual / pattern Shape plan → `/ark-explore` |
| Judgment design for a known violation | Contract wrong / false-green → STOP to `/ark-contract` / `/ark-adopt` |

When the fix is really a **Shape** extraction (I/O out of routes, god module split), write an
**extraction card** before editing — same template as `docs/brownfield-adoption.md`
§6 and explore §G. Fixed fields (never mechanical-safe, never silent B apply):

```text
### Extraction card
Pilot: <one directory or feature path>
Smell: <doctor designSmells id if present>
Move: <verbatim relocate / split>
Do not: rewrite queries; weaken ark.config; invent mechanical-safe kinds; big-bang
Success: <falsifiable>
Kill-switch: <stop condition>
Next: re-run ark-check; shrink baseline if applicable
```

## Dual engine (mandatory)

| Engine | Role |
|--------|------|
| **Deterministic** | Violation list, plan kinds, post-edit `ark-check` |
| **Exploratory** | Why this edge exists in *this* product; better home; manifiesto if the rule is business |


## Subagent fan-out (optional, host-dependent)

When the user asks to go faster **or** the work naturally splits (multiple packages,
feature dirs, plan clusters), you **may** dispatch **subagents**:

| Host capability | Behavior |
|-----------------|----------|
| **Parallel subagents supported** (e.g. multi-agent / `spawn_subagent` / concurrent Agent tools) | Launch **2–N** agents in **one wave** with **disjoint path scopes**. Prefer **read-only** explore agents for mapping; at most **one writer** unless the host gives isolated worktrees. Parent merges findings, then runs `ark-check` once. |
| **Not supported** (single agent only) | **Fall back to sequential** — same checklist, one cluster/step at a time. Never claim parallel work you did not run. |

**Rules:**
1. Give each subagent a **tight brief**: paths in scope, sensor commands allowed, deliverable shape (paths opened + findings JSON or bullets).
2. **No shared mutable files** across parallel writers.
3. STOP handoffs and dual-engine rules still apply in every agent.
4. Parent owns the **### Completion** block (union of **Opened**, single **Handoff**).
5. Do **not** use subagents to weaken the gate or invent `mechanical-safe` kinds.

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
2. **Read** each violated file and its import target (plus callers that explain product role).
   If the wall is a concentrated contract smell: **STOP — do not continue this skill as complete.** **STOP — concentrated edge: invoke /ark-contract with source evidence** (do not freeze a wrong contract or grind N freezes).
   If false-green cores: **STOP — do not continue this skill as complete.** **STOP — false-green: invoke /ark-adopt or /ark-contract before claiming ENFORCE.** Do not claim goal.met / ENFORCE from type-only cleanup while doctor reports `contract-false-green-io-under-application`.
   If many residuals: **STOP — do not continue this skill as complete.** **STOP — bulk residual debt: invoke /ark-loop or /ark-autopilot** instead of ad-hoc multi-file grinding without a plan.
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

## Mechanical-edit hygiene (Y04 — outcome gate)

- Header injection must **merge into the existing doc comment**; the kept result has one `/**`, not stacked headers.
- Route completion or movement must **preserve the original typed `defineRoute<…>(opts, handler)` call**; reconstruct that call instead of extracting untyped opts/handler constants that drop generics or contextual typing.
- A convention-only `*-data.ts` stub is not a fix: move the real code or **leave the placeholder file uncreated**; never write `import "server-only"; export {}` as an empty naming token.
- Keep the edit only when the **previously clean file stays typecheck-clean**. Otherwise roll it back and treat the change as judgment.

## Reshape findings (X04 — never mechanical)

If `doctor.physicalCohesion` fires while you fix: do **not** fold reshape moves into your fix
batch. Physical moves run only through `/ark-loop`'s one-pilot loop; merge decisions only as
`/ark-architect` merge cards. A cohesion finding is context for your fix, never a license to
reorganize. Respect `physicalCohesion.reshapeDecisions`: never revive a current rejected/deferred
target from the still-visible facts. If the user makes a verdict while reviewing the finding,
record its exact `decisionTarget` + reason in `.ark/reshape-decisions.json`; never infer one from
golden-pattern prose.

## Done

- Targeted violations gone; no new ones.
- Report: what moved, what was intentional default, what needs user decision.

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
