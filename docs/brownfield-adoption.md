# Brownfield burn-down playbook

Adopting Ark on a large, pre-existing codebase is a different job from a greenfield one: the
goal is not "make the check green" — it's to get the contract to reflect the real
architecture, govern most of the tree, and freeze only genuine debt, then burn it down in
order. This playbook is the sequence that keeps you honest (and is what `/ark-adopt` runs).

The rule underneath all of it: **`ark.config.json` is authoritative.** A green check that
governs 40% of the tree, or a baseline full of false positives, is worse than no gate — it
looks safe. Report the truth, then fix it.

## 1. Config — reflect what exists, propose the rest

```bash
ark-check --init          # detects layer directories; proposes a layer for each ungoverned one
```

`--init` writes layers for the directories it recognizes and **proposes a canonical layer for
every ungoverned directory** (harvested from the 11-layer profile + presets; unrecognized
ones are flagged for you to classify, never guessed). Keep an existing config; don't
regenerate it unasked.

## 2. Diagnose before you freeze

```bash
ark-check --root . --config ark.config.json --json   # read `summary`
ark-check --doctor                                    # or the consolidated health view
```

Read the violation `summary`. The decisive signal is **concentration**: when most violations
are a single layer edge, the *contract* is almost always wrong, not the code. The classic
case is every route "violating" app→kernel because the framework's own entrypoint
(`defineRoute`, a DI container, etc.) is the sanctioned way in — that's hundreds of false
positives, not debt. `--update-baseline` will refuse a lopsided freeze for exactly this
reason. Fix the contract first (step 3).

## 2b. Rules inventory (ArkRules / AR13)

When inter-layer edges are already green but business rules still live as spaghetti
(validation in controllers, magic constants, anemic entities):

```bash
ark-check --rules-inventory --json
# MCP: ark_rules_inventory
```

Output is **honest counts** (inventoried / under-contract / frozen) — never a score. Route
extraction through `/ark-fix` or `/ark-loop` (one pilot card at a time) and declaration
through `/ark-contract` editing `arkrules/<Layer>.json` (ADR 0015 — no new skill names).
Report residual as **`[Layer]`** (import edges / baseline) vs **`[ArkRules]`** (inventory /
structure / invariants). Case study shape:
[arkrules-migration-case-study.md](field/arkrules-migration-case-study.md).

