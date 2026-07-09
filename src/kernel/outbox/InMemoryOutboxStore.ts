import type { DomainEvent } from '../../domain/types';
import type { OutboxRecord, OutboxStatus, OutboxStore } from './types';

let outboxSequence = 0;

function nextOutboxId(): string {
  outboxSequence += 1;
  return `outbox-${Date.now()}-${outboxSequence}`;
}

function cloneRecord(record: OutboxRecord): OutboxRecord {
  return {
    ...record,
    event: {
      ...record.event,
      metadata: { ...record.event.metadata },
    },
  };
}

/**
 * Reference in-process outbox. **Not production durability** — state is lost on
 * process exit. Use only for tests/demos/local single-process work; inject a durable
 * `OutboxStore` in production (see `docs/production-hardening.md`).
 */
export class InMemoryOutboxStore implements OutboxStore {
  private readonly records = new Map<string, OutboxRecord>();

  async enqueue(event: DomainEvent): Promise<OutboxRecord> {
    const now = new Date().toISOString();
    const record: OutboxRecord = {
      id: nextOutboxId(),
      event,
      status: 'pending',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(record.id, record);
    return cloneRecord(record);
  }

  async markDispatched(id: string): Promise<void> {
    const record = this.records.get(id);
    if (!record) return;
    record.status = 'dispatched';
    record.updatedAt = new Date().toISOString();
  }

  async markFailed(id: string, error: unknown): Promise<void> {
    const record = this.records.get(id);
    if (!record) return;
    record.status = 'failed';
    record.attempts += 1;
    record.error = error instanceof Error ? error.message : String(error);
    record.updatedAt = new Date().toISOString();
  }

  async list(status?: OutboxStatus): Promise<OutboxRecord[]> {
    return Array.from(this.records.values())
      .filter((record) => !status || record.status === status)
      .map(cloneRecord);
  }

  async clear(): Promise<void> {
    this.records.clear();
  }
}
