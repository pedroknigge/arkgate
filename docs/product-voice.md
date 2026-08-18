# ArkGate product voice

Canonical English for public product surfaces: README, doctor/CLI human output, compact
router, skill frontmatter, release notes, and agent-facing first-run copy.

**Who this is for:** anyone writing or reviewing user-visible ArkGate text.  
**Who this is not for:** internal ADR drafts, ROADMAP engineering notes, or pure code comments.

When this document disagrees with shipped UI strings, **fix the strings** (or update this doc
deliberately in the same change). Voice is product surface, not marketing decoration.

---

## North star

A track so simple a newcomer enters, so strict a senior trusts — and the AI ships faster
because the design space is small and honest.

- **Gate side:** architecture config (`ark.config.json`) + pre-write block where the host
  supports it + required CI. Deterministic. Don’t show green if we could not verify.
  Two planes: **import rules** (who may import whom) always; **ArkRules** (structure rules
  inside a layer) opt-in.
- **Coach side:** where code belongs, who talks to whom, how; fix imports first, then leftover
  design work; one small refactor at a time; never silent auto-reshape; never weaken the config.
- **Five-door autonomy:** invoking `/ark-adopt`, `/ark-place`, `/ark-autopilot`, `/ark-explore`,
  or `/ark-upgrade` **is** the approval. The agent writes or maps in that turn. CLI/MCP are
  sensor + gate. Silent reshape from the compact router (unasked) stays forbidden.
- **Team parliament:** the architecture file is a **constitution**. A product change must not
  amend it. Stewards own loosen and baseline-grow. The ratchet is **new vs the branch you
  merge to**, not only the file on this checkout. A small PR pays `--changed --base`, not
  the whole tree. Humans who never hit the write hook are allowed to ignore Ark.
- **Agent contract surface (4.3.0):** agents read **guardrail catalogs** and **scan** evidence;
  they **process** (judge / coach) outside the package. Projection and skills never become the
  pass/fail gate.
- **Improvement compass (4.4.0):** residual architecture work is named as **lenses** (SoC, DIP,
  domain alignment, …) projected from existing sensors — **never** a 0–10 score or Excellent/Good
  rank. Out-of-scope lenses (perf, app security tooling, full resilience) stay honest.
- **Vibe-coder dual depth:** human doctor and skills lead with plain outcomes and one next move;
  experts keep full JSON. Full-AI workflows get the same single door — not a skill menu exam.
- **False done is forbidden:** “Rules on” ≠ elegant design. Leftover design work must not
  read as “healthy finished.” Empty ArkRules inventory is not a score. MCP configuration on
  disk is not proof that the current process belongs to this project.

---

## Sentence template

Prefer three beats when a line teaches:

```text
[plain fact]. [precise term + implication]. [one next action].
```

Examples:

| Bad | Good |
|-----|------|
| Ship it 🚀 your architecture is crushed! | Import rules check out. Leftover design smells mean the tree is still messy. Next: `/ark-explore` shape-focus. |
| You don’t need to understand anything. | Doctor reports one status light and one primary next action. Run `ark-check --doctor`. |
| Become an architect in 60 seconds. | Install pins `ark.config.json` and a short agent router. Full guided cleanup is `/ark-autopilot` after skills install. |

---

## Lexicon (prefer) — 4.6 common words

**Brands (keep):** **ArkGate** (product / npm `arkgate`) and **ArkRules** (opt-in structure rules
inside a layer). Gloss on first mention; do not rebrand.

Human copy prefers the **common** column. JSON field names (`designWeak`, `ruleId`, MCP tools)
stay stable unless a change explicitly adds an alias.

