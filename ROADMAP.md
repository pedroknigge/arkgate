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
- **Co-pilot** (**ships in 2.0.0**): take a non-developer from *"I have a project"* to
  *"my architecture is sound and stays that way"* — with an agent doing the work and
  Ark keeping it honest.

The co-pilot loop: Ark analyzes the repo and proposes an application shape in plain
language; the user accepts; an agent — driven by Ark's plan — proposes the full set of
changes, sequences them into a roadmap, and improves the architecture incrementally,
running `ark-check` after every step and enforcing the contract from then on.

Two entry styles, **three operating modes**, one contract underneath:

- **Newbie entry** gets the whole loop — Ark proposes, plans, applies the safe changes, and
  enforces. They never need to know "hexagonal" or "layer glob" to benefit.
- **Expert entry** takes only the parts they want — adjust the contract, run the gate — and
  ignores the autopilot.

Operating modes (what Ark is doing right now, not who you are):

- **Suggest** — greenfield / thin tree: propose an application shape and install a starter contract.
- **Adapt** — brownfield or low governed%: match the contract to real layout, raise coverage, freeze only real debt.
- **Enforce** — contract actually governs code; write gate + CI hold the line. A clean plan with ~0% governed is *not* enforce.

Honesty scales into autonomy: Ark never auto-applies a change it can't validate, never
reports green while skipping work, and always shows what it did automatically vs what it
is proposing vs what it deferred for a human decision. Judgment-heavy refactors
("big rocks") are always proposed, never silently applied.

**Status: 2.0.0 = co-pilot milestone + field-hardened honesty.** Primitives — **plan**
(`ark-check --plan`), **goal** (plan `goal` block, including governed%), **loop**
(`/ark-loop`) — composed by **`ark start`** and **`/ark-autopilot`**. Field hardening closes
false-greens, detects Nest/Next/express, overlays real globs, and uses a pnpm-safe runner.
What remains after 2.0 is **depth** (broader mechanical-safe, evals), not new primitives.

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

### Co-pilot — Phases F–J (plan · goal · loop · autopilot) — 2.0.0

- **`ark-check --plan`** (Phase F) — the classified remediation plan: every violation tagged
  `mechanical-safe` (safe to auto-apply) / `judgment` (your call) / `deferred`, ordered
  auto-first, wrapped in a `goal` block. Report-only. The **plan** + **goal** primitives.
- **`ark start`** (Phase G) — the guided front door: looks at your project, describes the shape
  in plain language, sets up config + gates, and shows the plan. No preset or skill name needed;
  adopts an established codebase instead of imposing a shape.
- **`/ark-loop`** (Phase H) — the **loop** primitive: drives the plan to a clean architecture in
  a discardable worktree, auto-applying the safe fixes (validate-or-rollback) and proposing the
  rest, never weakening the gate.
- **`/ark-autopilot`** (Phase I) — the end-to-end co-pilot: set up → plan → drive the fixes →
  enforce, in plain language with approvals, over two tiers (newbie/expert) on one contract.
- **Proof** (Phase J) — classifier-precision corpus, demo
  [docs/demos/03-copilot-autopilot.md](docs/demos/03-copilot-autopilot.md), enforcement-handoff test.
- **Field-hardened honesty** (2.0 must-have, not optional polish):
  - `goal.met` only when violations are clear **and** governed coverage is meaningful;
  - **suggest / adapt / enforce** modes on `ark start`, `--plan`, `--doctor`;
  - shape signals ignore `.github` / other dot-dirs;
  - Nest / Next / express / library **layout overlays** on init so starters get real governed%;
  - pnpm runner skips the deps-status gate that breaks real apps (`ERR_PNPM_IGNORED_BUILDS`);
  - TypeScript resolved from the project; `--plan` still reports coverage honesty without TS.

**This is the co-pilot milestone (2.0.0).** Spec: [docs/co-pilot-plan.md](docs/co-pilot-plan.md).
Maintainer freeze list: [docs/roadmap-internal.md](docs/roadmap-internal.md).

## Now — after the co-pilot milestone (2.0.0)

Primitives and field honesty are complete. Next is depth and trust:

- **Broaden `mechanical-safe`.** Add file relocation and verbatim infra relocation to the
  auto-appliable class — each only once evals prove it behavior-preserving. Grow the classifier
  corpus from real runs. Full plan: [docs/co-pilot-plan.md](docs/co-pilot-plan.md).
- **Trust hardening**: npm provenance (done), signed release tags, CI security scanning — a
  co-pilot that edits your repo has to be verifiably trustworthy.
- **ESLint parity**: keep the editor plugin aligned with `ark-check` so violations surface as
  you type, with CI as the authoritative gate.
- **More framework packs** (optional): explicit Nest/Next enthusiast policy packs if overlays
  need project-specific tuning beyond filename conventions.

## Later

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