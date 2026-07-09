import type {
  AuditQuery,
  AuditRecord,
  AuditRecordInput,
  AuditStore,
  AuditTrail,
  CreateAuditTrailOptions,
} from './types';

let auditSequence = 0;

function createAuditId(): string {
  auditSequence += 1;
  return `audit-${Date.now()}-${auditSequence}`;
}

function matchesQuery(record: AuditRecord, query: AuditQuery): boolean {
  if (query.type && record.type !== query.type) return false;
  if (query.intent && record.intent !== query.intent) return false;
  if (query.correlationId && record.correlationId !== query.correlationId) return false;
  if (query.subject && record.subject !== query.subject) return false;
  if (query.since && record.timestamp < query.since) return false;
  if (query.until && record.timestamp > query.until) return false;
  return true;
}

/**
 * Reference in-process audit store. **Not production durability** — records do not
 * survive process restarts. For production, inject an `AuditStore` that writes to your
 * durable log/DB (see `docs/production-hardening.md`).
 */
export class InMemoryAuditStore implements AuditStore {
  private readonly records: AuditRecord[] = [];

  constructor(private readonly maxRecords?: number) {}

  append(record: AuditRecord): void {
    this.records.push(record);
    if (this.maxRecords !== undefined && this.records.length > this.maxRecords) {
      this.records.splice(0, this.records.length - this.maxRecords);
    }
  }

  query(query: AuditQuery = {}): AuditRecord[] {
    const records = this.records.filter((record) => matchesQuery(record, query));
    return query.limit === undefined ? [...records] : records.slice(-query.limit);
  }

  clear(): void {
    this.records.length = 0;
  }
}

export class AuditTrailImpl implements AuditTrail {
  constructor(private readonly store: AuditStore) {}

  async record(input: AuditRecordInput): Promise<AuditRecord> {
    const record: AuditRecord = {
      id: createAuditId(),
      timestamp: input.timestamp ?? new Date().toISOString(),
      type: input.type,
      source: input.source,
      actor: input.actor,
      intent: input.intent,
      correlationId: input.correlationId,
      causationId: input.causationId,
      subject: input.subject,
      details: input.details,
    };
    await this.store.append(record);
    return record;
  }

  async query(query?: AuditQuery): Promise<AuditRecord[]> {
    return this.store.query(query);
  }

  async clear(): Promise<void> {
    await this.store.clear();
  }
}

/**
 * Create an audit trail. Defaults to `InMemoryAuditStore` (**not** production durability).
 * Pass `options.store` for a durable backend.
 */
export function createAuditTrail(options: CreateAuditTrailOptions = {}): AuditTrail {
  return new AuditTrailImpl(
    options.store ?? new InMemoryAuditStore(options.maxRecords)
  );
}
