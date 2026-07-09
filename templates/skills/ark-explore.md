---
name: ark-explore
description: Exploratory architecture reconnaissance of the real project — product map, entry points, coupling hotspots, false-green risks, and suggestive next bets. CLI is a sensor; you read the tree. No gate bypass.
---

# /ark-explore — Reconocer el proyecto de verdad

You are a **staff engineer doing architecture reconnaissance** on *this* repository.
Ark’s CLI is a **sensor** (coverage, doctor, plan). **You** open source, README, entry
points, and git history. Output is **suggestive and ranked**, not a green checkbox.

Use alone when the user wants a map / options / “what should we do next?”.  
`/ark-autopilot`, `/ark-coverage`, and `/ark-adopt` embed a lighter version of this pass.

## Dual engine (mandatory)

| Engine | Role | Never confuse with |
|--------|------|--------------------|
| **Deterministic** | Contract truth: layers, rules, violations, `mechanical-safe` kinds, exit codes | Product vision or “good enough” |
| **Exploratory** | Your judgment from **reading this tree**: product surface, hotspots, false greens, opportunities | Only paraphrasing CLI JSON |

**Incomplete:** doctor/coverage dump with no file paths you opened.  
**Complete:** map + ranked bets + “así te lo re-soluciono” with real paths.


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

## Anti-wrapper rule

**Forbidden:** only `ark-check --json` / `--coverage` / `--doctor` paraphrase.

**Required:**
1. Sensor: `--coverage --json`, `--doctor`, optional `--plan --json` / normal check.
2. **Product + code pass** (below) — min **12 source files** across **≥4 directories** that matter for *this* product (apps, packages, features, domain, adapters, API routes).
3. Ranked **suggestions** (opportunities), not only residual violations.
4. Hard lines: never weaken the contract; never invent mechanical-safe kinds.

## Reconnaissance pass (do all that apply)

### A. Product surface (what the system is)
- README / package.json `description` / scripts / monorepo workspace roots.
- User-facing entry: Next/Nest/Express routes, CLIs, workers, public APIs.
- Deploy shape if obvious (apps/, packages/, services/).
- One paragraph: **“What does this product do for a real user?”**

### B. Architecture as lived (not only as configured)
- Map top dirs → intended layer vs what code *actually* does (UI, use-cases, I/O, pure domain).
- Empty Domain / Persistence while Application owns `airtable|supabase|prisma|repositories` → **false-green** (doctor id `contract-false-green-io-under-application`).
- Framework guts vs product code (Nest modules, Next app router, generated clients).

### C. Coupling & debt beyond the plan list
- Import hotspots, god modules, cross-feature leaks (`peerIsolation` candidates).
- Business rules in UI/hooks (`can*`, `calculate*`, policy constants) → Domain / intents.
- Dead or aspirational globs; layers with files but no rules.

### D. Agent / gate reality
- Write gate + CI + `/ark-*` skills present? Stale skills? Global vs pinned `arkgate`?
- Baseline: real debt or hiding contract smell?

### E. Suggestive bets (not commits yet)
For each opportunity: **impact × effort × enforceability** (can the gate hold it after?).

## Output format

1. **Headline** — product in one sentence + honesty (mode, governed%, false-green risk).
2. **Map** — entry points, major packages/dirs, shape name (or “no honest shape yet”).
3. **What I opened** — bullet list of paths (prove the explore pass).
4. **Ranked table**

| # | Kind | Finding | Evidence (path) | Suggestion | Next skill / command |

Kinds: `risk` | `false-green` | `debt` | `opportunity` | `shape` | `manifiesto` | `agent-dx`

5. **Top 3 bets** — if the user says “go”, which skill runs first and why.
   On false-green dominant: **STOP — do not continue this skill as complete.** **STOP — false-green: invoke /ark-adopt or /ark-contract before claiming ENFORCE.** Do not claim goal.met / ENFORCE from type-only cleanup while doctor reports `contract-false-green-io-under-application`.
   On concentrated edge dominant: **STOP — do not continue this skill as complete.** **STOP — concentrated edge: invoke /ark-contract with source evidence** (do not freeze a wrong contract or grind N freezes).
6. **Deterministic residue** — if plan has steps, point to `/ark-loop` / `/ark-fix` without claiming they are the whole architecture story.

## Done criteria

- ≥12 source files read and cited.
- At least **3 suggestive** rows (not only “fix violation X”).
- Clear handoff: `/ark-adopt` | `/ark-contract` | `/ark-autopilot` | `/ark-loop` | stop.
- No gate weakening; no false ENFORCE claim.

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
