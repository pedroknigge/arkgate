---
name: ark-runtime
description: Evaluate the experimental Ark runtime kernel against hand-rolled event bus, outbox, audit, saga, projection, policy, or NestJS code. Finds one candidate, wires one, verifies.
---

# /ark-runtime — Evaluate the runtime kernel (experimental opt-in)

The runtime kernel is currently **experimental** and is not required for ArkGate enforcement or
presented as production-ready. Use this skill only when the user explicitly wants to evaluate it.

The separate `@arkgate/runtime` source package contains the experimental runtime kernel
(`createArkKernel`) with an event bus, event contracts, outbox, audit trail,
policy engine, workflow/saga coordination, projections, observability hooks,
and NestJS adapters. The stable `arkgate` package is the architecture gate; it does not bundle
the runtime implementation. This skill migrates hand-rolled versions of those to the kernel,
one feature at a time.

## Dual engine (mandatory)

| Engine | Role |
|--------|------|
| **Deterministic** | CLI / MCP / contract sensors — exit codes, plan kinds, coverage numbers, install status |
| **Exploratory** | You open **this** repo's real files and product surface before concluding |

The CLI is a **sensor**, never the whole job. Claiming done without the exploratory bar for this skill is **incomplete**.


## Subagent fan-out (optional, host-dependent)

If the host supports **parallel subagents** and the task splits cleanly (e.g. multiple
dirs to sample), fan out read-only scouts; otherwise **fall back to sequential**.
Parent merges and still emits the **### Completion** contract. Never parallel-write
the same files or weaken the gate.

## Steps

1. **Inventory** — grep the codebase for hand-rolled equivalents:
   - event bus / emitter used for domain events (`EventEmitter`, homemade
     pub/sub, ad-hoc handler registries)
   - outbox tables or "save event + publish later" code
   - audit/history logs written manually
   - saga/workflow orchestration (multi-step processes with compensation)
   - read-model/projection builders
   - policy/authorization checks scattered across use cases
   Also check whether `@nestjs/common` is present → the `@arkgate/runtime/nestjs`
   adapters apply.
2. **Pick ONE target** — the smallest, most self-contained candidate (fewest
   call sites). Migrating everything at once is how adoptions die. List the
   rest as follow-ups in the report.
3. **Resolve availability** — run `npm view @arkgate/runtime dist-tags --json`. If an
   `experimental` tag exists, install that exact companion. Otherwise continue only from an
   ArkGate source checkout: run `npm run build:runtime` at its root and install its local
   `packages/runtime` folder into the target. Outside a source checkout, stop and report that the
   runtime is unavailable; never fall back to the deprecated root shims as if they contained it.
4. **Migrate** — import from `@arkgate/runtime` or `@arkgate/runtime/nestjs`, and read the
   [runtime package guide](https://github.com/pedroknigge/arkgate/blob/main/packages/runtime/README.md)
   plus the [experimental surface policy](https://github.com/pedroknigge/arkgate/blob/main/docs/package-surface.md#experimental-opt-in-surfaces) before
   writing code. Wire the kernel at the composition root; keep the domain
   ignorant of it (handlers/ports, not kernel imports inside domain code —
   the architecture check enforces this; Claude/Grok hooks can block it earlier). Note: the kernel bounds in-memory
   history by default (`maxHistorySize` 1000); mention this if the hand-rolled
   version retained everything.
5. **Delete the hand-rolled version** once call sites are moved — the point is
   less code, not a second parallel system. Deleting code is a destructive move:
   confirm with the user before removing the old implementation, and never delete
   something the inventory only *suspects* is dead (a misclassified load-bearing
   emitter must not be removed on a guess).

## Critical handoffs

- No static gates yet: **STOP — do not continue this skill as complete.** Run `/ark-architect` or `/ark-adopt` first.
- Runtime companion unavailable from npm and no ArkGate source checkout: **STOP** and report the distribution boundary.
- Inventory finds nothing: stop; do not introduce kernel speculatively.

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

## Completion contract (skill incomplete if missing)

End with **exactly** these headings (markdown `###`):

### Completion
- **Sensor:** commands/tools run
- **Opened:** real paths read (or `n/a` only if pure install/upgrade with no source analysis)
- **Result:** one-line outcome
- **Handoff:** `/ark-…` / CLI / `none`
- **Incomplete?** `no` | `yes — <what is missing>`

If a **STOP** handoff applies and you continued as if done, set **Incomplete?** to `yes`.
**Skill incomplete if missing** any of the bullets above.
