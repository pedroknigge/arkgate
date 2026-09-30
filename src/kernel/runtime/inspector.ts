/**
 * Opt-in ArkRun inspector. HTTP is dynamically imported so constructing a
 * kernel does not bind a port or load `node:http`.
 */
import {
  resolveArkRunInspectorBind,
} from '../../domain/arkRunInspector';
import type { ArkRunInspectorHandle, ArkRunInspectorListenSource } from './inspectorListen';

export type { ArkRunInspectorHandle };

export type StartArkRunInspectorOptions = {
  host?: string;
  port?: number;
  /** Participates in the production veto together with process NODE_ENV. */
  nodeEnv?: string;
  sseIntervalMs?: number;
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
  });
}
