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
  ARK_RUN_INSPECTOR_CONSOLE_PATH,
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
  createArkRunInspectorEventRingBuffer,
  formatArkRunInspectorSseEvent,
  formatArkRunInspectorTraceSseEvent,
  isArkRunInspectorLoopbackHost,
  unavailableArkRunInspectorOutboxMonitor,
  unavailableArkRunInspectorWorkflowsMonitor,
  type ArkRunInspectorBind,
  type ArkRunInspectorOutboxMonitor,
  type ArkRunInspectorSnapshot,
  type ArkRunInspectorWorkflowsMonitor,
} from '../../domain/arkRunInspector';
import {
  arkRunConsoleHeaders,
  createArkRunConsoleNonce,
  renderArkRunInspectorConsoleHtml,
} from './inspectorConsole';

export type ArkRunInspectorTraceSink = (record: unknown) => void;
export type ArkRunInspectorTraceSubscribe = (
  listener: ArkRunInspectorTraceSink
) => (() => void) | void;

export type ArkRunInspectorListenSource = {
  getInspectorSnapshot(bind: ArkRunInspectorBind): ArkRunInspectorSnapshot;
  requestGraph(query?: ArkRunGraphQuery): ArkRunGraph;
  /** OD04: pending/failed outbox summaries (EventBufferStore.list). */
  listInspectorOutbox?(): Promise<ArkRunInspectorOutboxMonitor>;
  /** OD04: workflow/saga summaries (WorkflowEngine.list). */
  listInspectorWorkflows?(): Promise<ArkRunInspectorWorkflowsMonitor>;
  /** Push trace subscription for real-time SSE streaming. */
  subscribeTrace?: ArkRunInspectorTraceSubscribe;
  /** Mutable kernel traceSinks array (fallback when subscribeTrace is absent). */
  traceSinks?: ArkRunInspectorTraceSink[];
  /** Duck-typed kernel ports when explicit list* helpers are absent. */
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
  consoleUrl?: string;
  close(): Promise<void>;
};

export type ListenArkRunInspectorOptions = {
  bind: ArkRunInspectorBind;
  /** @deprecated Replaced by real-time trace push; retained for compatibility. */
  sseIntervalMs?: number;
  /** Maximum trace events kept in the SSE replay ring buffer. Default 200. */
  maxEvents?: number;
  /** Optional SSE comment heartbeat interval in ms. Disabled (0) by default. */
  heartbeatMs?: number;
  /** Serve the read-only HTML console at GET /console. Default true. */
  console?: boolean;
  /** Optional push subscription override when source does not expose one. */
  subscribeTrace?: ArkRunInspectorTraceSubscribe;
  /** Optional mutable traceSinks array to attach/detach a push sink. */
  traceSinks?: ArkRunInspectorTraceSink[];
};

type ActiveSseClient = {
  res: ServerResponse;
  drop: () => void;
};

function jsonHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extra,
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

function requestUrl(url: string | undefined): URL | undefined {
  // Collapse leading slashes: `//outbox` must route as `/outbox`, never be read
  // as a protocol-relative authority (host "outbox", path "/") → snapshot.
  const raw = (url && url.length > 0 ? url : '/').replace(/^\/+/, '/');
  try {
    return new URL(raw, 'http://127.0.0.1');
  } catch {
    return undefined;
  }
}

function writeJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>
): void {
  if (res.writableEnded || res.destroyed) return;
  try {
    res.writeHead(status, jsonHeaders(extraHeaders));
    res.end(JSON.stringify(body));
  } catch {
    // Client gone mid-write — never throw into a void async chain.
  }
}

function writeHtml(
  res: ServerResponse,
  status: number,
  headers: Record<string, string>,
  html: string
): void {
  if (res.writableEnded || res.destroyed) return;
  try {
    res.writeHead(status, headers);
    res.end(html);
  } catch {
    // Client gone mid-write — ignore broken pipe.
  }
}

function safeSseWrite(
  res: ServerResponse,
  chunk: string,
  drop: () => void
): boolean {
  if (res.writableEnded || res.destroyed) {
    drop();
    return false;
  }
  try {
    res.write(chunk);
    return true;
  } catch {
    drop();
    return false;
  }
}

