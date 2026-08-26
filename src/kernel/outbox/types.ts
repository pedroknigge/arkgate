import type { DomainEvent } from '../../domain/types';

export type EventBufferStatus = 'pending' | 'dispatched' | 'failed';

export interface EventBufferRecord {
  id: string;
  event: DomainEvent;
  status: EventBufferStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
  ownerId?: string;
  expiresAt?: string;
}

/**
 * Pluggable transactional event buffer for publish handoff (Outbox pattern).
 *
 * Provides agnostic primitives (tx parameter, claim leases) to allow production implementations
 * to safely handle concurrency, atomic handoffs, and background processing.
 *
 * **Durability stance (R9):** ArkGate ships only a reference in-process store
 * (`InMemoryEventBuffer`) for tests, demos, and single-process development — it does
 * not survive process restarts and is **not production durability**. Inject your own
 * for a transactional outbox. See `docs/production-hardening.md`.
 */
export interface EventBufferStore {
  enqueue(event: DomainEvent, tx?: unknown): Promise<EventBufferRecord>;
  claim?(workerId: string, timeoutMs: number): Promise<EventBufferRecord | undefined>;
  markDispatched(id: string, tx?: unknown): Promise<void>;
  markFailed(id: string, error: unknown, tx?: unknown): Promise<void>;
  list(status?: EventBufferStatus): Promise<EventBufferRecord[]>;
  clear(): Promise<void>;
}

/** @deprecated Use EventBufferStatus. */
export type OutboxStatus = EventBufferStatus;
/** @deprecated Use EventBufferRecord. */
export type OutboxRecord = EventBufferRecord;
/** @deprecated Use EventBufferStore. */
export type OutboxStore = EventBufferStore;

