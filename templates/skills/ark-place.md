---
name: ark-place
description: "Where does new code go? Names the folder from the rules file and writes the file there."
---

# /ark-place — Where does this code go?

**When:** you are adding a new file or artifact and need the layer, folder, and name.
**Not when:** session 0 / config is missing or lying (`/ark-adopt`) or an existing violation cluster (`/ark-autopilot`).

## Steps

1. CLI-first: if the local CLI already resolved the root, skip waiting on MCP. Identity is optional then.
2. Place with **filePath required** (`ark_place` or read `ark.config.json` + `.ark/golden-pattern.json`). Fail-closed without a path — never invent `components/*.tsx` or default to Presentation.
3. Write it there. Then `arkgate-check`.

## Checklist

- `filePath` is known before the call. Description alone is not a path.
- Golden pattern is load-bearing when present. Adopt generates it.
- Do not default a repository to Presentation.
- When `arkRun` is on: scaffold through the kernel (no `new` of managed types; declare
  `uses` / `reactsTo` / `raises` / `sends`; factory only in `arkRun.kernelRoots`,
  `compositionRoots` alias). Extra off → do not introduce the kernel. Enable it
  via `/ark-adopt`. Skills never enforce.
- When `arkOrder` is on: factory only in `arkOrder.planeRoots`; Domain stays plane-free;
  freeze ξ with `release()`. Extra off → do not introduce the plane. Enable it via
  `/ark-adopt`. Skills never enforce.

## Autonomy contract

Invoking this skill **is** the approval. If the user described an artifact, **write the
files** in this turn (prepare-write + scaffold). A path table alone is incomplete.
The CLI is a **sensor and gate**. **CLI budget:** `ark_identity` then `ark_place` when using MCP
(or skip identity if the CLI already resolved the root); otherwise read `ark.config.json`; write;
`ark-check`. Do not ask which layer they prefer.

**Still never:** weaken `ark.config.json`; invent `mechanical-safe` kinds; claim leftover
design work is finished because one file landed.

## Improvement compass (process preflight)

When doctor is available, read `doctor.improvementCompass` (or the human **Improvement compass** section).
Name 1–3 **residual** lenses in plain language before skill-shopping. Always `notAScore` — never invent
0–10 scores or Excellent/Good ranks.

**What the user should feel next:** fewer blocked AI writes, clearer folders, safer domain — then jargon.

**Anti false-done:** empty plan A + residual lenses / design-weak → **Incomplete? yes**. Green edges alone
are not “architecture finished.”

**AI-easy architecture:** ports over concrete I/O in domain; one concern per module; golden pattern for
new files; place before write (`/ark-place` / prepare-write).

**Out of scope (honest):** scalability/performance, full app-security tooling (SAST), and full resilience
patterns are **out-of-scope** lenses — say so; do not invent Ark enforcement for them.

**Where so the AI doesn’t mess up next time** — golden pattern + layer home before the write.

## Deep modules (process)

- Place so new code stays **deep**: one small public surface per concern; hide implementation details.
- If the artifact is a port or adapter, **name the seam** and put the interface where callers should depend (usually Domain/Application), implementation on the outer side.
- Do not scaffold empty pass-through modules that fail the **deletion test** (complexity would vanish if deleted).

## When / not when

| Use `/ark-place` when… | Do **not** use it when… |
|------------------------|-------------------------|
| New artifact: where + **write** under the config | Existing violation cluster → `/ark-autopilot` |
| Naming / directory for a known kind | Session 0 / config missing or lying → `/ark-adopt` (then come back) |
| Kernel-managed artifact when `arkRun` is already on | Extra not chosen yet → `/ark-adopt` (advisory `arkRun`); evaluate / migrate a hand-rolled bus → `/ark-runtime` |
| Plane-root artifact when `arkOrder` is already on | Extra not chosen yet → `/ark-adopt` (advisory `arkOrder`); skip cluster grind → `/ark-autopilot` |

The user describes something they need to build (a saga, a background job, an
event handler, a repository, an HTTP client, a use case, a projection, …).
Your job: name the layer it belongs to, the directory, the naming convention,
and — if they asked to build it — scaffold it there correctly.

