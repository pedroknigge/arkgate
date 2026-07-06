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

## Now

- **Write-gate ↔ CI contract parity.** The AI write gate can block an import the CI gate
  allows, because the runtime architecture profile drops the config's file globs and
  falls back to an infrastructure path-heuristic that ignores the explicit layer rules.
  Make the two gates agree so `ark.config.json` is authoritative on both.
- **Config doctor.** One command that explains governed files, unclassified files, empty
  layers, weak rule coverage, installed gates, installed skills, and baseline health —
  folding the new coverage/diagnosis output into a single view.
- **Trust hardening**: npm provenance, signed release tags, `SECURITY.md`, CI security
  scanning, clearer release verification.
- **Public demos**: agent self-correction, brownfield baseline adoption, and `ark_place`
  guided feature generation.

## Next

- **Fix-class hinting.** Beyond value-vs-type-only, distinguish cheap mechanical fixes
  (type moves, file relocations) from "big rocks" — real refactors such as migrating raw
  SQL in routes to repositories, which change behavior and need verification against real
  data, not just a type check.
- **Comparative evals**: agent-generated changes with and without Ark on a governed repo,
  tracking violations and time-to-fix.
- **Example gallery**: clonable examples for NestJS, monorepos, Next.js/API apps, and
  brownfield adoption — including a worked facade split.
- **Watch mode**: `ark-check --watch` for editor-adjacent feedback without ESLint.
- **ESLint parity**: keep editor feedback aligned with `ark-check`, documenting CI as the
  authoritative gate.

## Later

- **Runtime package split**: decide whether the optional runtime kernel becomes a separate
  package once the static and agent gate are more mature.
- **Docs site**: move long-form documentation out of the README into a focused docs site.
- **Framework adapters**: only when examples justify them; Ark stays a governance tool, not
  an app framework.
- **Team policy packs**: proven starter configs for hexagonal, layered, feature-sliced, and
  monorepo projects — plus a "framework border" pack encoding the surface/internals split.

## Not Planned

- Reimplementing workflow orchestrators such as Temporal or Restate.
- Adding runtime dependencies to the core static gates.
- Becoming a web framework, job runner, ORM abstraction, or deployment platform.
- Ad-hoc layer heuristics: suggestions must trace to the canonical profile/presets.

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
