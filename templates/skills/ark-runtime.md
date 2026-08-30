---
name: ark-runtime
description: Wire the optional ArkRun extra (arkgate/runtime). One candidate. Extra on via /ark-adopt.
---

# /ark-runtime — Evaluate and wire ArkRun (experimental opt-in)

The ArkRun kernel (`arkgate/runtime`) is currently **experimental**. It is **not** required
for ArkGate enforcement and is **not** production durability. Use this skill when the user wants
to evaluate or wire the kernel. **This skill never enforces** — the write / CI / ESLint plane
does when the `arkRun` extra is on. Do **not** invent `/ark-run`. `@arkgate/runtime` is deprecated.

**When:** evaluate a hand-rolled bus / outbox / saga / projection / policy / Nest adapter against
the kernel, or wire an extra that is already on (composition root, declarations, transport).
**Not when:** session 0 / extra not chosen (`/ark-adopt`); one new file (`/ark-place`); skip-violation
grind (`/ark-autopilot` / leftover `/ark-fix`).

## Extra vs kernel (mandatory)

| Piece | What it is | What it is not |
|-------|------------|----------------|
| **ArkRun extra** (`arkRun` on `ark.config.json`, schema `1.2+`) | Gate contract: kernel usage + complete declarations | A score; Layers / ArkRules replacement; merge teeth while `advisory` |
| **Kernel** `arkgate/runtime` | Kernel you construct with `createStrictArkKernel` (one instance per call) | A process-wide `getKernel()`; shipped cloud broker SDKs; production durability |

Absence of the extra is **silent** — Layers and ArkRules verdicts stay identical. Doctor / status
`arkRun` is always `notAScore`. Never invent 0–10 scores or pass/fail from this skill.

## Improvement compass note

This skill is **experimental runtime** only. Do **not** treat runtime adoption as residual on the
resilience lens unless the user explicitly opts into the experimental kernel. Prefer doctor compass
for static architecture residual; hand static residual to `/ark-explore` / `/ark-autopilot`.
Doctor `arkRun` residual is a finding-id count (`ARKRUN_*`), never a compass score.

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

## Out of scope for ArkRules

This skill is **runtime-kernel only**. Do not mix ArkRules structure/invariants here; hand off to `/ark-contract` / `/ark-adopt` / `/ark-explore` for static contract planes. Label kernel-usage residual **`[ArkRun]`** so it never blurs with **`[Layer]`** or **`[ArkRules]`**.

## Subagent fan-out (optional, host-dependent)

If the host supports **parallel subagents** and the task splits cleanly (e.g. multiple
dirs to sample), fan out read-only scouts; otherwise **fall back to sequential**.
Parent merges and still emits the **### Completion** contract. Never parallel-write
the same files or weaken the gate.

## Steps

1. **Inventory** — grep the codebase for hand-rolled equivalents:
   - event bus / emitter used for domain events (`EventEmitter`, homemade
     pub/sub, ad-hoc handler registries)
   - outbox tables or "save event + publish later" code
   - audit/history logs written manually
   - saga/workflow orchestration (multi-step processes with compensation)
   - read-model/projection builders
   - policy/authorization checks scattered across use cases
   Also check whether `@nestjs/common` is present → the `arkgate/nestjs`
   adapters apply.
2. **Read the extra** — open `ark.config.json`. If `arkRun` is absent and the user wants the extra,
   **STOP — do not continue this skill as complete.** Handoff **`/ark-adopt`** to write **advisory**
   `arkRun` (schema `1.2+`; `compositionRoots`, `managedLayers`, `requireDeclarations`). Do not
   invent the extra here. If the extra is present, note `mode`, roots, managed layers, and
   `requireDeclarations`; doctor `arkRun` is `notAScore`.
3. **Pick ONE target** — the smallest, most self-contained candidate (fewest
   call sites). Migrating everything at once is how adoptions die. List the
   rest as follow-ups in the report. New files after the extra is on go through **`/ark-place`**.
4. **Resolve availability** — `npm install arkgate` already ships `arkgate/runtime`.
   Import from `arkgate/runtime` (or `arkgate/nestjs`). `@arkgate/runtime` is deprecated.
