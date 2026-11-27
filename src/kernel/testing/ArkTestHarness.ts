import type { ArkKernel } from '../runtime';
import type { ArkRunComponentFactory } from '../runtime/componentRegistry';
import type { ArkTestHarness, ArkTestSnapshot } from './types';
import type { AuditQuery, AuditRecord } from '../audit';
import type { DomainEvent } from '../../domain/types';
import type { OutboxRecord, OutboxStatus } from '../outbox';
import type { TraceRecord, TraceRecordType } from '../event-bus';

export function createArkTestHarness(kernel: ArkKernel): ArkTestHarness {
  return {
    events(intent?: string): DomainEvent[] {
      return kernel.eventBus
        .getHistory()
        .map((record) => record.event)
        .filter((event) => !intent || event.intent === intent);
    },

    traces(type?: TraceRecordType): TraceRecord[] {
      return kernel.eventBus
        .getTrace()
        .filter((record) => !type || record.type === type);
    },

    audit(query?: AuditQuery): Promise<AuditRecord[]> {
      return kernel.auditTrail.query(query);
    },

    outbox(status?: OutboxStatus): Promise<OutboxRecord[]> {
      return kernel.outbox.list(status);
    },

    observability() {
      kernel.syncGraph();
      return kernel.observability.report();
    },

    async snapshot(): Promise<ArkTestSnapshot> {
      return {
        events: this.events(),
        traces: this.traces(),
        audit: await this.audit(),
        outbox: await this.outbox(),
        observability: this.observability(),
      };
    },

    async clear(): Promise<void> {
      kernel.eventBus.clearHistory();
      kernel.eventBus.clearTrace();
      await kernel.auditTrail.clear();
      await kernel.outbox.clear();
    },

    override<T, Input = unknown>(
      id: string,
      factory: ArkRunComponentFactory<T, Input>
    ): void {
      kernel.replaceForTest(id, factory);
    },
  };
}
