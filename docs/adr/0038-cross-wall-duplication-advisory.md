# ADR 0038: Cross-wall duplication advisory (doctor-time token fingerprints)

- **Status:** Accepted (`DU01`)
- **Date:** 2026-09-30
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase DU / DU01 — list near-identical code whose copies sit
  on two sides of a wall, or in two layers, as a doctor Details / report
  advisory ([plan](../plans/cross-wall-duplication/README.md))
- **Refines:** [ADR 0026](0026-gate-waist-facts-in-verdict-out.md) D2
  ("a new advisory section requires an existing evidence source"), **narrowly**:
  one new evidence source — AST-token fingerprints — computed in Tooling at
  `--doctor --all` / `--report` time only. Nothing else in D2 moves
- **Does not amend:** ADR 0026 D1 waist (facts in, one verdict out); ADR 0011
  resolved facts; ADR 0015 no new skill names; no `schemaVersion` bump; no
  `ark.config.json` key. Does **not** close `Z09` / `RB-11` / `K01`

## Context

A `peerIsolation` or `childSlices` deny tells the agent where the wall is. The
cheapest way around it is to copy the code: the import is denied, the copy is
not an import. Nothing in ArkGate sees a copy.

[ADR 0010](0010-reshape-copilot-boundary.md) recorded that the 3.4.0 session
found **zero structural clones** among the inspected feature files: merging
them was domain modeling, not deduplication. A duplication signal that counts
volume would be noise. The signal that matters is a copy that **crosses a
boundary the config draws** — a slice wall, a child-slice wall, or a layer.

The resolved facts do not carry token streams, so no existing evidence source
can show a copy. This is the one place Phase DU needs ADR 0026 D2 refined.

## Decisions

### D1 — Fingerprints are doctor-time Tooling evidence, never facts

Token fingerprints are computed in Tooling while status details or the report
run. They never enter resolved facts, `factsHash`, `policyHash`, the analysis
result, or the verdict. `valid`, the violations list and `factsHash` are
byte-identical with and without the section (tested). The pure algorithm lives
in Domain (`src/domain/cloneDetection.ts`, generated to
`bin/lib/clone-detection.mjs`); the token stream, file reads and caps live in
Tooling (`bin/lib/duplication-io.mjs`).

### D2 — Crossing-only, through the gate's own classifier

A copy family is reported only when at least one of its pairs crosses a
boundary. The crossing comes from the classifier the gate uses —
`findDeniedEdgeDecision` (`src/domain/layerMatch.ts`) — evaluated in both
directions, with the members' paths:

| Crossing | When | Catalog id |
|----------|------|------------|
| `cross-slice` | same layer; a `peerIsolation` wall without `childSlices` denies the import | `CROSS_WALL_DUPLICATE` |
| `cross-parent` | same layer; the universe wall of a rule with `childSlices` denies it | `CROSS_WALL_DUPLICATE` |
| `cross-sibling` | same universe; the child-slice wall denies (or warns on) it | `CROSS_WALL_DUPLICATE` |
| `cross-layer-walled` | two layers; the import is denied in **both** directions | `CROSS_WALL_DUPLICATE` |
| `cross-layer` | two layers; at least one direction may import the other | `CROSS_LAYER_DUPLICATE` |

A `fail-closed` universe-wall decision (a path the wall cannot classify) is
**counted, never reported**: an unclassifiable path is not evidence of a wall.
A parent ↔ child copy inside one universe is counted with the same-slice pairs:
the child may import the parent. Same-slice and same-layer copies are counted
as unexamined, never listed. Files outside every layer are counted, never
listed.

### D3 — Fixed constants, calibrated on a corpus, not user tunables

Following ADR 0010 D3: the constants live in code with the calibration table
below as their provenance, and change only through an amendment of this ADR
plus a corpus rerun. The starting points are jscpd's defaults (at least 50
tokens and 5 lines) plus a name-agreement floor.

