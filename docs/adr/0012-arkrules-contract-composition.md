# ADR 0012: ArkRules contract and modular composition

- **Status:** Accepted (`AR01` — schema, config `1.0→1.1` migration, and pure validation
  are pinned by `arkRulesContract.test.ts` / `configContract.test.ts`)
- **Date:** 2026-07-24
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase AR / AR01 — declarative intra-layer ArkRules composition,
  reference syntax, fail-closed loading, and Effective Contract provenance
  ([plan](../plans/arkrules-evolution/README.md))
- **Refines:** [ADR 0002](0002-analysis-engine-ownership.md) (one verdict authority),
  config contract discipline from C01

## Context

ArkGate today proves **inter-layer** truth (imports, capabilities, purity). It does not
declare what must exist **inside** a layer — aggregate shape, always-valid factories,
domain events on mutation, or named business invariants. Those rules stay invisible to the
contract and therefore invisible to the write gate, CI, doctor, and remediation plane.

The vision requires modular composition so a project with dozens of business rules keeps a
lean root `ark.config.json` while focused, reviewable `arkrules/<Layer>.json` files carry
structure sensors and invariant catalogs. Composition must stay deterministic, opt-in, and
fail-closed — never silent green from a missing or empty reference.

## Decisions

### D1 — Top-level `arkRules` map references sibling files

`ark.config.json` gains an optional top-level `arkRules` object (schemaVersion `1.1`):

```json
"arkRules": {
  "DomainModel": "arkrules/DomainModel.json"
}
```

Keys are layer names; values are project-relative paths. Chosen over per-layer inline fields
so `layers[]` stays lean and provenance is trivial. Physical template layout is
`arkrules/<Layer>.json`; any relative path remains legal.

### D2 — No auto-discovery; explicit references only

Only explicitly referenced files load. An unreferenced file under `arkrules/` is an
advisory config warning (drift visibility). A referenced file that is missing, unparsable,
or schema-invalid **fails closed** with a file-precise diagnostic — same severity class as
an invalid root config.

### D3 — Empty scope is never silent green

A structure or invariant rule whose `appliesTo` scope matches zero governed files is a
config signal: advisory warning when the rule is advisory; fail-closed when the rule is
`enforced`. A zero-match glob is almost always misconfiguration (ArchUnitTS
`allowEmptyTests:false` lesson).

### D4 — Sibling schema + additive root migration

- Root `ark.config.json` `schemaVersion` bumps `1.0 → 1.1` additively (optional `arkRules`).
  Migration table: `unversioned→1.0`, `1.0→1.1`. Absence of `arkRules` changes no
  architecture verdict.
- Sibling schema `schemas/ark.arkrules.schema.json` (`schemaVersion` starts at `1.0`)
  validates each referenced file. Unknown sensors fail closed (closed vocabulary).
  `layer` must match the referencing key.

### D5 — Effective Contract carries provenance into `policyHash`

A pure Domain loader resolves references, validates each part, and produces one in-memory
Effective Contract where every rule carries `{ sourceFile, ruleId }` provenance. That
document feeds `deterministicHash` → `policyHash` so policy-delta classification, resident
hook identity, and prepare-write hashes cover ArkRules automatically.

### D6 — Require/forbid polarity in structure entries

Structure entries use a closed `sensor` vocabulary (ADR 0013) with
`mode: "advisory" | "enforced"` (default advisory). Severity off-switch for individual
rules is demotion/ack through policy-delta, not a free-form severity enum in v1.

## Consequences

- Consumers without `arkRules` keep current behavior after the additive migration.
- Tooling surfaces (CLI, MCP, ESLint) share one Effective Contract; no per-surface parsers.
- Weakening (delete/demote) an ArkRule is a hash-bound policy-delta transition (ADR 0014 /
  AR11 deepen this ladder).
- Executable predicate engines stay out of core (ADR 0016).

## Alternatives considered

| Option | Why not |
|--------|---------|
| Inline rules on each `layers[]` entry | Bloats the root contract; weak provenance |
| Auto-load every file under `arkrules/` | Silent coupling; hard to audit what is active |
| Separate top-level product / second gate | Splits the enforcement plane; violates north star |
| Executable DSL in core | LLM-shaped risk + non-deterministic maintenance; ADR 0016 |

## Evidence / acceptance

- Packaged schemas exported via `package.json` `./schema/*`.
- `1.0` configs load through migration with content other than `schemaVersion` unchanged.
- Missing / invalid referenced ArkRules files fail closed with path-precise diagnostics.
- Plan authority: [arkrules-evolution](../plans/arkrules-evolution/README.md) Phase AR0.
