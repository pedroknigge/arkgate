# ADR 0036: Skill catalog covers 100% of product capacity

- **Status:** Accepted (`SK216`)
- **Date:** 2026-09-06
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** Issue [#216](https://github.com/pedroknigge/arkgate/issues/216) —
  the shipped skill *set* must exercise Layers + ArkRules + ArkRun + ArkOrder
  and speak Contener · Guiar · Ordenar. Skill count is secondary.
- **Amends:** ACS05 “no new skill names” freeze in
  [agent-contract-surface-4.3](../plans/agent-contract-surface-4.3/README.md).
  The catalog stays **closed in Domain** (`ARK_SKILL_NAMES`). Add a name only
  with a live ROADMAP item.
- **Does not amend:** ADR 0026 waist; write + PR gates; extras-off default.
  Does **not** close `K01` / `Z09`

## Context

ACS05 froze **13** names so packaging could not invent doors. That freeze
blocked the one missing first-class extra door: ArkRun has `/ark-runtime`;
ArkOrder (the killer optional) was “do not invent `/ark-order`” and only
sprinkled on adopt / place / autopilot. Shortcut names (`architect`,
`contract`, `fix`, `loop`, `think`) overlapped first-class doors.

Pedro bar (2026-09-06): cover **capacity**, not count. Retire shortcuts only
if no surface is lost. Route among themselves. Add a door when capacity is
unreachable.

## Decision

1. **First-class doors** (9): adopt, place, explore, autopilot, upgrade,
   runtime, **order**, explain, coverage.
2. **One-release stubs** (5): architect → adopt; contract → adopt / autopilot;
   fix → autopilot; loop → autopilot; think → explore (one decision, 2–3 options).
3. **`/ark-order`** mirrors `/ark-runtime` depth for `arkgate/order` (`planeRoots`,
   `release` / `proposeRelease` / `apply`, `xiKeys`, `ARKORDER_*`, billing gallery).
   Skills never enforce.
4. Remaining first-class doors speak **Contener · Guiar · Ordenar** and name
   the sibling for each job.
5. Standing check: `tests/unit/static-check/skillCatalogCapacity.test.ts`
   plus `npm run check:agent-skills`.

## Consequences

- Catalog count is **14** this release (9 first-class + 5 stubs). Stubs may
  drop in a later item when old docs have moved.
- Generate / check still require 1:1 flat templates ↔ Agent Skills layout.
- Host projections and dogfood links follow `ARK_SKILL_NAMES`.
- Do not invent `/ark-run`. Do not force extras on. Do not weaken write + PR gates.
