# Ark Roadmap

Ark is an AI architecture gate for TypeScript: one machine-readable architecture
contract, enforced when agents write code and again before code merges.

The runtime kernel remains optional. The public product focus is the static and
agent-native gate: `ark-check`, `ark-mcp`, `ark://manifest`, and the `/ark-*`
workflows that help agents place code correctly.

## Direction

Ark's focus has sharpened from "enforce a clean architecture" to **helping a team
organize a messy, pre-existing codebase — without ever presenting a false-green.**
A gate that freezes every violation and reports green, or that silently governs a
fraction of the tree, looks safe while checking almost nothing — worse than no gate.
The tool should tell the truth about what it governs and guide the cleanup in order.

A second focus is now explicit: **enthusiast-first onboarding** — users who build with
AI but are not professional developers need a plain-language path from "what I want to
build" to the right preset and layers, before the write gate can help them.

Four principles drive this:

- **Honesty over green.** Report the governed fraction, separate real debt from false
  positives, and refuse to freeze a baseline that buries a contract bug.
- **Protect the border around a framework, not its internals.** A repo using a
  DI/kernel framework (dcouplr, NestJS, a custom kernel) declares that framework's
  public surface as one layer and treats the rest as a black box. Ark guards the
  boundary; it does not duplicate the framework's own wiring. This is how Ark stays
  compatible with any runtime.
- **Diagnose → classify → freeze only real debt.** Adoption is not "freeze
  everything." When most violations concentrate on one edge, the contract is usually
  wrong, not the code — fix the contract first (allow the edge, or split the target
  layer into a public surface + internals), then freeze the genuine remainder.
- **Suggestions come from Ark's own canonical sources.** Layer proposals are harvested
  from the 11-layer profile and the named presets — never an ad-hoc heuristic. A
  directory Ark does not recognize is flagged for the user to classify, never guessed.
  **Architecture archetypes** (application shape, not vendor stack) are curated in
  `templates/architecture-playbook.json` and map to those same presets and layers.

Full implementation plan: [docs/architect-onboarding-plan.md](docs/architect-onboarding-plan.md).

## Recently shipped

- **Package-manager-aware commands.** Every command Ark emits — the AGENTS.md
  contract, `.mcp.json`, the Claude/Codex hooks, the `check:architecture` script, the
  postinstall hints — follows the project's package manager (`pnpm exec` / `yarn` /
  `npx`), not just the CI workflow.
- **`init` proposes, coverage stops lying.** `--init` proposes a canonical layer for
  every ungoverned directory (from the 11 layers + presets; unrecognized dirs flagged).
  `--coverage` leads with `Governed: N%`, warns loudly when Ark governs a minority, and
  groups ungoverned directories with proposals.
- **Violation diagnosis.** `ark-check` groups violations by edge and target subtree,
  ranked, with a concentration verdict. `--update-baseline` refuses a lopsided freeze
  unless `--force`, pointing at the facade fix instead of the baseline.
- **Type-only vs value violations.** Each import violation is tagged `typeOnly`; the
  summary splits real runtime coupling (fix first) from type placement (moves with the
  type).
- **Facade splits are order-independent.** A file resolves to the most specific matching
  layer pattern, so a public-surface layer wins over a catch-all regardless of layer
  order.
- **Skills reoriented to organize.** `/ark-adopt`, `/ark-coverage`, `/ark-fix`,
  `/ark-contract`, and `/ark-explain` teach the border principle, the facade split, and
  the type-only fix pattern, and consume the new diagnosis output.
- **The write gate honors the contract over its infra heuristic.** A resolvable cross-layer
  import is judged by the config's layer rules — like `ark-check` — so both gates agree on a
  governed edge, and `mayImportInfrastructure` is no longer needed for declared data layers.
- **`--install-agent-gates --migrate-commands`.** Rewrites only the command runner in existing
  gate files to match the package manager, preserving customizations — for repos that adopted
  before the emitted commands became package-manager-aware.
- **`ark-check --doctor`.** One consolidated health view — coverage, violations, gates, skills,
  baseline, command runners — each with its fix, plus a ranked "Top actions" list.
- **Brownfield burn-down playbook** ([docs/brownfield-adoption.md](docs/brownfield-adoption.md))
  plus an `/ark-fix` fix class for relocating raw infrastructure access (SQL/DB in a route)
  verbatim into a repository/adapter.

## Now

- **Trust hardening**: npm provenance, signed release tags, `SECURITY.md`, CI security
  scanning, clearer release verification.
- **Public demos**: agent self-correction, brownfield baseline adoption, and `ark_place`
  guided feature generation.
- **ESLint parity**: keep the editor plugin aligned with `ark-check` so violations surface as
  you type, with CI as the authoritative gate.

## Next

### Architect onboarding (enthusiast-first)

