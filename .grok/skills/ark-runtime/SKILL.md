---
name: ark-runtime
description: Replace hand-rolled infra with the Ark runtime kernel — event bus, outbox, audit, sagas, projections, policies, NestJS. Finds candidates, wires one, verifies.
arkVersion: 2.0.1
---

# /ark-runtime — Adopt the runtime kernel (opt-in features)

`ark-runtime-kernel` is not just static checking: it ships a runtime kernel
(`createArkKernel`) with an event bus, event contracts, outbox, audit trail,
policy engine, workflow/saga coordination, projections, observability hooks,
and NestJS adapters. This skill migrates hand-rolled versions of those to the
kernel, one feature at a time.

## Steps

1. **Inventory** — grep the codebase for hand-rolled equivalents:
   - event bus / emitter used for domain events (`EventEmitter`, homemade
     pub/sub, ad-hoc handler registries)
   - outbox tables or "save event + publish later" code
   - audit/history logs written manually
   - saga/workflow orchestration (multi-step processes with compensation)
   - read-model/projection builders
   - policy/authorization checks scattered across use cases
   Also check whether `@nestjs/common` is present → the `ark-runtime-kernel/nestjs`
   adapters apply.
2. **Pick ONE target** — the smallest, most self-contained candidate (fewest
   call sites). Migrating everything at once is how adoptions die. List the
   rest as follow-ups in the report.
3. **Migrate** — import from `ark-runtime-kernel` (root export) or
   `ark-runtime-kernel/nestjs`, and read the package's `docs/agent-guide.md`
   (in `node_modules/ark-runtime-kernel/docs/`) for the runtime API before
   writing code. Wire the kernel at the composition root; keep the domain
   ignorant of it (handlers/ports, not kernel imports inside domain code —
   the write gate will enforce this anyway). Note: the kernel bounds in-memory
   history by default (`maxHistorySize` 1000); mention this if the hand-rolled
   version retained everything.
4. **Delete the hand-rolled version** once call sites are moved — the point is
   less code, not a second parallel system. Deleting code is a destructive move:
   confirm with the user before removing the old implementation, and never delete
   something the inventory only *suspects* is dead (a misclassified load-bearing
   emitter must not be removed on a guess).

## Operating rules

- If the inventory finds NO hand-rolled equivalents, say so and stop — do not
  introduce the runtime kernel speculatively. Static enforcement alone is a
  complete, valid use of Ark.
- Keep the migration diff reviewable: one feature per invocation.
- Plain-language reporting: one sentence per concept ("outbox = events are
  saved in the same transaction as your data, then published — so you never
  publish something that didn't commit").

## Related onboarding

- Adopt static gates and application shape **first** (`/ark-architect`, `/ark-adopt`).
- Runtime kernel is optional and separate from enthusiast onboarding.

## Verify and report

Run the project's tests plus `ark-check --root . --config ark.config.json
--strict-config`. Report: what was migrated, lines deleted vs added, remaining
candidates ranked, and any behavior differences (e.g. bounded history).
