---
name: structrail-explore
description: Decision-grade architecture recon — sensor + tree + field path + coupling evidence. Rank residual that changes action; optional dual-plan seed (not multi-week roadmaps). CLI is a sensor; you read the tree. No gate bypass.
---

# /structrail-explore — Recon the real project

You are a **staff engineer doing architecture reconnaissance** on *this* repository.
Structrail’s CLI is a **sensor** (coverage, doctor, plan). **You** open source, entry points,
install hooks, examples/starters, and coupling evidence. Output is **decision-grade**:
ranked residual that changes the next command — **not** a celebration of ENFORCE and
**not** a paraphrase of README/ROADMAP.

Use alone when the user wants a map / options / “what should we do next?”.  
`/structrail-autopilot`, `/structrail-coverage`, and `/structrail-adopt` embed a lighter version of this pass.

## Related onboarding

- **Greenfield / thin tree:** `/structrail-architect` or `structrail-check --recommend` / `structrail start`.
- **Brownfield:** `/structrail-adopt` after the map (or hand off from explore STOP paths).
- **Default path:** `structrail start` → `/structrail-autopilot` → `structrail-check --doctor`.
- **Execute dual plan + apply:** `/structrail-autopilot` (explore is recon / seed, not the loop).

## Dual engine (mandatory)

| Engine | Role | Never confuse with |
|--------|------|--------------------|
| **Deterministic** | Contract truth: layers, rules, violations, `mechanical-safe` kinds, exit codes | Product vision or “good enough” |
| **Exploratory** | Your judgment from **reading this tree**: product surface, field path, hotspots, false greens / false promises, design patterns lived | Only paraphrasing CLI JSON or docs |

**Incomplete:** doctor/coverage dump with no file paths you opened; or a long map that
only restates README; or a multi-week roadmap when the user only asked for a map.  
**Complete:** dry headline + field evidence + ranked bets with **así te lo re-soluciono**
(real paths, concrete next step, **success signal**) + honest handoff when residual is
*not* layer debt.

**ENFORCE / 100% governed / empty plan is baseline, not a finding.** Lead with residual
that still matters (dogfood gaps, soft starters, identity drift, **semantic false-green**,
coupling that blocks evolution). If residual is truly none, say so in one line and hand
off `stop`.

## Output mode (pick one — do not invent a third)

| Mode | When | Deliverable |
|------|------|-------------|
| **Recon (default)** | map / residual / “what next?” / bare `/structrail-explore` | Headline → map → ranked table → **Top 3** → residue → Completion |
| **Dual-plan seed** | user asks for a **plan**, mejora, roadmap, o “Structrail + patrón de diseño” | Same recon **plus** a short **§ Dual-plan seed** (below). **Cap 3–5 B bets.** |

**Forbidden in either mode:**
- A 6-phase / multi-week implementation roadmap as the default explore product.
- Phases with week estimates, long PR stacks, or vanity “Domain ≥ N files” as done criteria.
- Auto-applying anything (explore does not edit the contract or product code unless the user
  separately asks to execute a bet).

**Dual-plan seed shape (mode 2 only):**

| Section | Content |
|---------|---------|
| **A. Remediation** | From `--plan` — usually empty when ENFORCE; one line if so |
| **B. Pattern / evolution** | **3–5** bets max from the ranked table; each: evidence · así te lo re-soluciono · **success signal** · next skill · **kill-switch** if proposing a new layer/big move |

Long multi-PR execution plans belong to **`/structrail-autopilot`** (or a human-owned doc after
the seed), not to explore by default.

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

Useful split when present: **core product tree** vs **field path** (`examples/`,
`templates/`, gallery starters, eval fixtures) vs **agent install surfaces** (hooks,
MCP, CI templates).

## Anti-wrapper rule

**Forbidden:**
- Only `structrail-check --json` / `--coverage` / `--doctor` paraphrase.
- Echoing README / ROADMAP / marketing as if it were recon.
- Padding the ranked table with “architecture is clean” rows when the sensor already said that.
- Ranking debt by **LOC alone** without fan-in, exports, or call-site evidence.
- **Vanity success metrics** as bet done criteria (e.g. “Domain ≥ 20 files”, “add a layer
  because the diagram is prettier”) without multi-surface proof or a kill-switch.
