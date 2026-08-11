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

- **Gate side:** machine-readable contract + write gate + CI. Deterministic. Fail-closed.
  Green must mean something real. Two planes: **Layers** (inter) always; **ArkRules** (intra)
  opt-in.
- **Co-pilot side:** where code belongs, who talks to whom, how; dual plan **A** (edges) +
  **B** (shape); one pilot at a time; never silent judgment codemod; never weaken the contract.
- **Agent contract surface (4.3.0):** agents read **guardrail catalogs** and **scan** evidence;
  they **process** (judge / coach) outside the package. Projection and skills never become the
  pass/fail gate.
- **Improvement compass (4.4.0):** residual architecture work is named as **lenses** (SoC, DIP,
  domain alignment, …) projected from existing sensors — **never** a 0–10 score or Excellent/Good
  rank. Out-of-scope lenses (perf, app security tooling, full resilience) stay honest.
- **Vibe-coder dual depth:** human doctor and skills lead with plain outcomes and one next move;
  experts keep full JSON. Full-AI workflows get the same single door — not a skill menu exam.
- **False done is forbidden:** Enforce ≠ elegant design. `design-weak` / residual must not
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
| Ship it 🚀 your architecture is crushed! | Checked edges are clean. Residual design smells mean the tree is still design-weak. Next: `/ark-explore` shape-focus. |
| You don’t need to understand anything. | Doctor reports one status light and one primary next action. Run `ark-check --doctor`. |
| Become an architect in 60 seconds. | Install pins the contract and compact router. Full guided cleanup is `/ark-autopilot` after skills install. |

---

## Lexicon (prefer)

| Term | Use for |
|------|---------|
| **contract** | `ark.config.json` layers, rules, include — the machine-readable architecture file |
| **Layers plane** | Inter-layer edges: imports, placement, purity, isolation |
| **ArkRules** (opt-in) | Intra-layer structure sensors + domain invariant catalogs as data (`arkrules/*`) |
| **advisory ArkRules** | Default sensor mode — **not** merge teeth; does not fail CI/merge alone (FG-ARKRULES-ADVISORY-ONLY) |
| **extraMergeTeeth** | Only when enforced structure/invariant rules exist **and** classification is honest (≥50% governed, ≥1 populated layer) |
| **dual-plane residual** | Label findings **`[Layer]`** vs **`[ArkRules]`** — never blur them |
| **rulesUnderContract** | Doctor/inventory counts for ArkRules — **never a score** |
| **type-only placement debt** | `import type` edges on the violations list with `failsStrict:false` — prefer SharedTypes / owning layer; not runtime coupling |
| **gate** / **write gate** | Host boundary that blocks or advises on invalid writes |
| **edges** | Allowed import graph (plan **A** / remediation) |
| **baseline** | Frozen known debt; does not make a wrong contract honest |
| **remediation** | Fixing violations against the contract |
| **pilot** | One extraction / reshape cluster at a time |
| **shape** | Design residual after edges are clean (plan **B**) |
| **design-weak** | Edges clean under Enforce, but design smells / pattern residual remain — not “done” |
| **residual** | Work still open after a green edge check (usually Shape / plan **B**) |
| **co-pilot** | Guidance that proposes order and pilots without silent codemod |
| **fail-closed** | Incomplete analysis or unproven enforcement never looks green |
| **honest coverage** | Governed % and empty scope that cannot false-green |
| **mechanical-safe** | Deterministic auto-apply class only |
| **judgment** | Human/agent design work; never silent auto-apply as mechanical-safe |
| **doctor** | Control plane: status light + next action |
| **compact router** | Default onboarding agent instructions (not the full skill pack) |
| **hard write** | Non-bypassable PreToolUse block for listed ops (Claude/Grok when installed + trusted) |
| **advisory write** | MCP/rules coach only (Cursor/Codex at write time) — not a hard block |
| **project identity** | Stable canonical root + config identity returned by `ark_identity`; separate from contract and process identity |
| **matched binding** | Live MCP answered for the exact project root, or for a contained descendant together with the matching project id; only this binding is authoritative |
| **authoritative manifest** | Contract returned by `ark_manifest` after a matched identity handshake |
| **compatibility manifest resource** | `ark://manifest` through standard `resources/read`; always unverified/non-authoritative because the request cannot portably carry a project expectation |
| **configured on disk** | Host files name an Ark MCP command; says nothing about which process is currently running |
| **runtime observed** | A live `ark_identity` response matched this workspace; never infer it from `.codex/config.toml` or hook files |
| **required CI / status context** | Merge hard boundary when the repository makes the Ark job a **required GitHub status context** (CLI: `arkgate-check --strict-merge` / `ark-check --strict-merge`) |
| **contract ready** | Project/layers/ArkRules honesty residual clear — not the same as “hard local write” |
| **environment residual** | Permanent host/provider posture (e.g. soft-write Codex) kept in evidence without forcing global **Not finished** |
| **guardrail catalog** | Closed vocabulary of allowed sensors, capabilities, diagnostic `ruleId`s, and skill roles — agents and copy choose from the catalog; they do not invent free-form enforcement claims |
| **scan** | Deterministic engine / CLI / MCP evidence pass (layers, ArkRules sensors, status facts, prepare-write). Same inputs → same verdict. No LLM. |
| **process** (agent judgment) | Skill- or agent-side coaching: placement, dual-plan, pilot choice, remediation order. Improves prevention; **never** package pass/fail |
| **diagnostic code** / **ruleId** | Stable public violation id (e.g. `LAYER_IMPORT_VIOLATION`) with shared why/fix anchors — catalog-linked, not prose-only ([diagnostics.md](diagnostics.md)) |
| **agent projection** | Version-matched AGENTS/CLAUDE (or equivalent) block generated from package + contract; **non-authoritative** — enforcement is ark-check / hooks / CI |
| **finding ref** | Stable id for a finding across turns (ruleId + target key), so agents re-address without fuzzy message match |
| **status snapshot** | One machine-readable project/session manifest (`ark status --json` shape): identity, activation honesty, last check, residual counts, thin compass residual map — not a numeric score |
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
| Name the status light + plain fact + term + next action | “Enforce · design-weak. Checked edges are honest; design smells remain. Next: one Shape door — explore → dual-plan B → autopilot with OK.” |
| Rank one primary door under residual | Doctor **Primary next action** #1; **Also** only for secondary |
| Label expert skills as escapes | “Install skill pack only when doctor or a STOP handoff names a skill.” |
| State host write honesty | “Cursor/Codex: advisory write. Required GitHub status context is the hard merge boundary.” |
| Soft-write ≠ unfinished project | “Architecture contract ready; Codex local writes are advisory.” Keep `soft-write-host` in evidence; reserve **Not finished** for contract/project debt. |
| Keep Suggest on start → doctor | New-here primary is finish `start`, not a competing recommend/architect curriculum |
| Qualify edge-clean under design-weak | “None on checked edges … design residual remains. Not healthy finished.” |
| Prefer fail-closed over fake hard | Incomplete analysis, unobserved hooks, and soft MCP never paint as hard green |
| State project binding before verdict | “Ark MCP matched this workspace; `ark_manifest` evidence is authoritative.” Otherwise: “Ark MCP is configured, but runtime identity is unverified. Restart and call `ark_identity` with the exact project root.” |
| Keep inventory claims evidence-bound | “Possible rule candidate in the configured Application layer.” A filename or technical constant alone is not Domain evidence. |
| Honesty clear ≠ architecture healthy | `productHonesty.finished` means residual **architecture** honesty sensors are clear — not a green graph score. Open blocking violations, ADAPT/SUGGEST with debt, dual-truth pin, or design residual keep `unfinished: true`. Permanent soft-write alone does **not**. |
| Separate CI runtime from provider policy | Successful CI run ≠ required status; GitHub Free plan 403 → `unavailable-plan`, not “CI never ran.” |
| Prefer catalog language for agent DX | “Stable `ruleId` with why/fix anchors.” Not a free-form list of “things that might be wrong.” |
| Name scan before process | “Scan: two layer import violations. Process: fix the Application→Domain edge first.” |
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
| “Healthy / done” while design-weak | False done |
| “Honesty clear” as “architecture finished” | Honesty clear only means residual honesty sensors are quiet; graph/mode debt is separate |
| “Not finished” solely because host is Codex/Cursor | Soft-write is environment residual; do not paint a green whole-tree project as unfinished architecture |
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

