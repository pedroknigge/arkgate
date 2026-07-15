# ADR 0006: Architecture change maps are explicit, optional structural input

- **Status:** Accepted
- **Date:** 2026-07-14
- **Owner:** ArkGate maintainers
- **Decision scope:** Change-map schema, preflight binding, package resource

## Context

ArkGate needs enough machine-readable intent to compare a multi-file architectural plan with an
eventual implementation. Making a planning file mandatory would add setup weight and could turn a
boundary tool into a requirements manager. Free-form prose would also make the verdict depend on
model interpretation and session context.

## Decision

ArkGate accepts an optional, explicitly supplied architecture change map:

- Schema `1.0` contains only project-relative file operations (`create`, `update`, `delete`), each
  file's declared Ark layer, and directed dependencies between files in that same plan.
- `additionalProperties: false`, canonical paths, known/resolved layers, unique files and edges,
  and local edge endpoints fail closed through one pure DomainModel loader.
- The schema ships at `arkgate/schema/change-map` and
  `arkgate/schema/ark.change-map.schema.json`. No map is generated or installed by default.
- CLI `ark preflight --change-map <map.json>` and MCP `ark_prepare_change.changeMap` bind the
  normalized map hash into the atomic preflight result. Omitting the map preserves T02 behavior.
- The map describes structural intent only. It contains no requirements, tasks, acceptance claims,
  commands, or arbitrary metadata, and it never proves behavioral completion.

## Consequences

- The same explicit JSON produces the same normalized map and identity fingerprint without an LLM.
- Editors receive a published JSON Schema while adapters reuse the checked analysis bundle.
- T04 can compare this bounded structural input with actual paths and edges without inventing
  product intent.
- Teams that do not need convergence tracking pay no project-file or workflow cost.

## Related

- Project hub: [AGENTS.md](../../AGENTS.md)
- Phase T plan: [change-integrity-loop](../plans/change-integrity-loop/README.md)
- Atomic preflight decision: [ADR 0005](0005-atomic-change-preflight.md)
