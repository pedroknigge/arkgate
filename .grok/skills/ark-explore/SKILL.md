---
name: ark-explore
description: Decision-grade architecture recon — sensor + tree + field path + coupling evidence. Rank residual that changes action, not green checkboxes. CLI is a sensor; you read the tree. No gate bypass.
arkVersion: 2.9.1
---

# /ark-explore — Recon the real project

You are a **staff engineer doing architecture reconnaissance** on *this* repository.
Ark’s CLI is a **sensor** (coverage, doctor, plan). **You** open source, entry points,
install hooks, examples/starters, and coupling evidence. Output is **decision-grade**:
ranked residual that changes the next command — **not** a celebration of ENFORCE and
**not** a paraphrase of README/ROADMAP.

Use alone when the user wants a map / options / “what should we do next?”.  
`/ark-autopilot`, `/ark-coverage`, and `/ark-adopt` embed a lighter version of this pass.

## Related onboarding

- **Greenfield / thin tree:** `/ark-architect` or `ark-check --recommend` / `ark start`.
- **Brownfield:** `/ark-adopt` after the map (or hand off from explore STOP paths).
- **Default path:** `ark start` → `/ark-autopilot` → `ark-check --doctor`.

## Dual engine (mandatory)

| Engine | Role | Never confuse with |
|--------|------|--------------------|
| **Deterministic** | Contract truth: layers, rules, violations, `mechanical-safe` kinds, exit codes | Product vision or “good enough” |
| **Exploratory** | Your judgment from **reading this tree**: product surface, field path, hotspots, false greens / false promises, opportunities | Only paraphrasing CLI JSON or docs |

**Incomplete:** doctor/coverage dump with no file paths you opened; or a long map that
only restates README.  
**Complete:** dry headline + field evidence + ranked bets with **así te lo re-soluciono**
(real paths, concrete next step) + honest handoff when the residual is *not* layer debt.

**ENFORCE / 100% governed / empty plan is baseline, not a finding.** Lead with residual
that still matters (dogfood gaps, soft starters, identity drift, coupling that blocks
evolution). If residual is truly none, say so in one line and hand off `stop`.

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

Useful split when present: **core product tree** vs **field path** (`examples/`,
`templates/`, gallery starters, eval fixtures) vs **agent install surfaces** (hooks,
MCP, CI templates).

## Anti-wrapper rule

**Forbidden:**
- Only `ark-check --json` / `--coverage` / `--doctor` paraphrase.
- Echoing README / ROADMAP / marketing as if it were recon.
- Padding the ranked table with “architecture is clean” rows when the sensor already said that.
- Ranking debt by **LOC alone** without fan-in, exports, or call-site evidence.

**Required:**
1. Sensor: `--coverage --json`, `--doctor`, optional `--plan --json` / normal check.
2. **Product + code pass** — min **12 source files** across **≥4 directories** that matter for *this* product (apps, packages, features, domain, adapters, API routes, CLIs).
3. **Field path** when the repo ships consumer-facing scaffolds (see §E) — run or open them; do not assume docs match scripts.
4. **Coupling evidence** beyond “large file” (see §C).
5. Ranked rows that **change a decision** (opportunity / risk / false-green / agent-dx), not residual violation trivia alone.
6. Hard lines: never weaken the contract; never invent mechanical-safe kinds; never claim ENFORCE from type-only cleanup while false-green doctor ids are active.

## Reconnaissance pass (do all that apply)

### A. Product surface (what the system is)
- README / package.json `description` / scripts / monorepo workspace roots — **skim for entry points**, do not restate the pitch.
- User-facing entry: Next/Nest/Express routes, CLIs, workers, public APIs, package exports.
- Deploy shape if obvious (apps/, packages/, services/).
- One dry line: **what a real user/agent gets** (not the slogan).

### B. Architecture as lived (not only as configured)
- Map top dirs → intended layer vs what code *actually* does (UI, use-cases, I/O, pure domain).
- Empty Domain / Persistence while Application owns `airtable|supabase|prisma|repositories` → **false-green** (doctor id `contract-false-green-io-under-application`).
- Framework guts vs product code (Nest modules, Next app router, generated clients).
- **Identity risk:** which layer owns the product *wedge* vs which dominates file count / public barrel (e.g. optional runtime re-exported as default import).

