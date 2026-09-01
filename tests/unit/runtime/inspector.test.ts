import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as gate from '../../../src/gate';
import {
  ARK_RUN_INSPECTOR_DEFAULT_HOST,
  ARK_RUN_INSPECTOR_MONITOR_SAMPLE_LIMIT,
  ARK_RUN_INSPECTOR_SSE_EVENT,
  ArkRunInspectorBindError,
  ArkRunInspectorProductionError,
  createStrictArkKernel,
  startArkRunInspector,
  type ArkRunInspectorHandle,
} from '../../../src/index';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const handles: ArkRunInspectorHandle[] = [];

async function started(options?: Parameters<typeof startArkRunInspector>[1]) {
  const ark = createStrictArkKernel({ instanceId: 'kernel-rn12-http' });
  ark.register({
    id: 'Application.PlaceOrder',
    uses: ['Domain.OrderRepository'],
    factory: () => ({ leaked: true }),
  });
  const handle = await startArkRunInspector(ark, {
    port: 0,
    sseIntervalMs: 0,
    nodeEnv: 'test',
    ...options,
  });
  handles.push(handle);
  return { ark, handle };
}

afterEach(async () => {
  while (handles.length > 0) {
    const handle = handles.pop();
    await handle?.close();
  }
});

describe('RN12 ArkRun inspector HTTP', () => {
  it('keeps the inspector off the stable gate root', () => {
    expect((gate as { startArkRunInspector?: unknown }).startArkRunInspector).toBeUndefined();
    expect((gate as { startInspector?: unknown }).startInspector).toBeUndefined();
    expect(
      (gate as { getInspectorSnapshot?: unknown }).getInspectorSnapshot
    ).toBeUndefined();
  });

  it('does not statically import node:http from the kernel factory', () => {
    const factory = fs.readFileSync(
      path.join(ROOT, 'src/kernel/runtime/createArkKernel.ts'),
      'utf8'
    );
    const facade = fs.readFileSync(path.join(ROOT, 'src/kernel/runtime/inspector.ts'), 'utf8');
    expect(factory).not.toMatch(/node:http/);
    expect(facade).toMatch(/await import\('\.\/inspectorListen\.js'\)/);
    expect(facade).not.toMatch(/from 'node:http'/);
  });

  it('binds 127.0.0.1, serves snapshots, and never leaks factories', async () => {
    const { ark, handle } = await started();
    expect(handle.host).toBe(ARK_RUN_INSPECTOR_DEFAULT_HOST);
    expect(handle.port).toBeGreaterThan(0);
    expect(handle.snapshotUrl).toContain('127.0.0.1');
    expect(handle.graphUrl).toContain('/graph');

    const res = await fetch(handle.snapshotUrl);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      bind: { host: string; loopback: boolean; port: number };
      package: { components: Array<{ id: string; uses: string[] }> };
      transport: { kinds: string[]; cloudSdksShipped: boolean; brokerBound: boolean };
    };
    expect(body.bind.host).toBe('127.0.0.1');
    expect(body.bind.loopback).toBe(true);
    expect(body.bind.port).toBe(handle.port);
    expect(body.package.components[0]?.id).toBe('Application.PlaceOrder');
    expect(body.package.components[0]?.uses).toEqual(['Domain.OrderRepository']);
    expect(JSON.stringify(body)).not.toMatch(/leaked/);
    expect(body.transport.cloudSdksShipped).toBe(false);
    expect(body.transport.brokerBound).toBe(false);
    expect(body.transport.kinds).toEqual(['local', 'localBlocking', 'broker']);
    expect(ark.getInspectorSnapshot({ host: handle.host, port: handle.port }).bind.port).toBe(
      handle.port
    );
  });

  it('serves a process/technical graph slice on /graph', async () => {
    const { handle } = await started();
    const processRes = await fetch(handle.graphUrl);
    expect(processRes.status).toBe(200);
    const processBody = (await processRes.json()) as {
      slice: string;
      mermaid: string;
      edges: Array<{ kind: string }>;
    };
    expect(processBody.slice).toBe('process');
    expect(processBody.mermaid).toContain('flowchart LR');
    expect(JSON.stringify(processBody)).not.toMatch(/leaked/);

    const technicalRes = await fetch(
      `${handle.graphUrl}?slice=technical&nodeIds=Application.PlaceOrder&degreesOfSeparation=1`
    );
    const technicalBody = (await technicalRes.json()) as {
      slice: string;
      nodes: Array<{ id: string }>;
      mermaid: string;
    };
    expect(technicalBody.slice).toBe('technical');
    expect(technicalBody.nodes.map((node) => node.id)).toEqual([
      'Application.PlaceOrder',
      'Domain.OrderRepository',
    ]);
    expect(technicalBody.mermaid).toContain('flowchart TD');

    const bad = await fetch(`${handle.graphUrl}?slice=bus`);
    expect(bad.status).toBe(400);
  });

  it('streams an SSE snapshot event on /events', async () => {
    const { handle } = await started();
    const res = await fetch(handle.eventsUrl);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    const reader = res.body?.getReader();
    expect(reader).toBeDefined();
    const chunk = await reader!.read();
    const text = new TextDecoder().decode(chunk.value);
    expect(text).toContain(`event: ${ARK_RUN_INSPECTOR_SSE_EVENT}`);
    expect(text).toContain('Application.PlaceOrder');
    await reader!.cancel();
  });

  it('refuses NODE_ENV=production without binding', async () => {
    const ark = createStrictArkKernel();
    await expect(startArkRunInspector(ark, { nodeEnv: 'production' })).rejects.toBeInstanceOf(
      ArkRunInspectorProductionError
    );
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(startArkRunInspector(ark, { nodeEnv: 'test' })).rejects.toBeInstanceOf(
        ArkRunInspectorProductionError
      );
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('reports brokerBound without leaking the adapter', async () => {
    const ark = createStrictArkKernel({
      broker: { send() { /* consumer-owned handoff */ } },
    });
    const snapshot = ark.getInspectorSnapshot();
    expect(snapshot.transport.brokerBound).toBe(true);
    expect(snapshot.transport.cloudSdksShipped).toBe(false);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it('rejects public binds before listen', async () => {
    const ark = createStrictArkKernel();
    await expect(startArkRunInspector(ark, { host: '0.0.0.0' })).rejects.toBeInstanceOf(
      ArkRunInspectorBindError
    );
    await expect(startArkRunInspector(ark, { host: '::' })).rejects.toBeInstanceOf(
      ArkRunInspectorBindError
    );
    await expect(ark.startInspector({ host: '8.8.8.8', nodeEnv: 'test' })).rejects.toBeInstanceOf(
      ArkRunInspectorBindError
    );
  });
});

describe('PROD-004 inspector durability + /outbox /workflows routes', () => {
  it('default createStrictArkKernel snapshot.hardening shows memory kinds (false-green impossible)', () => {
    const ark = createStrictArkKernel({ instanceId: 'prod-004-harden' });
    const snapshot = ark.getInspectorSnapshot();
    expect(snapshot.package.components).toEqual([]);
    const stores = snapshot.hardening.durability.stores;
    expect(stores).toHaveLength(3);
    expect(stores.map((s) => s.role).sort()).toEqual(['audit', 'outbox', 'workflow']);
    expect(stores.every((s) => s.kind === 'memory')).toBe(true);
    expect(stores.every((s) => /^InMemory/i.test(s.id))).toBe(true);
    // Same predicate dashboard uses: any memory → never "[OK] Durable Stores Configured".
    const wouldPrintGreenOk =
      stores.filter((s) => s.kind === 'memory').length === 0 && stores.length > 0;
    expect(wouldPrintGreenOk).toBe(false);
  });

  it('GET /outbox happy path returns capped samples without payloads', async () => {
    const { ark, handle } = await started();
    await ark.eventBuffer.enqueue({
      intent: 'Order.Placed',
      payload: { secret: 'do-not-leak' },
      metadata: { source: 'test', occurredAt: new Date().toISOString() },
    } as never);
    const pending = await ark.eventBuffer.list('pending');
    expect(pending.length).toBeGreaterThan(0);
    await ark.eventBuffer.markFailed(pending[0]!.id, new Error('dispatch failed'));

    const res = await fetch(handle.outboxUrl);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      available: boolean;
      pendingCount: number;
      failedCount: number;
      pending: unknown[];
      failed: Array<{ id: string; status: string; error?: string }>;
      sampleLimit: number;
    };
    expect(body.available).toBe(true);
    expect(body.failedCount).toBeGreaterThanOrEqual(1);
    expect(body.sampleLimit).toBe(ARK_RUN_INSPECTOR_MONITOR_SAMPLE_LIMIT);
    expect(body.failed.some((row) => row.status === 'failed')).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/do-not-leak|payload|secret/);
  });

  it('GET /workflows happy path returns available monitor with sampleLimit', async () => {
    const { handle } = await started();
    const res = await fetch(handle.workflowsUrl);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      available: boolean;
      total: number;
      workflows: unknown[];
      sampleLimit: number;
    };
    expect(body.available).toBe(true);
    expect(body.sampleLimit).toBe(ARK_RUN_INSPECTOR_MONITOR_SAMPLE_LIMIT);
    expect(Array.isArray(body.workflows)).toBe(true);
    expect(typeof body.total).toBe('number');
  });

  it('GET /outbox and /workflows return unavailable when ports are missing', async () => {
    const handle = await startArkRunInspector(
      {
        getInspectorSnapshot: () =>
          ({
            schemaVersion: '1.0',
            kernelInstanceId: 'bare',
            bind: { host: '127.0.0.1', port: 0, loopback: true },
            package: {
              schemaVersion: '1.0',
              kernelInstanceId: 'bare',
              components: [],
            },
            transport: {
              kinds: ['local', 'localBlocking', 'broker'],
              ephemeralDefault: true,
              brokerBound: false,
              cloudSdksShipped: false,
              fallback: 'in-process-local',
            },
            observability: {},
            hardening: { durability: { stores: [] } },
          }) as never,
        requestGraph: () => ({ slice: 'process', nodes: [], edges: [], mermaid: '' }) as never,
      },
      { port: 0, sseIntervalMs: 0, nodeEnv: 'test' }
    );
    handles.push(handle);

    const outbox = await fetch(handle.outboxUrl);
    expect(outbox.status).toBe(200);
    expect(await outbox.json()).toMatchObject({
      available: false,
      pendingCount: 0,
      failedCount: 0,
      pending: [],
      failed: [],
      sampleLimit: ARK_RUN_INSPECTOR_MONITOR_SAMPLE_LIMIT,
    });

    const workflows = await fetch(handle.workflowsUrl);
    expect(workflows.status).toBe(200);
    expect(await workflows.json()).toMatchObject({
      available: false,
      total: 0,
      workflows: [],
      sampleLimit: ARK_RUN_INSPECTOR_MONITOR_SAMPLE_LIMIT,
    });
  });

  it('GET /outbox and /workflows return 500 when list helpers throw', async () => {
    const handle = await startArkRunInspector(
      {
        getInspectorSnapshot: () =>
          ({
            schemaVersion: '1.0',
            kernelInstanceId: 'boom',
            bind: { host: '127.0.0.1', port: 0, loopback: true },
            package: {
              schemaVersion: '1.0',
              kernelInstanceId: 'boom',
              components: [],
            },
            transport: {
              kinds: ['local', 'localBlocking', 'broker'],
              ephemeralDefault: true,
              brokerBound: false,
              cloudSdksShipped: false,
              fallback: 'in-process-local',
            },
            observability: {},
            hardening: { durability: { stores: [] } },
          }) as never,
        requestGraph: () => ({ slice: 'process', nodes: [], edges: [], mermaid: '' }) as never,
        async listInspectorOutbox() {
          throw new Error('outbox exploded');
        },
        async listInspectorWorkflows() {
          throw new Error('workflows exploded');
        },
      },
      { port: 0, sseIntervalMs: 0, nodeEnv: 'test' }
    );
    handles.push(handle);

    const outbox = await fetch(handle.outboxUrl);
    expect(outbox.status).toBe(500);
    expect(await outbox.json()).toEqual({ error: 'outbox exploded' });

    const workflows = await fetch(handle.workflowsUrl);
    expect(workflows.status).toBe(500);
    expect(await workflows.json()).toEqual({ error: 'workflows exploded' });
  });
});
