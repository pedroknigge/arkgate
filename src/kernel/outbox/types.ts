import type { DomainEvent } from '../../domain/types';

export type OutboxStatus = 'pending' | 'dispatched' | 'failed';

export interface OutboxRecord {
  id: string;
  event: DomainEvent;
  status: OutboxStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

/**
 * Pluggable outbox for publish handoff.
 *
 * **Durability stance (R9):** ArkGate ships only a reference in-process store
 * (`InMemoryOutboxStore`) for tests, demos, and single-process development — it does
 * not survive process restarts and is **not production durability**. Inject your own
 * `OutboxStore` (DB, queue, etc.) for real systems. See `docs/production-hardening.md`.
 */
export interface OutboxStore {
  enqueue(event: DomainEvent): Promise<OutboxRecord>;
  markDispatched(id: string): Promise<void>;
  markFailed(id: string, error: unknown): Promise<void>;
  list(status?: OutboxStatus): Promise<OutboxRecord[]>;
  clear(): Promise<void>;
}
