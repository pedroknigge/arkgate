import type { DomainEvent } from '../../domain/types';
import type { EventBufferRecord, EventBufferStatus, EventBufferStore } from './types';
import { nextRuntimeId } from '../runtimeIds';

function nextOutboxId(): string {
  return nextRuntimeId('outbox');
}

function cloneRecord(record: EventBufferRecord): EventBufferRecord {
  return {
    ...record,
    event: {
      ...record.event,
      metadata: { ...record.event.metadata },
    },
  };
}

/** Evicted-while-pending ids remembered so a late settle can un-count them. */
const EVICTED_PENDING_TRACK_LIMIT = 10_000;

export interface InMemoryEventBufferOptions {
  /**
   * Maximum records retained. When exceeded, the oldest settled record
   * (`dispatched` / `failed`) is evicted first; only when every record is still
   * `pending` is the oldest pending record evicted, and `evictedPending` counts
   * it so the loss is visible. A record evicted while still in flight that is
   * settled afterwards (`markDispatched` / `markFailed`) was delivered, not lost,
   * so it leaves the count. Default: unbounded (`Infinity`). Kernels built by
   * `createArkKernel` pass `maxHistorySize` (default 1000).
   */
  maxRecords?: number;
}

/**
 * Reference in-process event buffer. **Not production durability** — state is lost on
 * process exit. Use only for tests/demos/local single-process work; inject a durable
 * store for production. This is not an atomic outbox (see `docs/production-hardening.md`).
 */
export class InMemoryEventBuffer implements EventBufferStore {
  private readonly records = new Map<string, EventBufferRecord>();
  private readonly maxRecords: number;
  /**
   * Ids evicted while `pending`, oldest first. A later settle removes the id (the
   * record was in flight, not lost). Bounded to {@link EVICTED_PENDING_TRACK_LIMIT}
   * ids so the tracker itself cannot grow without limit; ids that fall off stay counted.
   */
  private readonly evictedPendingIds = new Set<string>();
  private evictedPendingCount = 0;

  constructor(options: InMemoryEventBufferOptions = {}) {
    const max = options.maxRecords;
    this.maxRecords =
      typeof max === 'number' && !Number.isNaN(max) && max >= 0 ? max : Infinity;
  }

  /**
   * Pending records dropped because the cap was reached with nothing settled to
   * evict, and never settled afterwards. Records still in flight when evicted
   * (e.g. fire-and-forget local handlers) leave the count once the kernel
   * settles them.
   */
  get evictedPending(): number {
    return this.evictedPendingCount;
  }

  private trackEvictedPending(id: string): void {
    this.evictedPendingCount += 1;
    this.evictedPendingIds.add(id);
    while (this.evictedPendingIds.size > EVICTED_PENDING_TRACK_LIMIT) {
      const oldest = this.evictedPendingIds.values().next().value as string;
      this.evictedPendingIds.delete(oldest);
    }
  }

  /** A settle for an evicted in-flight record: delivered, so not a loss. */
  private settleEvicted(id: string): void {
    if (this.evictedPendingIds.delete(id)) this.evictedPendingCount -= 1;
  }

  private evictOverflow(): void {
    while (this.records.size > this.maxRecords) {
      let victim: string | undefined;
      for (const [id, record] of this.records) {
        if (record.status !== 'pending') {
          victim = id;
          break;
        }
      }
      if (victim === undefined) {
        victim = this.records.keys().next().value as string;
        this.trackEvictedPending(victim);
      }
      this.records.delete(victim);
    }
  }

  async enqueue(event: DomainEvent): Promise<EventBufferRecord> {
    const now = new Date().toISOString();
    const record: EventBufferRecord = {
      id: nextOutboxId(),
      event,
      status: 'pending',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(record.id, record);
    const result = cloneRecord(record);
    this.evictOverflow();
    return result;
  }

  async markDispatched(id: string): Promise<void> {
    const record = this.records.get(id);
    if (!record) {
      this.settleEvicted(id);
      return;
    }
    record.status = 'dispatched';
    record.updatedAt = new Date().toISOString();
  }

  async markFailed(id: string, error: unknown): Promise<void> {
    const record = this.records.get(id);
    if (!record) {
      // Evicted in flight and then failed: that is a real loss of the record,
      // but it was not silently dropped while pending, so it leaves the count.
      this.settleEvicted(id);
      return;
    }
    record.status = 'failed';
    record.attempts += 1;
    record.error = error instanceof Error ? error.message : String(error);
    record.updatedAt = new Date().toISOString();
  }

  async list(status?: EventBufferStatus): Promise<EventBufferRecord[]> {
    return Array.from(this.records.values())
      .filter((record) => !status || record.status === status)
      .map(cloneRecord);
  }

  async clear(): Promise<void> {
    this.records.clear();
    this.evictedPendingIds.clear();
  }
}

/** @deprecated Use InMemoryEventBuffer. */
export const InMemoryOutboxStore = InMemoryEventBuffer;
