import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
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
  type ArkRunInspectorSource,
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

function bareSource(overrides: Partial<ArkRunInspectorSource> = {}): ArkRunInspectorSource {
  return {
    getInspectorSnapshot: (bind) => ({
      schemaVersion: '1.0',
      kernelInstanceId: 'bare-kernel',
      bind: { host: bind.host, port: bind.port, loopback: true },
      package: {
        schemaVersion: '1.0',
        kernelInstanceId: 'bare-kernel',
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
    }),
    requestGraph: () => ({
      schemaVersion: '1.0',
      kernelInstanceId: 'bare-kernel',
      slice: 'process',
      query: {
        slice: 'process',
        nodeIds: [],
        degreesOfSeparation: null,
        include: { tokens: [], ids: [], labels: [], tags: [], groups: [], architectureKinds: [] },
        exclude: { tokens: [], ids: [], labels: [], tags: [], groups: [], architectureKinds: [] },
      },
      nodes: [],
      edges: [],
      mermaid: 'flowchart LR',
    }),
    ...overrides,
  };
}

async function readSseUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (accumulated: string) => boolean,
  timeoutMs = 1500
): Promise<string> {
  const decoder = new TextDecoder();
  let accumulated = '';
  const deadline = Date.now() + timeoutMs;
  while (!predicate(accumulated)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`Timed out waiting for SSE match. Received:\n${accumulated}`);
    }
    const chunk = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('SSE read timeout')), remaining)
      ),
    ]);
    if (chunk.done) break;
    accumulated += decoder.decode(chunk.value, { stream: true });
  }
  return accumulated;
}

describe('R-07 inspector HTTP/SSE crash protection', () => {
  it('returns 500 JSON when requestGraph throws an Error or non-Error and keeps serving', async () => {
    let mode: 'error' | 'string' | 'ok' = 'error';
    const handle = await startArkRunInspector(
      bareSource({
        requestGraph: () => {
          if (mode === 'error') throw new Error('graph boom');
          if (mode === 'string') throw 'raw failure';
          return bareSource().requestGraph();
        },
      }),
      { port: 0, nodeEnv: 'test' }
    );
    handles.push(handle);

    const errRes = await fetch(handle.graphUrl);
    expect(errRes.status).toBe(500);
    expect(await errRes.json()).toEqual({ error: 'graph boom' });

    mode = 'string';
    const nonErrRes = await fetch(handle.graphUrl);
    expect(nonErrRes.status).toBe(500);
    expect(await nonErrRes.json()).toEqual({ error: 'graph request failed' });

    mode = 'ok';
    const okRes = await fetch(handle.graphUrl);
    expect(okRes.status).toBe(200);
  });

  it('returns 500 JSON when getInspectorSnapshot throws on /snapshot or /events', async () => {
    const handle = await startArkRunInspector(
      bareSource({
        getInspectorSnapshot: () => {
          throw new Error('snapshot boom');
        },
      }),
      { port: 0, nodeEnv: 'test' }
    );
    handles.push(handle);

    const snapRes = await fetch(handle.snapshotUrl);
    expect(snapRes.status).toBe(500);
    expect(await snapRes.json()).toEqual({ error: 'snapshot boom' });

    const eventsRes = await fetch(handle.eventsUrl);
    expect(eventsRes.status).toBe(500);
    expect(await eventsRes.json()).toEqual({ error: 'snapshot boom' });
  });

  it('survives abrupt SSE socket destroy while continuing to broadcast to healthy clients', async () => {
    const traceSinks: Array<(record: unknown) => void> = [];
    const handle = await startArkRunInspector(bareSource({ traceSinks }), {
      port: 0,
      nodeEnv: 'test',
    });
    handles.push(handle);

    // Connect a healthy SSE client
    const healthyRes = await fetch(handle.eventsUrl);
    const healthyReader = healthyRes.body!.getReader();
    await readSseUntil(healthyReader, (text) => text.includes('event: snapshot'));

    // Connect a second raw HTTP SSE client and destroy its socket abruptly
    await new Promise<void>((resolve, reject) => {
      const req = http.get(handle.eventsUrl, (res) => {
        res.once('data', () => {
          req.destroy();
          res.destroy();
          resolve();
        });
      });
      req.on('error', () => resolve());
      setTimeout(() => reject(new Error('raw client connect timeout')), 1500);
    });

    // Push multiple trace bursts immediately after raw socket destruction
    for (let i = 0; i < 5; i += 1) {
      for (const sink of [...traceSinks]) {
        sink({ type: 'event.published', intent: `Domain.Burst.${i}` });
      }
    }

    const received = await readSseUntil(healthyReader, (text) =>
      text.includes('Domain.Burst.4')
    );
    expect(received).toContain('event: trace');
    expect(received).toContain('Domain.Burst.0');
    expect(received).toContain('Domain.Burst.4');
    await healthyReader.cancel();
  });

  it('drops an SSE client cleanly when res.write throws synchronously without failing other clients', async () => {
    const traceSinks: Array<(record: unknown) => void> = [];
    const handle = await startArkRunInspector(bareSource({ traceSinks }), {
      port: 0,
      nodeEnv: 'test',
    });
    handles.push(handle);

    const resA = await fetch(handle.eventsUrl);
    const readerA = resA.body!.getReader();
    await readSseUntil(readerA, (text) => text.includes('event: snapshot'));

    const resB = await fetch(handle.eventsUrl);
    const readerB = resB.body!.getReader();
    await readSseUntil(readerB, (text) => text.includes('event: snapshot'));

    const originalWrite = http.ServerResponse.prototype.write;
    let threwOnce = false;
    http.ServerResponse.prototype.write = function patchedWrite(
      this: http.ServerResponse,
      ...args: Parameters<http.ServerResponse['write']>
    ): boolean {
      if (!threwOnce) {
        threwOnce = true;
        throw new Error('simulated EPIPE write failure');
      }
      return originalWrite.apply(this, args);
    };

    try {
      expect(() => {
        traceSinks[0]!({ type: 'event.published', intent: 'Domain.AfterWriteError' });
      }).not.toThrow();
    } finally {
      http.ServerResponse.prototype.write = originalWrite;
    }

    expect(threwOnce).toBe(true);
    const receivedB = await readSseUntil(readerB, (text) =>
      text.includes('Domain.AfterWriteError')
    );
    expect(receivedB).toContain('Domain.AfterWriteError');

    await readerA.cancel();
    await readerB.cancel();
  });
});

