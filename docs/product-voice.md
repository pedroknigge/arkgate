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
- **False done is forbidden:** Enforce ≠ elegant design. `design-weak` / residual must not
  read as “healthy finished.” Empty ArkRules inventory is not a score.

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
| **dual-plane residual** | Label findings **`[Layer]`** vs **`[ArkRules]`** — never blur them |
| **rulesUnderContract** | Doctor/inventory counts for ArkRules — **never a score** |
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
| **required CI** | Merge hard boundary when the repository makes `arkgate-check` a required status |

## Do (product copy)

| Do | Example |
|----|---------|
| Name the status light + plain fact + term + next action | “Enforce · design-weak. Checked edges are honest; design smells remain. Next: one Shape door — explore → dual-plan B → autopilot with OK.” |
| Rank one primary door under residual | Doctor **Primary next action** #1; **Also** only for secondary |
| Label expert skills as escapes | “Install skill pack only when doctor or a STOP handoff names a skill.” |
| State host write honesty | “Cursor/Codex: advisory write. Required CI is the hard merge boundary.” |
| Keep Suggest on start → doctor | New-here primary is finish `start`, not a competing recommend/architect curriculum |
| Qualify edge-clean under design-weak | “None on checked edges … design residual remains. Not healthy finished.” |
| Prefer fail-closed over fake hard | Incomplete analysis, unobserved hooks, and soft MCP never paint as hard green |

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
| “ArkRules prove business correctness” | They enforce *declared* structure/coverage evidence, not arbitrary logic |
| Blurring import edges with invariants | Always label **`[Layer]`** vs **`[ArkRules]`** |

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

## Hero phrases (forbidden)

- Become an architect in 60 seconds.
- You don’t need to understand architecture.
- We auto-fix everything safely.
- Ship it 🚀 / crush the spaghetti with vibes.

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
- [ ] Seniors would not be embarrassed to paste the line into a PR.
