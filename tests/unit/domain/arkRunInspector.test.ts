import { describe, expect, it } from 'vitest';
import {
  ARK_RUN_INSPECTOR_DEFAULT_HOST,
  ARK_RUN_INSPECTOR_DEFAULT_PORT,
  ARK_RUN_INSPECTOR_MONITOR_SAMPLE_LIMIT,
  ARK_RUN_INSPECTOR_SCHEMA_VERSION,
  ARK_RUN_INSPECTOR_SSE_EVENT,
  ArkRunInspectorBindError,
  ArkRunInspectorProductionError,
  arkRunInspectorUrl,
  buildArkRunInspectorHardening,
  buildArkRunInspectorOutboxMonitor,
  buildArkRunInspectorSnapshot,
  buildArkRunInspectorWorkflowsMonitor,
  classifyArkRunInspectorStoreDurability,
  formatArkRunInspectorSseEvent,
  isArkRunInspectorLoopbackHost,
  isArkRunInspectorProductionEnv,
  resolveArkRunInspectorBind,
} from '../../../src/domain/arkRunInspector';
import { ARK_RUN_TRANSPORT_KINDS } from '../../../src/domain/arkRunTransport';

describe('RN12 ArkRun inspector bind + snapshot (pure)', () => {
  it('defaults to 127.0.0.1 and port 0', () => {
    expect(ARK_RUN_INSPECTOR_DEFAULT_HOST).toBe('127.0.0.1');
    expect(ARK_RUN_INSPECTOR_DEFAULT_PORT).toBe(0);
    expect(resolveArkRunInspectorBind()).toEqual({ host: '127.0.0.1', port: 0 });
    expect(resolveArkRunInspectorBind({ host: 'localhost', port: 4177 })).toEqual({
      host: '127.0.0.1',
      port: 4177,
    });
  });

  it('accepts loopback hosts and rejects public binds', () => {
    expect(isArkRunInspectorLoopbackHost('127.0.0.1')).toBe(true);
    expect(isArkRunInspectorLoopbackHost('127.0.0.2')).toBe(true);
    expect(isArkRunInspectorLoopbackHost('::1')).toBe(true);
    expect(isArkRunInspectorLoopbackHost('localhost')).toBe(true);
    expect(isArkRunInspectorLoopbackHost('0.0.0.0')).toBe(false);
    expect(isArkRunInspectorLoopbackHost('::')).toBe(false);
    expect(isArkRunInspectorLoopbackHost('8.8.8.8')).toBe(false);
    expect(() => resolveArkRunInspectorBind({ host: '0.0.0.0' })).toThrow(
      ArkRunInspectorBindError
    );
    expect(() => resolveArkRunInspectorBind({ host: '::' })).toThrow(ArkRunInspectorBindError);
    expect(() => resolveArkRunInspectorBind({ host: '*' })).toThrow(ArkRunInspectorBindError);
    expect(() => resolveArkRunInspectorBind({ host: '192.168.1.10' })).toThrow(
      ArkRunInspectorBindError
    );
    expect(() => resolveArkRunInspectorBind({ port: 70000 })).toThrow(ArkRunInspectorBindError);
  });

  it('vetoes production from either env slot', () => {
    expect(isArkRunInspectorProductionEnv('production')).toBe(true);
    expect(isArkRunInspectorProductionEnv('test')).toBe(false);
    expect(() => resolveArkRunInspectorBind({ nodeEnv: 'production' })).toThrow(
      ArkRunInspectorProductionError
    );
    expect(() =>
      resolveArkRunInspectorBind({ host: '127.0.0.1', processNodeEnv: 'production' })
    ).toThrow(ArkRunInspectorProductionError);
    expect(() =>
      resolveArkRunInspectorBind({ nodeEnv: 'development', processNodeEnv: 'production' })
    ).toThrow(ArkRunInspectorProductionError);
  });

  it('builds a JSON snapshot without factories and shows transport kinds', () => {
    const factory = () => ({ secret: true });
    const snapshot = buildArkRunInspectorSnapshot({
      kernelInstanceId: 'kernel-rn12',
      host: '127.0.0.1',
      port: 4177,
      package: {
        components: [
          {
            id: 'Application.PlaceOrder',
            uses: ['Domain.OrderRepository'],
            factory,
            instance: { secret: true },
          },
        ],
      },
      observability: { generatedAt: 'stamp', factory },
      ephemeralDefault: true,
      brokerBound: false,
    });

    expect(snapshot.schemaVersion).toBe(ARK_RUN_INSPECTOR_SCHEMA_VERSION);
    expect(snapshot.bind).toEqual({ host: '127.0.0.1', port: 4177, loopback: true });
    expect(snapshot.package.components[0]?.uses).toEqual(['Domain.OrderRepository']);
    expect(JSON.stringify(snapshot)).not.toMatch(/secret/);
    expect(typeof JSON.parse(JSON.stringify(snapshot))).toBe('object');
    expect(snapshot.transport.kinds).toEqual([...ARK_RUN_TRANSPORT_KINDS]);
    expect(snapshot.transport.cloudSdksShipped).toBe(false);
    expect(snapshot.transport.fallback).toBe('in-process-local');
    expect(snapshot.transport.brokerBound).toBe(false);
    expect(snapshot.observability).toEqual({ generatedAt: 'stamp' });
  });

  it('formats SSE snapshot events and loopback URLs', () => {
    const body = { ok: true };
    expect(formatArkRunInspectorSseEvent(body)).toBe(
      `event: ${ARK_RUN_INSPECTOR_SSE_EVENT}\ndata: {"ok":true}\n\n`
    );
    expect(arkRunInspectorUrl('127.0.0.1', 9, '/snapshot')).toBe(
      'http://127.0.0.1:9/snapshot'
    );
    expect(arkRunInspectorUrl('::1', 9, '/events')).toBe('http://[::1]:9/events');
  });
});

