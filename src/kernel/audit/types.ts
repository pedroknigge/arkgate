export type MaybePromise<T> = T | Promise<T>;

export type AuditRecordType =
  | 'event.published'
  | 'event.rawPublish'
  | 'event.intercepted'
  | 'interceptor.error'
  | 'policy.softViolation'
  | 'policy.hardViolation'
  | 'layer.observedViolation'
  | 'handler.error'
  | 'hook.error'
  | 'workflow.started'
  | 'workflow.step.completed'
  | 'workflow.step.failed'
  | 'workflow.compensation.completed'
  | 'workflow.completed'
  | 'workflow.failed'
  | 'projection.applied'
  | 'metadata.changed';

export interface AuditRecord {
  id: string;
  type: AuditRecordType;
  timestamp: string;
  source?: string;
  actor?: string;
  intent?: string;
  correlationId?: string;
  causationId?: string;
  subject?: string;
  details?: unknown;
}

export interface AuditRecordInput {
  type: AuditRecordType;
  timestamp?: string;
  source?: string;
  actor?: string;
  intent?: string;
  correlationId?: string;
  causationId?: string;
  subject?: string;
  details?: unknown;
}

export interface AuditQuery {
  type?: AuditRecordType;
  intent?: string;
  correlationId?: string;
  subject?: string;
  since?: string;
  until?: string;
  limit?: number;
}

/**
 * Pluggable persistence for audit records.
 *
 * **Durability stance (R9):** Default is `InMemoryAuditStore` — reference only, not
 * production durability (lost on restart). Implement this interface for durable audit.
 * See `docs/production-hardening.md`.
 */
export interface AuditStore {
  append(record: AuditRecord): MaybePromise<void>;
  query(query?: AuditQuery): MaybePromise<AuditRecord[]>;
  clear(): MaybePromise<void>;
}

/**
 * High-level audit API used by the event bus / kernel.
 * Durability is that of the injected `AuditStore` (default in-memory).
 */
export interface AuditTrail {
  record(input: AuditRecordInput): Promise<AuditRecord>;
  query(query?: AuditQuery): Promise<AuditRecord[]>;
  clear(): Promise<void>;
}

export interface CreateAuditTrailOptions {
  /** Durable store when provided; otherwise `InMemoryAuditStore` (not production durability). */
  store?: AuditStore;
  maxRecords?: number;
}
