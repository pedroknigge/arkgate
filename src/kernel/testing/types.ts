import type { AuditQuery, AuditRecord } from '../audit';
import type { DomainEvent } from '../../domain/types';
import type { ObservabilityDriftReport } from '../observability';
import type { OutboxRecord, OutboxStatus } from '../outbox';
import type { TraceRecord, TraceRecordType } from '../event-bus';
import type { ArkRunComponentFactory } from '../runtime/componentRegistry';

export interface ArkTestSnapshot {
  events: DomainEvent[];
  traces: TraceRecord[];
  audit: AuditRecord[];
  outbox: OutboxRecord[];
  observability: ObservabilityDriftReport;
}

export interface ArkTestHarness {
  events(intent?: string): DomainEvent[];
  traces(type?: TraceRecordType): TraceRecord[];
  audit(query?: AuditQuery): Promise<AuditRecord[]>;
  outbox(status?: OutboxStatus): Promise<OutboxRecord[]>;
  observability(): ObservabilityDriftReport;
  snapshot(): Promise<ArkTestSnapshot>;
  clear(): Promise<void>;
  override<T, Input = unknown>(
    id: string,
    factory: ArkRunComponentFactory<T, Input>
  ): void;
}