| Prefer (human) | Was / JSON | Use for |
|----------------|------------|---------|
| **architecture config** | contract | `ark.config.json` layers, rules, include |
| **import rules** / **allowed dependencies** | Layers plane / edges | Who may import whom; placement, purity, isolation |
| **ArkRules** (opt-in; gloss: structure rules inside a layer) | ArkRules | Intra-layer sensors + domain invariant catalogs (`arkrules/*`) |
| **advisory ArkRules** | advisory ArkRules | Default sensor mode — **not** merge teeth; does not fail CI/merge alone |
| **extra merge checks** | extraMergeTeeth | Only when enforced structure/invariant rules exist **and** classification is honest |
| **label `[Layer]` vs `[ArkRules]`** | dual-plane residual | Never blur import-rule findings with ArkRules findings |
| **ArkRules counts** | rulesUnderContract | Doctor/inventory counts — **never a score** |
| **type-only import debt** | type-only placement debt | `import type` on the violations list with `failsStrict:false` |
| **pre-write block** | hard write | Host actually blocks listed edit ops (installed + trusted) |
| **warning only (not blocked)** | advisory write | MCP/rules coach; not a hard block |
| **import graph** | edges | Allowed imports (fix these first) |
| **baseline** | baseline | Frozen known debt; does not make a wrong config honest |
| **fix** | remediation | Fixing violations against the config |
| **one small refactor** | pilot | One extraction / reshape cluster at a time |
| **shape / leftover design work** | **design-weak** / residual | Imports clean under Enforce, but design smells remain — not “done” |
| **coach** | co-pilot | Guidance that proposes order without silent auto-reshape |
| **don’t show green if unverified** | fail-closed | Incomplete analysis or unproven enforcement never looks green |
| **honest coverage** | honest coverage | Governed % and empty scope that cannot false-green |
| **safe to auto-apply** | mechanical-safe | Deterministic auto-apply class only |
| **your judgment** | judgment | Human/agent design work; invoke of an apply door is the approval — not silent compact-router reshape |
| **five doors** | skill menu of 13 | adopt · place · autopilot · explore · upgrade — other names are shortcuts |
| **law / constitution** | contract + baseline + ArkRules files | `ark.config.json`, `arkrules/*`, `.ark-baseline.json` — a different change type than product |
| **steward** | contract owner | GitHub handle or email in `stewards`; only they may loosen the law or grow the baseline |
| **several hands** | multi-author / CODEOWNERS | Doctor asks for stewards or shows list drift; adopt proposes handles or emails, never invents names |
| **contract session** | `--contract-session` | Explicit “this diff is a law change”; still never mixed with product files |
| **vs the base branch** | `--against` / `--changed --base` / `status --vs` | Ratchet and honesty against the ref you merge to |
| **doctor** | doctor | Status light + next action |
| **short agent router** | compact router | Default onboarding agent instructions (not the full skill pack) |
| **right project?** | matched binding / project identity | Live MCP answered for this exact project root (+ id). `ark_identity` |
| **authoritative config read** | authoritative manifest | `ark_manifest` after a matched identity handshake |
| **compatibility manifest** | `ark://manifest` | Always unverified — request cannot carry a project expectation |
| **configured on disk** | configured on disk | Host files name an Ark MCP command; not proof of the live process |
| **runtime observed** | runtime observed | A live `ark_identity` matched this workspace |
| **required CI status** | required CI / status context | Merge hard boundary: required GitHub status running `arkgate-check --strict-merge` |
| **config ready** | contract ready | Project/import-rules/ArkRules honesty clear — not the same as a local pre-write block |
| **host limitation** | environment residual | Soft-write or uncovered host path (e.g. OpenCode, hosted/specialized tools) — do not paint the whole project unfinished |
| **allowed rule ids** | guardrail catalog | Closed vocabulary of sensors, capabilities, `ruleId`s, skill roles |
| **check (tool)** | scan | Deterministic engine / CLI / MCP. Same inputs → same verdict. No LLM. |
| **coaching / your judgment** | process | Skill- or agent-side. **Never** package pass/fail |
| **diagnostic code** / **ruleId** | ruleId | Stable public violation id — catalog-linked ([diagnostics.md](diagnostics.md)) |
| **agent summary** | agent projection | Version-matched AGENTS/CLAUDE block; **non-authoritative** |
| **finding id** | finding ref | Stable id (ruleId + target key) across turns |
| **status snapshot** | status snapshot | `ark status --json`: identity, activation, last check, leftover counts — not a score |
| **shared agent skills (home)** | Codex/Claude/Grok home catalog | Machine floor: always latest additive; never downgrade |
| **session recipe** | Agent loop: bind identity → read status → act on residual / findingRef; run doctor when status compass mode is not `full` |
| **compass mode** | Status honesty label for the projected residual map: `full` \| `subset` \| `unavailable` — never invent green residual |
| **improvement compass** | Closed projection of residual architecture work across fixed **lenses** (aligned to 15 common principles). Always `notAScore`. Never a gate input. |
| **lens** | One named principle dimension (`soc`, `dip`, `domain`, …) with status `ok` / `residual` / `not-instrumented` / `out-of-scope` and evidence refs from existing sensors |
| **topResidual** | Deterministic short list of residual lens ids — what to improve next, not a ranking score |
| **out-of-scope lens** | Principle Ark does not instrument (e.g. scalability APM, SAST) — say so; do not invent residual |
| **AI-easy architecture** | Small, pure, placeable modules and a golden pattern so the next agent turn stays ordered under the contract |
| **self-service upgrade honesty** | After managed upgrade, consumers can see write-path activation labels and customized-content preserve without asking a maintainer |
| **module** | Anything with a surface callers depend on and an implementation behind it (function, package, slice) — not only a TypeScript `module` keyword |
| **interface** (product sense) | Everything a caller must know: types, invariants, errors, ordering, config — not only a TypeScript `interface` keyword |
| **depth** / **deep module** | Much behavior behind a **small interface** (deep) vs interface almost as complex as the body (shallow). Prefer deep modules. **Never** a 0–10 depth score |
| **seam** | Place where behavior can be swapped or tested without editing callers (port boundary). Name seams when proposing ports/adapters or Shape pilots |
| **adapter** | Concrete thing that satisfies an interface at a seam |
| **leverage** | Capability callers get per unit of interface they must learn |
| **locality** | Change, bugs, and verification concentrate in one place |
| **deletion test** | Process heuristic before extracting “just for tests”: if you delete the module and complexity *vanishes*, it was mostly pass-through; if complexity *reappears* across many callers, it was earning its keep. One adapter → seam still hypothetical; two real adapters → seam justified |
| **test at the public interface** | Prefer verifying behavior through the seam’s public surface, not through private pass-through layers or extraction-for-test-only modules |
| **hot path** (advisory) | Repo-relative path with elevated **recent change volume** (heuristic from git history when available). Advisory residual only — never a gate input; omit or mark unavailable when history is missing |
| **deepening candidate** (advisory) | Shape residual card projected only from **existing** smells / cohesion / compass evidence — locality/leverage intent; never invents candidates without evidence; never flips the verdict |
| **domain glossary** | Optional consumer file of product terms (common roots: `CONTEXT.md`, `docs/glossary.md`, `docs/domain.md`, `docs/ubiquitous-language.md`). Prefer terms for layer/slice/pilot naming when present. Missing glossary is normal — no warning spam; never enforces |
| **two-axis done** | (1) architecture residual via status/doctor/compass (scan); (2) feature/ticket residual outside the package (process). **Enforce green ≠ feature done** |

