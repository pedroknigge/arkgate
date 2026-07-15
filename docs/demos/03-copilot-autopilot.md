# Demo: the co-pilot autopilot, end to end

Take a project from "no guardrails" to "governed, cleaned up, and enforced" — the way a
non-developer would, driving an agent. This is the Phase F→G→H→I flow (plan · guided setup ·
loop · autopilot) in one sitting.

## In one line

`npx ark start` previews the setup and plan; `npx ark start --apply` applies exactly that preview.
Then **`/ark-autopilot`** (in your agent) carries the remediation plan out — applying the safe
fixes and proposing the rest, always validated by `ark-check`.

## Prerequisites

- Ark built or installed from this repository
- An agent CLI (Claude, Cursor, Codex, Grok, …) for the `/ark-autopilot` and `/ark-loop` steps

## Steps

### 1. Guided setup (no architecture knowledge needed)

```bash
TMP=$(mktemp -d); cd "$TMP"
git init -q                        # the loop works in a discardable worktree
npm init -y >/dev/null
npx ark start --yes          # read-only preview
npx ark start --yes --apply  # apply the preview after review
```

Ark describes the project's shape in plain language and previews `ark.config.json` + agent/CI
gates, projected coverage, exact file hashes, follow-up commands, and host guarantees. `--apply`
writes that exact preview. After apply, `ark-check --plan` classifies fixes as _safe to auto-apply_
or _need your decision_, while doctor reports **suggest**, **adapt**, or **enforce**.

On Nest/Next/express/library projects, init also merges framework filename conventions into
the layer globs so day-one **governed%** is real (not a false-green empty contract).

### 2. See the plan yourself (optional)

```bash
npx ark-check --plan            # human view (includes Governed: N%; pattern bets when design-weak)
npx ark-check --plan --json     # { ok, plan: { goal, counts, steps, patternBets?, designSmells? } }
npx ark-check --doctor --json   # designFitness / designSmells when residual is design-weak
```

Each **A** step is tagged `mechanical-safe` / `judgment` / `deferred` with a `confidence`,
`rationale`, and often `remediationKind`. Auto-safe kinds: type-only type move, pure-type **file**
relocate, `import type` of pure-type modules, and named type-export imports from mixed modules
(`import-type-of-type-exports`). `goal.met` is true only when
there are no active violations **and** governed coverage is meaningful — so a clean plan that
checks almost nothing is not "done."

When edges are clean but design residual remains, JSON also sets `goal.designWeak` and
`patternBets[]` (each with `neverMechanicalSafe: true`). Those are **B** (Shape) bets — not
auto-applied. Extraction cards: [brownfield-adoption.md](../brownfield-adoption.md) §6.

### 3. Carry the plan out — the autopilot

In your agent, run:

```
/ark-autopilot
```

It runs the whole flow (newbie tier): **explore first** (map + dual plan), hands off to
`/ark-loop` for plan **A** `mechanical-safe` steps one at a time — **validating each with
`ark-check` and rolling back any regression** — proposes each A `judgment` and each B
pattern/Shape bet for a yes/no, and reports what was auto-applied vs proposed vs deferred.
Nothing lands until you review the diff. Empty A with open B is **not** “architecture healthy
finished.”

Expert entry: skip the autopilot and use the pieces — `ark init` / `/ark-contract` to shape the
contract, `ark-check --plan` for the work, `/ark-fix` for targeted fixes, `ark-check
--strict-config` as the gate. Same contract, same gates; same suggest/adapt/enforce modes.

### 4. It stays clean

The gates installed in step 1 keep checking the architecture from now on. A supported, trusted
Claude/Grok PreToolUse hook can block covered writes; MCP calls remain advisory, and a required CI
status is the final cross-host merge boundary. Verify:

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
