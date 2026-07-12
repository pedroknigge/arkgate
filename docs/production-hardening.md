# Production Hardening

The optional runtime kernel is currently **experimental**. This page is a requirements checklist
for teams evaluating **`@arkgate/runtime`**, not a claim that the runtime is production-ready.
Static ArkGate adoption does not require it. See [package-surface.md](package-surface.md).

## Durability stance (R9)

**ArkGate does not ship production-durable adapters.** Built-in stores are **reference
InMemory-only** — appropriate for tests, local development, examples, and single-process
demos. They lose all state on process restart. Production systems **must** inject their
own implementations of the store interfaces (or accept that data is ephemeral).

Ark's built-in stores are intentionally in-memory defaults. Production systems should provide
stores that match their durability, ordering, retention, and operational requirements.

## In-Memory Defaults (reference only — not production durability)

These defaults do not survive process restarts:

- `InMemoryAuditStore`
- `InMemoryEventBuffer` (`InMemoryOutboxStore` is a deprecated compatibility alias)
- `InMemoryReadModelStore`
- `InMemoryWorkflowStore`

Use them only when losing state is acceptable. JSDoc on `EventBufferStore`, `AuditStore`,
`ReadModelStore`, and `WorkflowStore` restates this stance at the type level.

## Production Store Checklist

When implementing Ark store interfaces in production, cover these guarantees explicitly:

- Durability: records survive process restarts and deploys.
- Idempotency: repeated writes or dispatch attempts do not corrupt state.
- Ordering: event/outbox ordering is defined where consumers depend on it.
- Concurrency: simultaneous publishers/workers cannot race checkpoints or workflow state.
- Retention: audit and trace records have an explicit retention policy.
- Observability: failed writes and dispatches are visible to operators.
- Migration: schema changes for stored records are versioned.

Workflow `timeoutMs` uses cooperative cancellation: ArkGate aborts the `AbortSignal`
passed as the third `execute` argument, but JavaScript cannot stop an operation that
ignores that signal. Production steps must pass it to network/database clients and keep
external effects idempotent; otherwise work may finish after the workflow was marked failed.

### Workflow retry boundary

`RetryPolicy` applies only while `step.execute` is running, including a timeout from that
execution. Once `execute` resolves, ArkGate marks the step completed before saving the
snapshot and recording `workflow.step.completed`. If either post-effect operation fails, the
workflow enters its failure/compensation path; it does not execute the completed step again.

The same fail-closed rule applies when the final `workflow.completed` audit record fails:
completed steps are compensated when handlers exist, and the workflow ends failed. Production
effects and compensations must therefore be idempotent, and audit/snapshot stores must be
operational dependencies rather than best-effort telemetry.

### Required recovery semantics (not implemented by built-ins)

| Contract | Required definition before a production claim |
|----------|-----------------------------------------------|
| Workflow recovery | Persist the last committed step and effect id; restart resumes only from that checkpoint and never assumes an in-flight effect failed or succeeded without reconciliation. |
| Optimistic versioning | Every snapshot write carries the previously read version; conflicting writes fail without overwriting and the caller reloads before retrying. |
| Dispatcher leases | A claim records owner and expiry atomically; only the owner may acknowledge it, and takeover is allowed only after expiry. |
| Idempotent delivery | Every message/effect has a stable idempotency key retained for the full retry window; duplicate attempts return the prior outcome without repeating the effect. |
| Atomic handoff | Application state and dispatch record commit in one transaction. Without this guarantee the API must be called an event buffer, not an outbox. |

The experimental package supplies none of these persistence guarantees. Fault/restart matrices
must cover crashes before and after every transaction, effect, checkpoint, lease, and acknowledgement.

## Interface Targets

| Concern | Interface |
|---------|-----------|
| Audit records | `AuditStore` |
| Non-atomic dispatch buffer | `EventBufferStore` |
| Projection state | `ReadModelStore` |
| Workflow snapshots | `WorkflowStore` |

## Example Shape

```ts
class DurableAuditStore implements AuditStore {
  async append(record: AuditRecord): Promise<void> {
    // Insert into your database with an idempotent key.
  }

  async query(query: AuditQuery = {}): Promise<AuditRecord[]> {
    // Apply query filters and retention-aware ordering.
    return [];
  }

  async clear(): Promise<void> {
    // Usually only enabled in tests or isolated maintenance jobs.
  }
}
```

Ark does not ship a database adapter in core because storage choice is operationally
specific. Keep those adapters in the application or a separate integration package.
