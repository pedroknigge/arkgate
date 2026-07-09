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

## 3. Make the contract real (via `/ark-contract`)

- **Classify the ungoverned tree.** `ark-check --coverage` leads with `Governed: N%` and
  proposes a layer per ungoverned directory. Add the recognized ones; decide the layer for the
  flagged ones. Get `governed` high before trusting any check.
- **Protect the border around a framework, not its internals.** If the concentrated edge
  points into a DI/kernel framework (dcouplr, NestJS, a custom kernel), split the target layer
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

## What Ark does NOT do here

Ark reorganizes and governs code — it never touches your data model. Migrating raw SQL to a
repository moves the same query to another file; the schema, migrations, and the database are
untouched. And the burn-down itself is the team's work (or a codemod, or an agent loop) — Ark
diagnoses, orders it, and gives you the pattern; it doesn't auto-run hundreds of edits against
your restricted data layer.
