# Cross-wall duplication advisory — copies across a wall

> **Plan, not implementation authority.** Code and executable schemas decide whether a
> claim is true. Work starts only when item IDs appear as `doing`/`todo` in
> [ROADMAP.md](../../../ROADMAP.md). Hub: [AGENTS.md](../../../AGENTS.md) ·
> [Package surface](../../package-surface.md) · [ADR index](../../adr/README.md)

**Status:** Implemented on the tree (`DU01`–`DU05` done; not yet released); `DU06` parked.<br>
**Slug:** `cross-wall-duplication`<br>
**Kind:** epic / advisory with new, bounded evidence<br>
**Prefix:** `DU`<br>
**ADR:** [0038](../../adr/0038-cross-wall-duplication-advisory.md) (refines ADR 0026 D2 narrowly)<br>
**Owners:** product (Pedro) + library maintainers<br>
**Last updated:** 2026-09-30<br>
**Target package:** additive patch. **No `schemaVersion` bump.** No
`ark.config.json` key. No new skill name.

Does **not** close `Z09` / residual `RB-11` or `K01`. Never in the write hook,
MCP, ESLint, compact status, `--changed`, or `--strict-merge`.

---

## 0. The finding

- A `peerIsolation` or `childSlices` deny teaches the agent where the wall is.
  The cheapest way around it is to copy the code.
- Nothing in ArkGate sees a copy. ADR 0010 recorded that "zero structural
  clones" was measured by hand in 3.4.0, so a clone signal must be about
  crossings, not volume.
- The resolved facts carry no token stream: this needs one new evidence source,
  which is why ADR 0038 refines ADR 0026 D2.

## 1. Goal

Doctor Details, JSON and the report list near-identical code families whose
members sit on opposite sides of a wall, or in two different layers, and
suggest where the shared code could live. `notAScore`. Never fails any check.

## 2. Non-goals

- A duplication percentage or score; clones within one slice (counted as
  unexamined, never listed).
- Auto-extraction or a codemod.
- Running in the write hook, MCP, ESLint, compact status, `--strict-merge` or
  `--changed`.
- A compass lens change (a later, separate item if ever).
- A `duplication` config block.

## 3. Locked decisions

Authority is [ADR 0038](../../adr/0038-cross-wall-duplication-advisory.md). This section is the index.

| D | Decision |
|---|---|
| D1 | Fingerprints are doctor-time Tooling evidence; never in facts, `factsHash`, or the verdict. |
| D2 | Report a family only if a pair crosses a boundary, classified by `findDeniedEdgeDecision` in both directions. `fail-closed` is counted, not reported. |
| D3 | Fixed constants calibrated on a corpus (ADR 0010 D3 discipline). |
| D4 | Only `--doctor --all` and `--report`; JSON without `--all` is `not-run`. |
| D5 | Typed arrays, one file's text at a time, caps → `partial`. |
| D6 | No config. A `.ark/duplication-acks.json` sidecar is parked (`DU06`). |

## 4. Design (as built)

| Piece | Where | What |
|-------|-------|------|
| Pure core | `src/domain/cloneDetection.ts` → `bin/lib/clone-detection.mjs` | `fingerprint` (rolling hash with `Math.imul` + winnowing), `candidatePairs` (sort by hash, bucket cap, seed-pair cap), `extendMatch`, `sameNames`, `classifyCrossing`, `groupFamilies` (union-find), `buildDuplicationAdvisory`, copy |
| Token stream | `bin/lib/duplication-io.mjs` | `ts.createSourceFile` from the TypeScript doctor already loaded; pre-order node walk: identifiers → 0, literals and JSX text → 1, every other node kind → `2 + kind`; unary operators emitted; imports and `export … from` skipped |
| Eligibility | `bin/lib/duplication-io.mjs` | governed files minus tests, `.d.ts`, default generated globs, generated headers, files over 256 KB; walled layers first; `graphScanLimit(n)` files |
| Phase 1 | `bin/lib/duplication-io.mjs` | stream: parse, fingerprint, append to typed arrays, release; 1 000 000 fingerprints cap |
| Placement | `bin/lib/duplication-io.mjs` | per candidate file pair: `layerForRelativePath` + `findDeniedEdgeDecision` both ways, before any verification |
| Phase 2 | `bin/lib/duplication-io.mjs` | compare at most 1000 crossing file pairs (calibrated; ADR 0038): re-parse (cache of 8), extend, line span, name agreement |
| Destination | `bin/lib/duplication-io.mjs` | shared root → universe common folder → the lower layer both may import → a layer both may import → `/ark-place` |
| Doctor / report | `doctor-advisories.mjs`, `html-report-advisories.mjs` | `doctor.crossWallDuplication` JSON, Details section, `data-advisory="crossWallDuplication"` |

## 5. Files per layer

| Layer | Files |
|---|---|
| DomainModel | `src/domain/cloneDetection.ts` (new) · `src/domain/diagnosticCatalog.ts` (+`CROSS_WALL_DUPLICATE`, +`CROSS_LAYER_DUPLICATE`) · generated `bin/lib/clone-detection.mjs`, `bin/lib/diagnostic-catalog.mjs` |
| Kernel | none |
| Tooling | `bin/lib/duplication-io.mjs` (new) · `bin/lib/doctor-advisories.mjs` · `bin/lib/doctor-plan.mjs` (scope flag) · `bin/lib/html-report-advisories.mjs` (1 line) · `bin/ark-check-runtime.mjs` (scope flag) · `scripts/generate-cli-pure.mjs` · `scripts/check-module-budgets.mjs` · `scripts/memory-bench.mjs` |
| FrameworkAdapters | none |

## 6. Tests

- Property `tests/property/cloneDetection.property.test.ts`: determinism under
  file-order permutation; the winnowing guarantee (a planted identical run of
  50 tokens is always a candidate); renaming every identifier keeps the pair a
  candidate but fails name agreement.
- Domain `tests/unit/domain/cloneDetection.test.ts`: bucket cap, family union,
  caps set `partial`, crossing classification, copy.
- Tooling `tests/unit/static-check/crossWallDuplication.test.ts`: JSX text with
  an apostrophe, generated-header exclusion, same-slice copies counted not
  listed, fail-closed not reported, `not-run` without `--all`, verdict and
  `factsHash` byte-identical.
- `reportParity.test.ts` covers the new key automatically.
- Journey `tests/fixtures/journey/copycat/` + golden: cross-slice, cross-sibling
  and cross-layer families with destinations, a same-slice copy that is not
  listed, a generated copy that is excluded, `not-run` without `--all`.
- Self-host: the mother repo's generated mirrors produce zero families.
- Memory: `bench:memory` gains a `doctorAll` scenario.

## 7. ROADMAP

Items `DU01`–`DU06` under **Phase DU** in [ROADMAP.md](../../../ROADMAP.md).
