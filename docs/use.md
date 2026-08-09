# Use ArkGate

For **anyone** shipping TypeScript with an AI coding agent. You do not need to study clean architecture first.

**One contract. One gate. One co-pilot.**

---

## In one minute

```bash
npm install -D arkgate typescript
npx arkgate start                 # preview what will change
npx arkgate start --apply         # install compact contract + host router + CI plan
npx arkgate-check --doctor        # where am I? one status light, one next action
```

Then keep working with your agent. The doctor is the **control plane**: when stuck, run doctor and do action **#1**.

| Stuck on… | Do this |
|-----------|---------|
| Unsure | `npx arkgate-check --doctor` |
| Agent broke architecture | Fix the edge doctor names (or re-run check) |
| Code is green but still a mess | Shape residual — see below |
| New ArkGate version | Follow doctor / upgrade guidance |

Full skill pack is **optional** (expert depth). Day-to-day: compact router + doctor is enough.

---

## When not to adopt

Skip ArkGate (or treat it as overkill) when:

- The project has **no AI coding agents** and **no multi-layer integration boundaries** worth pinning.
- It is a **single-developer hobby CRUD** with no pressure to keep layers honest over time.
- The team will **not** maintain `ark.config.json` layers or make `arkgate-check --strict-merge` a
  **required** GitHub status context — without that, local advisory write stays avoidable.

In those cases a boundary linter or editor rules may be enough; see [README — Why not only ESLint / Nx / cruiser?](../README.md#why-not-only-eslint--nx--cruiser). When you *do* adopt, day-to-day honesty is still: advisory write on soft hosts → required merge status. Surface that with `npx arkgate-check --doctor` or `npx arkgate status --json` ([agent guide — Write-path honesty](agent-guide.md#write-path-honesty)).

---

## What you get

| When | What happens |
|------|----------------|
| While the AI writes | Host write gate or advisory MCP (depends on host) |
| Before merge | Make the Ark job a **required GitHub status context** running `arkgate-check --strict-merge` (alias `ark-check`) |
| Anytime | Doctor: Suggest / Adapt / Enforce (+ design-weak if residual) |

**Codex / Cursor / OpenCode:** local write stays advisory forever — that is not unfinished architecture. Doctor may say **contract ready** while still reminding you that local writes are advisory; **Not finished** is reserved for real project/contract debt.

ArkGate is **not** a web framework, ORM, or app runtime. It is architecture enforcement + co-pilot for AI TypeScript.

### Two planes (you choose)

| Plane | Plain English | Config | Enforces |
|-------|---------------|--------|----------|
| **Layers** | Who may talk to whom | `layers[]` + `rules[]` | Import direction, purity, forbidden globals, capabilities, peer isolation |
| **ArkRules** (optional) | Habits *inside* a layer + named policies | `arkRules` + `arkrules/<Layer>.json` | Structure **heuristics** (module shape); invariant **catalog + coverage evidence** (not full business proof) |

Start always gives you **layers**. ArkRules templates may ship with start/init; they begin **advisory** until you promote them. Doctor / HTML show `rulesUnderContract` (catalog, **not a score**). No `arkRules` map is fine — only Layers run.

**Do not confuse:** green Layers ≠ perfect design (Shape residual can remain). Covered invariants ≠ “the business always does the right thing” — they mean the named policy is declared and has symbol/test evidence.

### New modules vs config edits

**Happy path:** put a new module under an existing layer directory/glob (`layers[].patterns`). Usually
**no** `ark.config.json` edit — the file classifies and the existing rules apply.

**Touch the contract only when** you invent a new boundary (new layer or allow/deny edge), leave an
ungoverned path under `include`, or need a capability / forbidden-global exception. Optional ArkRules
`appliesTo` globs narrow invariants inside a layer; empty `appliesTo: []` fails closed. Full field
list: [configuration.md](configuration.md).

---

## Status lights (not settings)

| Light | Means | Your move |
|-------|--------|-----------|
| **Suggest** | New or thin project | Finish `start`, re-run doctor |
| **Adapt** | Not fully protected yet | Doctor action #1 until clean |
| **Enforce** | Edges honest under the contract | Keep write path + CI |
| **Enforce · design-weak** | Edges clean; design still messy | Shape door — not “done” |

**Green edges ≠ elegant design.** Empty remediation plan is not “architecture finished” if design residual remains.

---

## When the gate is green but the code is still messy

That is **Shape** work (plan B) — suggested, never auto-applied as silent magic.

1. Doctor confirms design-weak (and residual lenses on the improvement compass)  
2. Guided map / dual plan (skill pack: `/ark-explore` then `/ark-autopilot` with your OK)  
3. One pilot at a time · re-run doctor  

Install skills only when you want that guided path:

```bash
npx arkgate-check --install-agent-gates --skills-only --force
```

---

## Improvement compass (not a score)

Doctor shows an **improvement compass**: a closed set of architecture **lenses** (separation of
concerns, dependency inversion, domain alignment, …) projected from existing sensors.

```text
Improvement compass (not a score)
  Residual: Separation of concerns · Dependency inversion · Domain alignment
  Out of scope (honest): Scalability · App security tooling · Full resilience patterns
  Next: /ark-explore — one pilot at a time after map
```

| Fact | Meaning |
|------|---------|
| Always `notAScore` | No 0–10, no Excellent/Good ranks, no averages |
| Residual lenses | What still matters for cleaner, AI-easy code |
| Out of scope | Performance/APM, SAST, full resilience — use other tools |
| Never a gate input | Residual alone does **not** fail CI or flip `valid` |

JSON: `ark-check --doctor --json` → `doctor.improvementCompass` (full lenses + `topResidual`).  
Human doctor prints the short section above.

### Align → Stabilize → Shape

| Phase | Goal | Done when (plain English) |
|-------|------|---------------------------|
| **Align** | Contract matches the tree | Include/layers honest; no false-green freeze |
| **Stabilize** | Edges under Enforce | Real debt only in baseline; write path + CI honest |
| **Shape** | One golden pattern + pilots | Residual lenses shrink pilot by pilot — never silent multi-pilot |

Green edges under **Enforce · design-weak** mean Align/Stabilize may be fine while Shape remains open.
Empty plan A is **not** “architecture finished.”

---

## Tutorials and demos

- Plain-language track: [enthusiast/](enthusiast/README.md)  
- First project tutorial: [enthusiast/tutorial-first-project.md](enthusiast/tutorial-first-project.md)  
- Demos: [demos/](demos/)  

---

## Next depth

| Need | Doc |
|------|-----|
| Hosts, CI, MCP, brownfield, power CLI | [develop.md](develop.md) |
| Agent/CLI/MCP reference (status, skills, compass JSON) | [agent-guide.md](agent-guide.md) |
| Wire a specific agent host | [ai-gates.md](ai-gates.md) |
| Improve the library | [CONTRIBUTING.md](../CONTRIBUTING.md) |

← [All docs](README.md)
