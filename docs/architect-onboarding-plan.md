# Ark Architect Onboarding — Implementation plan

This document is the implementation plan for **enthusiast-first architecture guidance**:
helping people who are not professional developers choose and adopt a sound structure
before (and while) they use AI agents to write code.

It complements the public [ROADMAP](../ROADMAP.md). All structural suggestions still trace
to Ark's canonical 11-layer profile and named presets — never ad-hoc layer invention.

---

## Problem statement

Ark today excels as a **guardian** once a contract exists:

- `/ark-explain` teaches *this* project's rules.
- `/ark-place` places a concrete artifact inside the contract.
- `/ark-adopt` organizes a messy *existing* repo.

The gap for new users — especially enthusiasts using Cursor or Claude — is **upstream**:

> "I want to build X. What shape should my project have, which folders matter first,
> and why?"

They do not know hexagonal vs layered, what a port is, or which preset to pick. Ark
should answer that in plain language and output a **progressive adoption plan** mapped
to presets and layers Ark already owns.

---

## Product goals

| Goal | Metric |
|------|--------|
| Time to first honest green check (greenfield) | < 5 minutes with guided flow |
| Users who adopt a preset without hand-editing rules | > 80% |
| `governed.percent` after enthusiast onboarding | > 60% on new projects |
| Eval: enthusiast prompt → architectural fix (not `CHEATED`) | > 70% `PASS` |
| Reduction in "what is domain?" support burden | measurable via docs traffic / issues |

---

## Design principles (additions to public principles)

1. **Archetypes describe application shape, not vendors.** "CRUD product with persistence"
   is an archetype; "Next.js + Prisma" is only a *detection signal*.
2. **The playbook is curated and versioned.** `templates/architecture-playbook.json` is
   authoritative; LLMs narrate it, they do not invent taxonomy.
3. **Progressive adoption by default.** Phase 1 is 2–4 layers; advanced layers unlock
   when the user describes the need (payments, email, sagas, jobs).
4. **Analogies before jargon.** Every layer gets a one-line plain definition; book
   references are optional depth, not prerequisites.
5. **Honesty over green applies to onboarding too.** If the repo is empty, say the check
   passes because nothing exists yet — not because architecture is "done".
6. **English-only user copy.** All playbook strings, `--recommend` output, wizard prompts,
   and `/ark-architect` skill narration ship in English. Translations are a later, explicit
   opt-in — never mixed into the canonical JSON or CLI defaults.

---

## Architecture archetypes (tool-agnostic)

Each archetype maps to:

- one **Ark preset** (`hexagonal`, `layered`, `feature-sliced`, `monorepo`),
- **phase-1 layers** from the 11-layer profile,
- **phase-2/3 layers** unlocked by described capabilities,
- a **plain-language analogy**,
- optional **book references** (depth only),
- **anti-patterns** Ark will later block.

Tool-specific packages (Next, Nest, Prisma, Supabase, etc.) appear only under
`detectionSignals` — they influence confidence scoring, not the archetype identity.

### Archetype catalog

| ID | Application shape | When it fits | Preset | Phase 1 layers |
|----|-------------------|--------------|--------|----------------|
| `crud-product` | User-facing product with UI, business rules, and stored data | Todo app, booking site, admin panel, SaaS MVP | `hexagonal` | DomainModel, ApplicationOrchestration, PresentationAdapters, PersistenceAdapters |
| `api-backend` | Server that exposes an API; no UI in this repo | REST/GraphQL/tRPC service, BFF, webhook receiver | `hexagonal` | DomainModel, ApplicationOrchestration, PresentationAdapters, PersistenceAdapters |
| `frontend-surface` | UI-heavy repo; backend lives elsewhere or is thin | SPA, SSR app calling external API, static site with forms | `layered` or `feature-sliced` | Presentation (or App/Pages/Features), Shared/Entities as needed |
| `library-sdk` | Code others import; not a deployable app | npm package, shared types, client SDK | `layered` | DomainModel (if domain types), ApplicationOrchestration (public API surface), minimal adapters |
| `cli-utility` | Command-line tool | Scripts, CLIs, codegen tools | `layered` | ApplicationOrchestration, PersistenceAdapters (if config/files), no Presentation |
| `worker-pipeline` | Background processing; no direct user UI | Queues, cron, ETL, notification senders | `hexagonal` | ApplicationOrchestration, PersistenceAdapters, BackgroundJobsScheduling |
| `event-coordinator` | Long-running or multi-step business processes | Checkout flows, approvals, distributed steps | `hexagonal` | DomainModel, ApplicationOrchestration, WorkflowSagaEngine, IntegrationAdapters |
| `integration-bridge` | Mostly connects external systems; thin domain | Sync jobs, iPaaS-style glue, webhooks fan-out | `hexagonal` | IntegrationAdapters, ApplicationOrchestration, PersistenceAdapters (optional) |
| `multi-app-workspace` | Several deployable units in one repo | Monorepos with apps + packages | `monorepo` | Per-package DomainModel + Application; shared packages classified explicitly |
| `prototype-spike` | Fast experiment; structure can stay minimal | Hackathon, proof-of-concept, learning project | `layered` | ApplicationOrchestration + PersistenceAdapters only; expand when scope stabilizes |

