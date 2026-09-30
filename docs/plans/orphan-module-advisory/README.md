# Orphan module advisory — files nothing imports

> **Plan, not implementation authority.** Code and executable schemas decide whether a
> claim is true. Work starts only when item IDs appear as `doing`/`todo` in
> [ROADMAP.md](../../../ROADMAP.md). Hub: [AGENTS.md](../../../AGENTS.md) ·
> [Package surface](../../package-surface.md) · [ADR index](../../adr/README.md)

**Status:** Implemented on the tree (`OM01`–`OM07` done; not yet released).<br>
**Slug:** `orphan-module-advisory`<br>
**Kind:** epic / advisory projection of resolved import facts<br>
**Prefix:** `OM`<br>
**ADR:** [0037](../../adr/0037-orphan-module-advisory.md)<br>
**Owners:** product (Pedro) + library maintainers<br>
**Last updated:** 2026-09-30<br>
**Target package:** additive patch. **No `schemaVersion` bump.** No
`ark.config.json` key (sidecar `.ark/entry-points.json`). No new skill name.

Does **not** close `Z09` / residual `RB-11` or `K01`. Never in the write hook,
MCP write tools, ESLint, `--changed`, or `--strict-merge`.

---

## 0. The finding

- The resolver already emits `dependencies[]` with `from`, `target`,
  `resolution` (`resolved-project | resolved-external | unresolved | dynamic`),
  `kind` (`import | export | dynamic-import | require`) and `namedBindings`
  (`src/domain/resolvedCandidateFactsTypes.ts`).
- Doctor threw that away: `runArchitectureScan()` returned only `.result`
  (the memory cut in #339), and `bin/lib/flat-parent-importers.mjs` rebuilt an
  importer graph by re-reading every file and matching import text.
- Governed files exclude tests and `.d.ts` (`isGovernableSourceFile`), so edges
  from tests are not in the graph. A naive "no importers" check would list
  every file only a test imports.

## 1. Goal

Doctor Details, JSON and the report list governed source files that nothing
imports and that no known entry point covers. Every entry says where its
evidence came from. The section is honest when the evidence is incomplete. It
is `notAScore` and never flips `valid`, strict-merge or `goal.met`.

## 2. Non-goals

- Auto-delete or a codemod. Deleting goes through the write gate with a human OK.
- A reachability "islands" tier in v1.
- A top-level `entryPoints` config key (ADR 0037 D5).
- Any gate teeth, `--strict-merge` input, or compass lens change.

## 3. Locked decisions

Authority is [ADR 0037](../../adr/0037-orphan-module-advisory.md). This section is the index.

| D | Decision |
|---|---|
| D1 | Project existing resolved facts only. Verdict + `factsHash` byte-identical. |
| D2 | Tier 1 = zero importers and not an entry. Tier 2 = unused exports, Details only. |
| D3 | Closed entry sources, each with a `source` label. |
| D4 | `complete \| partial \| deferred \| unavailable`; per-item `certainty` under `partial`. |
| D5 | `.ark/entry-points.json` sidecar (64 KiB, 200 entries, `reviewBy`). |
| D6 | Tier 1 in every doctor, printed in Details; compact gets one dim count line. Tier 2 in `--all` / `--report`. |
| D7 | Never in the write hook, MCP write tools, ESLint, or `--strict-merge`. |

## 4. Design (as built)

| Piece | Where | What |
|-------|-------|------|
| Importer index | `bin/lib/import-graph-projection.mjs` | `projectImporterIndex(facts)`: governed paths, `importerCount` (`Uint32Array`), `edges` (`Int32Array` pairs), per-target named use (`'*'` for default / namespace / side-effect / dynamic / require / `export *`), capped unresolved relative specifiers, dynamic-site count |
| Scan hook | `bin/lib/architecture-scan.mjs` | `runArchitectureScan({ graphProjection: true })` adds `importGraph` before `facts` is released. Resident doctor projects the same index from its retained snapshot |
| Entry evidence | `bin/lib/entry-points-io.mjs` | Closed sources (ADR 0037 D3), sidecar load with bounds and `reviewBy` |
| Outside importers | `bin/lib/orphan-modules-io.mjs` | Test files and non-governed project source (`ts.preProcessFile` + the project resolver), path literals that name a candidate, lexical dynamic reach. Bounded: 5000 files, 256 KB each; a cap forces `partial` |
| Pure core | `src/domain/orphanModules.ts` → `bin/lib/orphan-modules.mjs` | `findOrphanModules`, `findUnusedExports`, copy. Sets and arrays only; no globs, no `ts`, no fs |
| Doctor / report | `doctor-advisories.mjs`, `html-report-advisories.mjs` | `doctor.orphanModules` JSON (nested `unusedExports`), Details section, one compact count line, `data-advisory="orphanModules"` |
| Flat parent | `bin/lib/flat-parent-importers.mjs` | Reads the importer index when present; the lexical fallback stays for callers without facts |

Tier 2 lives inside `orphanModules.unusedExports` instead of a second
top-level key: one section, one JSON key, and the compact view can say
`deferred` with the command that runs it.

## 5. Files per layer

| Layer | Files |
|---|---|
| DomainModel | `src/domain/orphanModules.ts` (new) · `src/domain/diagnosticCatalog.ts` (+`ORPHAN_MODULE`, +`UNUSED_EXPORT`) · generated `bin/lib/orphan-modules.mjs`, `bin/lib/diagnostic-catalog.mjs` |
| Kernel | none |
| Tooling | `bin/lib/import-graph-projection.mjs`, `bin/lib/entry-points-io.mjs`, `bin/lib/orphan-modules-io.mjs` (new) · `architecture-scan.mjs` · `ark-check-runtime.mjs` · `ark-mcp-runtime.mjs` (resident doctor) · `doctor-advisories.mjs` · `doctor-plan.mjs` (details flag) · `html-report-advisories.mjs` · `flat-parent-importers.mjs` · `scripts/generate-cli-pure.mjs` · `scripts/check-module-budgets.mjs` · `scripts/memory-bench.mjs` |
| FrameworkAdapters | none |

## 6. Tests

- Domain `tests/unit/domain/orphanModules.test.ts`: entry suppression, type-only
  and re-export edges count, test-only tier, `partial` certainty, caps and
  truncation, determinism under input order.
- Tooling: `entryPointsIo.test.ts`, `importGraphProjection.test.ts` (verdict +
  `factsHash` byte-identical), `orphanModulesIo.test.ts`.
- `reportParity.test.ts` covers the new key automatically.
- Journey `tests/fixtures/journey/deadwood/` + golden: `orphan-listed`,
  `test-only-tier`, `maybe-dynamic`, `entry-suppressed`,
  `unused-export-details-only`.
- Self-host: the mother repo's doctor lists no `bin/*.mjs` entry.

## 7. ROADMAP

Items `OM01`–`OM07` under **Phase OM** in [ROADMAP.md](../../../ROADMAP.md).