- Multi-week roadmaps when mode is recon-only.

**Required:**
1. Sensor: `--coverage --json`, `--doctor`, optional `--plan --json` / normal check.
2. **Product + code pass** — min **12 source files** across **≥4 directories** that matter for *this* product (apps, packages, features, domain, adapters, API routes, CLIs).
3. **Field path** when scaffolds exist (see §E); for pure apps, **internal field path** (see §E).
4. **Coupling evidence** beyond “large file” (see §C).
5. **Path-correct vs design-correct** pass (see §B).
6. Ranked rows that **change a decision**; each bet has a **success signal** (not a file count).
7. Hard lines: never weaken the contract; never invent mechanical-safe kinds; never claim ENFORCE from type-only cleanup while false-green doctor ids are active.

## Reconnaissance pass (do all that apply)

### A. Product surface (what the system is)
- README / package.json `description` / scripts / monorepo workspace roots — **skim for entry points**, do not restate the pitch.
- User-facing entry: Next/Nest/Express routes, CLIs, workers, public APIs, package exports.
- Deploy shape if obvious (apps/, packages/, services/).
- One dry line: **what a real user/agent gets** (not the slogan).

### B. Architecture as lived — path-correct vs design-correct
- Map top dirs → intended layer vs what code *actually* does (UI, use-cases, I/O, pure domain).
- Classic false-green: empty Domain / Persistence while Application owns `airtable|supabase|prisma|repositories` → doctor id `contract-false-green-io-under-application`.
- **Semantic false-green** (edges green, names lie) — flag when you see it:
  - HTTP handlers / route bodies living under `repositories/` or Persistence globs.
  - Presentation/routes defaulting to a data facade (`platform/*`, raw db) while “repos exist”.
  - Domain layer thin while pure business rules sit in Application with no I/O (should be Domain).
  - Layer labels that match globs but not role (gate path-correct, design wrong).
- Framework guts vs product code (Nest modules, Next app router, generated clients).
- **Identity risk:** which layer owns the product *wedge* vs file-count / public barrel.
- **Concurrent design patterns** (short table when ≥2 styles coexist): name each pattern,
  one example path, quality (`canonical` / `gate-green design-weak` / `legacy`). Mark the
  **golden** pattern to copy. Do not only list layer file counts.

### C. Coupling & debt (measure, don’t guess)
Prefer evidence over aesthetics:
- **Fan-in / importers** of hot modules (who imports the suspect file?).
- **Export surface** (how many public symbols does the orchestration module re-export?).
- Import cycles, cross-feature leaks (`peerIsolation` candidates).
- Business rules in UI/hooks (`can*`, `calculate*`, policy constants) → Domain / intents.
- Dead or aspirational globs; layers with files but no rules; **starter/preset rules weaker than sibling archetypes** (soft green).
- LOC is a **hint** only — pair it with fan-in or export count before calling something a god module.

### D. Agent / gate reality (installed vs generated)
- Write gate + CI + `/structrail-*` skills present? Stale skills? Global vs pinned `structrail`?
- **Installed hooks vs install templates:** compare project PreToolUse / write-hook commands to what `--install-agent-gates` would emit (e.g. reject-only `--hook` vs `--hook-repair`). Doctor `writePath` / adoption gaps are leads — **verify on disk**.
- MCP config present and pointing at a real binary? `prepare-write` / autoPatch surface vs hook mode.
- Baseline: real debt or hiding contract smell?
- CI: is architecture check required on the default branch path this repo actually uses?
- **Origin:** is `.ark/reports/origin.json` present? (Day-zero picture; missing → note as agent-dx / adopt gap, not a layer violation.)

### E. Field path (consumer promise or internal)
When `examples/`, `templates/`, gallery starters, eval fixtures, or docs claim “copy this and stay green”:
1. Open **≥2** scaffolds (prefer one minimal gallery + one “deep” / runnable demo).
2. **Run** their documented check script when cheap (`npm run check`, `structrail-check --strict-config`); record pass/fail — do not trust README alone.
3. Diff **rule strength** across archetypes (missing denies = soft false-green for consumers).
4. Note import style vs package surface docs (`structrail` root barrel vs preferred subpath).
5. Flag **false promises**: demo fails under its own check, or green with a hollow contract.

