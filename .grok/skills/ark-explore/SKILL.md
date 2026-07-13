---
name: ark-explore
description: Decision-grade architecture recon — sensor + tree + field path + coupling + design-correct residual. Dual-plan seed for spaghetti/pattern debt (never multi-week roadmaps). CLI is a sensor; you read the tree. No gate bypass.
arkVersion: 3.0.2
---

# /ark-explore — Recon the real project

You are a **staff engineer doing architecture reconnaissance** on *this* repository.
Ark’s CLI is a **sensor** (coverage, doctor, plan). **You** open source, entry points,
install hooks, examples/starters, and coupling evidence. Output is **decision-grade**:
ranked residual that changes the next command — **not** a celebration of ENFORCE and
**not** a paraphrase of README/ROADMAP.

## When / not when

| Use `/ark-explore` when… | Do **not** use it when… |
|--------------------------|-------------------------|
| Map / “what next?” / residual after ENFORCE | User wants edits applied → `/ark-autopilot` or `/ark-fix` |
| **Primary post-green door (Q01):** messy / spaghetti / design-weak / “clarify for AI” | Skill-shopping coverage or think for the same residual |
| Spaghetti brownfield: patterns concurrent, design-weak under green check | Only “governed% + gates installed?” numbers → `/ark-coverage` |
| Dual-plan **seed** (A remediation + B pattern bets) without applying | One design trade-off between 2–3 options already mapped → `/ark-think` |
| Path-correct vs design-correct honesty | Plain-language tour / HTML report → `/ark-explain` |

**Q01 single path:** when doctor `postGreenPath` / ENFORCE · design-weak is active, **this skill
(shape-focus / dual-plan seed) is the map half of the one door** — then `/ark-autopilot` only
to apply B with user OK. Do not send the user to coverage or think as equal first choices.

`/ark-autopilot`, `/ark-adopt`, and `/ark-coverage` embed a **lighter** version of this pass.
**You** are the full recon + pattern-planning skill.

## Related onboarding

- **Greenfield / thin tree:** `/ark-architect` or `ark-check --recommend` / `ark start`.
- **Brownfield action (write contract/baseline):** `/ark-adopt` after the map.
- **Execute dual plan:** `/ark-autopilot` (explore seeds; autopilot applies A, proposes B).
- **Default path:** `ark start` → `/ark-autopilot` → `ark-check --doctor`.

## Dual engine (mandatory)

| Engine | Role | Never confuse with |
|--------|------|--------------------|
| **Deterministic** | Contract truth: layers, rules, violations, `mechanical-safe` kinds, exit codes | Product vision or “good enough” |
| **Exploratory** | Judgment from **reading this tree**: product surface, field path, hotspots, false greens, **lived design patterns**, spaghetti residual | Only paraphrasing CLI JSON or docs |

**Incomplete:** doctor/coverage dump with no file paths you opened; or a long map that
only restates README; or a multi-week roadmap when the user only asked for a map;
or “healthy” because plan A is empty while design-weak smells remain unlisted.  
**Complete:** dry headline + field evidence + ranked bets with **así te lo re-soluciono**
(real paths, concrete next step, **success signal**) + honest handoff when residual is
*not* layer debt.

**ENFORCE / 100% governed / empty plan is baseline, not a finding.** Lead with residual
that still matters (dogfood gaps, soft starters, identity drift, **semantic false-green**,
**design-weak under ENFORCE**, coupling that blocks evolution). If residual is truly none,
say so in one line and hand off `stop`.

## Output mode (pick one — do not invent a fourth)

| Mode | When | Deliverable |
|------|------|-------------|
| **Recon (default)** | map / residual / “what next?” / bare `/ark-explore` | Headline → map → ranked table → **Top 3** → residue → Completion |
| **Dual-plan seed** | user asks for a **plan**, mejora, roadmap, “Ark + patrón”, **or** spaghetti signals fire (§G) | Same recon **plus** **§ Dual-plan seed** (A + B). **Cap 3–5 B bets.** |
| **Shape-focus** | plan A already empty / ENFORCE, user wants **pattern** depth only | Abbreviated map + **mandatory** concurrent-patterns table + B bets only (A = “goal.met / empty”) |

**Auto-upgrade:** if §G spaghetti signals fire, you **must** use dual-plan seed or shape-focus
— never end on recon-only with “layers are clean.”

**Forbidden in every mode:**
- A 6-phase / multi-week implementation roadmap as the default explore product.
- Phases with week estimates, long PR stacks, or vanity “Domain ≥ N files” as done criteria.
- Auto-applying anything (explore does not edit the contract or product code unless the user
  separately asks to execute a bet).

**Dual-plan seed shape (mode dual-plan seed | shape-focus):**

| Section | Content |
|---------|---------|
| **A. Remediation** | From `--plan` — usually empty when ENFORCE; one line if so |
| **B. Pattern / evolution** | **3–5** bets max; each: evidence · así te lo re-soluciono · **success signal** · next skill · **pilot** · **kill-switch** if new layer/big move |
| **Phase ladder** | Name which of Align / Stabilize / **Shape** the repo is in (§G) |

