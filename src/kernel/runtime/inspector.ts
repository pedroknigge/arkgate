/**
 * Opt-in ArkRun inspector. HTTP is dynamically imported so constructing a
 * kernel does not bind a port or load `node:http`.
 */
import {
  resolveArkRunInspectorBind,
} from '../../domain/arkRunInspector';
import type {
  ArkRunInspectorHandle,
  ArkRunInspectorListenSource,
  ArkRunInspectorTraceSink,
  ArkRunInspectorTraceSubscribe,
} from './inspectorListen';

export type { ArkRunInspectorHandle };

export type StartArkRunInspectorOptions = {
  host?: string;
  port?: number;
  /** Participates in the production veto together with process NODE_ENV. */
  nodeEnv?: string;
  /** @deprecated Replaced by real-time trace push; retained for compatibility. */
  sseIntervalMs?: number;
  /** Maximum trace events retained in the SSE replay ring buffer. Default 200. */
  maxEvents?: number;
  /** Optional SSE comment heartbeat interval in ms. Disabled (0) by default. */
  heartbeatMs?: number;
  /** Serve the read-only HTML console at GET /console. Default true. */
  console?: boolean;
  /** Optional trace push subscription when the source does not expose one. */
  subscribeTrace?: ArkRunInspectorTraceSubscribe;
  /** Optional mutable traceSinks array to attach/detach a push sink. */
  traceSinks?: ArkRunInspectorTraceSink[];
};

/** What the inspector reads: snapshot, graph, and optional outbox / workflow monitors. */
export type ArkRunInspectorSource = ArkRunInspectorListenSource;

export async function startArkRunInspector(
  source: ArkRunInspectorSource,
  options: StartArkRunInspectorOptions = {}
): Promise<ArkRunInspectorHandle> {
  const bind = resolveArkRunInspectorBind({
    host: options.host,
    port: options.port,
    nodeEnv: options.nodeEnv,
    processNodeEnv: process.env.NODE_ENV,
  });
  const { listenArkRunInspector } = await import('./inspectorListen.js');
  return listenArkRunInspector(source, {
    bind,
    sseIntervalMs: options.sseIntervalMs,
    maxEvents: options.maxEvents,
    heartbeatMs: options.heartbeatMs,
    console: options.console,
    subscribeTrace: options.subscribeTrace,
    traceSinks: options.traceSinks,
  });
}
