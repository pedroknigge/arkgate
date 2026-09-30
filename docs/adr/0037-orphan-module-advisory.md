# ADR 0037: Orphan module advisory projects resolved import facts

- **Status:** Accepted (`OM01`)
- **Date:** 2026-09-30
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase OM / OM01 — list governed source files that nothing
  imports and that no known entry point covers, as a doctor / report advisory
  ([plan](../plans/orphan-module-advisory/README.md))
- **Amends:** none. Uses the ADR 0026 D2 door ("advisory projects existing
  facts"): the resolved import edges already exist; doctor stopped receiving
  them when the scan dropped `facts` to save memory
- **Does not amend:** ADR 0026 waist (facts in, one verdict out); ADR 0015 no
  new skill names; no `schemaVersion` bump; no `ark.config.json` key. Does
  **not** close `Z09` / `RB-11` / `K01`

## Context

The resolver already emits `dependencies[]` with `from`, `target`,
`resolution` (`resolved-project | resolved-external | unresolved | dynamic`),
`kind` and `namedBindings` (`src/domain/resolvedCandidateFactsTypes.ts`).
Doctor never saw them: `runArchitectureScan()` returns only `.result`, and the
flat-parent suggestion rebuilt an importer graph by re-reading every file and
matching import text.

A file nothing imports is the cheapest leftover mess an agent leaves: a
rewrite lands next to the old module, the old one stays. Nothing in the check
sees it, and it should not — deleting code is not an import rule. But the
facts to *show* it are already computed.

Three traps make a naive "zero importers" list wrong:

1. Governed files exclude tests (`isGovernableSourceFile`), so a file only a
   test imports has zero importers in the graph.
2. Entry points are imported by nobody by definition: `package.json` `bin` /
   `exports`, framework conventions (Next `app/**/page.tsx`), config files,
   files a script runs.
3. Dynamic loading (`import(\`./handlers/${x}\`)`, `import.meta.glob`,
   `new URL('./x', import.meta.url)`, `require.context`) reaches files with no
   static edge.

## Decisions

### D1 — Project existing resolved facts only

Doctor and report capture a compact importer index (typed arrays, governed
paths, per-target named use) before `facts` is released. The verdict,
`factsHash`, `policyHash` and the facts schema stay byte-identical with and
without the index (tested). No second analysis engine. The flat-parent
suggestion reads the same index instead of its lexical re-read.

### D2 — Two tiers

Tier 1: a governed file with zero importers — any `resolved-project` edge
counts, including `import type` and `export … from` re-exports — that no entry
source covers. Tier 2: an export no governed file or test imports by name.
Default, namespace, side-effect, dynamic, `require` and `export *` use make the
whole target "possibly all used" and it is skipped. Entry files are exempt.

### D3 — A closed list of entry sources

Each entry carries a `source` label. A file any source covers is not listed.

| Source | Evidence |
|--------|----------|
| `package-json` | `main`, `module`, `browser`, `types`, every string leaf of `exports`, `bin` (string or map), for the root and each workspace package. Built paths map back to source through a bundler entry map (`'out/name': 'src/file.ts'` in a `*.config.*` file), then tsconfig `outDir`/`rootDir`, then `dist\|build\|lib` → `src`. A path that maps nowhere is `unmapped` and forces `partial` |
| `package-scripts` | repo file paths named in `package.json` `scripts` and in CI workflow run steps |
| `framework` | Next (`app/**` route files, `pages/**`, `middleware`, `proxy`, `instrumentation`, `mdx-components`), Vite `index.html` module scripts, Nest `main.ts` / `nest-cli.json`, Vercel root `api/**`, Storybook `*.stories.*` |
| `ark-config` | `arkRun.kernelRoots` / `compositionRoots`, `arkOrder.planeRoots`, `sharedImportsSlice.stopAt` |
| `config-file` | `*.config.*` files, test setup files, and any repo source file a string literal in a config file names |
| `ambient` | files containing `declare global` or `declare module` |
| `sidecar` | globs in `.ark/entry-points.json` |

### D4 — Honesty states

`complete | partial | deferred | unavailable`. `unavailable` means doctor had
no import index (no TypeScript, or a caller without facts). `partial` means
something the list depends on could not be followed: an unmapped entry, a
dynamic import with no static head, an unresolved relative import, a cap, an
unrecognised framework with a large share of files listed. Under `partial`,
each listed file carries `certainty: no-importer | maybe-dynamic |
maybe-unresolved`. `deferred` is tier 2 in the compact view: the JSON names the
command that runs it. Copy says "nothing imports this file", never "dead
code". `partial` is never printed as complete.

### D5 — Sidecar, not config

User-declared entries live in the optional `.ark/entry-points.json`:
`{ "schemaVersion": "1", "entryPoints": [{ "glob", "reason", "reviewBy?" }] }`.
Reasons: older builds reject unknown top-level config keys; the list is not an
import rule, so it must not move `policyHash`; the repo already keeps advisory
memory in sidecars (`contract-smell-acks.json`, `reshape-decisions.json`).
Bounds: 64 KiB, 200 entries. A malformed file suppresses nothing and a doctor
line says so. After `reviewBy` passes, the glob stops applying and the file
comes back annotated.

### D6 — Where it runs

Tier 1 runs in every doctor and report: O(edges), plus a bounded pass over
test files and non-governed project source that only runs when a candidate
remains. The compact view prints at most one dim count line. The list prints
in Details (`--doctor --all`) and the HTML report. Tier 2 runs only in
`--doctor --all` and `--report`.

### D7 — Never a gate input

Never in the write hook, MCP write tools, ESLint, `--changed`, or
`--strict-merge`. Never flips `valid`, strict-merge, `goal.met`, or a compass
lens. Always `notAScore`. Deleting a listed file goes through the write gate
with a human OK — no auto-delete, no codemod.

## Names this ADR requires (and forbids)

Required: doctor JSON `orphanModules` (with nested `unusedExports`), report
section `data-advisory="orphanModules"`, catalog ids `ORPHAN_MODULE` and
`UNUSED_EXPORT` (category `drift`, often advisory), sidecar
`.ark/entry-points.json`.

Forbidden: an `entryPoints` config key, "dead code" in public copy, a
percentage or score, an islands / reachability tier in v1, auto-delete,
`/ark-orphans` or any new skill name.

## Consequences

- OM02–OM07 implement these decisions.
- A consumer sees, in `--doctor --all`: `Nothing imports src/lib/legacy-pricing.ts,
  and no entry point covers it. Next: delete it through the write gate, or add
  it to .ark/entry-points.json if a framework loads it.`
- An unrecognised framework cannot flood the list: with no framework
  recognised and more than a quarter of governed files listed, the status is
  `partial`, the headline says entry points were not recognised, and the list
  is cut to five.

## Alternatives considered

| Option | Why not |
|--------|---------|
| `entryPoints` key in `ark.config.json` | Older builds reject unknown keys; it would move `policyHash` without being an import rule |
| Reachability from entries ("islands") | Too noisy while entry knowledge is partial |
| Keep the flat-parent lexical graph and add a third graph | Two text graphs drift from the resolver |
| Run in the write hook | Not an import rule; the hook must stay cheap |

## Related

- Waist: [ADR 0026](0026-gate-waist-facts-in-verdict-out.md)
- Physical cohesion (advisory, one move at a time): [ADR 0010](0010-reshape-copilot-boundary.md)
- Skills: [ADR 0015](0015-arkrules-migration-skills.md)
- Plan: [orphan-module-advisory](../plans/orphan-module-advisory/README.md)