**No artifact given?** If the skill is invoked with nothing to place, don't error
and don't guess — the artifact is the one thing only the user knows. Read the
contract (step 1) and print the placement map from it: one row per declared layer
with what belongs there, its directory, and which layers it may/may not import,
plus the not-yet-adopted `suggestedLayers` as a footnote. Then ask what they want
to place. That map is derived entirely from the repo, so producing it is real work,
not a stalling question.

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

## Dual plane — layers + extras (mandatory, except /ark-runtime)

ArkGate has **always-on Layers** plus opt-in extras. The user chooses extras; you **always label** findings so they never blur. ArkOrder is an extra **inside** the `arkgate` package (`arkgate/order`), not a second install.

| Plane | What it protects | Where it lives | Sensors / tools |
|-------|------------------|----------------|-----------------|
| **Layers** (inter-layer) | Who may import whom, capabilities, pure/forbiddenGlobals, peerIsolation | `ark.config.json` → `layers[]`, `rules[]` | graph check, baseline edges, doctor coverage % |
| **ArkRules** (intra-layer) | Structure inside a layer + domain invariants as data | `arkRules` map + `arkrules/<ExactLayerName>.json` | structure sensors, invariant coverage, `--rules-inventory`, doctor `rulesUnderContract` |
| **ArkRun** (extra) | Kernel usage + complete declarations | `arkRun` on `ark.config.json` (schema `1.2+`); factory `arkgate/runtime`; **`kernelRoots` preferred**, `compositionRoots` alias | `ARKRUN_*`, doctor `arkRun` (`notAScore`) |
| **ArkOrder** (extra) | Operational pattern (ξ vs s) | `arkOrder` on `ark.config.json` (schema `1.3+`); factory `arkgate/order` | `ARKORDER_*` |

**Rules for every report / answer:**
1. Prefix each finding or next step with **`[Layer]`** or **`[ArkRules]`** or **`[ArkRun]`** or **`[ArkOrder]`** (or a table with those headers).
2. Never call an import-edge violation an “invariant” or an aggregate sensor a “layer deny.”
3. Absence of `arkRules` is **valid** — do not force ArkRules unless the user wants them or residual inventory clearly wants a pilot.
4. Missing layer home: add it via **`/ark-adopt`** in this session if needed, then write the file; never invent `mechanical-safe`.
5. CLI helpers: `ark-check --rules-inventory --json`, doctor JSON `rulesUnderContract`, sensors emit `ARKRULE_*` / `INVARIANT_UNCOVERED` with `evidence.arkruleId`.
6. Absence of `arkRun` is **valid**. Do not introduce the kernel speculatively. Skills never enforce this extra.
7. Absence of `arkOrder` is **valid**. When on: Domain stays plane-free; freeze ξ with `release()`; never `update`/`patch`/`set` the pattern. Import `createOrderPlane` from `arkgate/order` (same npm package). No `/ark-order` skill.


### Place + ArkRules
- Choose layer from contract **and** check structure sensors for that layer (private state, factory, thin adapter, writes-via-aggregate).
- Scaffold to satisfy **[ArkRules]** when present; state which sensors apply.
- Persistence **writes** (insert/update/delete against a driver) go through a Domain aggregate + persistence adapter. Application/Feature files that import Prisma/pg/Supabase and call `.insert` / `.create` are **[ArkRules]** `writes-via-aggregate`. Do not invent `Externals/` or `admission.ts`.

### Place + ArkRun
When `arkRun` is present on the architecture config:
- Scaffold kernel-managed artifacts **through the kernel**, not `new` of an admitted type (`ARKRUN_DIRECT_NEW`).
- Call `createStrictArkKernel` (or an admission sibling) only inside `arkRun.kernelRoots` (`compositionRoots` is a legacy alias — still valid). Each call is a new instance — no process-wide `getKernel()`.
- Domain-role files stay kernel-free (`ARKRUN_KERNEL_IN_DOMAIN`). Import from `arkgate/runtime` (or `arkgate/nestjs`). `@arkgate/runtime` is deprecated.
- List `uses` / `reactsTo` / `raises` / `sends` when `requireDeclarations` is on. Adding an existing call-site literal to the declaration list is the only mechanical-safe ArkRun edit; inventing a new emit / handle / depend is judgment.
- Do not import a homemade bus (`EventEmitter`, queue clients) in `managedLayers` — send on the kernel transport (`local` / `localBlocking` / `broker`; `ephemeral` defaults true). No shipped cloud SDKs.
- In-memory stores are **not** production durability. Doctor `arkRun` is `notAScore`.
- Absence of the extra: place with **[Layer]** + **[ArkRules]** only. Enable advisory extra via `/ark-adopt`; evaluate a hand-rolled bus via `/ark-runtime`. Do not invent `/ark-run`.
- Skills never enforce.