- One contract. One gate. One co-pilot.
- Green must mean something real.
- You arrive at Enforce; you never turn it on.
- Enforce does not mean the design is elegant — only that checked edges are honest.
- Empty plan A is not “architecture healthy” when design residual remains.
- One pilot at a time. Pattern bets are never mechanical-safe.
- Doctor is the control plane: status light + next action.
- Scan is deterministic. Process is judgment. Only the gate decides pass/fail.
- Guardrails are a catalog, not free generation.
- Agent docs project the contract; they never replace the gate.

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
| **Suggest** | Thin or new tree. Contract is not yet the control plane. Next: `ark start` preview, then `--apply`; re-run doctor. |
| **Adapt** | Contract and tree still disagree, or debt is open. Write path does not fully protect you yet. Next: doctor top action #1. |
| **Enforce** | Honest coverage and clean checked edges. Keep host write path + required CI. |
| **Enforce · design-weak** | Checked edges are honest; design smells remain. Green is not elegant design. Next: one Shape door — map (`/ark-explore` shape-focus) → dual-plan B → apply B only with `/ark-autopilot` and OK. |

### Primary next action

- Lead with the **outcome**, then the **skill or command**, then the **constraint** (never mechanical-safe / never skill-shop).
- When design-weak, rank the single Shape path first; do not list explore / coverage / think as equal first choices.

### Deny / gate failure

```text
[What failed in plain terms]. [Rule or evidence id]. Next: [one fix path — /ark-fix, prepare-write, or contract edit].
```

Never: mock the user, imply the gate is optional, or suggest disabling rules to “finish.”

### Healthy finished

Print “Healthy — nothing to do” **only** when there is no design-weak residual and no open top actions.
Otherwise name the residual.

---

## Compact router model

Keep short. Three jobs only:

1. Point at **doctor** as status.
2. Day-to-day place / validate / check.
3. Point at **full skill pack install** as optional expert depth — not a skill catalog dump.

---

## Skill description model

| Skill role | Frontmatter tone |
|------------|------------------|
| `/ark-autopilot` | Guided **end-to-end** path (explore → dual plan → apply A; B with OK) |
| `/ark-explore` | Map / dual-plan **seed** only; primary post-green map half |
| Others | Specialized escape; name when **not** to use them |

Keep dual-engine rules and **STOP** handoffs. Never claim silent full-tree reshape.

---

## Checklist before shipping copy

- [ ] One next action is obvious.
- [ ] Status light is not a mode picker.
- [ ] No false done under design-weak / incomplete analysis.
- [ ] Technical terms present (contract, gate, edges, pilot) without slang.
- [ ] Expert skills are labeled expert — not the default curriculum.
- [ ] Scan vs process is not blurred with package LLM pass/fail.
- [ ] Codes, sensors, and capabilities stay inside the guardrail catalog.
- [ ] Projection / AGENTS.md never claimed as enforcement.
- [ ] Seniors would not be embarrassed to paste the line into a PR.
