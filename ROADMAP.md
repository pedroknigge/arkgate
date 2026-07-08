# Ark Roadmap

Ark is an AI architecture gate for TypeScript: one machine-readable architecture
contract, enforced when agents write code and again before code merges.

The runtime kernel remains optional. The public product focus is the static and
agent-native gate: `ark-check`, `ark-mcp`, `ark://manifest`, and the `/ark-*`
workflows that help agents place code correctly.

## North Star — an architecture co-pilot for everyone

Ark's arc has three stages: **Gate → Guide → Co-pilot.**

- **Gate** (shipped): catch violations at write time and before merge; one contract.
- **Guide** (shipped, 1.11–1.14): stop false-greens, recommend an application shape,
  write an adoption plan, route mature repos to honest adoption.
- **Co-pilot** (where we're going): take a non-developer from *"I have a project"* to
  *"my architecture is sound and stays that way"* — with an agent doing the work and
  Ark keeping it honest.

The co-pilot loop: Ark analyzes the repo and proposes an application shape in plain
language; the user accepts; an agent — driven by Ark's plan — proposes the full set of
changes, sequences them into a roadmap, and improves the architecture incrementally,
running `ark-check` after every step and enforcing the contract from then on.

Two tiers, one contract underneath:

- **Newbie** gets the whole loop — Ark proposes, plans, applies the safe changes, and
  enforces. They never need to know "hexagonal" or "layer glob" to benefit.
- **Expert** takes only the parts they want — adjust the contract, run the gate — and
  ignores the autopilot.

Honesty scales into autonomy: Ark never auto-applies a change it can't validate, never
reports green while skipping work, and always shows what it did automatically vs what it
is proposing vs what it deferred for a human decision. Judgment-heavy refactors
("big rocks") are always proposed, never silently applied.

## Direction

Ark's focus has sharpened from "enforce a clean architecture" to **helping a team
organize a messy, pre-existing codebase — without ever presenting a false-green.**
A gate that freezes every violation and reports green, or that silently governs a
fraction of the tree, looks safe while checking almost nothing — worse than no gate.
The tool should tell the truth about what it governs and guide the cleanup in order.

A second focus is now explicit: **enthusiast-first onboarding** — users who build with
AI but are not professional developers need a plain-language path from "what I want to
build" to the right preset and layers, before the write gate can help them. The
[North Star](#north-star--an-architecture-co-pilot-for-everyone) extends this from
onboarding into ongoing, agent-driven improvement.

Five principles drive this:

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
- **Autonomy is validated and reversible.** As Ark starts to apply changes (not just
  propose them), every step runs in a discardable worktree, is validated by `ark-check`
  before it counts, and is rolled back if it fails or regresses. Only mechanically-safe,
  gate-verifiable changes are auto-applied; anything requiring judgment is proposed for a
  human yes/no. The agent does the edits; Ark decides whether they're allowed to land.

Full implementation plan: [docs/architect-onboarding-plan.md](docs/architect-onboarding-plan.md).
Enthusiast doc track: [docs/enthusiast/README.md](docs/enthusiast/README.md).

## Recently shipped

### Core gates and brownfield

- **Package-manager-aware commands.** Every command Ark emits follows the project's
  package manager (`pnpm exec` / `yarn` / `npx`).
- **`init` proposes, coverage stops lying.** `--init` and `--coverage` with governed %
  and ungoverned directory proposals.
- **Violation diagnosis**, type-only tagging, facade splits, write-gate contract parity.
- **`ark-check --doctor`**, brownfield burn-down playbook, `/ark-fix` infra relocation.

### Architect onboarding (Phases A–E)

- **`templates/architecture-playbook.json`** — ten tool-agnostic archetypes.
- **`ark-check --recommend`** (+ `--json`, **`--write-plan`** → `ark-adoption-plan.json`).
- **`ark init` enthusiast wizard** and **`ark init --archetype <id> --yes`**.
- **MCP `ark_recommend`**, skill **`/ark-architect`**, session-context enthusiast hint.
- **Terminal UX**: doctor "New here?", fix-class / `enthusiastHint`, `--watch`, `--report --beginner`.
- **Example gallery**: `examples/*-starter/` (four archetypes) + comparative eval (30 prompts).
- **Public demos**: write-gate self-correction, brownfield baseline, architect → `ark_place` funnel.
- **Enthusiast policy packs**: `enthusiast-hexagonal|layered|feature-sliced|monorepo` via
  `--list-policy-packs` / `--apply-policy-pack`.
- **Diátaxis enthusiast track**: `docs/enthusiast/` (tutorial, how-to, reference, explanation).

### Brownfield install & onboarding hardening

- **No install lifecycle scripts** — Ark runs no code on install, so hardened repos that
  block build scripts install it with zero prompts.
- **Mature repos routed to adoption** — `ark init` and `ark-check --recommend` steer an
  established codebase to the adoption flow instead of a thin, false-red starter.
- **Layer `exclude` globs** — carve framework internals out of a broad pattern; resolved in
  the one matcher shared by both gates, so CI and the write gate classify identically.
- **`ark upgrade`** — one command to update the package, refresh gates + skills (and Codex
  home), migrate command runners, and re-check. Robust package-manager detection (the
  `packageManager` field wins; a stray lockfile can't hijack an npm project).
- CLI polish: `ark --help` exits 0; generated CI enables corepack before `setup-node`.

### Co-pilot — Phase F (plan + goal primitives)

- **`ark-check --plan`** — the classified remediation plan: every violation tagged
  `mechanical-safe` (safe to auto-apply) / `judgment` (your call) / `deferred`, ordered
  auto-first, wrapped in a `goal` block. Report-only; it's the **plan** primitive the coming
  apply-loop consumes. See [docs/co-pilot-plan.md](docs/co-pilot-plan.md).

## Now — co-pilot enablers

These are the building blocks that turn "Guide" into "Co-pilot." Each ships and is useful
on its own; together they compose the autonomous loop.

- **Worktree-safe apply loop.** Execute plan steps in a discardable git worktree, one small
  change at a time, `ark-check` after each, roll back a step that fails or regresses, and
  surface a diff for approval. Never touches non-code (no DB/schema migrations).
- **Guided single entry point.** One flow (recommend → confirm in plain language → init →
  write-plan) so a newcomer never has to know the individual skill names.
- **Trust hardening**: npm provenance, signed release tags, CI security scanning — a co-pilot
  that edits your repo has to be verifiably trustworthy.
- **ESLint parity**: keep the editor plugin aligned with `ark-check` so violations surface as
  you type, with CI as the authoritative gate.

## Later — full co-pilot

Full implementation plan: [docs/co-pilot-plan.md](docs/co-pilot-plan.md).

- **The autopilot orchestration.** An agent-driven skill/workflow that reads
  `ark-adoption-plan.json` and drives the phases: auto-applies the safe class (validated),
  presents judgment items for a yes/no, re-runs the gate, and explains each step in plain
  language. Composes the "Now" enablers into the end-to-end loop.
- **Tiered UX.** A newbie mode (full autopilot with approvals) and an expert mode (manual
  skills + gate), over the same contract and gates.
- **Deployed docs site** (VitePress / GitHub Pages) — content already lives in-repo under `docs/`.
- **Optional locale packs** for wizard and `/ark-architect` (English remains canonical).
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
- **A codemod/AST-rewrite engine.** The co-pilot orchestrates an agent to make edits and
  *validates* them with the gate; Ark does not hand-roll transforms or own the refactor
  logic. It decides what is allowed to land, not how each edit is written.
- **Auto-applying judgment-heavy refactors.** Big rocks are always proposed for a human
  decision, never silently applied — even in newbie mode.

## How to contribute

Issues and PRs welcome on [GitHub](https://github.com/pedroknigge/ark-runtime-kernel).
For enthusiast onboarding feedback, reference the archetype id and `ark-check --recommend --json`
output when reporting misfires.