function parseLastEventId(header: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
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

function attachTraceSubscription(
  source: ArkRunInspectorListenSource,
  options: ListenArkRunInspectorOptions,
  onTrace: ArkRunInspectorTraceSink
): () => void {
  const subscribe = options.subscribeTrace ?? source.subscribeTrace;
  if (typeof subscribe === 'function') {
    const unsubscribe = subscribe(onTrace);
    return () => {
      if (typeof unsubscribe !== 'function') return;
      try {
        unsubscribe();
      } catch {
        // Detach must not fail server shutdown.
      }
    };
  }
  const sinks = options.traceSinks ?? source.traceSinks;
  if (Array.isArray(sinks)) {
    sinks.push(onTrace);
    return () => {
      const idx = sinks.indexOf(onTrace);
      if (idx >= 0) sinks.splice(idx, 1);
    };
  }
  return () => {};
}

export async function listenArkRunInspector(
  source: ArkRunInspectorListenSource,
  options: ListenArkRunInspectorOptions
): Promise<ArkRunInspectorHandle> {
  const http = await import('node:http');
  const clients = new Set<ActiveSseClient>();
  const ringBuffer = createArkRunInspectorEventRingBuffer(options.maxEvents);
  const heartbeatMs =
    typeof options.heartbeatMs === 'number' && Number.isFinite(options.heartbeatMs)
      ? Math.max(0, Math.trunc(options.heartbeatMs))
      : 0;
  const consoleEnabled = options.console !== false;
  const consoleNonce = consoleEnabled ? createArkRunConsoleNonce() : '';
  const consoleHeaders = consoleEnabled ? arkRunConsoleHeaders(consoleNonce) : {};
  const consoleHtml = consoleEnabled ? renderArkRunInspectorConsoleHtml(consoleNonce) : '';

  let closed = false;
  let bound: ArkRunInspectorBind = options.bind;
  const snapshot = () => source.getInspectorSnapshot(bound);

  const detachTrace = attachTraceSubscription(source, options, (record: unknown) => {
    if (closed) return;
    const buffered = ringBuffer.push(record);
    const frame = formatArkRunInspectorTraceSseEvent(buffered.event, buffered.id);
    for (const client of [...clients]) {
      safeSseWrite(client.res, frame, client.drop);
    }
  });

  const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'GET') {
      writeJson(res, 405, { error: 'method not allowed' }, { allow: 'GET' });
      return;
    }
    const url = requestUrl(req.url);
    if (!url) {
      writeJson(res, 400, { error: 'malformed request url' });
      return;
    }
    const path = url.pathname;
    if (path === '/' || path === ARK_RUN_INSPECTOR_SNAPSHOT_PATH) {
      try {
        writeJson(res, 200, snapshot());
      } catch (error) {
        writeJson(res, 500, {
          error: error instanceof Error ? error.message : 'snapshot failed',
        });
      }
      return;
    }
    if (path === ARK_RUN_INSPECTOR_GRAPH_PATH) {
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
        writeJson(res, 500, {
          error: error instanceof Error ? error.message : 'graph request failed',
        });
      }
      return;
    }
    if (path === ARK_RUN_INSPECTOR_OUTBOX_PATH) {
      void resolveOutboxMonitor(source)
        .then((body) => writeJson(res, 200, body))
        .catch((error: unknown) => {
          writeJson(res, 500, {
            error: error instanceof Error ? error.message : 'outbox monitor failed',
          });
        });
      return;
    }
    if (path === ARK_RUN_INSPECTOR_WORKFLOWS_PATH) {
      void resolveWorkflowsMonitor(source)
        .then((body) => writeJson(res, 200, body))
        .catch((error: unknown) => {
          writeJson(res, 500, {
            error: error instanceof Error ? error.message : 'workflows monitor failed',
          });
        });
      return;
    }
    if (consoleEnabled && path === ARK_RUN_INSPECTOR_CONSOLE_PATH) {
      writeHtml(res, 200, consoleHeaders, consoleHtml);
      return;
    }
    if (path === ARK_RUN_INSPECTOR_EVENTS_PATH) {
      let initialSnapshot: ArkRunInspectorSnapshot;
      try {
        initialSnapshot = snapshot();
      } catch (error) {
        writeJson(res, 500, {
          error: error instanceof Error ? error.message : 'snapshot failed',
        });
        return;
      }

      let dropped = false;
      let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
      const client: ActiveSseClient = {
        res,
        drop() {
          if (dropped) return;
          dropped = true;
          clients.delete(client);
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = undefined;
          }
        },
      };

      req.on('close', client.drop);
      req.on('error', client.drop);
      res.on('close', client.drop);
      res.on('error', client.drop);

      try {
        if (res.writableEnded || res.destroyed) {
          client.drop();
          return;
        }
        res.writeHead(200, sseHeaders());
        res.flushHeaders();
      } catch {
        client.drop();
        return;
      }

      if (!safeSseWrite(res, formatArkRunInspectorSseEvent(initialSnapshot), client.drop)) {
        return;
      }

      const lastEventId = parseLastEventId(req.headers['last-event-id']);
      for (const entry of ringBuffer.list(lastEventId)) {
        if (
          !safeSseWrite(
            res,
            formatArkRunInspectorTraceSseEvent(entry.event, entry.id),
            client.drop
          )
        ) {
          return;
        }
      }

      if (dropped) return;
      clients.add(client);
      if (heartbeatMs > 0) {
        heartbeatTimer = setInterval(() => {
          safeSseWrite(res, ': heartbeat\n\n', client.drop);
        }, heartbeatMs);
      }
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
    closed = true;
    detachTrace();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    throw error;
  }

  const handle: ArkRunInspectorHandle = {
    host: bound.host,
    port: bound.port,
    url: arkRunInspectorUrl(bound.host, bound.port, '/'),
    snapshotUrl: arkRunInspectorUrl(bound.host, bound.port, ARK_RUN_INSPECTOR_SNAPSHOT_PATH),
    eventsUrl: arkRunInspectorUrl(bound.host, bound.port, ARK_RUN_INSPECTOR_EVENTS_PATH),
    graphUrl: arkRunInspectorUrl(bound.host, bound.port, ARK_RUN_INSPECTOR_GRAPH_PATH),
    outboxUrl: arkRunInspectorUrl(bound.host, bound.port, ARK_RUN_INSPECTOR_OUTBOX_PATH),
    workflowsUrl: arkRunInspectorUrl(bound.host, bound.port, ARK_RUN_INSPECTOR_WORKFLOWS_PATH),
    close() {
      closed = true;
      detachTrace();
      for (const client of [...clients]) {
        client.drop();
        try {
          if (!client.res.writableEnded && !client.res.destroyed) {
            client.res.end();
          }
        } catch {
          // Client already gone.
        }
      }
      clients.clear();
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
  if (consoleEnabled) {
    handle.consoleUrl = arkRunInspectorUrl(
      bound.host,
      bound.port,
      ARK_RUN_INSPECTOR_CONSOLE_PATH
    );
  }
  return handle;
}