describe('PROD-004 outbox/workflows monitors + hardening (pure)', () => {
  it('strips event payloads from outbox monitor samples', () => {
    const monitor = buildArkRunInspectorOutboxMonitor([
      {
        id: 'o-1',
        status: 'pending',
        attempts: 0,
        event: { intent: 'Order.Placed', payload: { secret: 'leak-me' } },
        error: undefined,
      },
      {
        id: 'o-2',
        status: 'failed',
        attempts: 3,
        event: { intent: 'Order.Failed', payload: { card: '4111' } },
        error: 'boom',
      },
      {
        id: 'o-skip',
        status: 'dispatched',
        attempts: 1,
        event: { intent: 'Skip.Me', payload: { x: 1 } },
      },
    ]);

    expect(monitor.available).toBe(true);
    expect(monitor.pendingCount).toBe(1);
    expect(monitor.failedCount).toBe(1);
    expect(monitor.sampleLimit).toBe(ARK_RUN_INSPECTOR_MONITOR_SAMPLE_LIMIT);
    expect(monitor.pending).toEqual([
      { id: 'o-1', status: 'pending', attempts: 0, intent: 'Order.Placed' },
    ]);
    expect(monitor.failed).toEqual([
      { id: 'o-2', status: 'failed', attempts: 3, intent: 'Order.Failed', error: 'boom' },
    ]);
    expect(JSON.stringify(monitor)).not.toMatch(/secret|4111|payload|leak-me/);
  });

  it('caps outbox samples while preserving accurate counts', () => {
    const records = Array.from({ length: 40 }, (_, i) => ({
      id: `p-${i}`,
      status: 'pending' as const,
      attempts: 0,
      event: { intent: `I.${i}`, payload: { n: i } },
    })).concat(
      Array.from({ length: 5 }, (_, i) => ({
        id: `f-${i}`,
        status: 'failed' as const,
        attempts: 1,
        event: { intent: `F.${i}`, payload: { n: i } },
      }))
    );

    const capped = buildArkRunInspectorOutboxMonitor(records, { sampleLimit: 10 });
    expect(capped.pendingCount).toBe(40);
    expect(capped.failedCount).toBe(5);
    expect(capped.pending).toHaveLength(10);
    expect(capped.failed).toHaveLength(5);
    expect(capped.sampleLimit).toBe(10);

    const floored = buildArkRunInspectorOutboxMonitor(records, { sampleLimit: 999 });
    expect(floored.sampleLimit).toBe(ARK_RUN_INSPECTOR_MONITOR_SAMPLE_LIMIT);
    expect(floored.pending).toHaveLength(ARK_RUN_INSPECTOR_MONITOR_SAMPLE_LIMIT);
    expect(floored.pendingCount).toBe(40);
  });

  it('strips workflow payloads and caps the sample array', () => {
    const snapshots = Array.from({ length: 40 }, (_, i) => ({
      id: `w-${i}`,
      workflowName: `Flow.${i}`,
      status: i % 2 === 0 ? 'running' : 'failed',
      currentStep: `step-${i}`,
      payload: { secret: `leak-${i}` },
      context: { card: '4111' },
    }));

    const monitor = buildArkRunInspectorWorkflowsMonitor(snapshots, { sampleLimit: 8 });
    expect(monitor.available).toBe(true);
    expect(monitor.total).toBe(40);
    expect(monitor.runningCount).toBe(20);
    expect(monitor.failedCount).toBe(20);
    expect(monitor.workflows).toHaveLength(8);
    expect(monitor.sampleLimit).toBe(8);
    expect(monitor.workflows[0]).toEqual({
      id: 'w-0',
      name: 'Flow.0',
      status: 'running',
      currentStep: 'step-0',
    });
    expect(JSON.stringify(monitor)).not.toMatch(/secret|4111|payload|context|leak-/);

    const floored = buildArkRunInspectorWorkflowsMonitor(snapshots, { sampleLimit: 100 });
    expect(floored.sampleLimit).toBe(ARK_RUN_INSPECTOR_MONITOR_SAMPLE_LIMIT);
    expect(floored.workflows).toHaveLength(ARK_RUN_INSPECTOR_MONITOR_SAMPLE_LIMIT);
    expect(floored.total).toBe(40);
  });

  it('classifies InMemory* ports as memory and never green-OK for all-memory facts', () => {
    expect(classifyArkRunInspectorStoreDurability('InMemoryEventBuffer', 'outbox')).toEqual({
      role: 'outbox',
      id: 'InMemoryEventBuffer',
      kind: 'memory',
    });
    expect(classifyArkRunInspectorStoreDurability('PostgresOutbox', 'outbox').kind).toBe('durable');

    const hardening = buildArkRunInspectorHardening({
      stores: [
        { role: 'outbox', id: 'InMemoryEventBuffer', kind: 'memory' },
        { role: 'audit', id: 'InMemoryAuditStore', kind: 'memory' },
        { role: 'workflow', id: 'InMemoryWorkflowStore', kind: 'memory' },
      ],
    });
    expect(hardening.durability.stores).toHaveLength(3);
    expect(hardening.durability.stores.every((s) => s.kind === 'memory')).toBe(true);

    // Dashboard green-OK requires zero memory stores (bin/ark-dashboard.mjs renderHardening).
    const memoryStores = hardening.durability.stores.filter((s) => s.kind === 'memory');
    const wouldPrintGreenOk = memoryStores.length === 0 && hardening.durability.stores.length > 0;
    expect(wouldPrintGreenOk).toBe(false);

    const snapshot = buildArkRunInspectorSnapshot({
      kernelInstanceId: 'prod-004',
      hardening,
      package: { components: [] },
    });
    expect(snapshot.package.components).toEqual([]);
    expect(snapshot.hardening.durability.stores.map((s) => s.kind)).toEqual([
      'memory',
      'memory',
      'memory',
    ]);
  });
});
