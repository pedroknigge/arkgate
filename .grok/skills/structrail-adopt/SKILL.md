---
name: structrail-adopt
description: Brownfield onboarding — exploratory match of contract to real product code, classify ungoverned dirs, mine business rules into the manifest, freeze only real debt. Deep source analysis required.
structrailVersion: 3.0.0
---

# /structrail-adopt — Bring Structrail into an existing codebase

Goal: contract reflects **product reality**, most code governed, only genuine debt frozen
with a burn-down. A green check over a wrong contract is a **false green**.


## Dual engine (mandatory)

| Engine | Role |
|--------|------|
| **Deterministic** | coverage, doctor, baseline, strict-config after edits |
| **Exploratory** | walk the real monorepo/app layout; reclassify; mine rules; suggest shape |


## Subagent fan-out (optional, host-dependent)

When the user asks to go faster **or** the work naturally splits (multiple packages,
feature dirs, plan clusters), you **may** dispatch **subagents**:

| Host capability | Behavior |
|-----------------|----------|
| **Parallel subagents supported** (e.g. multi-agent / `spawn_subagent` / concurrent Agent tools) | Launch **2–N** agents in **one wave** with **disjoint path scopes**. Prefer **read-only** explore agents for mapping; at most **one writer** unless the host gives isolated worktrees. Parent merges findings, then runs `structrail-check` once. |
| **Not supported** (single agent only) | **Fall back to sequential** — same checklist, one cluster/step at a time. Never claim parallel work you did not run. |

**Rules:**
1. Give each subagent a **tight brief**: paths in scope, sensor commands allowed, deliverable shape (paths opened + findings JSON or bullets).
2. **No shared mutable files** across parallel writers.
3. STOP handoffs and dual-engine rules still apply in every agent.
4. Parent owns the **### Completion** block (union of **Opened**, single **Handoff**).
5. Do **not** use subagents to weaken the gate or invent `mechanical-safe` kinds.

## Related onboarding

- **Greenfield:** `/structrail-architect` or `structrail-check --recommend` / `structrail start`.
- **Brownfield:** `/structrail-adopt` — match contract to reality; do not force a starter preset.
- **Deep map only:** `/structrail-explore`.
- **Default path:** `structrail start` → `/structrail-autopilot` → `structrail-check --doctor`.

## Anti-wrapper rule (mandatory)

**Forbidden:** only running `--init` / `--update-baseline` / coverage JSON without reading the tree.

**Required:**
1. CLI sensor: `--coverage --json`, check `--json` (`summary`), doctor.
2. **Product map** — what ships, which apps/packages, entry routes/CLIs.
3. **Read real source** in largest ungoverned dirs and top import edges (min **12 files**
   across **≥4 dirs**).
4. **“Así te lo re-soluciono”** — concrete layer globs, file moves, manifest/intent proposals.
5. **Suggestive burn-down** — ranked next steps after adopt (not only “baseline done”).
6. Never freeze a concentrated edge without investigating contract smell / false-green.

## Guiding principle

Structrail protects the **boundary around** a framework, not its internals. Nest/DI public surface = one layer; internals black box.

## Steps

1. **Config** — missing → `structrail-check --init` (detection). Keep existing unless asked to regenerate.
   If the tree is `src/features` + `shared`/`lib` **without** FSD `entities`/`widgets`, prefer
   `vertical-slice` (or pack `enthusiast-vertical-slice`) — do **not** force hexagonal.
   If `src/contexts` or `src/bounded-contexts` exists, prefer `ddd-bounded-contexts`.
2. **Check + diagnose** — `summary.concentrated` / dominant edge → fix contract first, don’t freeze.
   Cross-slice / cross-context `peerIsolation` hits are judgment: extract shared or events.
   If one edge dominates residual debt: **STOP — do not continue this skill as complete.** **STOP — concentrated edge: invoke /structrail-contract with source evidence** (do not freeze a wrong contract or grind N freezes).
   Empty Domain/Persistence + I/O under Application → false-green.
   **STOP — do not continue this skill as complete.** **STOP — false-green: invoke /structrail-adopt or /structrail-contract before claiming ENFORCE.** Do not claim goal.met / ENFORCE from type-only cleanup while doctor reports `contract-false-green-io-under-application`.
3. **Classify ungoverned** — use coverage `suggestions` **plus** dirs you discovered by reading;
   add layers/patterns via `/structrail-contract`.
4. **Mine business rules → manifiesto** (model job — this is why the skill exists):
   - Scan for loose domain: validators, pricing/policy functions, `can*`/`calculate*`, magic business constants, publish/intent strings, logic in UI/hooks that belongs in Domain.
   - Propose: Domain files, `intentPrefixes`, intent names (`Domain.*` / `Application.*`), kernel `defineIntent` stubs if runtime is used.
   - Apply config through `/structrail-contract` discipline; move pure rules into Domain when safe; validate with structrail-check.
   - Deliver section **“Así te lo re-soluciono en el manifiesto”** with before/after contract snippets.
5. **Freeze only real debt** — `--update-baseline` (zero debt → **no empty baseline file** left behind).
6. **Gates + skills** — `--install-agent-gates` (CI monorepo-aware when `frontend/package.json` exists).
7. **Ratchet + opportunity plan** — ranked residual edges + **explore-style bets** (what to improve next week).

## Operating modes

Explain modes as **detected stages** (Setup / Align / Guard), not user settings.

## Verify

`structrail-check --root . --config structrail.config.json --strict-config` (+ baseline only if non-empty file retained).
Report: governed% before/after, files written, frozen count, false positives avoided, manifest/intent proposals applied or deferred, **top opportunities still open**.

## Never

- Freeze false positives to get green.
- Force runtime kernel over existing Nest/DI.
- Claim Enforce while governed% is low, cores empty with I/O in Application, or core bags ungoverned.

## Completion contract (skill incomplete if missing)

End with **exactly** these headings (markdown `###`):

### Completion
- **Sensor:** commands/tools run
- **Opened:** real paths read (or `n/a` only if pure install/upgrade with no source analysis)
- **Result:** one-line outcome
- **Handoff:** `/structrail-…` / CLI / `none`
- **Incomplete?** `no` | `yes — <what is missing>`

If a **STOP** handoff applies and you continued as if done, set **Incomplete?** to `yes`.
**Skill incomplete if missing** any of the bullets above.