### Place + ArkOrder
When `arkOrder` is present on the architecture config:
- Import `createOrderPlane` from `arkgate/order` (same npm package). Domain-role files stay plane-free.
- Freeze ξ with `release()`; derive s with `project()`; field `ingest()` never mints a pattern; `proposeRelease()` needs a non-empty blast. There is no `update`/`patch`/`set`.
- Call the factory only inside `arkOrder.planeRoots`. Empty roots in `enforced` mode is `ARKORDER_MISSING_PLANE`.
- Named slow keys live in `arkOrder.xiKeys`. A managed-layer Prisma/pg write of those keys is `ARKORDER_XI_FIELD_WRITE` — absorb with `ingest` or change the pattern with `proposeRelease`.
- Skip clusters (`ARKORDER_MISSING_PLANE` / `ARKORDER_KERNEL_IN_DOMAIN` / `ARKORDER_GENERIC_UPDATE` / `ARKORDER_TOO_MANY_PARAMS` / `ARKORDER_INGEST_WRITES_XI` / `ARKORDER_XI_FIELD_WRITE`): place this artifact, then grind via `/ark-autopilot`. Extra not on → `/ark-adopt`. Do not invent `/ark-order`.
- Absence of the extra is valid. Do not invent `/ark-order`. Skills never enforce.

## Subagent fan-out (optional, host-dependent)

If the host supports **parallel subagents** and the task splits cleanly (e.g. multiple
dirs to sample), fan out read-only scouts; otherwise **fall back to sequential**.
Parent merges and still emits the **### Completion** contract. Never parallel-write
the same files or weaken the gate.

## Steps

1. **Read the contract, not your intuition.** If the `ark` MCP server is available, complete
   the mandatory `ark_identity` preflight first, then call **`ark_place`** with the target file
   path and bound `project` envelope — it returns the layer,
   its forbidden globals, and exactly which layers the file may / must not import,
   straight from the contract (no guessing). When present, also honor optional
   **`goldenPattern`** (from `.ark/golden-pattern.json`) for **NEW code only** —
   advisory layout norm; never overrides the gate and never clears design-weak.
   Absent golden is normal. Otherwise load `ark.config.json`; after the matched preflight,
   `ark_manifest` with the same bound envelope includes `suggestedLayers` with conventional
   directories for layers not yet adopted. The `ark://manifest` resource is compatibility-only and always
   unverified/non-authoritative. The project's `AGENTS.md` placement table, if present, is
   authoritative too.
2. **Classify the artifact** by what it does, not what it's called:
   - Pure business rules/entities/value objects → domain-model layer.
   - When Domain ArkRules require private state / factories (`aggregate-private-state`,
     `always-valid-factory`), scaffold private fields + static factory — do not emit public
     mutable aggregates.
   - Orchestrates a use case, no I/O of its own → application layer.
   - Talks to a database, queue, API, filesystem → an adapter layer on the side
     that matches the direction (driven/persistence vs driving/http).
     **Writes** go through a Domain aggregate that uses a persistence port; the
     adapter implements the port. Do not put `prisma.order.create` in a use case.
   - Reacts to events, long-running coordination (saga/workflow), scheduled
     jobs, projections → the event/workflow layers if the config declares them.
     When `arkRun` is on, wire those through the kernel (register + declarations),
     not a homemade emitter.
   - Kernel-managed application service when `arkRun` is on → composition-root factory
     + `register({ uses, reactsTo, raises, sends })`; never `new` of the admitted type.
   - **`vertical-slice` contract:** put co-located feature code under
     `src/features/<slice>/…` (never import a sibling slice); shared primitives
     under `src/shared/`; infra under `src/lib/`; shell under `src/app/`.
   - **`ddd-bounded-contexts` contract:** put code under
     `src/contexts/<context>/{domain,application,infrastructure,presentation}/`;
     shared kernel only under `src/shared/kernel/`. Cross-context imports at the
     same technical layer are peerIsolation violations.
