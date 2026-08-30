---
name: ark-coverage
description: How much of the tree the rules file covers. CLI is a sensor; read the source.
---

# /ark-coverage — Ark adoption fitness (not full recon)

**Not a first-run door.** Fitness numbers only (governed files, gates, baseline).
Session 0 → **`/ark-adopt`**. Leftover design → **`/ark-explore`**. Apply → **`/ark-autopilot`**.
Do not send the user to leftover `/ark-contract` or `/ark-fix`.

You audit **how this repo uses ArkGate** (coverage, gates, baseline, host write path) and
what adoption gaps remain. Work autonomously. End with a ranked fitness report.

**This is not `/ark-explore`.** You do **not** produce a multi-pattern dual-plan or spaghetti
Shape ladder by default. If the tree is design-weak under ENFORCE, **handoff** to explore.

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

**Fitness numbers + handoff** when residual lenses are non-empty — never call coverage “done architecture.”

## When / not when

| Use `/ark-coverage` when… | Do **not** use it when… |
|---------------------------|-------------------------|
| “How adopted is Ark?” governed%, gates, baseline, skills stale | Full product map / what-next architecture → `/ark-explore` |
| Capability gaps (CI, write path, ESLint, optional layers) | Apply fixes end-to-end → `/ark-autopilot` |
| Ranked *adoption* opportunities (install, ratchet, contract classify) | Spaghetti pattern plan / golden pattern → `/ark-explore` dual-plan seed |
| Quick honesty before a release checklist | One design trade-off → `/ark-think` |

## Dual engine (mandatory)

| Engine | Deliverable |
|--------|-------------|
| **Deterministic** | governed%, layers, gates, baseline, doctor gaps, summary edges |
| **Exploratory** | Enough source to prove ungoverned clusters / false-green are real (not JSON-only) |

**Forbidden:** only `ark-check --coverage/--doctor/--json` paraphrase with no source evidence.

**Required before you finish:**
1. CLI sensor: `--coverage --json`, `--doctor`, normal `--json` for `summary`.
2. **Product surface** — name the app/package(s) in one line (not a full recon).
3. **Read real source** in the top ungoverned / high-risk clusters (minimum **10 files**
   across at least **4 directories**). Prefer domain, features, adapters, routes — not only config.
4. **“How to fix”** for adoption gaps (globs, install, baseline, intents).
5. If plan A is empty but you see design-weak / concurrent patterns / god modules:
   list them briefly and **STOP — do not continue this skill as complete** for pattern work —
   **handoff `/ark-explore` (dual-plan seed or shape-focus)**. Do not invent a second explore report here.

If you did not open source files, the skill is **not complete**.  
Full recon + pattern planning: `/ark-explore`.


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
4. Editing `arkrules/*` or promoting modes is **`/ark-adopt`** / leftover **`/ark-contract`**; fixing code under a structure sensor is leftover **`/ark-fix`** / **`/ark-loop`** or **`/ark-autopilot`** (judgment, never invent mechanical-safe).
5. CLI helpers: `ark-check --rules-inventory --json`, doctor JSON `rulesUnderContract`, sensors emit `ARKRULE_*` / `INVARIANT_UNCOVERED` with `evidence.arkruleId`.
5b. Invariant coverage is a **text match, never an execution**: a file walk plus the invariant id in a `describe`/`it` title. Never report `INVARIANT_UNCOVERED: 0` as “the tests pass” or “the tests run” — ArkGate does not run tests and reads no runner config. When the project declares `coverage.coverageRoots`, a covering test found outside them raises the advisory `INVARIANT_COVERAGE_OUTSIDE_ROOTS`; without that declaration ArkGate makes no claim about where tests run.
6. Extras silent when off. Doctor `arkRun` is `notAScore`. Do not force extras. Do not invent `/ark-run` or `/ark-order`.


### Coverage + ArkRules
- Fitness report: governed% / gates / baseline = **[Layer]**; `rulesUnderContract` inventoried/under-contract/frozen = **[ArkRules]** (counts, never a score).
- Capability gap: “no arkRules map” is optional adoption opportunity, not a failed gate.

### Coverage + extras
- Extras silent when off. Doctor `arkRun` is `notAScore`. “No arkRun / arkOrder” is not a failed gate. Do not force extras.

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

## Operating modes (detected — not user-picked)

