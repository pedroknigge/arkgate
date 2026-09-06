---
name: ark-order
description: Wire the optional ArkOrder extra (arkgate/order). One candidate. Extra on via /ark-adopt.
---

# /ark-order — Evaluate and wire ArkOrder (optional)

**Contener · Guiar · Ordenar.** In plain words: contain the write, guide the next
step, order leftover mess. This door is **Ordenar**: the extra for the few big product
choices (billing plan, not seat counts). Ordering leftover folders is `/ark-explore`
then `/ark-autopilot`. Skills never enforce — CLI / hooks / CI do.

Layers stop a bad import. ArkOrder stops rewriting a big product choice as if it
were a seat count. Change those choices through a valve, not a generic update.

The ArkOrder extra (`arkgate/order`) is **optional**. It is **not** required for
ArkGate enforcement and is **not** production durability. Use this skill when the
user wants to evaluate or wire the extra. **This skill never enforces.** Do **not**
invent `/ark-run`. `@arkgate/order` is not a package — import `arkgate/order` from
the same `arkgate` tarball.

**When:** evaluate a hand-rolled “PATCH the plan like a seat count” / generic update
of a slow product choice, or wire an extra that is already on (plane root, named
keys, valve).
**Not when:** session 0 / extra not chosen (`/ark-adopt`); one new file (`/ark-place`);
skip-violation grind (`/ark-autopilot`); wire the runtime kernel (`/ark-runtime`).

## When / not when

| Use `/ark-order` when… | Do **not** use it when… |
|------------------------|-------------------------|
| Wire one ArkOrder candidate after the extra is on | Extra not chosen → `/ark-adopt` |
| Evaluate a generic update of a named product choice | New plane-root file only → `/ark-place` |
| Valve: first `release()`, later `proposeRelease` then `apply` | Skip cluster grind → `/ark-autopilot`; one kernel candidate → `/ark-runtime` |

## Contener · Guiar · Ordenar

| Star | This door | Hand off |
|------|-----------|----------|
| **Contener** | `/ark-adopt` path · `/ark-place` new file · `/ark-upgrade` pin | Map → `/ark-explore` · apply → `/ark-autopilot` |
| **Guiar** | `/ark-explore` map · `/ark-autopilot` apply · `/ark-runtime` wire ArkRun · `/ark-explain` tour · `/ark-coverage` fitness | Session 0 → `/ark-adopt` · this door for the big-choice plane |
| **Ordenar** | **This skill** — wire ArkOrder | Extra off → `/ark-adopt` · new plane-root file → `/ark-place` · skip grind → `/ark-autopilot` |

**Handoff, do not invent a door.** Extra off → `/ark-adopt`. New file → `/ark-place`.
Skip cluster → `/ark-autopilot`. One kernel candidate → `/ark-runtime`.

## Extra vs plane (mandatory)

| Piece | What it is | What it is not |
|-------|------------|----------------|
| **ArkOrder extra** (`arkOrder` on `ark.config.json`, schema `1.3+`) | Gate contract: plane usage + named slow keys | A score; Layers / ArkRules / ArkRun replacement; merge teeth while `advisory` |
| **Plane** `arkgate/order` | Library you construct with `createOrderPlane` (one instance per call) | A process-wide singleton; a second npm package; production durability |

Absence of the extra is **silent** — Layers and ArkRules verdicts stay identical. Doctor / status
`arkOrder` is always `notAScore`. Never invent 0–10 scores or pass/fail from this skill.

## Improvement compass note

This skill is **optional order-plane** only. Do **not** treat ArkOrder adoption as residual on
the resilience lens unless the user explicitly opts into the extra. Prefer doctor compass
for static architecture residual; hand static residual to `/ark-explore` / `/ark-autopilot`.
Doctor `arkOrder` residual is a finding-id count (`ARKORDER_*`), never a compass score.

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

## Out of scope for ArkRules and ArkRun

This skill is **order-plane only**. Do not mix ArkRules structure/invariants here; do **not**
turn this skill into an ArkRun skill. Hand off first extras to `/ark-adopt`, new files to
`/ark-place`, skip clusters to `/ark-autopilot`, one kernel candidate to `/ark-runtime`.
Label plane residual **`[ArkOrder]`** so it never blurs with **`[Layer]`**, **`[ArkRules]`**,
or **`[ArkRun]`**.

## Subagent fan-out (optional, host-dependent)

If the host supports **parallel subagents** and the task splits cleanly (e.g. multiple
dirs to sample), fan out read-only scouts; otherwise **fall back to sequential**.
Parent merges and still emits the **### Completion** contract. Never parallel-write
the same files or weaken the gate.

## Steps

