# Deep-module coach (post-4.5 seed)

> **Plan, not implementation authority.** Code and executable schemas decide whether a claim is
> true. Work starts only when item IDs appear as `doing`/`todo` in [ROADMAP.md](../../../ROADMAP.md).
> Hub: [AGENTS.md](../../../AGENTS.md) · [Roadmap](../../../ROADMAP.md) · [Product voice](../../product-voice.md)

**Status:** Shipped in **4.5.5** (Phase DC; `DC01`–`DC04` done; published on npm `latest`)  
**Slug:** `deep-module-coach`  
**Kind:** epic seed / process + advisory product train  
**Owners:** product (Pedro) + library maintainers  
**Last updated:** 2026-08-10  
**Target package:** post-**4.5.0** (implementation only; no npm publish claim until release train)  
**Code paths:** `docs/product-voice.md`, skill bodies
(`templates/skills/` + agent-skills 1:1), compact router, doctor/HTML advisory only,
Tooling hot-path hints — **not** new gate semantics by default

---

## Why this seed exists

After 4.5.0, ArkGate is strong on **session truth** and **enforcement honesty**. The remaining
coach gap is **how agents and vibe coders talk about shape** once edges are green:

- Residual is named as compass lenses, but placement/Shape pilots lack a crisp vocabulary for
  “small surface, lots of behavior” modules and where a **testable seam** should sit.
- Dual-plan B and reshape pilots do not yet bias toward **recently changing** code (where
  restructure pays off).
- Brownfield adopt/explore do not systematically use a **consumer domain glossary** when the
  repo already has one.
- Agents still risk treating **gate green** as **feature/spec done**.

This train deepens **process + advisory** coaching. It does **not** invent architecture scores
or LLM pass/fail inside the package.

---

## Product vocabulary (use these terms)

| Term | Meaning for Ark |
|------|-----------------|
| **Module** | Anything with a surface callers depend on and an implementation behind it (function, package, slice) |
| **Interface** | Everything a caller must know: types, invariants, errors, ordering, config — not only a TypeScript `interface` keyword |
| **Depth** | Much behavior behind a small interface (deep) vs interface almost as complex as the body (shallow) |
| **Seam** | Place where behavior can be swapped or tested without editing callers |
| **Adapter** | Concrete thing that satisfies an interface at a seam |
| **Leverage** | Capability callers get per unit of interface they must learn |
| **Locality** | Change, bugs, and verification concentrate in one place |

**Deletion test (process heuristic):** if you delete the module and complexity *vanishes*, it was
mostly pass-through; if complexity *reappears* across many callers, it was earning its keep.

**Seam rule of thumb:** one adapter → seam is still hypothetical; two real adapters → seam is
justified.

Do **not** turn depth into a 0–10 score or rank band.

---

## Freeze (held unless ROADMAP item says otherwise)

| Frozen | Why |
|--------|-----|
| Numeric depth / architecture / principle **scores** | Binary gate; compass stays `notAScore` |
| New skill **names** beyond the current 13 | Deepen bodies + compact router only |
| New ArkRules **sensor vocabulary** | Needs ADR + field demand |
| New compass **lenses** without explicit epic | Closed set from 4.4.0 unless re-opened |
| LLM pass/fail or package “process verdict” | Deterministic gate only |
| AGENTS.md / skills / projection as enforcement | Non-authoritative coaching |
| Runtime productization | ADR 0004 |
| Issue tracker / task engine inside the package | Product is not a project manager |
| False hard-write claims for soft hosts | Honesty labels only |

Inherited hard lines from ROADMAP remain in force.

---

## Ordered backlog

Promote only when IDs appear as `todo`/`doing` in ROADMAP. Suggested phase prefix: **`DC`**.

