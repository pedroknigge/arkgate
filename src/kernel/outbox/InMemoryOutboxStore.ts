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

export interface InMemoryEventBufferOptions {
  /**
   * Maximum records retained. When exceeded, the oldest settled record
   * (`dispatched` / `failed`) is evicted first; only when every record is still
   * `pending` is the oldest pending record evicted, and `evictedPending` counts
   * it so the loss is visible. Default: unbounded (`Infinity`). Kernels built by
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
  private evictedPendingCount = 0;

  constructor(options: InMemoryEventBufferOptions = {}) {
    const max = options.maxRecords;
    this.maxRecords =
      typeof max === 'number' && !Number.isNaN(max) && max >= 0 ? max : Infinity;
  }

  /** Pending records dropped because the cap was reached with nothing settled to evict. */
  get evictedPending(): number {
    return this.evictedPendingCount;
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
        this.evictedPendingCount += 1;
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

  async list(status?: EventBufferStatus): Promise<EventBufferRecord[]> {
    return Array.from(this.records.values())
      .filter((record) => !status || record.status === status)
      .map(cloneRecord);
  }

  async clear(): Promise<void> {
    this.records.clear();
  }
}

/** @deprecated Use InMemoryEventBuffer. */
export const InMemoryOutboxStore = InMemoryEventBuffer;