1. **Inventory** — grep the codebase for hand-rolled equivalents:
   - a use-case that `update` / `patch` / `set` a slow product choice (plan, cycle, tenancy)
     the same way it writes a seat count or invoice
   - Prisma / pg / SQL writes of those names from Application / Features
   - a second `release()` after the first freeze (should be `proposeRelease` then `apply`)
   - membership ids (`projectId`, `orgId`) treated as slow keys
   - recomputable statuses (`paid`, `overdue`, `atCapacity`, `approved`) stored as if they
     were named choices
   Also check whether the billing gallery pattern applies:
   [examples/arkorder-billing](https://github.com/pedroknigge/arkgate/tree/main/examples/arkorder-billing)
   (GitHub tree, not in the npm tarball). Copy billing, **rename the three keys**.
2. **Read the extra** — open `ark.config.json`. If `arkOrder` is absent and the user wants the extra,
   **STOP — do not continue this skill as complete.** Handoff **`/ark-adopt`** to write **advisory**
   `arkOrder` (schema `1.3+`; real `planeRoots`, existing `managedLayers`, `maxXiKeys` default 7,
   **`xiKeys`** the 3–5 slow names). Do not invent the extra here. If the extra is present, note
   `mode`, `planeRoots`, managed layers, `maxXiKeys`, and `xiKeys`; doctor `arkOrder` is `notAScore`.
3. **Pick ONE target** — the smallest, most self-contained candidate (fewest call sites).
   Migrating everything at once is how adoptions die. List the rest as follow-ups in the report.
   New files after the extra is on go through **`/ark-place`**.
4. **Resolve availability** — `npm install arkgate` already ships `arkgate/order`.
   Import `createOrderPlane` from `arkgate/order`. Same npm package. Not a second install.
5. **Wire through the plane** — read
   [ArkOrder](https://github.com/pedroknigge/arkgate/blob/main/docs/arkorder.md)
   (first-contact breath first; valve tables below the fold).
   - Call `createOrderPlane` **only** inside `arkOrder.planeRoots`. Each call is a new instance —
     no process-wide singleton.
   - Keep Domain-role layers plane-free (`ARKORDER_KERNEL_IN_DOMAIN`).
   - First freeze: `release()`. Later change of a named choice is `proposeRelease` then `apply`
     — not a second `release()` (`ARKORDER_UNVALVED_RELEASE`), not `update` / `patch` / `set`
     (`ARKORDER_GENERIC_UPDATE`).
   - Name **`xiKeys`** (3–5 slow product decisions). Membership ids and recomputable statuses
     are not keys: derive a status on read or fold it from ingest. A use-case that persists
     those keys is `ARKORDER_XI_FIELD_WRITE`. Invoices and seats still flow through `ingest`.
   - Before writing a name, drop the candidate and ask: can current state reconstruct it
     uniquely? If it is recomputable or ingest determines it, derive it. The check remains
     silent on semantic entailment.
   - `refreshSigma`; ingest residual `absorb | escalate_up | hold` + `reasonCode`; capacity
     pack as data; in-memory `ReleaseStore` (`createMemoryReleaseStore`); `ingestTravelAction`.
     ArkRun `decisionTape` is still **`[ArkRun]`** — do not turn the tape into this skill.
   - In-memory stores lose state on restart — **not** production durability. Branding ArkOrder
     is not a durability claim. Doctor / status `arkOrder` is `notAScore`.
6. **Delete the hand-rolled generic update** once call sites are moved — the point is
   less code, not a second parallel system. Deleting code is a destructive move:
   confirm with the user before removing the old implementation, and never delete
   something the inventory only *suspects* is dead.

## Critical handoffs

- No static gates yet: **STOP — do not continue this skill as complete.** Run `/ark-adopt` first
  (`ark-check --recommend`).
- Extra absent and the user wants it: **STOP — do not continue this skill as complete.**
  **`/ark-adopt`** writes advisory `arkOrder`.
- Skip cluster (`ARKORDER_MISSING_PLANE` / `ARKORDER_KERNEL_IN_DOMAIN` / `ARKORDER_GENERIC_UPDATE`
  / `ARKORDER_TOO_MANY_PARAMS` / `ARKORDER_INGEST_WRITES_XI` / `ARKORDER_XI_FIELD_WRITE`) after
  the extra is on: **`/ark-autopilot`** — this skill still wires one candidate.
- New plane-root file after the extra is on: **`/ark-place`**.
- One kernel / bus candidate: **`/ark-runtime`** — do not mix planes.
- `arkgate` not installed and no local checkout: **STOP** and report the distribution boundary.
- Inventory finds nothing: stop; do not introduce the plane speculatively.

## Operating rules

- If the inventory finds NO hand-rolled equivalents, say so and stop — do not
  introduce ArkOrder speculatively. Static enforcement alone is a complete, valid use of Ark.
- Keep the migration diff reviewable: one feature per invocation.
- Skills never enforce; never weaken `ark.config.json` to skip `ARKORDER_*`.
- Never a process-wide plane singleton. Never a second npm package.
- Never claim in-memory stores are production-durable.
- Never force the extra on. Compact starter / `ark start` stays extras-off.
- Plain-language reporting: one sentence per concept ("the billing plan is a
  named choice — change it through the valve, not a generic update").
- ξ / Haken / slaving stay **below the fold**. First contact uses the one-minute breath.

## Related onboarding

- Adopt static gates and application shape **first** (`/ark-adopt` or `ark-check --recommend`).
  Brownfield: same door — advisory extra only until the team promotes; absence is valid.
- ArkOrder is optional and separate from enthusiast onboarding. Do not put `arkOrder` on the
  compact starter.

## Verify and report

Run the project's tests plus `ark-check --root . --config ark.config.json
--strict-config`. Report: what was migrated, lines deleted vs added, remaining
candidates ranked, behavior differences, and **`[ArkOrder]`** residual
(`ARKORDER_*` / doctor `arkOrder`, `notAScore`) separately from Layers / ArkRules / ArkRun.

## Completion contract (skill incomplete if missing)

End with **exactly** these headings (markdown `###`):

### Completion
- **Sensor:** commands/tools run
- **Opened:** real paths read (or `n/a` only if pure install/upgrade with no source analysis)
- **Result:** one-line outcome
- **Planes:** **`[ArkOrder]`** residual (or `n/a` if extra absent) — do not mix with `[Layer]` / `[ArkRules]` / `[ArkRun]`
- **Compass:** `n/a` (order skill; static residual → explore/autopilot) | top residual if doctor was run
- **Handoff:** `/ark-…` / CLI / `none`
- **Incomplete?** `no` | `yes — <what is missing>`

If a **STOP** handoff applies and you continued as if done, set **Incomplete?** to `yes`.
**Skill incomplete if missing** any of the bullets above.