| ID | Size | Priority | Outcome |
|----|-----:|----------|---------|
| `DC01` | S | P0 | Product voice + skill deepen: seam / depth / deletion-test language in explore, think, place, fix, loop (no new skill names) |
| `DC02` | M | P0 | Doctor + HTML **advisory** residual: optional hot-path hint (paths with recent churn) and deepening candidates projected only from **existing** smells/cohesion/compass evidence — never flip `valid` / strict-merge / `goal.met` |
| `DC03` | S | P1 | Adopt / explore: if the consumer repo has a domain glossary file (e.g. root `CONTEXT.md` or documented equivalent), use its terms for layer/slice naming and pilot wording — process only |
| `DC04` | S | P1 | Agent-guide + compact router: **two-axis done recipe** — (1) gate residual / compass, (2) feature or ticket acceptance — gate green ≠ work finished |

Preferred order if promoted: **DC01 → DC02 → DC03 → DC04**.

---

## Item detail

### DC01 — Voice and skill deepen

**Outcome:** Public product language and the existing 13 skill bodies teach:

- Prefer deep modules (small interface, hidden complexity)
- Name seams when proposing ports/adapters or pilots
- Apply the deletion test before extracting “just for tests”
- Align remediation next-action prose to “test at the public interface”

**Acceptance:**

- `docs/product-voice.md` lexicon entries for seam/depth/deletion-test (English product surface)
- Skills that own Shape / explore / place / fix / loop / think reference the terms without roadmap codes
- Agent-skills layout regenerated 1:1; `check:agent-skills` green
- No new skill names; no new `ruleId`s; no score language

**Non-goals:** New sensors; new compass lenses; HTML redesign.

---

### DC02 — Hot-path and deepening advisory

**Outcome:** Tooling may surface:

1. **Hot paths** — repo-relative paths with elevated recent change volume (heuristic; advisory)
2. **Deepening candidates** — cards or list items: files, friction, plain-language reshape intent,
   benefit in locality/leverage terms — **only** when existing doctor evidence already implies
   shape residual (design smells, physical cohesion, design-weak, residual compass lenses)

**Acceptance:**

- Never changes gate verdicts or completeness green
- Incomplete/missing git history → omit hot-path section (or `unavailable` style honesty), never invent
- HTML/report parity if doctor emits the section
- Package-surface documents advisory-only
- Focused tests for “no evidence → no fake candidates”

**Non-goals:** Ranking modules by a depth score; automatic multi-file reshape; reading entire
history on every doctor call without budgets.

---

### DC03 — Consumer domain glossary hook

**Outcome:** When adopting or exploring a consumer tree, skills instruct the agent to:

- Detect a domain glossary if present (documented paths; start with common root glossary names
  the product voice lists)
- Prefer those terms for layer names, slice folders, pilot names, and next-action prose
- Call out conflicts between glossary language and code reality (process judgment)

**Acceptance:**

- Documented in brownfield / explore / adopt skill bodies and develop or use lane as needed
- No enforcement from glossary content
- Missing glossary is normal (no warning spam)

---

### DC04 — Two-axis done recipe

**Outcome:** Agents and humans get one short recipe:

1. **Architecture residual** — status/doctor/compass (scan)
2. **Feature / ticket residual** — does the change match the requested behavior? (process outside
   the package)

**Acceptance:**

- Agent-guide + compact router (and optional Completion bullet) state: Enforce green ≠ feature done
- No package LLM verdict; no second scoreboard
- Aligns with existing anti false-done language (compass, design-weak)

---

## Non-goals (epic)

- Closing Z09 / RB-11
- Golden upgrade matrix / monorepo activation playbook (separate post-4.5 seeds)
- New architecture presets or policy packs
- Productizing an external skill suite or third-party brand vocabulary in public docs

---

## Promotion gate

**Promoted 2026-08-10:** Phase **DC** rows `DC01`–`DC04` are in [ROADMAP.md](../../../ROADMAP.md).
One `doing` at a time. Implementation train is **not** auto-published; release notes stay
prepared until a later publish decision.

---

## Related shipped trains

- [improvement-compass](../improvement-compass/README.md) (4.4.0) — residual lenses
- [domain-fitness-session-truth](../domain-fitness-session-truth/README.md) (4.5.0) — session honesty
- [reshape-copilot](../reshape-copilot/README.md) (3.6.0) — one pilot at a time
- [power-simple-shape](../power-simple-shape/README.md) — dual depth process
