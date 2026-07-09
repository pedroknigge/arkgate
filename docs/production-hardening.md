# Production Hardening

The optional runtime kernel is imported from **`arkgate/runtime`** (preferred). See
[package-surface.md](package-surface.md).

Ark's built-in stores are intentionally in-memory defaults. They are appropriate for tests,
local development, examples, and single-process demos. Production systems should provide
stores that match their durability, ordering, retention, and operational requirements.

## In-Memory Defaults

These defaults do not survive process restarts:

- `InMemoryAuditStore`
- `InMemoryOutboxStore`
- `InMemoryReadModelStore`
- `InMemoryWorkflowStore`

Use them only when losing state is acceptable.

## Production Store Checklist

When implementing Ark store interfaces in production, cover these guarantees explicitly:

- Durability: records survive process restarts and deploys.
- Idempotency: repeated writes or dispatch attempts do not corrupt state.
- Ordering: event/outbox ordering is defined where consumers depend on it.
- Concurrency: simultaneous publishers/workers cannot race checkpoints or workflow state.
- Retention: audit and trace records have an explicit retention policy.
- Observability: failed writes and dispatches are visible to operators.
- Migration: schema changes for stored records are versioned.

## Interface Targets

| Concern | Interface |
|---------|-----------|
| Audit records | `AuditStore` |
| Outbox dispatch handoff | `OutboxStore` |
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
