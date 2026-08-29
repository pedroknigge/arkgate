# ADR 0030: Opt-in extras live in the `arkgate` package

- **Status:** Accepted (`OR01` amendment)
- **Date:** 2026-08-29
- **Owner:** product (Pedro) + ArkGate maintainers
- **Decision scope:** npm identity of ArkRun and ArkOrder — one install, opt-in
  subpaths ([plan](../plans/arkorder/README.md))
- **Supersedes (npm identity only):** [ADR 0004](0004-runtime-package-isolation.md)
  independent `@arkgate/runtime` publish; [ADR 0021](0021-arkrun-companion-isolation.md) D1
  import path; [ADR 0028](0028-arkorder-companion-isolation.md) D1 `@arkgate/order` package
- **Does not supersede:** ADR 0004 durability contract; root export stays gate-only;
  no process singleton; extras silent when absent; ArkOrder does not replace ArkRun

## Context

Consumers should not join a second npm scope or run a second `npm install` to turn on
an extra. `@arkgate/runtime` (and a hypothetical `@arkgate/order`) made Ark look like
an organization of packages. Product intent is one library: **`arkgate`**. Opt-in is
config + import path, not a second tarball.

AR04 removed `arkgate/runtime` / `arkgate/nestjs` *forwarders* so the gate would not
pretend to re-export a companion. The mistake was treating “no shim” as “must be a
different package.” The extra should *be* the subpath of `arkgate`.

## Decisions

### D1 — One npm package: `arkgate`

Publish **`arkgate`**. Do not publish `@arkgate/order`. Do not require
`@arkgate/runtime` as the consumer install for new work.

```text
npm install arkgate
import { createAICodeGate } from 'arkgate'              // gate (always)
import { createStrictArkKernel } from 'arkgate/runtime' // ArkRun extra
import { createOrderPlane } from 'arkgate/order'        // ArkOrder extra
```

### D2 — Opt-in is the subpath + the config extra, not a download

Absence of `arkRun` / `arkOrder` in `ark.config.json` stays byte-for-byte silent.
Importing `arkgate/order` without the extra is a source fact; the gate extra still
defaults off. Enforced extra does **not** nextAction `npm i @arkgate/…`. It nextActions
“call `createOrderPlane` from `arkgate/order` in `planeRoots`.”

### D3 — Root export stays the gate

`import from 'arkgate'` must not grow `createStrictArkKernel` or `createOrderPlane`.
Isolation smoke proves:

- `.` exports the gate
- `./runtime` exports the kernel (when that surface ships in this tarball)
- `./order` exports the plane
- `.` does not export the other two factories

Tarball size may grow. That is accepted. Opt-in is not “don’t download the extra.”

### D4 — ArkOrder never gets a second package

`OR02` compiles `src/kernel/order/` into `dist/order` of **this** package and adds
`exports["./order"]`. There is no `packages/order` publishable workspace.

### D5 — ArkRun packaging is a correction, shipped in 4.8.0

[ADR 0031](0031-one-package-extras-deprecate-companion.md) restores `arkgate/runtime`
and `arkgate/nestjs` as **real** subpaths of package `arkgate`. `@arkgate/runtime` is
deprecated. Durability honesty stays: in-memory stores/planes are not Postgres.
Experimental labels the **surface**, not a second package.

## Consequences

- Sensors match specifiers `arkgate/order` and `arkgate/runtime`. Scoped `@arkgate/*`
  specifiers are compatibility or residual, not the taught import.
- Product voice: “optional extra of ArkGate,” not “install the ArkGate org package.”
- ADR 0004’s restart/fault matrix still blocks a production-durability claim.

## Alternatives considered

| Option | Why not |
|--------|---------|
| Keep `@arkgate/order` as 0.x companion | Second org, second install; same mistake as Run |
| Unscoped second package `arkorder` | Still a second install; not “the same library” |
| Put factories on `import from 'arkgate'` | Collapses opt-in; isolation smoke fails; Domain imports get easier to get wrong |
| Thin `arkgate/order` re-export of `@arkgate/order` | AR04 already rejected shims; consumers still install two packages |

## Related

- ArkOrder extra: [ADR 0027](0027-arkorder-gated-extra-plane.md)
- ArkOrder plane: [ADR 0028](0028-arkorder-companion-isolation.md)
- ArkRun extra (unchanged silence): [ADR 0020](0020-arkrun-gated-extra-plane.md)
