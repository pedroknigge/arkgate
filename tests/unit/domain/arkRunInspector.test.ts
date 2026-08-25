import { describe, expect, it } from 'vitest';
import {
  ARK_RUN_INSPECTOR_DEFAULT_HOST,
  ARK_RUN_INSPECTOR_DEFAULT_PORT,
  ARK_RUN_INSPECTOR_SCHEMA_VERSION,
  ARK_RUN_INSPECTOR_SSE_EVENT,
  ArkRunInspectorBindError,
  ArkRunInspectorProductionError,
  arkRunInspectorUrl,
  buildArkRunInspectorSnapshot,
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