| Mode | User meaning | What you tell them |
|------|----------------|--------------------|
| **Suggest / Setup** | Thin or new tree | “Ark will propose a starting shape — you don’t switch a mode.” |
| **Adapt / Align** | Contract ≠ folders or open debt | “Gates don’t fully protect you yet — classify + fix plan.” |
| **Enforce / Guard** | Coverage + clean edges + honest cores | “You arrived here for *contract* fitness — design may still be weak; use explore for Shape.” |

Never say “your architecture is guarded” while `goal.met` is false, governed% is low,
or false-green doctor gaps are open. Never say “architecture is healthy finished” solely
because governed% is 100% and plan is empty.

**Honesty hard lines (doctor JSON):**
- `coverageHonesty.worseThanNoGate` / weak coverage (~&lt;50%): green is **worse than no gate**.
- `baseline.honesty.dirtyBaselineRisk`: green-via-freeze may hide false-positive debt.
- `writePath.honesty.softWriteHost` (OpenCode or another uncovered path): write path is
  **advisory / best-effort**, not hard PreToolUse — required CI status is the hard merge boundary.
- Cursor hard evidence is limited to trusted Write/StrReplace; Codex is limited to a complete,
  trusted, runtime-observed local `apply_patch`. Do not borrow either claim for other paths.

## Related onboarding

- **Greenfield:** low governed% → `/ark-architect` or `ark-check --recommend`.
- **Brownfield:** `/ark-adopt` for action; this skill for fitness metrics.
- **Pattern / spaghetti residual:** `/ark-explore` dual-plan seed / shape-focus.
- **Business rules loose:** note in table; mining action → `/ark-adopt` or `/ark-contract`.

## Checklist (sensor + light code)

1. Config + `ark-check --strict-config`.
2. Baseline policy (orphan empty file? wire or delete).
3. Host-appropriate write path + `/ark-*` skills per detected agent.
4. CI workflow + monorepo install reality.
5. ESLint `arkgate/eslint` if ESLint exists.
6. Domain `forbiddenGlobals`.
7. **Governed%** + unclassified + `suggestions` from `--coverage --json`.
8. Concentrated edges in check `summary` → contract smell, not N freezes.
9. `layersWithoutRules` + empty cores with I/O under Application (false-green).
    On false-green: **STOP — do not continue this skill as complete.** **STOP — false-green: invoke /ark-adopt or /ark-contract before claiming ENFORCE.** Do not claim goal.met / ENFORCE from type-only cleanup while doctor reports `contract-false-green-io-under-application`.
    On one-edge wall: **STOP — do not continue this skill as complete.** **STOP — concentrated edge: invoke /ark-contract with source evidence** (do not freeze a wrong contract or grind N freezes).
10. Runtime kernel / Nest only if deps prove it — never force-fit.

## Output format

1. **Headline honesty** — product one-liner, governed%, mode, violations, false-green risk, **design-weak handoff?** (yes/no).
2. **Adoption map** — clusters you read for *fitness* (paths) — keep short.
3. **Ranked table** (adoption residual + install/capability opportunities)

| # | Kind | Gap / opportunity | Evidence (path or CLI) | How to fix (concrete) | Next |

Kinds: `debt` | `false-green` | `shape` | `manifiesto` | `gates` | `opportunity` | `design-weak`

4. If any `design-weak` rows: **Handoff required** → `/ark-explore` (do not expand into full dual-plan here).
5. Offer: “Apply top adoption N?” / “Run /ark-adopt?” / “Run /ark-explore for Shape?” — apply only if user agrees.

## Done criteria

- ≥10 source files read and cited; product surface named.
- At least one **How to fix** block with real paths or install commands.
- CLI numbers used as evidence, not as the whole report.
- Design residual either absent with evidence or explicitly handed to `/ark-explore`.

## Completion contract (skill incomplete if missing)

End with **exactly** these headings (markdown `###`):

### Completion
- **Sensor:** commands/tools run
- **Opened:** real paths read (or `n/a` only if pure install/upgrade with no source analysis)
- **Result:** one-line outcome
- **Planes:** one-line split of residual **[Layer]** vs **[ArkRules]** vs **[ArkRun]** vs **[ArkOrder]** (or `n/a` if unused)
- **Compass:** top residual lenses | `n/a`
- **Handoff:** `/ark-…` / CLI / `none`
- **Incomplete?** `no` | `yes — <what is missing>`

If a **STOP** handoff applies and you continued as if done, set **Incomplete?** to `yes`.
**Skill incomplete if missing** any of the bullets above.