## Public docs are product-only (from 4.4.0)

Consumer-facing prose (README, use/develop/agent-guide, skills, compact router, doctor/CLI human
lines, CHANGELOG user bullets, release notes bodies) explains **what ArkGate does and how to use
it**. It does **not** explain features by roadmap item codes, phase numbers, or internal queue
jargon (`IC02`, `ACS08`, `Z09`, `RB-11`, “Phase X shipped…”).

| Put here | Not here (for consumers) |
|----------|---------------------------|
| Commands, lenses, gates, skills, honest limits | Roadmap ids as the story |
| Stable API names (`ruleId`, JSON fields) | Ticket dumps in CHANGELOG |
| `ROADMAP.md` / `docs/plans/` / archive (maintainers) | Required reading of epic codes to use the product |

Historical maintainer files may keep engineering ids. **Do not regress** public lanes with new
id-heavy narrative after 4.4.0.

## Scan vs process (dual depth)

Borrow the harness *shape* (scan facts, then process with judgment) without shipping an LLM
verdict in core:

```text
scan  →  deterministic contract graph + host activation evidence
process → skills / human / host agent choose pilots and wording
gate  →  same binary verdict on every parity-capable adapter
```

| Surface | Language to use | Language to avoid |
|---------|-----------------|-------------------|
| CLI / MCP / CI | “Scan found…”, “Checked edges…”, “Verdict: pass/fail/incomplete” | “The model decided…”, “AI validated architecture” |
| Skills / doctor coach | “Process next: one pilot…”, “Judgment: Shape door…” | “Process mode enforces…”, “Skill pass/fail” |
| Catalog / codes | “ruleId from the diagnostic catalog”, “closed capability set” | Open-ended “any rule string”, free-generated sensors |
| Projection / AGENTS.md | “Agent-facing summary; not the gate” | “Follow AGENTS.md to pass CI” |