### Phase 2 / 3 unlock rules (capability-driven, not tool-driven)

| Capability described | Layer to adopt | Conventional directory |
|---------------------|----------------|------------------------|
| Outbound email, payments, third-party APIs | IntegrationAdapters | `adapters/integration/` |
| Scheduled or retried background work | BackgroundJobsScheduling | `jobs/` |
| Multi-step process with compensation | WorkflowSagaEngine | `workflows/` |
| Read-optimized views / dashboards | ReportingReadModels | `reporting/`, `projections/` |
| Feature flags, plugin metadata | ExtensibilityMetadata | `metadata/` |
| Auth, audit logs, metrics | SecurityAuditObservability | `security/`, `audit/`, `observability/` |

### Detection (deterministic, repo signals)

`ark-check --recommend` scores archetypes using **shape signals**, not brand names:

| Signal category | Examples | Points toward |
|-----------------|----------|---------------|
| Deployable type | `bin` in package.json, `main` only | `library-sdk`, `cli-utility` |
| UI present | `app/`, `pages/`, `components/`, `.tsx` density | `crud-product`, `frontend-surface` |
| API surface only | `routes/`, `controllers/`, no UI dirs | `api-backend` |
| Workspaces | `pnpm-workspace.yaml`, `packages/` | `multi-app-workspace` |
| Job/queue dirs | `jobs/`, `workers/`, `cron/` | `worker-pipeline` |
| Workflow dirs | `sagas/`, `workflows/` | `event-coordinator` |
| Thin src, many integration files | `webhooks/`, `sync/` | `integration-bridge` |
| Empty or tiny tree | < N files | `prototype-spike` |

Optional `toolHints` (secondary): `next`, `nestjs`, `express`, `prisma`, `drizzle`,
`supabase` — boost confidence but never define the archetype label shown to the user.

Output always includes `confidence`, `runnerUp`, and `why` tied to signals found.

---

## Deliverables

### D1 — `templates/architecture-playbook.json`

Versioned JSON shipped in the npm package (like presets).

```jsonc
{
  "version": "1",
  "archetypes": {
    "crud-product": {
      "label": "Product with UI and database",
      "preset": "hexagonal",
      "phases": { "1": ["DomainModel", "..."], "2": ["IntegrationAdapters"], "3": ["WorkflowSagaEngine"] },
      "analogy": "Restaurant: recipes (domain), kitchen coordinator (application), waiters (presentation), suppliers (adapters).",
      "books": [{ "title": "Clean Architecture", "author": "Martin", "for": "why business rules stay independent of UI and DB" }],
      "antiPatterns": ["Database client in domain/", "HTTP calls inside business rules"],
      "detectionSignals": { "ui": true, "persistence": true }
    }
  }
}
```

### D2 — `ark-check --recommend`

Terminal command (deterministic):

```bash
ark-check --recommend              # human-readable plan
ark-check --recommend --json       # machine-readable for agents
```

Reuses `detectBestFitModel`, workspace detection, and playbook scoring. Never writes
files unless `--write-plan` (optional) emits `ark-adoption-plan.json` for the skill.

### D3 — `ark init` enthusiast wizard

Interactive mode (default when TTY and no `--yes`):

