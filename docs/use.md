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

## What you get

| When | What happens |
|------|----------------|
| While the AI writes | Host write gate or advisory MCP (depends on host) |
| Before merge | `arkgate-check` — make it a **required** CI status |
| Anytime | Doctor: Suggest / Adapt / Enforce (+ design-weak if residual) |

ArkGate is **not** a web framework, ORM, or app runtime. It is architecture enforcement + co-pilot for AI TypeScript.

### Two planes (you choose)

| Plane | Plain English | Config | Enforces |
|-------|---------------|--------|----------|
| **Layers** | Who may talk to whom | `layers[]` + `rules[]` | Import direction, purity, forbidden globals, capabilities, peer isolation |
| **ArkRules** (optional) | Habits *inside* a layer + named policies | `arkRules` + `arkrules/<Layer>.json` | Structure **heuristics** (module shape); invariant **catalog + coverage evidence** (not full business proof) |

Start always gives you **layers**. ArkRules templates may ship with start/init; they begin **advisory** until you promote them. Doctor / HTML show `rulesUnderContract` (catalog, **not a score**). No `arkRules` map is fine — only Layers run.

**Do not confuse:** green Layers ≠ perfect design (Shape residual can remain). Covered invariants ≠ “the business always does the right thing” — they mean the named policy is declared and has symbol/test evidence.

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

1. Doctor confirms design-weak  
2. Guided map / dual plan (skill pack: `/ark-explore` then `/ark-autopilot` with your OK)  
3. One pilot at a time · re-run doctor  

Install skills only when you want that guided path:

```bash
npx arkgate-check --install-agent-gates --skills-only --force
```

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
| Wire a specific agent host | [ai-gates.md](ai-gates.md) |
| Improve the library | [CONTRIBUTING.md](../CONTRIBUTING.md) |

← [All docs](README.md)
