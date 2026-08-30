---
name: ark-adopt
description: Session 0 — write the rules file (ark.config.json) to match the real folders. Optional extra rules inside a layer. CLI validates.
---

# /ark-adopt — Mark the path (session 0)

**When:** empty tree, or the rules file does not match the real folders (session 0).
**Not when:** a single new file (`/ark-place`) or leftover design after the path is honest (`/ark-explore` then `/ark-autopilot`).

## Steps

1. Read `arkgate-check --doctor` (one light, one next action).
2. Write `ark.config.json` (and a baseline only for genuine debt) in this turn.
3. Re-run doctor. Day-to-day new files: `/ark-place`.

## Checklist

- Existing tree: propose **SharedKernel** (types/constants) + **CompositionRoot** (wiring) + `src/**/domain/**`. Never dump bare `src/lib/**` into Application.
- Generate `.ark/golden-pattern.json` (load-bearing for `/ark-place`).
- Future houses: mark unused layer globs `reserved` / `allowEmpty` so `--strict-config` does not fail.
- CLI-first: if `arkgate-check` already resolved the root, do not wait on MCP.
- Do not add `arkRun` or `arkOrder` unless the user wants that extra. When they do, write
  **advisory** extra in this turn (`arkRun` schema `1.2+`; `arkOrder` schema `1.3+`).
  Absence is silent and valid. Compact starter stays extras-off. Skills never enforce.

Invoking this skill **is** the approval. Write the architecture config in this turn.
Greenfield: scaffold like `--recommend`. Brownfield: match **product
reality**, freeze only genuine debt. A green check over a wrong config is a **false green**.

## Autonomy contract

The CLI is a **sensor and gate**, never the deliverable. **CLI budget:** one
`ark-check --recommend` or `--coverage` / `--doctor`; then write; then `ark-check`.
Forbidden as the result: preview-only adopt, “approve?”, or `STOP — invoke /ark-architect`
/ `/ark-contract`. Do that work **here**.

**Still never:** weaken `ark.config.json`; invent `mechanical-safe` kinds; claim finished
while leftover design work remains.

**Team lock:** this door **is** a contract session (law-only). Do not mix product source
into the same diff. After writes, validate with
`ark-check --contract-diff --contract-session --base <merge-ref> --author <steward>`.
If `stewards` is set, loosen and baseline-grow require a listed author. Feature work
uses `/ark-place` / `/ark-autopilot` and must not touch the constitution.

**Several hands → ask for stewards.** Read `doctor.stewardNudge` (or the human
**Stewards (advisory)** line). Act when `needsStewards` **or** `drift` is true.
**Ask once** before writing `stewards[]`. Identity is a **GitHub handle or email**
(`pedroknigge` or the GitHub noreply mail), not git `user.name`. Empty list: use
`proposed` (CODEOWNERS first, else git handles/emails; bots and display names stripped).
Drift: CODEOWNERS handles in `missingFromList`, or “team grew” (author count > steward
count) — ask who else owns the law. If the user says yes or names handles or emails,
write them in this turn. If they say the list is still right, leave it. Never invent
or auto-remove stewards.

**Adopt is Align + Stabilize, then seed Shape.** Freezing debt without a pattern plan leaves
spaghetti leftover design work. Always end with dual-plan **B** seeds (or handoff explore)
when design smells remain after the contract is honest.

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

**Spaghetti → honest contract.** SoC/DIP false-green STOP paths in plain language; residual lenses stay Incomplete until mapped.

## Domain glossary (process)

When present, prefer the consumer **domain glossary** for layer names, slice folders, intent names, and pilot wording:

| Detect (no requirement) |
|-------------------------|
| `CONTEXT.md`, `docs/glossary.md`, `docs/domain.md`, `docs/ubiquitous-language.md`, `docs/CONTEXT.md` |

- Prefer glossary terms over inventing parallel vocabulary.
- Call out conflicts between glossary language and code reality (process judgment).
- **Missing glossary is normal** — continue without warning spam. Never treat glossary prose as enforcement.

## When / not when

