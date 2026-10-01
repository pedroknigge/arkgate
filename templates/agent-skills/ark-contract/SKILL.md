---
name: ark-contract
description: Shortcut — edit the rules file or extra rules. Use /ark-adopt or /ark-autopilot.
---

# /ark-contract — Shortcut to adopt / autopilot

**Not a first-class door.** One-release redirect. Writing `ark.config.json` is
**`/ark-adopt`** at session 0 and **`/ark-autopilot`** afterward. Do that job now.
Contener · Guiar · Ordenar — this leftover name is not a star.

## When / not when

| Use this leftover name when… | Prefer instead |
|------------------------------|----------------|
| Layers / include / ArkRules / first extra need an edit | **`/ark-adopt`** (path, first `arkRun` / first `arkOrder`) or **`/ark-autopilot`** (tighten) |
| False-green / concentrated edge | **`/ark-adopt`** — write the honest config |
| One kernel candidate | **`/ark-runtime`** |
| One order-plane candidate | **`/ark-order`** |

## Dual engine (mandatory)

| Engine | Role |
|--------|------|
| **Deterministic** | CLI / MCP / contract sensors — exit codes, plan kinds, coverage numbers, install status |
| **Exploratory** | You open **this** repo's real files and product surface before concluding |

The CLI is a **sensor**, never the whole job. Claiming done without the exploratory bar for this skill is **incomplete**.

## MCP workspace binding (mandatory)

Before any `ark_*` MCP tool, call `ark_identity` with `project.expectedRoot` set to the exact
workspace root. Continue only when `binding.status === "matched"` and `authoritative === true`;
retain `projectIdentity.projectId`, then pass both `expectedRoot` and `expectedProjectId` under
`project` on every later MCP call. If identity is missing, mismatched, unverified, or the root is
uncertain, do not consume MCP analysis: use the workspace-local CLI and report that MCP
restart/retargeting is required. `ark://manifest` never satisfies this preflight.

## Subagent fan-out (optional, host-dependent)

If the host supports **parallel subagents**, fan out read-only scouts; otherwise
**fall back to sequential**. Never weaken the gate.

## Related onboarding

- **Greenfield:** `/ark-adopt` or `ark-check --recommend` / `ark start`.
- **Brownfield:** `/ark-adopt` — match config to reality.

## Steps

1. Path missing or lying → execute **`/ark-adopt`** (including first advisory `arkRun` / first advisory `arkOrder`).
2. Path honest and tightening → execute **`/ark-autopilot`**.
3. One kernel candidate → **`/ark-runtime`**. One order-plane candidate → **`/ark-order`**.

## Promoting an invariant (advisory → enforced)

Promotion goes through one judge. Run `arkgate-check --promote [<id>] --json` first and read
each invariant row's `blocker`:

- `no-coverage-evidence` — no test title or declared symbol, partial scan, outside
  `coverage.coverageRoots`, or no roots declared. Write the evidence or the roots (`/ark-adopt`).
- `probe-survived` — the committed `.ark/invariant-probe.json` shows, for files unchanged
  since the run, that the covering tests still pass with the rule broken (`survived`) or never
  call the symbol (`not-reached`). The fix is a **stronger test**, not more evidence text: add
  the case the line names, then re-run `arkgate-check --probe-invariants=<id> --write` and
  commit the file. Never delete or hand-edit the artifact to get past the refusal.

The probe runs the project's own tests in a temporary copy; ask the owner before you run it.
It is opt-in and not a score: a missing, stale, `killed` or `inconclusive` result changes
nothing. Only then `--promote <id> --apply`.

## Completion contract (skill incomplete if missing)

Skill incomplete if missing any field below.

### Completion
- **Sensor:** commands/tools run
- **Opened:** real paths read (or `n/a` only if pure install/upgrade with no source analysis)
- **Result:** one-line outcome
- **Planes:** one-line split of residual **[Layer]** vs **[ArkRules]** vs **[ArkRun]** vs **[ArkOrder]** (or `n/a` if unused)
- **Compass:** top residual lenses | `n/a`
- **Handoff:** `/ark-adopt` / `/ark-autopilot` / `/ark-order` / `none`
- **Incomplete?** `no` | `yes — <what is missing>`

When `doctor.productHonesty.finished` is `false`, **Incomplete? no** is disallowed. Write `yes — <pilotLoop.extractionCard.move or residual>`.
