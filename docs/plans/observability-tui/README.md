# Observability TUI Dashboard

**Status:** `OD01`–`OD04` shipped in 4.8.8; published on npm `latest`
**Phase:** `OD` (Observability Dashboard)

## Purpose
ArkRun exposes inspector JSON for runtime declarations, drift, workflows, outbox,
and store durability. The 4.8.8 tree adds a terminal view without moving presentation
into the kernel.

Use `ark-dashboard` / `arkgate-dashboard`, or the `ark dashboard` / `arkgate dashboard`
dispatcher, against the loopback inspector. The dashboard is a developer view, not a
gate verdict and not a production-durability claim.

## Value

- Memory-backed outbox, audit, and workflow stores are shown as memory, never durable.
- Declared-versus-observed drift is visible without becoming a second verdict.
- `GET /outbox` and `GET /workflows` expose full counts plus sanitized samples,
  capped at 32 with payloads omitted.
- Missing monitor ports say unavailable. The inspector still binds loopback only and
  refuses `NODE_ENV=production`.

## Delivered queue

- `OD01` **done:** ANSI polling TUI and dual package bins.
- `OD02` **done:** hardening panel from explicit inspector durability facts.
- `OD03` **done:** drift radar from inspector observability facts.
- `OD04` **done:** bounded outbox and workflow monitors plus main-CLI dispatcher.

## Excluded (What we will NOT build)
- We will not couple `src/kernel/` to the terminal UI. The TUI lives exclusively in `bin/` or `src/cli/`.
- We will not build a web dashboard (HTML/React). This is strictly a developer CLI experience.
- We will not implement real DB stores to "fix" the warnings. The user must still write those adapters themselves.
- Publication was verified directly against npm `latest`; the package reports `arkgate@4.8.8`.
