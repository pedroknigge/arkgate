/**
 * Loopback HTTP + SSE for the ArkRun inspector. `node:http` is loaded only
 * when listen runs so kernel construction does not open a socket.
 */
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import {
  ARK_RUN_INSPECTOR_EVENTS_PATH,
  ARK_RUN_INSPECTOR_SNAPSHOT_PATH,
  ArkRunInspectorBindError,
  arkRunInspectorUrl,
  formatArkRunInspectorSseEvent,
  isArkRunInspectorLoopbackHost,
  type ArkRunInspectorBind,
  type ArkRunInspectorSnapshot,
} from '../../domain/arkRunInspector';

export type ArkRunInspectorListenSource = {
  getInspectorSnapshot(bind: ArkRunInspectorBind): ArkRunInspectorSnapshot;
};

export type ArkRunInspectorHandle = {
  host: string;
  port: number;
  url: string;
  snapshotUrl: string;
  eventsUrl: string;
  close(): Promise<void>;
};

export type ListenArkRunInspectorOptions = {
  bind: ArkRunInspectorBind;
  sseIntervalMs?: number;
};

function jsonHeaders(): Record<string, string> {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  };
}

function sseHeaders(): Record<string, string> {
  return {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  };
}

function requestPath(url: string | undefined): string {
  const raw = url && url.length > 0 ? url : '/';
  return new URL(raw, 'http://127.0.0.1').pathname;
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, jsonHeaders());
  res.end(JSON.stringify(body));
}

function boundAddress(server: Server, requested: ArkRunInspectorBind): ArkRunInspectorBind {
  const addr = server.address();
  if (addr === null || typeof addr === 'string') {
    throw new ArkRunInspectorBindError(requested.host);
  }
  if (!isArkRunInspectorLoopbackHost(addr.address)) {
    throw new ArkRunInspectorBindError(addr.address);
  }
  return { host: requested.host, port: addr.port };
}

export async function listenArkRunInspector(
  source: ArkRunInspectorListenSource,
  options: ListenArkRunInspectorOptions
): Promise<ArkRunInspectorHandle> {
  const http = await import('node:http');
  const clients = new Set<ServerResponse>();
  const timers = new Set<ReturnType<typeof setInterval>>();
  const intervalMs =
    typeof options.sseIntervalMs === 'number' && Number.isFinite(options.sseIntervalMs)
      ? Math.max(0, options.sseIntervalMs)
      : 1000;

  let bound: ArkRunInspectorBind = options.bind;
  const snapshot = () => source.getInspectorSnapshot(bound);

  const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    const path = requestPath(req.url);
    if (req.method === 'GET' && (path === '/' || path === ARK_RUN_INSPECTOR_SNAPSHOT_PATH)) {
      writeJson(res, 200, snapshot());
      return;
    }
    if (req.method === 'GET' && path === ARK_RUN_INSPECTOR_EVENTS_PATH) {
      res.writeHead(200, sseHeaders());
      res.flushHeaders();
      res.write(formatArkRunInspectorSseEvent(snapshot()));
      clients.add(res);
      const timer =
        intervalMs > 0
          ? setInterval(() => {
              res.write(formatArkRunInspectorSseEvent(snapshot()));
            }, intervalMs)
          : undefined;
      if (timer) timers.add(timer);
      const drop = () => {
        clients.delete(res);
        if (timer) {
          clearInterval(timer);
          timers.delete(timer);
        }
      };
      req.on('close', drop);
      res.on('close', drop);
      return;
    }
    writeJson(res, 404, { error: 'not found' });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      server.once('error', onError);
      server.listen({ host: options.bind.host, port: options.bind.port }, () => {
        server.off('error', onError);
        try {
          bound = boundAddress(server, options.bind);
          resolve();
        } catch (error) {
          reject(error instanceof Error ? error : new ArkRunInspectorBindError(options.bind.host));
        }
      });
    });
  } catch (error) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    throw error;
  }

  return {
    host: bound.host,
    port: bound.port,
    url: arkRunInspectorUrl(bound.host, bound.port, '/'),
    snapshotUrl: arkRunInspectorUrl(bound.host, bound.port, ARK_RUN_INSPECTOR_SNAPSHOT_PATH),
    eventsUrl: arkRunInspectorUrl(bound.host, bound.port, ARK_RUN_INSPECTOR_EVENTS_PATH),
    close() {
      for (const timer of timers) clearInterval(timer);
      timers.clear();
      for (const client of clients) client.end();
      clients.clear();
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