| Use `/ark-adopt` when… | Do **not** use it when… |
|------------------------|-------------------------|
| Session 0: empty tree or existing repo needs an honest path | Map-only without writing config → `/ark-explore` |
| False-green / concentrated edge needs config truth | Feature file only → `/ark-place` |
| Mine loose business rules into Domain / advisory ArkRules | Apply leftover design after the path is honest → `/ark-autopilot` |
| Freeze **real** debt after the config is honest | User said map only |
| Turn **advisory** ArkRun on (`arkRun` extra, schema `1.2+`; **`kernelRoots` preferred**) | Evaluate / wire a hand-rolled bus → `/ark-runtime`; new kernel-managed file → `/ark-place` |
| Turn **advisory** ArkOrder on (`arkOrder` extra, schema `1.3+`, `planeRoots`) | New plane-root file after extra is on → `/ark-place`; grind skip clusters → `/ark-autopilot` |

## Dual engine (mandatory)

| Engine | Role |
|--------|------|
| **Deterministic** | coverage, doctor, baseline, strict-config after edits |
| **Exploratory** | walk the real monorepo/app layout; reclassify; mine rules; suggest shape |



## MCP workspace binding (mandatory)

Before any `ark_*` MCP tool, call `ark_identity` with `project.expectedRoot` set to the exact
workspace root. Continue only when `binding.status === "matched"` and `authoritative === true`;
retain `projectIdentity.projectId`, then pass both `expectedRoot` and `expectedProjectId` under
`project` on every later MCP call. If identity is missing, mismatched, unverified, or the root is
uncertain, do not consume MCP analysis: use the workspace-local CLI and report that MCP
restart/retargeting is required. `ark://manifest` never satisfies this preflight.

## Dual plane — layers + extras (mandatory, except /ark-runtime)

ArkGate has **always-on Layers** plus opt-in extras. The user chooses extras; you **always label** findings so they never blur. Absence of an extra is silent and valid. Skills never enforce. ArkOrder is an extra **inside** the `arkgate` package (`arkgate/order`), not a second install.

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
4. Editing `arkrules/*` or promoting modes is **this skill** (session 0) or **`/ark-autopilot`** later; never invent `mechanical-safe`.
5. CLI helpers: `ark-check --rules-inventory --json`, doctor JSON `rulesUnderContract`, sensors emit `ARKRULE_*` / `INVARIANT_UNCOVERED` with `evidence.arkruleId`.
6. Absence of `arkRun` is **valid**. Write it only when the user wants the extra. Skills never enforce.
7. Absence of `arkOrder` is **valid**. Write it only when the user wants the extra. Do not invent `/ark-order`. Skills never enforce.


### Adopt + ArkRules
- After classify: emit or refresh `arkRules` for matched layers (exact names; generic mold for unknowns).
- Mine rules → inventory + write advisory invariants/structure into `arkrules/<Layer>.json` **in this turn**.
- Application / Features templates include advisory `writes-via-aggregate`: driver import + write token in a use case is the skip. Do not copy `Externals/` / `admission.ts` folder religion.
- Freeze baseline is **[Layer]** debt; inventory residual is **[ArkRules]** — report both.

### Adopt + ArkRun
- User asked to turn the extra on: write **advisory** `arkRun` on `ark.config.json` (`schemaVersion` `1.2+`) **in this turn**. Default `"mode": "advisory"`.
- Required shape: **`kernelRoots` preferred** (real files; empty + enforced fails closed). `compositionRoots` is a legacy alias — still valid. `managedLayers` (existing `layers[].name` only), `requireDeclarations` (default true).
- Do **not** put `arkRun` on the compact starter / `ark start` scaffold. Brownfield stays advisory until the team promotes.
- Absence is valid and **silent** — never force the extra. Never force the kernel over existing Nest/DI. Do not invent `/ark-run`.
- Import from `arkgate/runtime` (factory `createStrictArkKernel`, per instance, no process-wide singleton). `@arkgate/runtime` is deprecated. No shipped cloud broker SDKs.
- In-memory stores are **not** production durability. Branding ArkRun is not a durability claim. Doctor / status `arkRun` is `notAScore`.
- Demoting enforced → advisory or deleting the extra is policy-delta **weakening**.
- After the extra is honest: handoff `/ark-runtime` to wire one candidate, `/ark-place` for new kernel-managed files. Skills never enforce.

