# ADR 0004 — isolate the experimental runtime from ArkGate

- Status: accepted (npm identity **partially superseded** by [ADR 0030](0030-opt-in-extras-same-npm-package.md))
- Date: 2026-07-11
- **Clarified by:** [ADR 0021](0021-arkrun-companion-isolation.md) — ArkRun extra vs kernel
  labels; no process singleton
- **Npm identity:** [ADR 0030](0030-opt-in-extras-same-npm-package.md) — extras are
  subpaths of `arkgate`, not a second `@arkgate/*` package. Durability contract below
  is **not** superseded. Root `import from 'arkgate'` stays gate-only.

## Decision

`arkgate` remains the stable gate product and the **only** npm package consumers install
for extras. The optional runtime and NestJS adapter are opt-in **subpaths**
(`arkgate/runtime`, `arkgate/nestjs`), not a second npm scope. They stay experimental
until restart/fault matrices prove durability contracts.

The root `arkgate` export is the gate API and ESLint adapter only — not kernel factories.
AR04 removed *forwarders* to a companion package. The target is a **real** subpath in
the same tarball, not `npm i @arkgate/runtime`. Restoring that for ArkRun is a queue
item; Order never ships as `@arkgate/order`. ADR [0021](0021-arkrun-companion-isolation.md)
still clarifies brand, factory, and no process singleton.

The existing in-memory “outbox” is not a transactional outbox. Its preferred public name becomes
`InMemoryEventBuffer`; the old symbols remain deprecated aliases during the experimental window.

## Required durability contract

No production-ready claim is allowed until implementations define and test all of:

- atomic application-state and message persistence;
- optimistic workflow versioning and conflict behavior;
- dispatcher leases, expiry, and safe takeover;
- idempotency keys and repeated-delivery semantics;
- crash/restart recovery at every effect and checkpoint boundary.

Until then, all included stores are process-local references that lose state on restart.