## Do (product copy)

| Do | Example |
|----|---------|
| Name the status light + plain fact + next action | “Enforce · leftover design work. Import rules check out; design smells remain. Next: one Shape door — explore → plan B → autopilot with OK.” |
| Rank one primary door under residual | Doctor **Primary next action** #1; **Also** only for secondary |
| Label expert skills as escapes | “Install skill pack only when doctor or a STOP handoff names a skill.” |
| State host write honesty | “Cursor blocks trusted Write/StrReplace. Codex blocks complete trusted local `apply_patch` after runtime observation. Required GitHub status covers every path.” |
| Soft/unverified write ≠ unfinished project | “Architecture config ready; this host operation is advisory or unverified.” Keep environment residual in evidence; reserve **Not finished** for config/project debt. |
| Keep Suggest on start → doctor | New-here primary is finish `start`, not a competing recommend/architect curriculum |
| Qualify import-clean under leftover design | “None on checked imports … leftover design work remains. Not healthy finished.” |
| Prefer unverified-as-not-green | Incomplete analysis, unobserved hooks, and soft MCP never paint as a hard green pre-write block |
| State project binding before verdict | “Ark MCP matched this workspace; `ark_manifest` evidence is for this project.” Otherwise: “Ark MCP is configured, but we have not proven this is the right project. Restart and call `ark_identity` with the exact project root.” |
| Keep inventory claims evidence-bound | “Possible rule candidate in the configured Application layer.” A filename or technical constant alone is not Domain evidence. |
| Honesty clear ≠ architecture healthy | `productHonesty.finished` means residual **architecture** honesty sensors are clear — not a green graph score. Open blocking violations, ADAPT/SUGGEST with debt, dual-truth pin, or design residual keep `unfinished: true`. Permanent soft-write alone does **not**. |
| Separate CI runtime from provider policy | Successful CI run ≠ required status; GitHub Free plan 403 → `unavailable-plan`, not “CI never ran.” |
| Prefer catalog language for agent DX | “Stable `ruleId` with why/fix anchors.” Not a free-form list of “things that might be wrong.” |
| Name the check before coaching | “Check: two layer import violations. Next: fix the Application→Domain import first.” |
| Label projection non-enforcing | “Regenerated agent contract for this package version. Enforcement remains ark-check / hooks / required CI.” |
| Keep status counts honest | “Inventory and residual counts are evidence — not a health score.” |
| Prefer deep modules | “Small interface, hide the complexity. Name the seam; test at the public interface.” |
| Apply the deletion test | “If deleting this extract would vanish the complexity, skip the pass-through; if callers re-absorb it, keep the module.” |
| Two-axis done | “Edges green and residual lenses quiet is architecture residual; ticket acceptance is a separate axis — Enforce green ≠ feature done.” |
| Glossary when present | “Prefer `CONTEXT.md` / product glossary terms for pilot and layer names; missing glossary is fine.” |

## Avoid

