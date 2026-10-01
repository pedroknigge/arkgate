# ADR 0039: Invariant mutation probe (owner-invoked, outside the gate path)

- **Status:** Accepted (`IP01`)
- **Date:** 2026-09-30
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Phase IP / IP01 — an opt-in command that mutates the
  symbol an invariant declares, runs only the covering tests in a temporary
  copy, and records per-invariant evidence that can only take promotability
  away ([plan](../plans/invariant-mutation-probe/README.md))
- **Refines:** [ADR 0014](0014-arkrules-invariant-catalog.md) D3 (promotion
  gains one more refusal) and [ADR 0016](0016-arkrules-no-executable-core.md)
  ("no arbitrary user code execution in the gate path"), **narrowly**: the
  probe executes the project's own tests, **outside** the gate path, only when
  the owner invokes it. Nothing in the gate path executes anything
- **Does not amend:** ADR 0014 D1 (invariants stay data) and D2 (coverage
  evidence order); ADR 0026 waist (the probe is not a fact and never enters the
  verdict); ADR 0015 / 0036 (no new skill name); no `schemaVersion` bump; no
  `ark.config.json` key. Does **not** close `Z09` / `RB-11` / `K01`

## Context

An invariant counts as covered when a `describe` / `it` title names its id, or
when `coverage.symbol` is declared in a non-test file (ADR 0014 D2). The
coverage message says so plainly: "ArkGate matches declared text; it never
executes tests." A title can name the rule while its body never exercises it,
and promotion from `advisory` to `enforced` (`canPromoteInvariant`) trusts that
text.

The only way to learn whether the covering tests actually pin the rule is to
break the rule and see whether a test fails. That is mutation testing, and it
executes code. ADR 0016 keeps code execution out of the gate path; the probe
needs a decision that keeps it there while still letting its evidence reach
the one place it matters: the promotion judge.

The brief said "each enforced invariant". `canPromoteInvariant` guards the
step from advisory to enforced, so the probe must also target **advisory**
invariants with a `coverage.symbol` — those are the ones about to be promoted.
On an already-enforced invariant the result is a health note only.

## Decisions

### D1 — Owner-invoked execution, outside the gate path

`arkgate-check --probe-invariants[=<id>]` is the only entry point. Invoking it
is the approval. The trust model is the same as `npm test`: it runs the
project's own tests with the project's own runner. It never runs from the
write hook, MCP, ESLint, `action.yml`, `--strict-merge`, `--changed`,
`--local`, `--update-baseline` or `--doctor`; the flag parser refuses those
combinations, and a static test pins that none of those entry modules can
reach the runner through their imports.

### D2 — The artifact can only subtract promotability

The committed artifact `.ark/invariant-probe.json` is evidence, never a
permission. A **fresh** `survived` or `not-reached` row refuses promotion.
`killed`, stale, absent, `inconclusive`, `unprobeable` or malformed evidence
changes nothing compared with today. Forging `killed` gains nothing (promotion
already allowed it); forging `survived` only blocks the forger's own
promotion. The probe is never required for promotion.

### D3 — Rows are bound to content hashes

Every row records SHA-256 hashes of the symbol file and of each covering test,
the invariant identity (`id` + `coverage`, **excluding `mode`**, so promoting
the rule does not make its own evidence stale), and the operator-set version
(`ip-ops@1`). When any of them changes, the row is stale: it is ignored and
named as stale.

### D4 — Wiring checks before any semantic mutant

Each target runs, in order:

1. **Baseline** — the covering tests must pass unmodified. Red or timeout →
   `inconclusive`.
2. **Load canary** — `throw new Error('ARK_PROBE_LOAD')` at the top of the
   symbol file must fail a test. If it does not, the runner never loads that
   copy (for example a workspace package reached through `node_modules`) →
   `inconclusive` (`file-not-loaded`), never a false `survived`.
3. **Reach canary** — `throw new Error('ARK_PROBE_REACH')` as the first
   statement of the symbol (or its initializer, for a `const`) must fail a
   test. If it does not, the tests load the file but never call the symbol →
   `not-reached`.

Only then do semantic mutants run.

### D5 — Closed operators, at most three mutants, deterministic

Operator set `ip-ops@1`, in priority order:

| Operator | Edit |
|----------|------|
| `negate-guard` | `if (c)` → `if (!(c))` where the then-branch throws or returns |
| `drop-throw` | `throw e;` → `;` |
| `flip-comparison` | `<`↔`>=`, `>`↔`<=`, `===`↔`!==`, `==`↔`!=` |
| `boundary-shift` | `<`↔`<=`, `>`↔`>=` |
| `const-shift` | numeric literal `n` → `n + 1`; `true`↔`false` |

The first site per operator, in priority order, up to three mutants. A
mutant that does not parse is `invalid` and never runs. Verdicts:

| Evidence | Verdict |
|----------|---------|
| baseline not green | `inconclusive` |
| load canary survived | `inconclusive` (`file-not-loaded`) |
| reach canary survived | `not-reached` |
| any semantic mutant survived | `survived` |
| every mutant killed or timed out | `killed` |
| a mutant hit a runner error, none survived | `inconclusive` |
| no valid mutant | `unprobeable` (`no-site`) |

Targets that cannot be probed at all are `unprobeable` with a reason:
`no-symbol`, `declaration-only` (`type` / `interface` / `enum` / `class`),
`symbol-not-found`, `no-covering-test` ("a declaration is not a test").

### D6 — Report by default, `--write` to persist

The command reports by default. `--write` persists
`.ark/invariant-probe.json` (the house convention from `--path-drift`). The
refusal reaches CI only when the artifact is committed, and the docs say so.

### D7 — No config

No config key. The flags are `--probe-invariants[=<id>]`, `--write`, `--json`
and `--runner vitest|jest|node`. `--runner` only resolves an ambiguous
detection; it never adds a runner the project does not have.

## Safety

- One temporary copy per run, under the OS temp directory, marked with
  `.arkgate-probe-owner`. The copy leaves out `node_modules`, `.git`, build
  output and caches; `node_modules` in the copy is a real directory of links
  to the project's top-level entries, so runner caches land in the copy.
- Mutants are applied **in the copy** and restored there. The user's tree is
  byte-identical after every run, including interrupted ones (tested).
- Cleanup in `finally` and on `SIGINT` / `SIGTERM`. The next run removes stale
  `arkgate-probe-*` directories older than 24 hours **only** when they carry
  the owner marker.
- The runner binary is resolved from the project and spawned with
  `process.execPath`, an argv array and no shell. Timeouts kill the whole
  process group. The environment is an allowlist: no tokens or cloud
  credentials, proxies pointed at a dead port, `HOME` and `TMPDIR` inside the
  copy. **This is best effort, not a sandbox**, and the docs say so.
- Caps: 20 000 files and 256 MiB per copy (`PROBE_TREE_TOO_LARGE` otherwise),
  25 targets per run, 8 covering tests per target, 3 mutants per target.

## Names this ADR requires (and forbids)

Required: flag `--probe-invariants`, artifact `.ark/invariant-probe.json`,
schema `schemas/ark.invariant-probe.schema.json` (package export
`./schema/invariant-probe`), optional field `probe` on the coverage evidence,
promotion blocker `probe-survived`, catalog id `INVARIANT_PROBE_SURVIVED`
(category `arkrules`, often advisory, a status and inventory line only).
Command refusals (`PROBE_RUNNER_UNKNOWN`, `PROBE_RUNNER_UNSUPPORTED`,
`PROBE_TREE_TOO_LARGE`, `PROBE_NO_TARGETS`) are JSON `reasonCode`s, not
catalog ids — the `--path-drift` precedent.

Forbidden: a mutation score or percentage, whole-repo mutation, running in the
write hook / MCP / ESLint / `action.yml` / `--strict-merge`, making the probe a
requirement for promotion, a config key, a new skill name,
`INVARIANT_PROBE_SURVIVED` in the analysis result or `failsStrict`.

## Consequences

- IP02–IP06 implement these decisions.
- An owner sees, after `--probe-invariants`:
  `INV-REFUND-WINDOW: the tests still pass when the refund guard is negated (src/domain/refunds/refundPolicy.ts:14). The test names the rule but does not pin it. Next: add a case that fails when the window is crossed.`
- `--promote` and the policy delta read the committed artifact through the
  same judge (`canPromoteInvariant`), so both surfaces refuse alike.
- Without an artifact, every promotion behaves exactly as before.

## Alternatives considered

| Option | Why not |
|--------|---------|
| Run mutants inside `ark-check` / CI | ADR 0016: no code execution in the gate path |
| Make a killed probe required for promotion | Turns an owner tool into a gate; absence must stay neutral |
| A mutation score per invariant or per repo | Scores are frozen; "100% mutation" is not a product goal |
| Mutate the user's tree in place and restore | A crash leaves a mutated tree; the copy makes that impossible |
| A config block for operators or caps | Fixed, versioned operator set; caps are constants (ADR 0010 D3 discipline) |
| Stryker as a dependency | A second runner stack and a score-first report; the probe needs three targeted mutants |

## Related

- Invariant coverage and promotion: [ADR 0014](0014-arkrules-invariant-catalog.md)
- No executable core: [ADR 0016](0016-arkrules-no-executable-core.md)
- Waist: [ADR 0026](0026-gate-waist-facts-in-verdict-out.md)
- Covering-test selection reuses the test-importer walk of [ADR 0037](0037-orphan-module-advisory.md)
- Plan: [invariant-mutation-probe](../plans/invariant-mutation-probe/README.md)
