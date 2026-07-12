# ADR 0004 — isolate the experimental runtime from ArkGate

- Status: accepted
- Date: 2026-07-11

## Decision

`arkgate` remains the stable gate product and npm package. The optional runtime and NestJS adapter
ship independently as `@arkgate/runtime`, versioned below 1.0 and published only under the
`experimental` dist-tag until restart/fault matrices prove its durability contracts.

The main `arkgate` build contains only the importable gate API and ESLint adapter. Deprecated
`arkgate/runtime` and `arkgate/nestjs` subpaths are forwarding shims: they require an explicit
installation of `@arkgate/runtime`, add no runtime implementation to the gate tarball, and will be
removed in ArkGate 4. Root runtime re-exports are removed at the ArkGate 3 boundary.

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