| Avoid | Why |
|-------|-----|
| vibes, “crush it,” emoji rain | Cheap; seniors dismiss it |
| “eh amigo,” fake familiarity | Condescension |
| “you don’t need to understand anything” | Lies about the product |
| “auto-refactor your whole app” / magic codemod claims | We never silent-apply plan B |
| “modes you pick” for Suggest/Adapt/Enforce | Those are **status lights**, not settings |
| Skill-shopping lists as the default curriculum | Progressive disclosure: one door first |
| “Healthy / done” while leftover design work remains | False done |
| “Honesty clear” as “architecture finished” | Honesty clear only means residual honesty sensors are quiet; graph/mode debt is separate |
| “Not finished” solely because a host hook is unverified or one host path is advisory | Environment residual is not architecture debt; do not paint a green whole-tree project as unfinished architecture |
| “MCP installed / active” because a config file exists | Say **configured on disk · runtime unverified** until `ark_identity` matches the expected root |
| Treating an unverified legacy MCP call as authoritative | Compatibility is not proof; require `binding.status: "matched"` and `authoritative: true` |
| “Handler means controller” / “every constant is a business rule” | ArkRules inventory uses configured layer context and suppresses narrow technical/test evidence; candidates remain prompts for judgment |
| Conflating CLI name with required status | `ark-check` is the command; the hard boundary is the GitHub required **status context** |
| “ArkRules prove business correctness” | They enforce *declared* structure/coverage evidence, not arbitrary logic or full semantic proof |
| “Structure enforced = Domain extraction done” | Structure sensors are **heuristics**; extraction is judgment (`/ark-fix` / pilot) |
| “Covered invariant = E2E business tests” | Coverage = symbol/test evidence for a named policy, not a runtime test runner |
| “Max arkRules packs = merge fails structure” | **Advisory ArkRules ≠ merge teeth.** Only `mode: "enforced"` can add teeth, and only after honest classification (FG-ARKRULES-ADVISORY-ONLY) |
| “Type-only volume means the gate is broken” | High type-only count is placement debt (behavior OK); group under plan A type-only, offer SharedTypes starter |
| Blurring import edges with invariants | Always label **`[Layer]`** vs **`[ArkRules]`** |
| “Ark uses AI to decide pass/fail” / package “process verdict” | Package is zero-LLM; process is agent-side judgment only |
| Inventing new skill **names** or preset packs as product copy filler | 4.3.0 freeze: deepen + package the 13; no new names/presets without ROADMAP promotion |
| Treating AGENTS.md / projection / skills as the write gate | Advisory surface; hard path is hooks / MCP prepare / required CI |
| Free-generated sensor or rule ids outside the catalog | Guardrail catalog is closed; unknown codes are a bug, not creativity |
| Numeric “architecture health” or trust score in status JSON | Counts and residuals yes; scored trust no |
| Depth score / “deepness rank” / Excellent module bands | Depth is vocabulary for process judgment, not a score surface |
| Extract “just for tests” without a deletion test | Pass-through modules add interface without locality or leverage |
| Treat hot paths or deepening candidates as gate failures | Advisory residual only; missing git never invents hot paths |
| Claim feature done solely because Enforce is green | Two-axis done: architecture residual and ticket residual are separate |

---

## Progressive disclosure (product rule)

1. **One primary path** — newcomer does not skill-shop among thirteen `/ark-*` skills.
2. **Doctor is the control plane** — one status light, one next action (human-grade + technical).
3. **Compact router / default install first** — full skill pack is **expert depth**, not onboarding UI.
4. **Post-green shape** is a first-class single door when edges are clean but residual remains.
5. **Day-to-day** — place + gate protect; guided organize via `/ark-autopilot` when needed.

```text
npx arkgate start → start --apply → ark-check --doctor
                 → (optional) install skill pack → /ark-autopilot
```

Skills table in docs = **escapes / expert**, not a second onboarding track.

---

## Hero phrases (approved)

- One architecture config. One check. One coach.
- Green must mean something real.
- You arrive at Enforce; you never turn it on.
- Enforce does not mean the design is elegant — only that checked imports are honest.
- A clean import check is not “architecture healthy” when leftover design work remains.
- One small refactor at a time. Pattern bets are never auto-applied.
- Doctor is the control plane: status light + next action.
- The check is deterministic. Coaching is judgment. Only the gate decides pass/fail.
- Guardrails are a catalog, not free generation.
- Agent docs summarize the config; they never replace the gate.
- **ArkGate** and **ArkRules** are product names — gloss them; don’t invent a second brand.

