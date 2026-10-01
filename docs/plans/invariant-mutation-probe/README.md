# Invariant mutation probe — do the covering tests pin the rule?

> **Plan, not implementation authority.** Code and executable schemas decide whether a
> claim is true. Work starts only when item IDs appear as `doing`/`todo` in
> [ROADMAP.md](../../../ROADMAP.md). Hub: [AGENTS.md](../../../AGENTS.md) ·
> [Package surface](../../package-surface.md) · [ADR index](../../adr/README.md)

**Status:** Implemented on the tree (`IP01`–`IP06` done; not yet released).<br>
**Slug:** `invariant-mutation-probe`<br>
**Kind:** epic / opt-in slow command, evidence for ArkRules promotion<br>
**Prefix:** `IP`<br>
**ADR:** [0039](../../adr/0039-invariant-mutation-probe.md) (refines ADR 0014 D3 and ADR 0016 narrowly)<br>
**Owners:** product (Pedro) + library maintainers<br>
**Last updated:** 2026-09-30<br>
**Target package:** adds a public schema export (`./schema/invariant-probe`), which
package-surface rules usually make a **minor** (4.9.0); the maintainer confirms the
train. **No `schemaVersion` bump.** No `ark.config.json` key. No new skill name.

Does **not** close `Z09` / residual `RB-11` or `K01`. Not a mutation score. Never in
the write hook, MCP, ESLint, the default CI action, or `--strict-merge`.

---

## 0. The finding

- An invariant counts as covered when a `describe` / `it` title names its id, or
  when `coverage.symbol` is declared (`classifyCoverage` / `rankCoverage` in
  `src/domain/invariantCoverage.ts`).
- The coverage message already says "ArkGate matches declared text; it never
  executes tests." A title can name the rule while the body never exercises it.
- `canPromoteInvariant` guards **advisory → enforced**, so the probe targets
  advisory invariants with `coverage.symbol` too — those are the ones being
  promoted. On enforced invariants the result is a health note only.
- Depends on `CR02` (policy-delta promotion sees `coverageRoots`) so promotion is
  correct before the probe can take promotability away.

## 1. Goal

`arkgate-check --probe-invariants[=<id>]` applies at most three small semantic
mutations to the declared symbol, in a temporary copy of the project, runs only the
covering tests with the project's own runner, and reports per invariant:
`killed | survived | not-reached | inconclusive | unprobeable`. When a committed,
fresh artifact records `survived` or `not-reached`, promotion is refused.

## 2. Non-goals

- A mutation score or percentage; whole-repo mutation (the "100% mutation" freeze
  holds).
- Running inside `ark-check`, the write hook, MCP, `action.yml`, or `--strict-merge`.
- Network sandboxing claims beyond best effort.
- Mutating types, interfaces or enums.
- Making the probe a requirement for promotion. Absence stays neutral.

## 3. Locked decisions

Authority is [ADR 0039](../../adr/0039-invariant-mutation-probe.md). This section is the index.

| D | Decision |
|---|---|
| D1 | Owner-invoked execution outside the gate path. Invoking it is the approval; trust model of `npm test`. |
| D2 | The artifact can only subtract promotability: fresh `survived` / `not-reached` refuses; everything else changes nothing. |
| D3 | Rows bound to content hashes (symbol file, each covering test, invariant identity without `mode`, operator-set version). Stale rows are ignored and named. |
| D4 | Baseline green → load canary killed → reach canary killed → semantic mutants. |
| D5 | Closed operator set `ip-ops@1`, at most 3 mutants, deterministic. |
| D6 | Report by default; `--write` persists `.ark/invariant-probe.json`. CI sees the refusal only when the artifact is committed. |
| D7 | No config. Flags: `--probe-invariants[=<id>]`, `--write`, `--json`, `--runner vitest\|jest\|node`. |

## 4. Design

### 4.1 Targets and covering tests

- Rows come from the same evaluation `--promote` uses (`loadSensorMap` /
  `evaluateInvariantCoverage` with `coverageRoots`).
