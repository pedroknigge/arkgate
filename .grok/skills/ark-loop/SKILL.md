---
name: ark-loop
description: Drive ark-check --plan to zero active violations. Read real source, auto-apply only mechanical-safe kinds, design judgment from the product tree. CLI validates — you edit code.
arkVersion: 3.0.0
---

# /ark-loop — Apply the plan safely

Read Ark’s classified **plan**, work toward **goal.met**, one small step at a time,
validating every change with `ark-check` and rolling back regressions.

Deterministic kinds stay **tight**. Your job is still **exploratory on the files**: open
importers/targets, see if the plan step is a symptom of wrong shape / false Domain / I/O
under Application — escalate to `/ark-contract` or `/ark-explore` when the wall is structural.

## When / not when

| Use `/ark-loop` when… | Do **not** use it when… |
|-----------------------|-------------------------|
| Plan A has steps; drive to `goal.met` | Plan A empty — **stop**; residual Shape → `/ark-explore` / `/ark-autopilot` B |
| Mechanical-safe + approved judgment only | Full product recon first → explore inside `/ark-autopilot` |
| User already has a plan and wants the apply loop | Brownfield contract false-green → `/ark-adopt` |

**Empty plan is not success for the product** — only for *edge remediation*. If `goal.met` and
(`goal.designWeak` or non-empty `patternBets` from `--plan --json`): do **not** invent
mechanical-safe kinds; hand off `/ark-explore` shape-focus or `/ark-autopilot` for dual-plan B.
Pattern bets always have `neverMechanicalSafe: true` — extraction cards only
(`docs/brownfield-adoption.md` §6).

## Related onboarding

- **Greenfield:** `/ark-architect` or `ark-check --recommend` / `ark start`.
- **Brownfield:** `/ark-adopt` — match contract to reality; do not force a starter preset.
- **Map / opportunities:** `/ark-explore`.
- **Default path:** `ark start` → `/ark-autopilot` → `ark-check --doctor`.

## Dual engine (mandatory)

| Engine | Role |
|--------|------|
| **Deterministic** | Only the four `mechanical-safe` kinds auto-apply; plan tags; gate re-check |
| **Exploratory** | Read sources; detect concentrated edges / false-green / wrong layer home before grinding |


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

## Anti-wrapper rule (mandatory)

**Forbidden:** re-printing plan JSON without opening sources, or inventing new “safe” kinds.

**Required:**
1. `--plan --json` as sensor.
2. For each step you touch: **read** `file` and `target` source (and enough callers to know the edge).
3. **“Así te lo re-soluciono”** — exact edit before applying.
4. After each apply: full gate re-run; rollback if targeted violation remains or new ones appear.
5. If one edge dominates: **STOP — do not continue this skill as complete.** **STOP — concentrated edge: invoke /ark-contract with source evidence** (do not freeze a wrong contract or grind N freezes).
6. If empty cores + I/O under Application: **STOP — do not continue this skill as complete.** **STOP — false-green: invoke /ark-adopt or /ark-contract before claiming ENFORCE.** Do not claim goal.met / ENFORCE from type-only cleanup while doctor reports `contract-false-green-io-under-application`.

## mechanical-safe only (auto)

| `remediationKind` | What to do |
|-------------------|------------|
| `type-only-import-move` | Move type to owning layer; re-export for back-compat |
| `pure-type-file-relocate` | Relocate pure-type file to owning layer (or rename out of false Domain globs) |
| `import-type-from-pure-type-module` | Convert value import of pure-type module to `import type` |
| `import-type-of-type-exports` | Convert value-syntax named import/export of type-only exports from a mixed module to `import type` / `export type` |
| *(none for port-proof)* | **W6** `port-proof-inject-binding` is **judgment** (arity change) — propose inject; do not auto-apply |

Never auto: free value uses of imports, multi-import files, dynamic import/require, forbidden globals, cycles, port-proof inject, multi-file adapter scaffolding without proof.

## Steps

1. **Plan** — `ark-check --plan --json` (+ `--baseline` if used). If `goal.met`: stop **A**;
   if design-weak residual is visible, hand off explore/autopilot B — do not claim architecture done.
2. **Worktree** — prefer discardable git worktree.
3. **Apply mechanical-safe** one-by-one with validate/rollback.
4. **Judgment** — propose with source-based design; apply only if user approved (or parent autopilot said full apply).
5. **Re-plan** after each round until dry, `goal.met`, or only judgment left without approval.
6. **Report** — auto-applied / proposed / deferred with paths; never claim clean if skipped.

## Operating rules

- Never weaken the gate (no rule disables, no fresh baselining of new debt).
- Concentrated single edge → stop and hand to `/ark-contract` with code evidence.
- When unsure behavior preservation → judgment, not mechanical-safe.

## Done criteria

- Gate confirms each kept edit.
- Honest residual list with **Así te lo re-soluciono** for anything left.
- If residual steps hide domain/business rules in the wrong layer, call out **manifiesto** work (`intentPrefixes` / Domain placement) via `/ark-contract` or `/ark-adopt`.

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