## Hero phrases (forbidden)

- Become an architect in 60 seconds.
- You don’t need to understand architecture.
- We auto-fix everything safely.
- Ship it 🚀 / crush the spaghetti with vibes.
- The AI validated your architecture / model pass/fail.
- Follow AGENTS.md to pass the architecture gate.

---

## Doctor / deny microcopy models

### Status light (operating mode)

Each model line follows the sentence template: **plain fact · term · next action**.

| Light | Model line |
|-------|------------|
| **Suggest** | Thin or new tree. Architecture config is not yet in charge. Next: `ark start` preview, then `--apply`; re-run doctor. |
| **Adapt** | Config and tree still disagree, or debt is open. The write path does not fully protect you yet. Next: doctor top action #1. |
| **Enforce** | Honest coverage and clean checked imports. Keep the host write path + required CI. |
| **Enforce · leftover design work** | Import rules check out; design smells remain. Green is not elegant design. Next: map (`/ark-explore` shape-focus) then apply one small refactor with `/ark-autopilot` (invoke = apply). |

### Primary next action

- Lead with the **outcome**, then the **skill or command**, then the **constraint** (never mechanical-safe / never skill-shop).
- When leftover design work remains, rank the single Shape path first; do not list explore / coverage / think as equal first choices.

### Deny / gate failure

```text
[What failed in plain terms]. [Rule or evidence id]. Next: [one fix path — /ark-autopilot, /ark-place, or /ark-adopt].
```

Never: mock the user, imply the gate is optional, or suggest disabling rules to “finish.”
Never: tell an agent to edit `ark.config.json` to clear a product-PR red. That is a **contract
session** for a steward — split the PR.

```text
This change mixes the constitution with product files. Next: split the PR, or run a steward
--contract-session that touches only ark.config / arkrules / .ark-baseline.json.
```

### Healthy finished

Print “Healthy — nothing to do” **only** when there is no leftover design work and no open top actions.
Otherwise name the leftover work.

---

## Compact router model

Keep short. Five doors only:

1. Point at **doctor** as status.
2. Session 0: **`/ark-adopt`**. Day-to-day new files: **`/ark-place`**.
3. Apply / leftover design: **`/ark-explore`** then **`/ark-autopilot`** (invoke = apply one refactor).
4. Bump: **`/ark-upgrade`**.
5. Full skill pack is optional expert depth — not a 13-name exam.

---

## Skill description model

| Skill role | Frontmatter tone |
|------------|------------------|
| `/ark-adopt` | Session 0 — write the path (greenfield + brownfield) |
| `/ark-place` | New feature — place **and write** |
| `/ark-autopilot` | Apply A + one Shape refactor; invoke = approval |
| `/ark-explore` | Map / dual-plan **seed** only |
| `/ark-upgrade` | Preview then apply in-turn |
| Others | Shortcut to a door above |

Autonomy contract on every door. Never claim silent full-tree reshape from the compact router.

---

## Autonomy contract (skills)

Invoking a five-door skill **is** the approval. Write or map in the same turn.

**CLI budget:** identity only if using MCP; one doctor / recommend / upgrade preview; then work;
then check. Forbidden as the deliverable: dumping `--plan` JSON, “approve?”, or
`STOP — invoke /ark-X` for work that door absorbs.

**Still never:** weaken the architecture config; invent `mechanical-safe` kinds; claim finished
while leftover design work remains; batch every Shape bet in one turn.

---

## Checklist before shipping copy

- [ ] One next action is obvious.
- [ ] Status light is not a mode picker.
- [ ] No false done under design-weak / incomplete analysis.
- [ ] Technical terms present (architecture config, import rules, ArkGate, ArkRules) without slang.
- [ ] Leftover design work is never called “done”.
- [ ] Expert skills are labeled expert — not the default curriculum.
- [ ] Scan vs process is not blurred with package LLM pass/fail.
- [ ] Codes, sensors, and capabilities stay inside the guardrail catalog.
- [ ] Projection / AGENTS.md never claimed as enforcement.
- [ ] Seniors would not be embarrassed to paste the line into a PR.