5. **Wire through the kernel** — read the
   [runtime package guide](https://github.com/pedroknigge/arkgate/blob/main/packages/runtime/README.md)
   plus the [experimental surface policy](https://github.com/pedroknigge/arkgate/blob/main/docs/package-surface.md#experimental-opt-in-surfaces) before
   writing code.
   - Call `createStrictArkKernel` (or an admission sibling: `createArkKernel`, `*FromConfig`) **only**
     inside `arkRun.compositionRoots`. Each call is a new instance — no process-wide singleton.
   - Keep Domain-role layers kernel-free (`ARKRUN_KERNEL_IN_DOMAIN`).
   - Resolve managed types from the kernel; do not construct admitted types with `new`
     (`ARKRUN_DIRECT_NEW`).
   - On `register()`, declare `uses` / `reactsTo` / `raises` / `sends`. `extendedInfo` is
     tooling-only and is **not** a gate verdict. Adding an existing call-site literal to the
     declaration list is the only mechanical-safe ArkRun edit; inventing a new emit / handle /
     depend is judgment.
   - Send on kernel transport: `local` / `localBlocking` / `broker`. `ephemeral` defaults **true**.
     Broker adapters are ports you inject — this package does not ship cloud SDKs. Unbound
     `broker` falls back in-process local. Do not import `EventEmitter` or a homemade bus in
     `managedLayers` (`ARKRUN_TRANSPORT_BYPASS`).
   - Optional inspector: `startInspector()` on `127.0.0.1`, refuses `NODE_ENV=production`, no
     public bind. Snapshots / `requestGraph` (process or technical + Mermaid) are tooling, not a
     score. `getDependencyInformationPackage()` never includes factories, live instances, or
     input DTOs.
   - In-memory stores lose state on restart — **not** production durability. Note bounded history
     (`maxHistorySize` 1000) if the hand-rolled version retained everything.
6. **Delete the hand-rolled version** once call sites are moved — the point is
   less code, not a second parallel system. Deleting code is a destructive move:
   confirm with the user before removing the old implementation, and never delete
   something the inventory only *suspects* is dead (a misclassified load-bearing
   emitter must not be removed on a guess).

## Critical handoffs

- No static gates yet: **STOP — do not continue this skill as complete.** Run `/ark-adopt` first (`ark-check --recommend` / leftover `/ark-architect`).
- Extra absent and the user wants it: **STOP — do not continue this skill as complete.** **`/ark-adopt`** writes advisory `arkRun`.
- Skip cluster (`new` of managed types, homemade bus, kernel in Domain) after the extra is on: leftover **`/ark-fix`** / **`/ark-loop`** or **`/ark-autopilot`** — this skill still wires one candidate.
- `arkgate` not installed and no local checkout: **STOP** and report the distribution boundary.
- Inventory finds nothing: stop; do not introduce kernel speculatively.

## Operating rules

- If the inventory finds NO hand-rolled equivalents, say so and stop — do not
  introduce the runtime kernel speculatively. Static enforcement alone is a
  complete, valid use of Ark.
- Keep the migration diff reviewable: one feature per invocation.
- Skills never enforce; never weaken `ark.config.json` to skip `ARKRUN_*`.
- Never a process-wide kernel singleton. Never shipped cloud broker SDKs.
- Never claim in-memory stores are production-durable.
- Plain-language reporting: one sentence per concept ("outbox = events are
  saved in the same transaction as your data, then published — so you never
  publish something that didn't commit").

## Related onboarding

- Adopt static gates and application shape **first** (`/ark-adopt`). Brownfield: same door —
  advisory extra only until the team promotes; absence is valid.
- Runtime kernel is optional and separate from enthusiast onboarding. Do not put `arkRun` on the
  compact starter.

## Verify and report

Run the project's tests plus `ark-check --root . --config ark.config.json
--strict-config`. Report: what was migrated, lines deleted vs added, remaining
candidates ranked, behavior differences (e.g. bounded history), and **`[ArkRun]`** residual
(`ARKRUN_*` / doctor `arkRun`, `notAScore`) separately from Layers / ArkRules.

## Completion contract (skill incomplete if missing)

End with **exactly** these headings (markdown `###`):

### Completion
- **Sensor:** commands/tools run
- **Opened:** real paths read (or `n/a` only if pure install/upgrade with no source analysis)
- **Result:** one-line outcome
- **Planes:** **`[ArkRun]`** residual (or `n/a` if extra absent) — do not mix with `[Layer]` / `[ArkRules]`
- **Compass:** `n/a` (runtime skill; static residual → explore/fix) | top residual if doctor was run
- **Handoff:** `/ark-…` / CLI / `none`
- **Incomplete?** `no` | `yes — <what is missing>`

If a **STOP** handoff applies and you continued as if done, set **Incomplete?** to `yes`.
**Skill incomplete if missing** any of the bullets above.
