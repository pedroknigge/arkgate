# Demo: the co-pilot autopilot, end to end

Take a project from "no guardrails" to "governed, cleaned up, and enforced" — the way a
non-developer would, driving an agent. This is the Phase F→G→H→I flow (plan · guided setup ·
loop · autopilot) in one sitting.

## In one line

`npx ark start` sets it up and shows a plan; **`/ark-autopilot`** (in your agent) carries the
plan out — applying the safe fixes and proposing the rest, always validated by `ark-check`.

## Prerequisites

- Ark built or installed from this repository
- An agent CLI (Claude, Cursor, Codex, …) for the `/ark-autopilot` and `/ark-loop` steps

## Steps

### 1. Guided setup (no architecture knowledge needed)

```bash
TMP=$(mktemp -d); cd "$TMP"
git init -q                        # the loop works in a discardable worktree
npm init -y >/dev/null
npx ark start --yes
```

Ark describes the project's shape in plain language, writes `ark.config.json` + agent/CI gates,
and prints the **plan** — how many fixes are _safe to auto-apply_ vs _need your decision_ —
plus which **operating mode** applies: **suggest**, **adapt**, or **enforce**.

On Nest/Next/express/library projects, init also merges framework filename conventions into
the layer globs so day-one **governed%** is real (not a false-green empty contract).

### 2. See the plan yourself (optional)

```bash
npx ark-check --plan            # human view (includes Governed: N%)
npx ark-check --plan --json     # { ok, plan: { goal, counts, steps } }
```

Each step is tagged `mechanical-safe` / `judgment` / `deferred` with a `confidence` and a
plain-language `rationale`. `goal.met` is true only when there are no active violations **and**
governed coverage is meaningful — so a clean plan that checks almost nothing is not "done."

### 3. Carry the plan out — the autopilot

In your agent, run:

```
/ark-autopilot
```

It runs the whole flow (newbie tier): confirms the plan, hands off to `/ark-loop` to apply the
`mechanical-safe` steps one at a time — **validating each with `ark-check` and rolling back any
regression** — proposes each `judgment` step for a yes/no, loops until `goal.met`, and reports
what was auto-applied vs proposed vs deferred. Nothing lands until you review the diff.

Expert entry: skip the autopilot and use the pieces — `ark init` / `/ark-contract` to shape the
contract, `ark-check --plan` for the work, `/ark-fix` for targeted fixes, `ark-check
--strict-config` as the gate. Same contract, same gates; same suggest/adapt/enforce modes.

### 4. It stays clean

The gates installed in step 1 keep enforcing the architecture from now on — in CI, and at write
time if the MCP hook is wired. Verify:

```bash
npx ark-check --root . --config ark.config.json --strict-config
```

## What this proves

- **plan + goal** (Phase F): `ark-check --plan` classifies the work and defines "done" (with
  governed% honesty).
- **guided setup** (Phase G): `ark start` — no preset or skill name required; modes
  suggest / adapt / enforce.
- **loop** (Phase H): `/ark-loop` — safe, reversible, validated apply.
- **autopilot** (Phase I): `/ark-autopilot` — the whole thing, with newbie/expert entry styles.
- **field honesty** (2.0): framework overlays + no false-green at 0% governed.

The classifier's precision (only provably-safe changes are ever `mechanical-safe`) is guarded
by the classifier corpus test in `tests/unit/static-check/arkCheck.test.ts`.