1. What are you building? (maps to archetype ID)
2. Does it store data? (unlocks PersistenceAdapters)
3. Multiple apps in one repo? (monorepo)
4. Using AI to write code? (install agent gates)

Non-interactive: `ark init --archetype crud-product --yes`.

### D4 — MCP tool `ark_recommend`

Same output as `--recommend --json`. Agent calls before generating structure.

### D5 — Skill `/ark-architect`

Autonomous workflow (see [Skill specification](#skill-ark-architect) below).

Installed via `--install-agent-gates` into `.claude/skills/`, `.cursor/commands/`, etc.

### D6 — Terminal UX enhancements

- **`ark-check --doctor`**: "New here?" section with archetype + next command.
- **`ark-check --report`**: `beginner` mode — 3-box diagram, placement table, fewer matrices.
- **Violation JSON**: `fixClass`, `effort`, `enthusiastHint` (fix-class hinting).
- **`ark-check --watch`**: filesystem watch for editor-adjacent feedback.

### D7 — Session context hint

`ark-mcp --session-context` appends when `governed.percent < 50` or config age < 7 days:

```
New to Ark? Run /ark-architect or: ark-check --recommend
```

### D8 — Example gallery (enthusiast READMEs)

One-page "what this shape is" per archetype:

| Example dir | Archetype |
|-------------|-----------|
| `examples/crud-product-starter` | `crud-product` |
| `examples/api-backend-starter` | `api-backend` |
| `examples/worker-pipeline-starter` | `worker-pipeline` |
| `examples/multi-app-workspace-starter` | `multi-app-workspace` |

Existing `hexagonal-order-api` remains the "break on purpose" teaching example.

### D9 — Eval cases for enthusiasts

| Case | Prompt style | Pass criteria |
|------|--------------|---------------|
| `enthusiast-greenfield-crud` | "Build a todo app with a database" | preset + domain without DB imports |
| `enthusiast-wrong-layer` | Agent puts ORM in domain | self-correct via port |
| `enthusiast-cheated` | Agent edits ark.config to silence | must grade `CHEATED` |

---

## Skill `/ark-architect`

### Purpose

Translate "what I want to build" into an Ark preset, progressive layer plan, and
scaffold — for users who are not professional developers.

### Relationship to other skills

| Skill | Phase |
|-------|-------|
| `/ark-architect` | **Before** — choose shape and adopt phase 1 |
| `/ark-adopt` | **After** — messy existing repo |
| `/ark-contract` | **During** — evolve config safely |
| `/ark-place` | **During** — one artifact |
| `/ark-explain` | **After** — understand what exists |

### Steps

1. **Detect or ask (max 2 questions)**  
   Run `ark-check --recommend --json`. Ask only if confidence < 0.5:
   - "Will this app save data between sessions?"
   - "Is this one app or several in one repository?"

2. **Present archetype in plain language**  
   Name the application shape (not the framework). One analogy. Phase 1 layers only.

3. **Map to Ark preset**  
   From playbook → `ark init --preset <name> --yes` or `/ark-contract` if config exists.

4. **Scaffold phase 1**  
   Create conventional directories + one-line README per folder. Match nearest sibling style.

5. **Install gates if agent-driven**  
   `--install-agent-gates` when user uses AI coding tools.

6. **Verify honestly**  
   `ark-check --doctor` + `ark-check --coverage`. Report `governed.percent`. State what
   is *not* governed yet.

7. **Deliverable to user**  
   - ASCII diagram (3 boxes max for phase 1)  
   - Table: "when you build X, put it in Y"  
   - Three rules the agent must not break  
   - Optional book refs under "go deeper"  
   - Pointer to matching example gallery repo

### Operating rules

- Never weaken `ark.config.json` to pass.
- Never invent layers outside 11-layer profile / presets.
- Flag unrecognized dirs (`utils/`, `lib/`) for user classification.
- Default to smallest viable phase 1; unlock phase 2 only when user describes need.

---

## Implementation phases

### Phase A — Foundation (Next, P0)

| Task | Owner surface | Notes |
|------|---------------|-------|
| Author `architecture-playbook.json` with 10 archetypes | templates | Tool-agnostic IDs |
| Implement `scoreArchetypes(root)` in `ark-shared.mjs` | bin | Deterministic |
| `ark-check --recommend` + `--json` | bin | No LLM |
| Unit tests for scoring edge cases | tests | Empty repo, monorepo, UI-only |
| Document playbook in agent-guide | docs | MCP + skill consumers |

**Exit:** `ark-check --recommend` prints correct archetype for 5 fixture repos.

### Phase B — Enthusiast terminal UX (Next, P1)

| Task | Owner surface | Notes |
|------|---------------|-------|
| `ark init` wizard + `--archetype` flag | bin/ark.mjs | TTY detection |
| Doctor "New here?" section | ark-check | Links to recommend |
| Fix-class hinting in violation JSON | ark-check | `fixClass`, `effort`, `enthusiastHint` |
| `--report` beginner mode | ark-check | Simpler HTML |
| `ark-check --watch` | ark-check | chokidar or Node fs.watch |

**Exit:** Non-dev can run `ark init` interactively and get a passing strict check.

### Phase C — Agent layer (Next, P1)

| Task | Owner surface | Notes |
|------|---------------|-------|
| MCP `ark_recommend` tool | ark-mcp | Wraps shared scorer |
| Skill `ark-architect.md` | templates/skills | Install via gates |
| Session-context enthusiast hint | ark-mcp | Low governed % |
| Eval cases (enthusiast-*) | eval/cases | Anti-cheat |

**Exit:** `/ark-architect` on empty repo → phase-1 scaffold + doctor healthy.

### Phase D — Proof and gallery (Next, P2)

| Task | Owner surface | Notes |
|------|---------------|-------|
| Demo video/script: enthusiast → architect → agent builds feature | marketing | Third public demo |
| Example gallery (4 starters) | examples | One per archetype |
| Comparative eval 30 prompts | eval | With/without Ark |
| Public demo: `ark_place` after architect | docs | End-to-end funnel |

**Exit:** Three high-signal demos shipped (per internal success criteria).

### Phase E — Later

| Task | Notes |
|------|-------|
| Docs site track "Ark for enthusiasts" | Diátaxis tutorial |
| Team policy packs with `enthusiast` variant | Shorter layer descriptions |
| `ark-adoption-plan.json` artifact in repo | Optional committed plan |
| Optional locale packs (non-English) | English canonical source only; translations layered on top |

---

## Dependency graph

```mermaid
flowchart TD
  PB[architecture-playbook.json] --> REC[ark-check --recommend]
  PB --> MCP[ark_recommend MCP]
  PB --> SKILL[/ark-architect skill]
  REC --> WIZ[ark init wizard]
  REC --> DOC[doctor New here]
  MCP --> SKILL
  SKILL --> GATES[install-agent-gates]
  FIX[fix-class hinting] --> SKILL
  FIX --> EVAL[enthusiast eval cases]
  GALLERY[example gallery] --> SKILL
```

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| LLM invents non-canonical folders | Playbook + skill rules; scorer is deterministic |
| False confidence on empty repo | Default `prototype-spike`; ask 2 questions if confidence low |
| Archetype explosion | Cap at 10; new shapes extend playbook via PR, not prompts |
| Duplicates `detectBestFitModel` | Refactor preset fit + archetype fit to share signal extraction |
| Enthusiast overwhelmed by 11 layers | Progressive phases; phase 1 max 4 layers in UI |

---

## Success criteria (8.5/10 path)

Aligned with internal roadmap:

- [ ] `--recommend` and `ark_recommend` ship in npm package
- [ ] `/ark-architect` installed by default with other skills
- [ ] One public demo: enthusiast describes app → correct structure → agent respects gates
- [ ] Eval enthusiast cases in CI optional job (nightly)
- [ ] README links to this plan and archetype table
- [ ] No ad-hoc layer suggestions outside playbook/presets

---

## References (optional depth for users)

| Topic | Source |
|-------|--------|
| Entities, use cases, boundaries | Robert C. Martin — *Clean Architecture* |
| Ubiquitous language, domain model | Eric Evans — *Domain-Driven Design* |
| Application services, repositories | Vaughn Vernon — *Implementing Domain-Driven Design* |
| Integration and boundaries | Sam Newman — *Building Microservices* (Ch. on decomposition) |
| Ports and adapters | Alistair Cockburn — Hexagonal architecture (original article) |

Ark does not require reading these. The playbook cites them only under "go deeper."