Long multi-PR execution belongs to **`/ark-autopilot`**. If residual spans sessions/PRs,
optionally point the user at a durable Shape plan (e.g. `docs/plans/shape-<pilot>/`) seeded
from patternBets + extraction cards — **optional**, not a gate requirement
(see `docs/brownfield-adoption.md` §6).

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

Useful split: **core product tree** | **field path** (`examples/`, starters) | **agent install surfaces** (hooks vs templates).

## Anti-wrapper rule

**Forbidden:**
- Only `ark-check --json` / `--coverage` / `--doctor` paraphrase.
- Echoing README / ROADMAP / marketing as if it were recon.
- Padding the ranked table with “architecture is clean” rows when the sensor already said that.
- Ranking debt by **LOC alone** without fan-in, exports, or call-site evidence.
- **Vanity success metrics** as bet done criteria (e.g. “Domain ≥ 20 files”) without multi-surface proof or a kill-switch.
- Multi-week roadmaps when mode is recon-only.
- Claiming “nothing to do” because plan A is empty while §G design smells remain.

**Required:**
1. Sensor: `--coverage --json`, `--doctor`, optional `--plan --json` / normal check.
2. **Product + code pass** — min **12 source files** across **≥4 directories** that matter for *this* product (apps, packages, features, domain, adapters, API routes, CLIs).
3. **Field path** when scaffolds exist (see §E); for pure apps, **internal field path** (see §E).
4. **Coupling evidence** beyond “large file” (see §C).
5. **Path-correct vs design-correct** pass (see §B) — always on brownfield or when plan is empty.
6. **§G spaghetti / design-depth** when signals fire (or always on brownfield).
7. Ranked rows that **change a decision**; each bet has a **success signal** (not a file count).
8. Hard lines: never weaken the contract; never invent mechanical-safe kinds; never claim ENFORCE from type-only cleanup while false-green doctor ids are active.

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
- **Concurrent design patterns** (short table when ≥2 styles coexist **or** when spaghetti signals fire):

| Pattern name | Example path | Quality |
|--------------|--------------|---------|
| … | `src/…` | `canonical` / `gate-green design-weak` / `legacy` |

Mark the **golden** pattern to copy. Do not only list layer file counts.

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
- **Installed hooks vs install templates:** compare project PreToolUse / write-hook commands to what `--install-agent-gates` would emit. Doctor `writePath` / adoption gaps are leads — **verify on disk**.
- MCP config present and pointing at a real binary? `prepare-write` / autoPatch surface vs hook mode.
- Baseline: real debt or hiding contract smell?
- CI: is architecture check required on the default branch path this repo actually uses?
- **Origin:** is `.ark/reports/origin.json` present? (Day-zero picture; missing → agent-dx / adopt gap, not a layer violation.)

### E. Field path (consumer promise or internal)
When `examples/`, `templates/`, gallery starters, eval fixtures, or docs claim “copy this and stay green”:
1. Open **≥2** scaffolds (prefer one minimal gallery + one “deep” / runnable demo).
2. **Run** their documented check script when cheap; record pass/fail — do not trust README alone.
3. Diff **rule strength** across archetypes (missing denies = soft false-green for consumers).
4. Note import style vs package surface docs (`arkgate` root barrel vs preferred subpath).
5. Flag **false promises**: demo fails under its own check, or green with a hollow contract.

If the repo is a **pure app** (no examples): state **Field path: internal** and do one of:
- Name the **norm for new code** that the residual implies (e.g. “no new `platform/db` in routes”), or
- Point at one **smoke** the team could add — do not invent a full CI system.

### F. Suggestive bets (not commits yet)
For each opportunity: **impact × effort × enforceability** (can the gate hold it after?).

**Success signal (required per bet)** — observable, not vanity:
- Good: `doctor.writePath = repair`; `ark-check` green after promote; API + UI import same pure `computeX`; 0 new routes with facade SQL; pilot cluster migrated + kill-switch decision recorded.
- Bad: “Domain has ≥ N files”; “add layer X”; “more documentation”.

**Kill-switch (required if the bet adds a layer, peerIsolation wall, or big-bang move):**
- Name a **pilot** (one cluster) and a **stop condition** (e.g. “if pilot does not reduce confusion in 2 real PRs → prefer handlers-under-domain without a new layer”).
- Prefer **forward-only + migrate-on-touch** over big-bang.

Prefer bets the user can run next (`command` / skill), not vague “improve DX”.

### G. Spaghetti / design-depth ladder (non-deterministic path — mandatory when signals fire)

**Signals (any one → dual-plan seed or shape-focus):**
- Plan A empty / `goal.met` **and** you still see design-weak / concurrent patterns / god modules.
- Brownfield with mixed layouts (flat services + “hex” folders + feature dumps).
- Semantic false-green (path-correct, design-wrong).
- User words: spaghetti, monstruo, legacy, “está enforce pero horrible”, pattern, refactor shape.

**Phase ladder (name exactly one current phase):**