- **`templates/architecture-playbook.json`**: versioned, tool-agnostic application
  archetypes (`crud-product`, `api-backend`, `frontend-surface`, `library-sdk`,
  `cli-utility`, `worker-pipeline`, `event-coordinator`, `integration-bridge`,
  `multi-app-workspace`, `prototype-spike`). Each maps to a named preset and phased
  11-layer adoption. Vendor packages are detection signals only, not archetype names.
- **`ark-check --recommend`**: deterministic terminal command (+ `--json`) that scores
  the repo against the playbook and prints a progressive adoption plan (phase 1–3
  layers, analogy, anti-patterns, optional book references for depth).
- **`ark init` enthusiast wizard**: interactive TTY flow for non-developers; non-interactive
  `ark init --archetype <id> --yes`. Asks what application *shape* is being built, not
  which framework was installed.
- **Skill `/ark-architect`**: autonomous agent workflow — detect archetype, explain in
  plain language, scaffold phase-1 directories, run `ark init` / `/ark-contract`, install
  gates, verify with `--doctor` and `--coverage`. Complements `/ark-explain` (teaches
  existing contract) and `/ark-place` (one artifact).
- **MCP tool `ark_recommend`**: same structured output as `--recommend --json` for agents
  to call before generating project structure.
- **`ark-check --doctor` "New here?" section**: points newcomers to `--recommend` or
  `/ark-architect` when governed coverage is low or the config is new.
- **`ark-mcp --session-context` enthusiast hint**: one-line pointer when adoption is
  early (`governed.percent` low or fresh config).

### Terminal and CI quality

- **Fix-class hinting.** Beyond value-vs-type-only, tag violations with `fixClass`
  (`port-inversion`, `file-move`, `data-layer-migration`, …), `effort`, and
  `enthusiastHint` — plain-language fix guidance in `--json` output.
- **Watch mode**: `ark-check --watch` for editor-adjacent feedback without ESLint.
- **`ark-check --report` beginner mode**: simplified HTML (3-box diagram, placement
  table, fewer matrices) for onboarding and PR attachments.

### Proof and examples

- **Comparative evals**: agent-generated changes with and without Ark on a governed repo,
  tracking violations and time-to-fix.
- **Enthusiast eval cases**: greenfield CRUD prompts, wrong-layer self-correction, and
  `CHEATED` detection when agents weaken the contract.
- **Example gallery**: clonable starters per archetype (`crud-product`, `api-backend`,
  `worker-pipeline`, `multi-app-workspace`) with one-page enthusiast READMEs; keep
  `hexagonal-order-api` as the intentional break example.
- **Public demo #3**: enthusiast describes an app → `/ark-architect` → correct phase-1
  structure → agent builds a feature without infrastructure in domain.

## Later

- **Docs site**: move long-form documentation out of the README; include an "Ark for
  enthusiasts" tutorial track (Diátaxis).
- **Team policy packs**: proven starter configs for hexagonal, layered, feature-sliced,
  and monorepo projects — plus a "framework border" pack and an **enthusiast** variant
  (shorter layer descriptions, progressive phases baked in).
- **`ark-adoption-plan.json`**: optional committed artifact emitted by `--recommend
  --write-plan` for teams that want a machine-readable adoption record.
- **i18n for wizard and `/ark-architect`**: Spanish first if community demand warrants it.
- **Runtime package split**: decide whether the optional runtime kernel becomes a separate
  package once the static and agent gate are more mature.
- **Framework adapters**: only when examples justify them; Ark stays a governance tool, not
  an app framework.

## Not Planned

- Reimplementing workflow orchestrators such as Temporal or Restate.
- Adding runtime dependencies to the core static gates.
- Becoming a web framework, job runner, ORM abstraction, or deployment platform.
- Ad-hoc layer heuristics: suggestions must trace to the canonical profile/presets or the
  architecture playbook.
- Vendor-named archetypes ("Next.js app", "NestJS API") as first-class taxonomy — tools may
  inform detection confidence only.

## Principles

- One contract drives write-time, merge-time, and optional runtime enforcement — and the
  contract is authoritative; a gate should not silently contradict it.
- Honesty over green: never report a passing check that ignores most of the code or freezes
  false positives as debt.
- Protect the border around a framework, not its internals.
- Diagnose and classify before freezing; freeze only genuine debt.
- CI remains the authoritative static check.
- Agent tooling should help generated code self-correct — and help a team organize a messy
  codebase — before review.
- Runtime features stay optional and clearly documented as advanced usage.
- **Archetypes describe application shape; vendors are hints.** Onboarding narrates in plain
  language; structure always maps to Ark presets and the 11-layer profile.
- **Progressive adoption:** phase 1 is the smallest honest layer set; advanced layers unlock
  when the user describes the capability (integrations, jobs, sagas), not when a tool is detected.