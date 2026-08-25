import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as gate from '../../../src/gate';
import {
  ARK_RUN_INSPECTOR_DEFAULT_HOST,
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
