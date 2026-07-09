---
name: ark-architect
description: Choose the application shape, adopt phase-1 layers, scaffold directories, and verify honestly — for enthusiasts before codegen. Autonomous.
---

# /ark-architect — Choose your application shape and adopt Ark

The user is building something new or early in Ark adoption. They may not know
layered architecture jargon. Your job: translate **what they want to build**
(application shape, not framework name) into an Ark preset, a phase-1 layer plan,
conventional directories, and a passing honest check — without weakening the gate.

Commands below are written as `ark-check` / `ark`; run each through the project's
package manager (`pnpm exec`, `yarn`, `npx`) — match the lockfile.

## Dual engine (mandatory)

| Engine | Role |
|--------|------|
| **Deterministic** | CLI / MCP / contract sensors — exit codes, plan kinds, coverage numbers, install status |
| **Exploratory** | You open **this** repo's real files and product surface before concluding |

The CLI is a **sensor**, never the whole job. Claiming done without the exploratory bar for this skill is **incomplete**.

## Relationship to other skills

| Skill | When |
|-------|------|
| **/ark-architect** | **Before** — greenfield or fresh config; pick shape + phase 1 |
| /ark-adopt | **After** — messy existing repo |
| /ark-contract | **During** — evolve config safely |
| /ark-place | **During** — one new file |
| /ark-explain | **After** — understand what exists |

## Steps

1. **Detect the shape** — call MCP tool **`ark_recommend`** (or run
   `ark-check --recommend --json`). Read `archetype`, `preset`, `confidence`,
   `adoptInOrder.phase1`, `analogy`, and `why`. Ask at most **two** questions only
   if `confidence < 0.5`:
   - "Will this app save data between sessions?"
   - "Is this one app or several in one repository?"

2. **Present in plain English** — name the application shape (e.g. "product with
   UI and stored data"), not the framework. One analogy. List **phase-1 layers only**.

3. **Map to Ark** — if `ark.config.json` is missing, run
   `ark init --archetype <archetype> --yes` (maps playbook id → preset + gates),
   or `ark-check --apply-policy-pack enthusiast-<preset>` for the enthusiast variant.
   Optional team record: `ark-check --recommend --write-plan` → `ark-adoption-plan.json`.
   If a config already exists, use `/ark-contract` to align it — do not regenerate
   unasked. On a messy brownfield tree: **STOP — do not continue this skill as complete.** Invoke **/ark-adopt** instead of forcing greenfield shape.

4. **Scaffold phase 1** — create conventional directories from the preset/playbook
   (`src/domain`, `src/application`, …). Add a one-line README per folder explaining
   what belongs there. Match the nearest sibling file style if code already exists.
   Flat layouts (`src/` + `lib/` + `api/` at the repo root) are common in Vite and
   serverless projects — use `/ark-contract` to map them to layers instead of forcing
   everything under `src/**/domain/**` only.

5. **Install gates** when the user uses AI coding tools and gates are missing:
   `ark-check --install-agent-gates`.

6. **Verify honestly** — run `ark-check --doctor` and `ark-check --coverage --json`.
   Report `governed.percent`. Say explicitly what is **not** governed yet
   (ungoverned directories, empty layers).

7. **Deliver to the user**
   - ASCII diagram (≤3 boxes for phase 1, inner → outer)
   - Table: "when you build X, put it in Y"
   - Three rules the agent must not break (no domain→database imports, no raw
     `publish()`, no weakening `ark.config.json` to pass)
   - Optional book refs from `books` in the recommendation JSON under "go deeper"
   - **Gallery starter** — point the user at the matching clonable example:

     | Archetype | Example directory |
     |-----------|-------------------|
     | `crud-product` | `examples/crud-product-starter/` |
     | `api-backend` | `examples/api-backend-starter/` |
     | `worker-pipeline` | `examples/worker-pipeline-starter/` |
     | `multi-app-workspace` | `examples/multi-app-workspace-starter/` |
     | `vertical-slice-product` | `examples/vertical-slice-starter/` |
     | `ddd-bounded-contexts` | `examples/ddd-context-starter/` |

     Say they can copy that folder as a baseline (`npm install && npm run check`).
     For a runnable API with break exercises, mention `examples/hexagonal-order-api/`.
     Full enthusiast track: `docs/enthusiast/README.md`.

## Operating rules

- Never weaken `ark.config.json`, the baseline, CI, or agent settings to pass.
- Never invent layers outside the 11-layer profile or named presets
  (`hexagonal`, `layered`, `feature-sliced`, `monorepo`, `ui-surface`,
  `vertical-slice`, `ddd-bounded-contexts`).
- Flag unrecognized dirs (`utils/`, `lib/`) — user must classify via `/ark-contract`.
- Default to smallest viable phase 1; unlock phase 2 only when the user describes need.
- All user-facing copy is **English**.

## Verify and report

End with `ark-check --root . --config ark.config.json --strict-config` when the
tree is ready. Report: archetype + preset, directories created, governed %, and
the next command if anything remains ungoverned.

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
