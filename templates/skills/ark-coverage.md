---
name: ark-coverage
description: Exploratory deep-audit of real code + Ark adoption gaps. CLI is a sensor only — map the product, read source, propose concrete remediations and ranked opportunities with "así te lo re-soluciono".
---

# /ark-coverage — Deep coverage + capability gaps

You audit how this repo uses ArkGate **and** what the **real product tree** needs next.
Work autonomously. End with a ranked report that is both **deterministic** (numbers) and
**exploratory** (source-backed suggestions).


## Dual engine (mandatory)

| Engine | Deliverable |
|--------|-------------|
| **Deterministic** | governed%, layers, gates, baseline, doctor gaps, summary edges |
| **Exploratory** | product map, clusters opened, opportunities beyond “fix violation X” |

**Forbidden:** only `ark-check --coverage/--doctor/--json` paraphrase or gate checklists with no source evidence.

**Required before you finish:**
1. CLI sensor: `--coverage --json`, `--doctor`, normal `--json` for `summary`.
2. **Product surface** — README, workspaces, entry apps/APIs (name them).
3. **Read real source** in the top ungoverned / high-coupling clusters (minimum **10 files**
   across at least **4 directories** that matter for this product). Prefer domain, features,
   adapters, app routes — not only config.
4. **“Así te lo re-soluciono”** — file-level moves, contract globs, intent/manifest proposals.
5. **Suggestive section** — opportunities (shape, extract, peerIsolation, manifiesto, DX)
   ranked by impact × enforceability, even if the check is already green.

If you did not open source files, the skill is **not complete**.  
Full recon-only mode: `/ark-explore`.


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
| **Enforce / Guard** | Coverage + clean edges + honest cores | “You arrived here — keep the host-appropriate write path and CI check on.” |

Never say “your architecture is guarded” while `goal.met` is false, governed% is low,
or false-green doctor gaps are open.

## Related onboarding

- **Greenfield:** low governed% → `/ark-architect` or `ark-check --recommend`.
- **Brownfield:** `/ark-adopt` + this skill’s deep map — **not** `/ark-architect`.
- **Business rules / intents loose in the tree:** also cover in **Así te lo re-soluciono**
  (mine → `intentPrefixes` / Domain placement / kernel `defineIntent` stubs).
- **Explore-only report:** `/ark-explore`.

## Checklist (sensor)

1. Config + `ark-check --strict-config` (dead preset globs advisory; unclassified files still fail strict).
2. Baseline policy (orphan empty file? wire or delete).
3. Host-appropriate write path + `/ark-*` skills per detected agent.
4. CI workflow + monorepo install reality (`frontend/package.json`?).
5. ESLint `arkgate/eslint` if ESLint exists.
6. Domain `forbiddenGlobals`.
7. **Governed%** + unclassified + `suggestions` from `--coverage --json`.
8. Concentrated edges in check `summary` → contract smell, not N freezes.
9. `layersWithoutRules` + empty cores with I/O under Application (false-green).
    On false-green: **STOP — do not continue this skill as complete.** **STOP — false-green: invoke /ark-adopt or /ark-contract before claiming ENFORCE.** Do not claim goal.met / ENFORCE from type-only cleanup while doctor reports `contract-false-green-io-under-application`.
    On one-edge wall: **STOP — do not continue this skill as complete.** **STOP — concentrated edge: invoke /ark-contract with source evidence** (do not freeze a wrong contract or grind N freezes).
10. Runtime kernel / Nest only if deps prove it — never force-fit Next+Python.

## Deep code pass (exploratory — the model job)

For each top cluster (e.g. `src/features/*`, `src/lib/*`, `apps/*/src`):

- Who imports whom (App→Presentation? Domain→App? cross-feature?).
- Is “core” / “lib” really application, UI, I/O, or mixed?
- Loose business logic: `calculate*`, `can*`, `validate*`, policy numbers, publish/intent strings without registry.
- Propose: layer home, `ark.config.json` patterns, Domain extract, intent names (`Domain.*` / `Application.*`).
- **Opportunity**, not only residual debt: what would make agents safer next week?

## Output format

1. **Headline honesty** — product one-liner, governed%, mode, violations, false-green risk.
2. **Code map** — clusters you read + what you found (paths).
3. **Ranked table** (mix residual gaps + opportunities)

| # | Kind | Gap / opportunity | Evidence (path or CLI) | Así te lo re-soluciono (concrete) |

Kinds: `debt` | `false-green` | `shape` | `manifiesto` | `gates` | `opportunity`

4. **Manifiesto / reglas de negocio** (if any): proposed intents / Domain files / config edits.
5. Offer: “Apply top N?” / “Run /ark-adopt?” — apply only if user agrees; then re-run strict check.

## Done criteria

- ≥10 source files read and cited; product surface named.
- At least one **Así te lo re-soluciono** block with real paths.
- At least **two** exploratory suggestions (not only CLI residual debt).
- CLI numbers used as evidence, not as the whole report.

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