| Constant | Value | Meaning |
|----------|------:|---------|
| `CLONE_GRAM` (k) | 20 | tokens per hashed gram |
| `CLONE_WINDOW` (w) | 31 | winnowing window; any shared run of `w + k − 1 = 50` tokens shares a fingerprint |
| `CLONE_MIN_TOKENS` | 50 | minimum extended run, in AST tokens |
| `CLONE_MIN_LINES` | 5 | minimum span on each side, in lines |
| `CLONE_NAME_AGREEMENT` | 0.6 | share of identifiers that match position by position |
| `CLONE_BUCKET_CAP` | 16 | a fingerprint shared by more places is boilerplate; skipped and counted |
| `CLONE_MAX_SEED_PAIRS` | 50 000 | seed pairs kept before the list is `partial` |
| `CLONE_FAMILY_LIST_CAP` | 8 | families listed; totals keep the full count |

The calibration run is recorded in [Calibration](#calibration).

### D4 — Where it runs

Only in `--doctor --all` (status details) and `--report`. The doctor JSON
without `--all` carries `{ "status": "not-run", "next": "arkgate-check --doctor --all" }`.
Never in the write hook, MCP, ESLint, the compact status, `--changed`, or
`--strict-merge`. Never flips `valid`, strict-merge, `goal.met`, or a compass
lens. Always `notAScore`.

### D5 — Bounded memory, honest caps

The token stream comes from the TypeScript module doctor already loaded
(`ts.createSourceFile`, one parse per file, a normalized node walk that is
JSX-safe). Phase 1 streams: read, parse, emit kinds, fingerprint, append to
typed arrays, release the text and the tree. At most one file's text is held
at a time; phase 2 re-parses at most the two files of one pair (a cache of
eight). Eligible files exclude tests, `.d.ts`, the default generated globs,
files whose first five lines say `@generated`, `GENERATED FILE`,
`DO NOT EDIT` or `generated from/by`, and files over 256 KB. Caps: files
`graphScanLimit(n)` (floor 2500, cap 8000), 1 000 000 fingerprints, 50 000 seed
pairs, 200 verified file pairs. Hitting any cap makes the section `partial`,
with the counts.

### D6 — No config

No `duplication` block and no top-level key. If field data asks for
suppression, a later `.ark/duplication-acks.json` sidecar with `reviewBy`
(the `contract-smell-acks.json` precedent) is the door — parked as `DU06`.

## Names this ADR requires (and forbids)

Required: doctor JSON `crossWallDuplication`, report section
`data-advisory="crossWallDuplication"`, catalog ids `CROSS_WALL_DUPLICATE` and
`CROSS_LAYER_DUPLICATE` (category `layer`, often advisory).

Forbidden: a duplication percentage or score, listing same-slice copies, a
`duplication` config key, auto-extraction or a codemod, a new skill name,
running in the write hook / MCP / ESLint / compact status / `--changed` /
`--strict-merge`.

## Calibration

Recorded when `DU02` landed. Families counted with the constants above, crossing
families only (the listed ones), on each tree's own `ark.config.json`:

| Tree | Eligible files | Families | Notes |
|------|---------------:|---------:|-------|
| _to be filled by `DU02`_ | | | |

## Consequences

- DU02–DU05 implement these decisions.
- A consumer sees, in `--doctor --all`:
  `This code is copied between features/billing and features/invoices (38 of 41 names match). The wall stops the import, not the copy. Next: move it to src/shared/ with /ark-place.`
- The mother repo's generated mirrors (`bin/lib/*.mjs` from `src/domain/*.ts`)
  carry a generated header and are never fingerprinted.

## Alternatives considered

| Option | Why not |
|--------|---------|
| A duplication percentage (jscpd-style) | Volume without crossings is noise (ADR 0010); a score is frozen |
| `ts.createScanner` token stream | The scanner cannot tokenize JSX text without the parser driving rescans; an apostrophe in JSX text starts a string |
| Fingerprints in resolved facts | Moves `factsHash` and the waist for an advisory; ADR 0026 D1 |
| A second tokenizer dependency | Doctor already holds TypeScript |
| User-tunable thresholds | ADR 0010 D3: calibrated constants, amended with evidence |

## Related

- Waist: [ADR 0026](0026-gate-waist-facts-in-verdict-out.md)
- Fixed calibrated constants: [ADR 0010](0010-reshape-copilot-boundary.md)
- Slice walls: [configuration — peerIsolation / childSlices](../configuration.md)
- Files nothing imports (same Details-only pattern): [ADR 0037](0037-orphan-module-advisory.md)
- Plan: [cross-wall-duplication](../plans/cross-wall-duplication/README.md)