| Phase | Goal | Done when (falsifiable) |
|-------|------|-------------------------|
| **Align** | Contract matches reality (path-correct); no false-green freeze | Governed high; false-green closed; concentrated edge fixed via contract |
| **Stabilize** | ENFORCE + honest baseline only for real debt | 0 new edges; doctor not lying about write path/CI |
| **Shape** | One **golden** pattern + pilot cluster | Pilot smells cleared; rest is migrate-on-touch; B bets have success signals |

ENFORCE without Shape progress is **`ENFORCE · design-weak`** — say that out loud. It is **not** “healthy finished.”

**Agent-detected design smells** (list any that apply; paths required — these may predate doctor IDs):

| Smell id (label) | How you detect it in source |
|------------------|-----------------------------|
| `io-under-application` | I/O clients under Application; empty Domain/Persistence (also doctor when present) |
| `handler-in-persistence` | HTTP/route bodies under repo/db globs |
| `god-module` | High fan-in + wide export surface + mixed concerns |
| `domain-logic-in-ui` | `can*` / `calculate*` / policy constants in hooks/pages |
| `mixed-pattern-cluster` | Same feature area uses ≥2 incompatible layouts |
| `soft-contract` | Layers without denies / peerIsolation off where peers leak |
| `facade-sql-in-routes` | Routes import raw ORM/SQL while “repositories exist” elsewhere |

**Extraction card** (for each I/O / god-module B bet — judgment, never mechanical-safe).
Canonical productized template also in `docs/brownfield-adoption.md` §6:

```text
### Extraction card
Pilot: <one dir or feature>
Smell: <doctor designSmells[].id when present, else agent-detected id>
Move: <verbatim I/O or rule → port/adapter or Domain file>
Do not:
  - rewrite queries / touch schema / migrations
  - weaken ark.config.json
  - auto-apply as mechanical-safe or invent new mechanical-safe kinds
  - big-bang the monorepo
Success: <observable / falsifiable>
Kill-switch: <stop condition>
Next: /ark-autopilot (apply with user ok) | /ark-fix (one cluster) | /ark-contract (globs only)
```

When doctor JSON is available, prefer smell `id`s from `designSmells` / `patternBets[].smellId`.

## Output format (keep tight)

State **Mode: recon | dual-plan seed | shape-focus** and **Phase: Align | Stabilize | Shape** in the first lines.

1. **Headline** — product one sentence + honesty (mode, governed%, false-green / semantic false-green / **ENFORCE·design-weak** / false-promise risk). ENFORCE is context, not the story.
2. **Map** — entry points, major dirs, shape name (or “no honest shape yet”). One screen. **Patterns concurrent** table when §B/§G requires it.
3. **What I opened** — paths + sensors (include field/hook/origin when used).
4. **Ranked table** — **only rows that change a decision**. Prefer **3–6** hard rows.

| # | Kind | Finding | Evidence (path) | Así te lo re-soluciono | Success signal | Next skill / command |

Kinds: `risk` | `false-green` | `debt` | `opportunity` | `shape` | `manifiesto` | `agent-dx` | `design-weak`

**Así te lo re-soluciono** must be concrete: files to touch, command to run.  
**Success signal** must be falsifiable (see §F).

5. **Field path summary**.
6. **Top 3 bets** — first bet = highest leverage residual, even when plan A is empty (design-correct / agent-dx / field honesty — **not** “run loop on zero steps”).
   On false-green dominant: **STOP — do not continue this skill as complete.** **STOP — false-green: invoke /ark-adopt or /ark-contract before claiming ENFORCE.** Do not claim goal.met / ENFORCE from type-only cleanup while doctor reports `contract-false-green-io-under-application`.
   On concentrated edge dominant: **STOP — do not continue this skill as complete.** **STOP — concentrated edge: invoke /ark-contract with source evidence** (do not freeze a wrong contract or grind N freezes).
7. **Dual-plan seed** — required in dual-plan seed / shape-focus (and when §G auto-upgrades); A + B cap 3–5; extraction cards for I/O bets.
8. **Deterministic residue** — plan steps, violations, doctor top action. Point to `/ark-loop` / `/ark-fix` **only when A steps exist**; never pretend loop is the architecture story when goal is already met.

Optional: **Diff vs naive sensor-only read** (what reading the tree changed).

## Done criteria

- ≥12 source files read and cited across ≥4 directories.
- Field path: scaffolds run/opened **or** pure-app internal norm stated.
- At least **3 decision-grade** rows (not “fix violation X” and not “layers are clean”).
- Coupling claims backed by fan-in / exports / importers (or clearly marked as LOC-only hint).
- Path vs design called out when concurrent patterns, semantic false-green, or §G signals exist.
- When §G fires: phase named, design smells listed with paths, dual-plan B or shape-focus B present.
- Every Top-3 / B bet has a **success signal**; new-layer bets have a **kill-switch** + pilot.
- Mode respected: no multi-week roadmap in recon mode; dual-plan seed capped at 3–5 B bets.
- Clear handoff: `/ark-adopt` | `/ark-contract` | `/ark-autopilot` | `/ark-loop` | `/ark-fix` | CLI | `stop`.
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
