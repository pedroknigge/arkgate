# Ark Roadmap

Ark is an AI architecture gate for TypeScript: one machine-readable architecture
contract, enforced when agents write code and again before code merges.

The runtime kernel remains optional. The public product focus is the static and
agent-native gate: `ark-check`, `ark-mcp`, `ark://manifest`, and the `/ark-*`
workflows that help agents place code correctly.

## Now

- **Trust hardening**: add npm provenance, signed release tags, `SECURITY.md`, security
  scanning in CI, and clearer release verification notes.
- **Write-gate parity**: make the AI write gate and CI gate agree more closely on
  layer-boundary violations, especially cross-layer imports.
- **Config-to-runtime bridge**: expose helpers so teams that opt into runtime enforcement
  can derive the runtime architecture profile from the same `ark.config.json`.
- **Gate detection polish**: make `ark-check --require-gates` recognize any workflow that
  runs Ark, not only the generated workflow filename.
- **Public demos**: publish short demos for agent self-correction, brownfield baselines,
  and `ark_place` guided feature generation.

## Next

- **Comparative evals**: benchmark agent-generated changes with and without Ark on a
  governed TypeScript repo, tracking architecture violations and time-to-fix.
- **Example gallery**: add clonable examples for NestJS, monorepos, Next.js/API apps, and
  brownfield adoption with a baseline.
- **Config doctor**: add one command that explains governed files, unclassified files,
  empty layers, weak rule coverage, installed gates, installed skills, and baseline
  health.
- **Watch mode**: add `ark-check --watch` for editor-adjacent feedback without requiring
  ESLint.
- **ESLint parity**: keep editor feedback aligned with `ark-check` where practical, while
  documenting CI as the authoritative gate.

## Later

- **Runtime package split**: decide whether the optional runtime kernel should become a
  separate package once the static and agent gate are more mature.
- **Docs site**: move long-form documentation out of the README into a focused docs site.
- **MCP registry presence**: publish `server.json` to the official MCP registry so agents
  can discover Ark more easily.
- **Framework adapters**: add adapters only when examples justify them. Fastify and
  Next.js are candidates; Ark should stay an architecture governance tool, not an app
  framework.
- **Team policy packs**: provide proven starter configs for hexagonal, layered,
  feature-sliced, and monorepo projects.

## Not Planned

- Reimplementing workflow orchestrators such as Temporal or Restate.
- Adding runtime dependencies to the core static gates.
- Becoming a web framework, job runner, ORM abstraction, or deployment platform.

## Principles

- One contract should drive write-time, merge-time, and optional runtime enforcement.
- CI remains the authoritative static check.
- Agent tooling should help generated code self-correct before review.
- Runtime features should stay optional and clearly documented as advanced usage.