**Upgrade note (4.0):** `ark upgrade --no-install` can refresh skills/gates while leaving
`package.json` on an older pin—doctor exposes `packageVersionTruth` when the CLI is ahead.
Prefer project-local `npx arkgate upgrade …` over bare PATH `ark` — global **2.x** is mutative
and unsafe next to 3.8+/4.0 ([field footgun](releases/4.0.0.md#field-footgun--global-arkgate-2x-on-path)).

## 3. Make the contract real (via `/ark-contract`)

- **Classify the ungoverned tree.** `ark-check --coverage` leads with `Governed: N%` and
  proposes a layer per ungoverned directory. Add the recognized ones; decide the layer for the
  flagged ones. Get `governed` high before trusting any check.
- **Protect the border around a framework, not its internals.** If the concentrated edge
  points into a DI/kernel framework (NestJS, a custom kernel), split the target layer
  into a **public surface** (the entrypoints app code may import — e.g. `kernel/app/**`,
  `kernel/events.ts`) and **internals** (denied). Overlapping globs resolve most-specific-first,
  so the surface wins regardless of layer order. Where app code reaches an internal entrypoint
  it legitimately needs, add a re-export **barrel** in the surface layer and repoint the
  imports to it — behavior-preserving, and the imports are now legal.

Re-run the check; the remainder should now be genuine debt.

## 4. Freeze only the genuine debt

```bash
ark-check --update-baseline    # writes .ark-baseline.json — commit it
```

If Ark still refuses (a single edge dominates), the contract is still wrong — go back to
step 3; don't `--force` past it. From now `ark-check --baseline` fails only on NEW
violations — the ratchet only moves toward zero.

## 5. Burn down, in order

`summary.edges` is the burn-down order. Prefer `ark-check --plan`: it tags each step
`mechanical-safe` / `judgment` / `deferred` and sets `remediationKind` for auto-safe cases.

- **Type-only inversion** (`typeOnly` — plan: `type-only-import-move`): move the type to the
  owning layer + re-export for back-compat. Safe to sweep when mechanical-safe.
- **Pure-type file** (`sourcePureTypeModule` — plan: `pure-type-file-relocate`): whole file is
  type-surface only — relocate the file (or extract types) to the owning layer.
- **Value import of pure type module** (`targetTypeOnlyExports` — plan:
  `import-type-from-pure-type-module`): convert static import to `import type`. Not safe for
  `require()` / dynamic `import()`.
- **Named type exports from mixed modules** (`namedBindingsTypeOnly` — plan:
  `import-type-of-type-exports`): value-syntax `import { Row }` / `export { Row }` where every
  binding is an `export type` / `interface` on the target — convert to `import type` /
  `export type`. Still **judgment** when any binding is a value, dual-space name
  (`export type Foo` + `export const Foo`), the target has top-level side effects (including
  impure value-export initializers like `export const db = connect()`), or the edge is
  `require` / dynamic `import()`.
- **Raw infrastructure access** (value coupling — always **judgment**): relocate data-access
  **verbatim** into a repository/adapter. Same query bytes = same behavior; do NOT rewrite the
  query. If CODEOWNERS reserves the data layer, migrate one route as a pattern and hand bulk
  work over; interleaved transactions aren't a pure relocation — flag them.

`/ark-fix` resolves each cluster at the root cause; fixing a frozen violation shrinks the
baseline permanently. Re-freeze lower with `--update-baseline` as you go.

## 6. Shape residual — extraction cards (judgment assist, P05)

When edges are green (`ark-check --plan` has empty `steps[]`) but doctor reports
**ENFORCE · design-weak** (`designSmells` / `patternBets`), you are in **Shape** work. Plan A
is done; plan **B** is not auto-applicable.

Use one **extraction card** per pilot (I/O relocate, god-module split, domain-out-of-UI).
Agents and humans fill the same fields — never invent a codemod engine or silent apply:

```text
### Extraction card
Pilot: <one directory or feature path>
Smell: <doctor designSmells[].id or agent-detected id>
Move: <what moves, e.g. query bytes verbatim → OrderRepository adapter>
Do not:
  - rewrite queries / touch schema / migrations
  - weaken ark.config.json to silence the smell
  - auto-apply as mechanical-safe or invent new mechanical-safe kinds
  - big-bang the whole monorepo
Success: <falsifiable signal, e.g. 0 routes import @prisma/client>
Kill-switch: <when to stop, e.g. if 2 PRs still confuse ownership → stop layer add>
Next: /ark-fix (one cluster) | /ark-autopilot (user ok on B) | /ark-explore shape-focus
```

CLI sensors:

```bash
ark-check --doctor --json   # designFitness.designWeak + designSmells[].evidence
ark-check --plan --json     # patternBets[] with neverMechanicalSafe: true
```

### Pilot loop (Q04) — one pilot at a time → re-doctor

When doctor/plan report **ENFORCE · design-weak**, JSON also includes **`pilotLoop`**:

| Field | Meaning |
|-------|---------|
| `pilotLoop.active` | `true` when design-weak and at least one pattern bet exists |
| `pilotLoop.nextPilot` | **One** extraction card (same fields as §6) ranked from `patternBets` |
| `pilotLoop.oneAtATime` | Always true — do not multi-pilot batch |
| `pilotLoop.neverMechanicalSafe` | Always true — judgment only; re-doctor is the success sensor |

**Loop:**

1. Read `pilotLoop.nextPilot` (or fill the §6 card by hand).
2. Apply **only** that pilot (bounded path(s) in `evidence` / `pilotTarget`).
3. Re-run `ark-check --doctor --json` (and `--plan --json`).
4. Success on this step = **reduced smell evidence on the pilot paths** (or that smell cleared). Residual outside the pilot may remain — that is honest Shape work, not failure.
5. Pick the next `nextPilot` only after re-doctor; stop on kill-switch.

Do **not** claim “healthy finished” while `designWeak` remains. Do **not** auto-apply pattern bets as mechanical-safe.

Fixture for CI honesty: `tests/fixtures/design-weak-enforce/` (empty plan A + non-empty B + pilotLoop).

### Optional: durable Shape plan (multi-PR)

CLI `patternBets` and extraction cards are enough for a single session. If residual spans
**multiple PRs or agents**, optionally persist one human-readable plan under the repo
(e.g. `docs/plans/shape-<pilot>/README.md` or any team path) with:

| Field | Source |
|-------|--------|
| Phase | Align / Stabilize / **Shape** |
| Golden vs legacy patterns | explore concurrent-patterns table |
| Smell ids / patternBets | `ark-check --doctor --json` / `--plan --json` |
| Extraction cards | §6 template above |
| Status of pilot | e.g. dual path (legacy + new) → real (only golden) when smells clear |

This is **optional narrative**, not a gate. Ark does not require a docs skill or a fixed
folder layout. Prefer one authority plan; promote or archive it when the pilot is real.

## What Ark does NOT do here

Ark reorganizes and governs code — it never touches your data model. Migrating raw SQL to a
repository moves the same query to another file; the schema, migrations, and the database are
untouched. And the burn-down itself is the team's work (or a codemod, or an agent loop) — Ark
diagnoses, orders it, and gives you the pattern; it doesn't auto-run hundreds of edits against
your restricted data layer. **Extraction cards are judgment assists only** — no general codemod
and no silent auto-apply of plan B.