describe('Phase 3.4 real SSE push, ring buffer, and read-only /console', () => {
  it('pushes trace events in real time without polling delay and detaches on close', async () => {
    let listener: ((record: unknown) => void) | undefined;
    let unsubscribed = false;
    const handle = await startArkRunInspector(
      bareSource({
        subscribeTrace: (fn) => {
          listener = fn;
          return () => {
            unsubscribed = true;
            listener = undefined;
          };
        },
      }),
      { port: 0, nodeEnv: 'test' }
    );
    handles.push(handle);

    const res = await fetch(handle.eventsUrl);
    const reader = res.body!.getReader();
    await readSseUntil(reader, (text) => text.includes('event: snapshot'));

    const start = Date.now();
    listener?.({
      type: 'event.published',
      intent: 'Domain.Order.Created',
      payload: { secret: 'must-not-leak' },
      details: { subscribersNotified: 1, factory: () => 'leak' },
    });

    const chunk = await readSseUntil(reader, (text) =>
      text.includes('Domain.Order.Created')
    );
    const elapsedMs = Date.now() - start;
    expect(elapsedMs).toBeLessThan(500);
    expect(chunk).toContain('id: 1');
    expect(chunk).toContain('event: trace');
    expect(chunk).not.toMatch(/must-not-leak|factory/);

    await reader.cancel();
    await handle.close();
    handles.pop();
    expect(unsubscribed).toBe(true);
  });

  it('enforces bounded ring buffer maxEvents and supports Last-Event-ID replay', async () => {
    const traceSinks: Array<(record: unknown) => void> = [];
    const handle = await startArkRunInspector(bareSource({ traceSinks }), {
      port: 0,
      nodeEnv: 'test',
      maxEvents: 3,
    });
    handles.push(handle);
    expect(traceSinks).toHaveLength(1);

    for (let i = 1; i <= 7; i += 1) {
      traceSinks[0]!({ type: 'event.published', intent: `Domain.Ev.${i}` });
    }

    // Late joiner only gets the last 3 buffered trace events (5, 6, 7)
    const res1 = await fetch(handle.eventsUrl);
    const reader1 = res1.body!.getReader();
    const text1 = await readSseUntil(reader1, (t) => t.includes('Domain.Ev.7'));
    expect(text1).toContain('event: snapshot');
    expect(text1).toContain('Domain.Ev.5');
    expect(text1).toContain('Domain.Ev.6');
    expect(text1).toContain('Domain.Ev.7');
    expect(text1).not.toContain('Domain.Ev.4');
    await reader1.cancel();

    // Resume with Last-Event-ID: 5 only replays 6 and 7
    const res2 = await fetch(handle.eventsUrl, { headers: { 'Last-Event-ID': '5' } });
    const reader2 = res2.body!.getReader();
    const text2 = await readSseUntil(reader2, (t) => t.includes('Domain.Ev.7'));
    expect(text2).toContain('Domain.Ev.6');
    expect(text2).toContain('Domain.Ev.7');
    expect(text2).not.toContain('Domain.Ev.5');
    await reader2.cancel();

    // Malformed Last-Event-ID falls back safely to full ring replay
    const res3 = await fetch(handle.eventsUrl, { headers: { 'Last-Event-ID': 'not-a-num' } });
    const reader3 = res3.body!.getReader();
    const text3 = await readSseUntil(reader3, (t) => t.includes('Domain.Ev.7'));
    expect(text3).toContain('Domain.Ev.5');
    await reader3.cancel();

    // Closing removes our sink from traceSinks
    await handle.close();
    handles.pop();
    expect(traceSinks).toHaveLength(0);
  });

  it('supports optional lightweight SSE heartbeat when heartbeatMs is configured', async () => {
    const handle = await startArkRunInspector(bareSource(), {
      port: 0,
      nodeEnv: 'test',
      heartbeatMs: 25,
    });
    handles.push(handle);

    const res = await fetch(handle.eventsUrl);
    const reader = res.body!.getReader();
    const text = await readSseUntil(reader, (t) => t.includes(': heartbeat'), 1000);
    expect(text).toContain(': heartbeat');
    await reader.cancel();
  });

  it('serves GET /console with per-startup random CSP nonce matching script and style tags', async () => {
    const handleA = await startArkRunInspector(bareSource(), { port: 0, nodeEnv: 'test' });
    const handleB = await startArkRunInspector(bareSource(), { port: 0, nodeEnv: 'test' });
    handles.push(handleA, handleB);

    expect(handleA.consoleUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/console$/);
    const resA = await fetch(handleA.consoleUrl!);
    const resB = await fetch(handleB.consoleUrl!);
    expect(resA.status).toBe(200);
    expect(resA.headers.get('content-type')).toMatch(/text\/html/);
    expect(resA.headers.get('x-content-type-options')).toBe('nosniff');
    expect(resA.headers.get('x-frame-options')).toBe('DENY');
    expect(resA.headers.get('cache-control')).toBe('no-store');

    const cspA = resA.headers.get('content-security-policy') ?? '';
    const cspB = resB.headers.get('content-security-policy') ?? '';
    expect(cspA).toContain("default-src 'none'");
    expect(cspA).toContain("connect-src 'self'");
    expect(cspA).toContain("form-action 'none'");
    expect(cspA).toContain("frame-ancestors 'none'");
    expect(cspA).not.toContain('unsafe-inline');

    const matchA = cspA.match(/script-src 'nonce-([A-Za-z0-9+/=]+)'/);
    const matchB = cspB.match(/script-src 'nonce-([A-Za-z0-9+/=]+)'/);
    expect(matchA?.[1]).toBeTruthy();
    expect(matchB?.[1]).toBeTruthy();
    expect(matchA![1]).not.toBe(matchB![1]);
    expect(cspA).toContain(`style-src 'nonce-${matchA![1]}'`);

    const htmlA = await resA.text();
    expect(htmlA).toContain(`<script nonce="${matchA![1]}">`);
    expect(htmlA).toContain(`<style nonce="${matchA![1]}">`);
    expect(htmlA).toContain('/snapshot');
    expect(htmlA).toContain('/graph');
    expect(htmlA).toContain('/outbox');
    expect(htmlA).toContain('/workflows');
    expect(htmlA).toContain('/events');
    expect(htmlA).not.toContain('innerHTML');
    expect(htmlA).not.toMatch(/\sonclick=/i);
  });

  it('allows disabling /console and rejects all non-GET mutations with 405', async () => {
    const disabled = await startArkRunInspector(bareSource(), {
      port: 0,
      nodeEnv: 'test',
      console: false,
    });
    handles.push(disabled);
    expect(disabled.consoleUrl).toBeUndefined();
    const missing = await fetch(`${disabled.url}console`);
    expect(missing.status).toBe(404);

    const enabled = await startArkRunInspector(bareSource(), { port: 0, nodeEnv: 'test' });
    handles.push(enabled);

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const consoleRes = await fetch(enabled.consoleUrl!, { method });
      expect(consoleRes.status, `${method} /console`).toBe(405);
      expect(consoleRes.headers.get('allow')).toBe('GET');
      expect(await consoleRes.json()).toEqual({ error: 'method not allowed' });

      const snapRes = await fetch(enabled.snapshotUrl, { method });
      expect(snapRes.status, `${method} /snapshot`).toBe(405);
    }

    // Loopback + production guards still apply when console is explicitly true.
    await expect(
      startArkRunInspector(bareSource(), { host: '0.0.0.0', console: true, nodeEnv: 'test' })
    ).rejects.toBeInstanceOf(ArkRunInspectorBindError);
    await expect(
      startArkRunInspector(bareSource(), { console: true, nodeEnv: 'production' })
    ).rejects.toBeInstanceOf(ArkRunInspectorProductionError);
  });
});
