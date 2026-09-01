/**
 * Loopback HTTP + SSE for the ArkRun inspector. `node:http` is loaded only
 * when listen runs so kernel construction does not open a socket.
 */
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import {
  InvalidArkRunGraphQueryError,
  arkRunGraphQueryFromSearchParams,
  type ArkRunGraph,
  type ArkRunGraphQuery,
} from '../../domain/arkRunGraph';
import {
  ARK_RUN_INSPECTOR_EVENTS_PATH,
  ARK_RUN_INSPECTOR_GRAPH_PATH,
  ARK_RUN_INSPECTOR_MONITOR_SAMPLE_LIMIT,
  ARK_RUN_INSPECTOR_OUTBOX_PATH,
  ARK_RUN_INSPECTOR_SNAPSHOT_PATH,
  ARK_RUN_INSPECTOR_WORKFLOWS_PATH,
  ArkRunInspectorBindError,
  arkRunInspectorUrl,
  buildArkRunInspectorOutboxMonitor,
  buildArkRunInspectorWorkflowsMonitor,
  formatArkRunInspectorSseEvent,
  isArkRunInspectorLoopbackHost,
  unavailableArkRunInspectorOutboxMonitor,
  unavailableArkRunInspectorWorkflowsMonitor,
  type ArkRunInspectorBind,
  type ArkRunInspectorOutboxMonitor,
  type ArkRunInspectorSnapshot,
  type ArkRunInspectorWorkflowsMonitor,
} from '../../domain/arkRunInspector';

export type ArkRunInspectorListenSource = {
  getInspectorSnapshot(bind: ArkRunInspectorBind): ArkRunInspectorSnapshot;
  requestGraph(query?: ArkRunGraphQuery): ArkRunGraph;
  listInspectorOutbox?(): Promise<ArkRunInspectorOutboxMonitor>;
  listInspectorWorkflows?(): Promise<ArkRunInspectorWorkflowsMonitor>;
  outbox?: { list(status?: 'pending' | 'dispatched' | 'failed'): Promise<unknown[]> };
  eventBuffer?: { list(status?: 'pending' | 'dispatched' | 'failed'): Promise<unknown[]> };
  workflowEngine?: { list(workflowName?: string): Promise<unknown[]> };
};

export type ArkRunInspectorHandle = {
  host: string;
  port: number;
  url: string;
  snapshotUrl: string;
  eventsUrl: string;
  graphUrl: string;
  outboxUrl: string;
  workflowsUrl: string;
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

function requestUrl(url: string | undefined): URL {
  const raw = url && url.length > 0 ? url : '/';
  return new URL(raw, 'http://127.0.0.1');
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.writableEnded || res.destroyed) return;
  try {
    res.writeHead(status, jsonHeaders());
    res.end(JSON.stringify(body));
  } catch {
    // Client gone mid-write — never throw into a void async chain.
  }
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

async function resolveOutboxMonitor(
  source: ArkRunInspectorListenSource
): Promise<ArkRunInspectorOutboxMonitor> {
  if (typeof source.listInspectorOutbox === 'function') {
    return source.listInspectorOutbox();
  }
  const store = source.outbox ?? source.eventBuffer;
  if (!store || typeof store.list !== 'function') {
    return unavailableArkRunInspectorOutboxMonitor();
  }
  const [pending, failed] = await Promise.all([store.list('pending'), store.list('failed')]);
  return buildArkRunInspectorOutboxMonitor([...(pending ?? []), ...(failed ?? [])], {
    sampleLimit: ARK_RUN_INSPECTOR_MONITOR_SAMPLE_LIMIT,
  });
}

async function resolveWorkflowsMonitor(
  source: ArkRunInspectorListenSource
): Promise<ArkRunInspectorWorkflowsMonitor> {
  if (typeof source.listInspectorWorkflows === 'function') {
    return source.listInspectorWorkflows();
  }
  if (!source.workflowEngine || typeof source.workflowEngine.list !== 'function') {
    return unavailableArkRunInspectorWorkflowsMonitor();
  }
  return buildArkRunInspectorWorkflowsMonitor(await source.workflowEngine.list(), {
    sampleLimit: ARK_RUN_INSPECTOR_MONITOR_SAMPLE_LIMIT,
  });
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
    const url = requestUrl(req.url);
    const path = url.pathname;
    if (req.method === 'GET' && (path === '/' || path === ARK_RUN_INSPECTOR_SNAPSHOT_PATH)) {
      writeJson(res, 200, snapshot());
      return;
    }
    if (req.method === 'GET' && path === ARK_RUN_INSPECTOR_GRAPH_PATH) {
      try {
        writeJson(
          res,
          200,
          source.requestGraph(
            arkRunGraphQueryFromSearchParams({
              slice: url.searchParams.get('slice'),
              nodeIds: url.searchParams.get('nodeIds'),
              degreesOfSeparation: url.searchParams.get('degreesOfSeparation'),
              include: url.searchParams.get('include'),
              exclude: url.searchParams.get('exclude'),
            })
          )
        );
      } catch (error) {
        if (error instanceof InvalidArkRunGraphQueryError) {
          writeJson(res, 400, { error: error.message, option: error.option });
          return;
        }
        throw error;
      }
      return;
    }
    if (req.method === 'GET' && path === ARK_RUN_INSPECTOR_OUTBOX_PATH) {
      void resolveOutboxMonitor(source)
        .then((body) => writeJson(res, 200, body))
        .catch((error: unknown) => {
          writeJson(res, 500, {
            error: error instanceof Error ? error.message : 'outbox monitor failed',
          });
        });
      return;
    }
    if (req.method === 'GET' && path === ARK_RUN_INSPECTOR_WORKFLOWS_PATH) {
      void resolveWorkflowsMonitor(source)
        .then((body) => writeJson(res, 200, body))
        .catch((error: unknown) => {
          writeJson(res, 500, {
            error: error instanceof Error ? error.message : 'workflows monitor failed',
          });
        });
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
    graphUrl: arkRunInspectorUrl(bound.host, bound.port, ARK_RUN_INSPECTOR_GRAPH_PATH),
    outboxUrl: arkRunInspectorUrl(bound.host, bound.port, ARK_RUN_INSPECTOR_OUTBOX_PATH),
    workflowsUrl: arkRunInspectorUrl(bound.host, bound.port, ARK_RUN_INSPECTOR_WORKFLOWS_PATH),
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