If the repo is a **pure app** (no examples): state **Field path: internal** and do one of:
- Name the **norm for new code** that the residual implies (e.g. “no new `platform/db` in routes”), or
- Point at one **smoke** the team could add (lint/CI allowlist, PR checklist) — do not invent a full CI system.

### F. Suggestive bets (not commits yet)
For each opportunity: **impact × effort × enforceability** (can the gate hold it after?).

**Success signal (required per bet)** — observable, not vanity:
- Good: `doctor.writePath = repair`; `structrail-check` green after promote; API + UI import same pure `computeX`; 0 new routes with facade SQL; pilot cluster migrated + kill-switch decision recorded.
- Bad: “Domain has ≥ N files”; “add layer X”; “more documentation”.

**Kill-switch (required if the bet adds a layer, peerIsolation wall, or big-bang move):**
- Name a **pilot** (one cluster) and a **stop condition** (e.g. “if pilot does not reduce confusion in 2 real PRs → prefer handlers-under-domain without a new layer”).
- Prefer **forward-only + migrate-on-touch** over big-bang.

Prefer bets the user can run next (`command` / skill), not vague “improve DX”.

## Output format (keep tight)

State **Mode: recon | dual-plan seed** in the headline or first line.

1. **Headline** — product in one sentence + honesty line (mode, governed%, false-green / semantic false-green / false-promise risk). ENFORCE is context, not the story.
2. **Map** — one short table or bullet map: entry points, major dirs, shape name (or “no honest shape yet”). One screen max. Include **patterns concurrent** table when relevant (§B).
3. **What I opened** — paths + sensors that prove the pass (include field/hook/origin paths when used).
4. **Ranked table** — **only rows that change a decision**. Prefer **3–6** hard rows; drop filler.

| # | Kind | Finding | Evidence (path) | Así te lo re-soluciono | Success signal | Next skill / command |

Kinds: `risk` | `false-green` | `debt` | `opportunity` | `shape` | `manifiesto` | `agent-dx`

**Así te lo re-soluciono** must be concrete: files to touch, command to run.  
**Success signal** must be falsifiable (see §F). If proposing a new layer / wall: add kill-switch in the así-te-lo cell or a footnote.

5. **Field path summary** (scaffolds and/or internal norm).
6. **Top 3 bets** — if the user says “go”, ordered execution. First bet = highest leverage residual, even when plan is empty (agent-dx / field honesty / design-correct — not “run loop on zero steps”).
   On false-green dominant: **STOP — do not continue this skill as complete.** **STOP — false-green: invoke /structrail-adopt or /structrail-contract before claiming ENFORCE.** Do not claim goal.met / ENFORCE from type-only cleanup while doctor reports `contract-false-green-io-under-application`.
   On concentrated edge dominant: **STOP — do not continue this skill as complete.** **STOP — concentrated edge: invoke /structrail-contract with source evidence** (do not freeze a wrong contract or grind N freezes).
7. **Dual-plan seed** — **only in mode 2**; A + B with cap 3–5 B rows; no multi-week phase chart.
8. **Deterministic residue** — compact: plan steps, violations, doctor top action. Point to
   `/structrail-loop` / `/structrail-fix` **only when steps exist**; never pretend loop is the architecture story when goal is already met.

Optional when useful: **Diff vs naive sensor-only read** (one short list: what reading the tree changed).

## Done criteria

- ≥12 source files read and cited across ≥4 directories.
- Field path: scaffolds run/opened **or** pure-app internal norm stated.
- At least **3 decision-grade** rows (not “fix violation X” and not “layers are clean”).
- Coupling claims backed by fan-in / exports / importers (or clearly marked as LOC-only hint).
- Path vs design called out when concurrent patterns or semantic false-green exist.
- Every Top-3 / B bet has a **success signal**; new-layer bets have a **kill-switch**.
- Mode respected: no multi-week roadmap in recon mode; dual-plan seed capped at 3–5 B bets.
- Clear handoff: `/structrail-adopt` | `/structrail-contract` | `/structrail-autopilot` | `/structrail-loop` | `/structrail-fix` | CLI command | `stop`.
- No gate weakening; no false ENFORCE claim; no README echo as primary content.

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