- A target is an invariant with `coverage.symbol` and a declaration of shape
  `function | const | method`. `type / interface / enum / class` →
  `unprobeable: declaration-only`; no symbol → `unprobeable: no-symbol`. At most
  25 targets per run, truncation stated.
- Covering tests, deduplicated, at most 8:
  - (a) test files whose `describe` / `it` titles name the id —
    `testFilesNamingInvariant` in `invariantCoverage.ts`, built on the same title
    matcher as coverage;
  - (b) test files that import the symbol file directly or through one
    re-exporting barrel — the test-importer walk extracted from the files-nothing-
    imports advisory (`bin/lib/outside-importers.mjs`, `testImportersOf`).
- None found → `unprobeable: no-covering-test` ("a declaration is not a test").

### 4.2 Pure core (Domain)

`src/domain/invariantProbe.ts` → `bin/lib/invariant-probe.mjs`:
operators and `mutantsForSite`, `planMutants`, `applyEdit`, `canaryEdits`,
`foldVerdict`, `invariantProbeIdentity`, `probeRowStaleness`,
`summarizeProbeForCoverage`, `readInvariantProbeArtifact`, totals and lines.
`src/domain/invariantProbeSchema.ts` → `schemas/ark.invariant-probe.schema.json`
(package export `./schema/invariant-probe`). Dates, durations and hashes are
supplied by Tooling; Domain stays clock-free and hash-free.

### 4.3 Tooling

| Module | Role |
|--------|------|
| `bin/lib/invariant-probe-sites.mjs` | `ts.createSourceFile`; locate the declaration; emit sites and the body shape |
| `bin/lib/invariant-probe-workspace.mjs` | temp copy, owner marker, `node_modules` link farm, caps, cleanup on `finally` / signals, stale sweep of marked directories only |
| `bin/lib/invariant-probe-runner.mjs` | detect vitest / jest / node:test; argv arrays, no shell, process-group kill on timeout, env allowlist |
| `bin/lib/invariant-probe-io.mjs` | read the artifact (1 MiB, 500 rows), hash current inputs, attach `probe` to coverage rows |
| `bin/lib/invariant-probe-cli.mjs` | `--probe-invariants` orchestration, output, `--write`, exit codes |

### 4.4 Promotion honesty (one judge)

Optional `probe?: InvariantProbeSummary` on `InvariantCoverageEvidence`.
`canPromoteInvariant(coverage)` keeps its parameter and adds one refusal for a
fresh `survived` / `not-reached`, returned with `blocker: 'probe-survived'`.
`sensor-promote-io` and `policy-delta-io` attach the rows, so `--promote` and the
policy delta refuse alike. Status (`--doctor`) ArkRules lines and
`--rules-inventory` show the probe state only when an artifact exists.

## 5. Diagnostics

`INVARIANT_PROBE_SURVIVED` (category `arkrules`, often advisory): a status and
inventory line only — never in the analysis result, never `failsStrict`.

## 6. Tests

- Domain: `planMutants` determinism and priority, `applyEdit` round-trip,
  `foldVerdict` truth table, freshness (mode change stays fresh; a test change goes
  stale), `canPromoteInvariant` (fresh survived refuses; stale / absent / killed
  unchanged), property test over every probe state.
- Tooling: workspace (tree byte-identical after a run and after a simulated crash;
  sweep touches marked directories only), runner adapters (vitest from the repo's
  own dependency, jest through a fake bin, node:test), group kill on timeout, env
  allowlist drops `GITHUB_TOKEN`, static import test over the gate entry modules.
- Journey `probeline` (node:test, zero deps, ESM `.mjs`): killed / survived /
  not-reached / unprobeable, then `--promote` refuses the survivor and the
  unreached invariant with blocker `probe-survived` and allows the killed one.

## 7. Acceptance

- The user's tree is byte-identical after every run, including interrupted ones.
- `probeline` verdicts are exactly killed / survived / not-reached / unprobeable;
  `--promote` and the policy delta refuse only fresh survived / not-reached.
- Without an artifact, every existing promotion test passes unchanged.
- No path from the write hook, MCP, ESLint, `action.yml` or `--strict-merge` spawns
  a runner.
