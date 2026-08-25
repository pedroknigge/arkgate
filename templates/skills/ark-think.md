---
name: ark-think
description: 2–3 options for one import-rule or ArkRules decision. Not a full map (use /ark-explore).
---

# /ark-think — Architectural reasoning (host LLM only)

**Not a first-run door.** One decision only. Session 0 → **`/ark-adopt`**.
Full map → **`/ark-explore`**. Apply → **`/ark-autopilot`**.
Do not send the user to leftover `/ark-contract` or `/ark-fix`.

You are the user's architecture thinking partner **inside** the project's Ark contract.
This skill does **not** call any LLM API from the arkgate package. **You** (the host agent)
reason; the write-gate and CI remain deterministic.

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

**2–3 options labeled by lens impact** (what residual improves / what stays out-of-scope).

## Deep modules (process)

- Prefer **deep modules** (small interface, hidden complexity). Never invent a depth score.
- Label the **seam** on each option that introduces a port/adapter; apply the **deletion test** before pass-through extracts “for testability.”
- Recommend tests **at the public interface** of the chosen seam.

## When / not when

| Use `/ark-think` when… | Do **not** use it when… |
|------------------------|-------------------------|
| One decision: new layer vs slice, port vs shared, peerIsolation choice | Full map / ranked residual / dual-plan seed → `/ark-explore` |
| 2–3 options already bounded by a known surface | Apply remediation → `/ark-autopilot` |
| Trade-offs before writing a **new** feature | Brownfield config wrong / false-green → `/ark-adopt` |
| Explain *why* a rule exists in *this* tree | HTML tour → `/ark-explain`; fitness numbers → `/ark-coverage` |

If you lack a product map and the tree is messy: run a **compressed** explore pass first
(≥8 files) **or** **STOP** and invoke `/ark-explore` — do not invent options from diagrams alone.

## Dual engine (mandatory)

| Engine | Role |
|--------|------|
| **Deterministic** | What the contract and doctor *prove* today (layers, rules, governed%, gaps) |
| **Exploratory** | What *this* decision surface wants — options grounded in files you open |

Never reason only from abstract hexagons. Open real modules before recommending a shape.


## MCP workspace binding (mandatory)

Before any `ark_*` MCP tool, call `ark_identity` with `project.expectedRoot` set to the exact
workspace root. Continue only when `binding.status === "matched"` and `authoritative === true`;
retain `projectIdentity.projectId`, then pass both `expectedRoot` and `expectedProjectId` under
`project` on every later MCP call. If identity is missing, mismatched, unverified, or the root is
uncertain, do not consume MCP analysis: use the workspace-local CLI and report that MCP
restart/retargeting is required. `ark://manifest` never satisfies this preflight.

## Dual plane — layers + ArkRules (mandatory, except /ark-runtime)

ArkGate has **two opt-in planes**. The user chooses which to use; you **always label** findings so they never blur.

| Plane | What it protects | Where it lives | Sensors / tools |
|-------|------------------|----------------|-----------------|
| **Layers** (inter-layer) | Who may import whom, capabilities, pure/forbiddenGlobals, peerIsolation | `ark.config.json` → `layers[]`, `rules[]` | graph check, baseline edges, doctor coverage % |
| **ArkRules** (intra-layer) | Structure inside a layer + domain invariants as data | `arkRules` map + `arkrules/<ExactLayerName>.json` | structure sensors, invariant coverage, `--rules-inventory`, doctor `rulesUnderContract` |

**Rules for every report / answer:**
1. Prefix each finding or next step with **`[Layer]`** or **`[ArkRules]`** (or a two-column table with those headers).
2. Never call an import-edge violation an “invariant” or an aggregate sensor a “layer deny.”
3. Absence of `arkRules` is **valid** — do not force ArkRules unless the user wants them or residual inventory clearly wants a pilot.
4. Editing `arkrules/*` or promoting modes is **`/ark-contract`**; fixing code under a structure sensor is **`/ark-fix`** / **`/ark-loop`** (judgment, never invent mechanical-safe).
5. CLI helpers: `ark-check --rules-inventory --json`, doctor JSON `rulesUnderContract`, sensors emit `ARKRULE_*` / `INVARIANT_UNCOVERED` with `evidence.arkruleId`.


### Think + ArkRules
- For ONE decision, consider options on **both** planes when relevant: e.g. new layer wall **vs** structure sensor **vs** invariant catalog entry.
- Every option must state enforceability: which plane holds it after the change.

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

## Steps

1. **Load the contract** — `ark.config.json`; when MCP is available, call `ark_identity` with
   the exact project root followed by `ark_manifest` with the same root plus returned project
   id. The `ark://manifest` resource is compatibility-only and always
   unverified/non-authoritative. Use `ark-check --coverage --json` / `--doctor` for honesty
   about governed% and false-green.
2. **Touch the decision surface** — README skim + **≥5 source files** on the feature/package/boundary
   under discussion. Name paths in the answer.
3. **Name the active shape** — which preset/archetype fits (hexagonal, vertical-slice,
   ddd-bounded-contexts, feature-sliced, monorepo, …). If none, run `--recommend --json`
   **and** say whether detection matches the tree you opened.
4. **Name concurrent patterns** on the decision surface (if ≥2): which is **golden** vs legacy.
5. **Reason within bounds** — propose **2–3 options** that **stay enforceable** by the gate.
   Prefer concrete paths and import rules over abstract diagrams.
6. **Explore alternatives** — for each option: coupling, testability, **AI-agent safety**,
   migration cost, **pilot + kill-switch** if the option adds a layer or wall.
7. **Surface hard lines** — never suggest: weakening `ark.config.json` to pass, silent
   judgment auto-apply, codemod engines, or skipping write-gate/CI.
8. **Hand off** — placement `/ark-place`; config `/ark-contract`; bulk debt `/ark-loop` /
   `/ark-autopilot`; map-only `/ark-explore`; violations `/ark-fix`.
   When the user needs action not advice: **STOP — do not continue this skill as complete** — invoke the handoff skill.

## Output format

- **Context:** product + contract + what you opened (paths) + phase if known (Align/Stabilize/Shape)
- **Options:** 2–3 alternatives with trade-offs (coupling, testability, agent safety, enforceability)
- **Recommendation:** one option + why it is enforceable **today**
- **Pilot / kill-switch:** if the choice changes shape or adds a layer
- **Risks if we pick wrong:** one sentence user-visible impact
- **Next command:** exact `ark-check` / skill to run next

## Related

- Greenfield shape: `/ark-architect`
- Brownfield: `/ark-adopt`
- Full recon / dual-plan seed: `/ark-explore`
- Explain existing: `/ark-explain`

## Completion contract (skill incomplete if missing)

End with **exactly** these headings (markdown `###`):

### Completion
- **Sensor:** commands/tools run
- **Opened:** real paths read (or `n/a` only if pure install/upgrade with no source analysis)
- **Result:** one-line outcome
- **Planes:** one-line split of residual **[Layer]** vs **[ArkRules]** (or `n/a` if unused)
- **Compass:** top residual lenses | `n/a`
- **Done axes:** architecture residual (status/doctor/compass) | feature/ticket residual (outside package). Enforce green ≠ feature done
- **Handoff:** `/ark-…` / CLI / `none`
- **Incomplete?** `no` | `yes — <what is missing>`

If a **STOP** handoff applies and you continued as if done, set **Incomplete?** to `yes`.
**Skill incomplete if missing** any of the bullets above.