### C. Coupling & debt (measure, don’t guess)
Prefer evidence over aesthetics:
- **Fan-in / importers** of hot modules (who imports the suspect file?).
- **Export surface** (how many public symbols does the orchestration module re-export?).
- Import cycles, cross-feature leaks (`peerIsolation` candidates).
- Business rules in UI/hooks (`can*`, `calculate*`, policy constants) → Domain / intents.
- Dead or aspirational globs; layers with files but no rules; **starter/preset rules weaker than sibling archetypes** (soft green).
- LOC is a **hint** only — pair it with fan-in or export count before calling something a god module.

### D. Agent / gate reality (installed vs generated)
- Write gate + CI + `/ark-*` skills present? Stale skills? Global vs pinned `arkgate`?
- **Installed hooks vs install templates:** compare project PreToolUse / write-hook commands to what `--install-agent-gates` would emit (e.g. reject-only `--hook` vs `--hook-repair`). Doctor `writePath` / adoption gaps are leads — **verify on disk**.
- MCP config present and pointing at a real binary? `prepare-write` / autoPatch surface vs hook mode.
- Baseline: real debt or hiding contract smell?
- CI: is architecture check required on the default branch path this repo actually uses?

### E. Field path (consumer promise — mandatory when present)
When `examples/`, `templates/`, gallery starters, eval fixtures, or docs claim “copy this and stay green”:
1. Open **≥2** scaffolds (prefer one minimal gallery + one “deep” / runnable demo).
2. **Run** their documented check script when cheap (`npm run check`, `ark-check --strict-config`); record pass/fail — do not trust README alone.
3. Diff **rule strength** across archetypes (missing denies = soft false-green for consumers).
4. Note import style vs package surface docs (`arkgate` root barrel vs preferred subpath).
5. Flag **false promises**: demo fails under its own check, or green with a hollow contract.

If the repo is a pure app with no examples, state **Field path: n/a** and deepen product tree recon instead.

### F. Suggestive bets (not commits yet)
For each opportunity: **impact × effort × enforceability** (can the gate hold it after?).  
Prefer bets the user can run next (`command` / skill), not vague “improve DX”.

## Output format (keep tight)

1. **Headline** — product in one sentence + honesty line (mode, governed%, false-green / false-promise risk). ENFORCE is context, not the story.
2. **Map** — one short table or bullet map: entry points, major dirs, shape name (or “no honest shape yet”). One screen max.
3. **What I opened** — paths + sensors that prove the pass (include field/hook paths when used).
4. **Ranked table** — **only rows that change a decision**. Prefer **3–6** hard rows; drop filler.

| # | Kind | Finding | Evidence (path) | Así te lo re-soluciono | Next skill / command |

Kinds: `risk` | `false-green` | `debt` | `opportunity` | `shape` | `manifiesto` | `agent-dx`

**Así te lo re-soluciono** must be concrete: files to touch, command to run, success signal
(e.g. “doctor writePath = repair”, “starter `npm run check` green under strict-config”).

5. **Field path summary** (when applicable) — small pass/fail table of starters/checks.
6. **Top 3 bets** — if the user says “go”, ordered execution. First bet should be the highest
   leverage residual, even when plan is empty (agent-dx / field honesty / coverage of the
   enforcement wedge — not “run loop on zero steps”).
   On false-green dominant: **STOP — do not continue this skill as complete.** **STOP — false-green: invoke /ark-adopt or /ark-contract before claiming ENFORCE.** Do not claim goal.met / ENFORCE from type-only cleanup while doctor reports `contract-false-green-io-under-application`.
   On concentrated edge dominant: **STOP — do not continue this skill as complete.** **STOP — concentrated edge: invoke /ark-contract with source evidence** (do not freeze a wrong contract or grind N freezes).
7. **Deterministic residue** — compact: plan steps, violations, doctor top action. Point to
   `/ark-loop` / `/ark-fix` **only when steps exist**; never pretend loop is the architecture story when goal is already met.

Optional when useful: **Diff vs naive sensor-only read** (one short list: what reading the tree changed).

## Done criteria

- ≥12 source files read and cited across ≥4 directories.
- Field path executed or explicitly `n/a` with reason.
- At least **3 decision-grade** rows (not “fix violation X” and not “layers are clean”).
- Coupling claims backed by fan-in / exports / importers (or clearly marked as LOC-only hint).
- Clear handoff: `/ark-adopt` | `/ark-contract` | `/ark-autopilot` | `/ark-loop` | `/ark-fix` | CLI command | `stop`.
- No gate weakening; no false ENFORCE claim; no README echo as primary content.

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