### Adopt + ArkOrder
- User asked to turn the extra on: write **advisory** `arkOrder` on `ark.config.json` (`schemaVersion` `1.3+`) **in this turn**. Default `"mode": "advisory"` — never session-0 default `enforced`.
- Required shape: `planeRoots` (real files; empty + enforced = `ARKORDER_MISSING_PLANE`), `managedLayers` (existing `layers[].name` only), `maxXiKeys` (default 7), **`xiKeys`** (the 3–5 slow names; empty = field-write sensor silent).
- Example (consumer trees — not this library's 4-layer compact). Copy billing, **rename the three keys**:

```json
{
  "schemaVersion": "1.3",
  "arkOrder": {
    "mode": "advisory",
    "planeRoots": ["src/main.ts"],
    "managedLayers": ["Application"],
    "maxXiKeys": 7,
    "xiKeys": ["plan", "cycle", "tenancy"]
  }
}
```

- `xiKeys` are meaning, not membership. `projectId` / `orgId` do not belong. If `proposeRelease` throws empty blast, that key does not order anything.
- A use-case that `prisma.*.update({ plan })` while `plan` is in `xiKeys` is **[ArkOrder]** `ARKORDER_XI_FIELD_WRITE`. Invoices and seats still flow through `ingest`.

- Do **not** put `arkOrder` on the compact starter / `ark start` scaffold. Domain stays plane-free. Import `createOrderPlane` from `arkgate/order` (same npm package).
- Absence is valid and **silent** — never force the extra. Do not invent `/ark-order`.
- Demoting enforced → advisory or deleting the extra is policy-delta **weakening**.
- After the extra is honest: handoff `/ark-place` for new plane-root files; grind skip via `/ark-autopilot`. Skills never enforce.

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

- **Greenfield:** this skill + `ark-check --recommend` / `ark start` — write the scaffold here.
- **Brownfield:** this skill — match config to reality; do not force a starter preset.
- **Deep map only:** `/ark-explore`.
- **Default path:** `ark start` → **`/ark-adopt`** → `/ark-place` / `/ark-autopilot`.

## Anti-wrapper rule (mandatory)

**Forbidden:** only running `--init` / `--update-baseline` / coverage JSON without reading the tree.

**Required:**
1. CLI sensor: `--coverage --json`, check `--json` (`summary`), doctor.
2. **Product map** — what ships, which apps/packages, entry routes/CLIs.
3. **Read real source** in largest ungoverned dirs and top import edges (min **12 files**
   across **≥4 dirs**).
4. **“How to fix”** — concrete layer globs, file moves, manifest/intent proposals.
5. **Suggestive burn-down** — ranked next steps after adopt (not only “baseline done”).
6. Never freeze a concentrated edge without investigating contract smell / false-green.

## Guiding principle

Ark protects the **boundary around** a framework, not its internals. Nest/DI public surface = one layer; internals black box.

## Steps

1. **Config** — missing → `ark-check --init` (detection). Keep existing unless asked to regenerate.
   If the tree is `src/features` + `shared`/`lib` **without** FSD `entities`/`widgets`, prefer
   `vertical-slice` (or pack `enthusiast-vertical-slice`) — do **not** force hexagonal.
   If `src/contexts` or `src/bounded-contexts` exists, prefer `ddd-bounded-contexts`.
   **Next.js:** `app/api/**` / `pages/api/**` (and route-group `app/(…)/api/**`) default to
   **ApplicationOrchestration**, not Presentation — do not reclassify API shells as UI.
   User wants the ArkRun extra → write **advisory** `arkRun` (schema `1.2+`, real
   `kernelRoots` preferred — `compositionRoots` alias, existing `managedLayers`) **in this turn**.
   User wants the ArkOrder extra → write **advisory** `arkOrder` (schema `1.3+`, real
   `planeRoots`, existing `managedLayers`, `maxXiKeys` 7) **in this turn**. Do not add extras
   to a compact starter. Do not promote to enforced as the session-0 default.
2. **Check + diagnose** — `summary.concentrated` / dominant edge → fix contract first, don’t freeze.
   Cross-slice / cross-context `peerIsolation` hits are judgment: extract shared or events.
   The denial names its reason. `unclassifiable path` in bulk means shared code lives outside
   the slice folders — declare those roots (`sharedRoots`) on the rule instead of treating
   thousands of shared files as violations; `cross-slice edge a → b` is the real one, and a
   deliberate directed edge goes in `allowedCrossSlice`. Promoting the shared slice to its own
   layer is still the preferred fix.
   If one edge dominates residual debt: **STOP — do not continue this skill as complete.** **STOP — concentrated edge:** rewrite `ark.config.json` **in this turn** with source evidence (do not freeze a wrong config or grind N freezes).
   Empty Domain/Persistence + I/O under Application → false-green.
   **STOP — do not continue this skill as complete.** **STOP — false-green:** fix the config **in this turn** before claiming ENFORCE. Do not claim goal.met / ENFORCE from type-only cleanup while doctor reports `contract-false-green-io-under-application`.
3. **Classify ungoverned** — use coverage `suggestions` **plus** dirs you discovered by reading;
   add layers/patterns **here** (write `ark.config.json`).
4. **Mine business rules → manifiesto** (model job — this is why the skill exists):
   - Scan for loose domain: validators, pricing/policy functions, `can*`/`calculate*`, magic business constants, publish/intent strings, logic in UI/hooks that belongs in Domain.
   - **ArkRules inventory (AR13):** run `ark-check --rules-inventory --json` for deterministic candidates
     (validation-in-controller, magic constants, anemic entities). Counts are **not a score**.
   - Propose: Domain files, `intentPrefixes`, intent names (`Domain.*` / `Application.*`), kernel `defineIntent` stubs if runtime is used;
     land structure/invariant entries under `arkrules/<Layer>.json` **in this turn** (ADR 0015 routing).
   - Write the config; move pure rules into Domain when safe; validate with ark-check.
   - Deliver section **How to fix the architecture config** with before/after contract snippets.
5. **Freeze only real debt** — `--update-baseline` (zero debt → **no empty baseline file** left behind).
6. **Gates + skills** — `--install-agent-gates` (CI monorepo-aware when `frontend/package.json` exists).
7. **Ratchet + Shape seed (mandatory exploratory close)** — after freeze/gates:
   - Name phase: **Align** (contract honesty) → **Stabilize** (baseline real) → **Shape** (golden pattern).
   - If plan A is empty but the tree still shows concurrent patterns, god modules, facade SQL,
     domain logic in UI, or semantic false-green: emit **dual-plan B** (3–5 bets) with pilot,
     success signal, kill-switch, and extraction cards for I/O moves — same bar as `/ark-explore` §G.
   - Do **not** claim “adopt complete / healthy” solely because the check is green.
   - Prefer handoff `/ark-autopilot` to apply one Shape refactor, or `/ark-explore` shape-focus
     if the user only wanted a plan.

## Operating modes

Explain modes as **detected stages** (Setup / Align / Guard), not user settings.
**Guard on the contract ≠ Shape done.** Say leftover design work remains when B residual remains.

## Verify

`ark-check --root . --config ark.config.json --strict-config` (+ baseline only if non-empty file retained).
Report: governed% before/after, files written, frozen count, false positives avoided, manifest/intent
proposals applied or deferred, **phase**, **top Shape / design-weak opportunities still open**
(with success signals).

## Never

- Freeze false positives to get green.
- Force runtime kernel over existing Nest/DI.
- Put `arkRun` or `arkOrder` on the compact starter / `ark start` scaffold.
- Claim in-memory kernel stores are production durability.
- Invent `/ark-run` or `/ark-order`.
- Claim Enforce while governed% is low, cores empty with I/O in Application, or core bags ungoverned.
- End adopt with only “baseline written” when design-weak residual is visible in files you opened.

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
