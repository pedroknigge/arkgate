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

## Now

- **Trust hardening**: npm provenance, signed release tags, `SECURITY.md`, CI security
  scanning, clearer release verification.
- **ESLint parity**: keep the editor plugin aligned with `ark-check` so violations surface as
  you type, with CI as the authoritative gate.

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

## How to contribute

Issues and PRs welcome on [GitHub](https://github.com/pedroknigge/ark-runtime-kernel).
For enthusiast onboarding feedback, reference the archetype id and `ark-check --recommend --json`
output when reporting misfires.