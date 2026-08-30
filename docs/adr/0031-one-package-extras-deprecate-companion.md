# ADR 0031: One `arkgate` package for every extra; deprecate `@arkgate/runtime`

- **Status:** Accepted (`PK01`)
- **Date:** 2026-08-29
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** npm identity for 4.8.0 — Gate, Rules, Run, and Order are
  opt-in surfaces of **one** package
- **Closes:** ROADMAP `PK01`
- **Amends:** [ADR 0004](0004-runtime-package-isolation.md) npm identity (durability
  contract unchanged); [ADR 0021](0021-arkrun-companion-isolation.md) D1 residual
  companion; [ADR 0030](0030-opt-in-extras-same-npm-package.md) D5 “when that item ships”

## Context

4.8.0 ships ArkOrder as `arkgate/order` in the same tarball. ArkRun still lived in
`@arkgate/runtime`, which made the product look like two installs. Product intent:
one library, extras opt-in by **config + import path**.

AR04 removed *forwarders* so the gate would not pretend to re-export a companion.
The correction is a **real** subpath, not a second package.

## Decisions

### D1 — Every extra is a subpath of `arkgate`

```text
npm install arkgate
import { createAICodeGate } from 'arkgate'              // gate (always)
import { createStrictArkKernel } from 'arkgate/runtime' // ArkRun extra
import { ArkModule } from 'arkgate/nestjs'              // Nest adapter extra
import { createOrderPlane } from 'arkgate/order'        // ArkOrder extra
```

Root `import from 'arkgate'` still does **not** export kernel or plane factories.

### D2 — `@arkgate/runtime` is deprecated

The companion remains a 0.x `experimental` package for existing pins. It is
**deprecated**. New work imports `arkgate/runtime`. Sensors still match
`@arkgate/runtime` as compatibility evidence so old trees do not go silent.

Do not nextAction `npm i @arkgate/runtime`. nextAction is “import from
`arkgate/runtime` and call `createStrictArkKernel` in `compositionRoots`.”

### D3 — Experimental means durability, not a second package

In-memory stores and the order plane stay process-local. `K01` / `Z09` stay parked.
The experimental label is **not** “install another npm scope.”

### D4 — Tarball growth is accepted

The `arkgate` tarball includes `dist/runtime` and `dist/nestjs`. Opt-in is the
subpath + config extra, not “don’t download the extra.”

## Consequences

- Isolation smoke: `.` is the gate; `./runtime` has `createStrictArkKernel`;
  `./order` has `createOrderPlane`; `.` exports neither extra factory.
- Docs, skills, catalog, and remediation teach `arkgate/runtime`.
- Publishing `@arkgate/runtime` after 4.8.0 is compatibility-only and should stay
  on the `experimental` dist-tag until it is unpublished.

## Alternatives considered

| Option | Why not |
|--------|---------|
| Keep `@arkgate/runtime` as the taught install | Second org / second install |
| Re-export kernel from `arkgate` root | Hides opt-in; Domain imports get easier to get wrong |
| Thin `arkgate/runtime` shim over the companion | AR04 already rejected shims |