3. **Answer concretely**: layer name, target directory (from the layer's
   `patterns`), intent-name prefix if the layer declares `intentPrefixes`, and
   which layers it may/may not import (from `rules`).
4. **If the layer isn't adopted yet** (suggested but no directory): write the
   layer into `ark.config.json` (session-0 honesty — same as `/ark-adopt` for
   that glob) **then** write the file. Don't silently drop the code into a
   wrong-but-existing layer.
5. **Write it.** If the user described the artifact, scaffold the file(s) in
   place this turn (prepare-write), following the nearest existing sibling's
   style, and any port/adapter split the rules force. A path table without
   files is incomplete unless they asked “where only.”

## Critical handoffs

- If the user needs bulk adoption / wrong config, not a single artifact: **STOP — do not continue this skill as complete.** Switch to **`/ark-adopt`** (write the path) instead of ad-hoc multi-file grinding without a plan.
- If the config lacks a home for the artifact: add the layer **in this turn**, then write the file.
- If doctor shows leftover design work and the user is asking to reshape existing structure
  (not place one new artifact): place only the new file under the golden/contract home, then
  hand off **one** pilot via `pilotLoop.nextPilot` / `/ark-explore` shape-focus — never multi-pilot
  batch reshape from this skill.
- If `arkRun` is on and the user is grinding skip violations (`new` of managed types, homemade
  bus) across many files: place this artifact through the kernel, then leftover `/ark-fix` /
  `/ark-autopilot`. Extra not on → `/ark-adopt` (advisory) or `/ark-runtime` (evaluate).
- If `arkOrder` is on and the user is grinding skip violations (`ARKORDER_*`) across many files:
  place this artifact on a plane root, then leftover `/ark-fix` / `/ark-autopilot`. Extra not on
  → `/ark-adopt` (advisory). Do not invent `/ark-order`.

## Operating rules

- Never ask "which layer do you prefer?" — the contract decides; you translate.
  Only surface a question when the artifact genuinely spans two legal designs
  with different trade-offs, and then recommend one.
- Explain the placement in one plain-language sentence ("this goes in
  `src/domain` because it's a business rule that shouldn't know about the
  database") — assume the user may be new to layered architecture.

## Related onboarding

- Run **after** session 0: `/ark-adopt` (or `ark init --archetype` / `ark-check --recommend`
  on greenfield). Brownfield: `/ark-adopt` first if the config is missing or lying.
- `ark-check --recommend` / MCP `ark_recommend` picks phase-1 dirs; gallery starters in
  `examples/*-starter/` show correct placement per archetype.
- Related demos: `docs/demos/` (write-gate self-correction, brownfield, autopilot).

## Verify and report

If you created files, run `ark-check --root . --config ark.config.json
--strict-config` and make it pass. Report: placement + why, files created (if
any), and the import rules the new code must respect going forward.

## Completion contract (skill incomplete if missing)

End with **exactly** these headings (markdown `###`):

### Completion
- **Sensor:** commands/tools run
- **Opened:** real paths read (or `n/a` only if pure install/upgrade with no source analysis)
- **Result:** one-line outcome
- **Planes:** one-line split of residual **[Layer]** vs **[ArkRules]** vs **[ArkRun]** vs **[ArkOrder]** (or `n/a` if unused)
- **Compass:** top residual lenses | `n/a`
- **Done axes:** architecture residual (status/doctor/compass) | feature/ticket residual (outside package). Enforce green ≠ feature done
- **Handoff:** `/ark-…` / CLI / `none`
- **Incomplete?** `no` | `yes — <what is missing>`

If a **STOP** handoff applies and you continued as if done, set **Incomplete?** to `yes`.
**Skill incomplete if missing** any of the bullets above.
