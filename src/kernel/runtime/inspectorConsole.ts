/**
 * Read-only local HTML console for the ArkRun inspector (`/console`).
 * Uses a per-startup CSP nonce from `node:crypto` and zero mutating endpoints.
 */
import { randomBytes } from 'node:crypto';
import {
  ARK_RUN_INSPECTOR_EVENTS_PATH,
  ARK_RUN_INSPECTOR_GRAPH_PATH,
  ARK_RUN_INSPECTOR_OUTBOX_PATH,
  ARK_RUN_INSPECTOR_SNAPSHOT_PATH,
  ARK_RUN_INSPECTOR_WORKFLOWS_PATH,
} from '../../domain/arkRunInspector';

export function createArkRunConsoleNonce(): string {
  return randomBytes(16).toString('base64');
}

function escapeAttr(value: string): string {
  return value.replace(/[^A-Za-z0-9+/=_-]/g, '');
}

export function arkRunConsoleHeaders(nonce: string): Record<string, string> {
  const safeNonce = escapeAttr(nonce);
  return {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': [
      "default-src 'none'",
      `script-src 'nonce-${safeNonce}'`,
      `style-src 'nonce-${safeNonce}'`,
      "connect-src 'self'",
      "img-src 'self' data:",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
  };
}

export function renderArkRunInspectorConsoleHtml(nonce: string): string {
  const safeNonce = escapeAttr(nonce);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ArkRun Inspector (Read-Only)</title>
<style nonce="${safeNonce}">
  :root { color-scheme: dark; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  body { margin: 0; padding: 16px; background: #0f1115; color: #e6e8ee; font-size: 13px; }
  header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #262b36; padding-bottom: 12px; }
  h1 { margin: 0; font-size: 16px; font-weight: 600; }
  .badge { background: #1e2430; border: 1px solid #30384a; border-radius: 4px; padding: 2px 8px; font-size: 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 12px; }
  section { background: #161a22; border: 1px solid #262b36; border-radius: 6px; padding: 12px; }
  h2 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: #9aa4b8; }
  .controls { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; align-items: center; }
  button, select, input { background: #0f1115; color: #e6e8ee; border: 1px solid #30384a; border-radius: 4px; padding: 4px 8px; font: inherit; }
  button { cursor: pointer; }
  pre { margin: 0; background: #0b0d11; border: 1px solid #202530; border-radius: 4px; padding: 8px; overflow: auto; max-height: 280px; white-space: pre-wrap; word-break: break-word; }
  #events-log { list-style: none; margin: 0; padding: 0; max-height: 300px; overflow: auto; }
  #events-log li { border-bottom: 1px solid #202530; padding: 4px 2px; }
</style>
</head>
<body>
<header>
  <h1>ArkRun Local Inspector</h1>
  <span class="badge">read-only</span>
  <span class="badge" id="status">connecting</span>
  <button type="button" id="refresh-btn">Refresh</button>
</header>
<div class="grid">
  <section>
    <h2>Snapshot</h2>
    <pre id="snapshot-view">Loading...</pre>
  </section>
  <section>
    <h2>Graph</h2>
    <div class="controls">
      <select id="slice-select" aria-label="Graph slice">
        <option value="process">process</option>
        <option value="technical">technical</option>
      </select>
      <input id="node-ids-input" type="text" placeholder="nodeIds (comma-separated)" />
      <input id="degrees-input" type="number" min="0" placeholder="degrees" />
      <button type="button" id="graph-btn">Load Graph</button>
    </div>
    <pre id="graph-view">Loading...</pre>
  </section>
  <section>
    <h2>Outbox</h2>
    <pre id="outbox-view">Loading...</pre>
  </section>
  <section>
    <h2>Workflows</h2>
    <pre id="workflows-view">Loading...</pre>
  </section>
  <section>
    <h2>Live Events</h2>
    <div class="controls">
      <button type="button" id="pause-btn">Pause</button>
      <button type="button" id="clear-btn">Clear</button>
      <input id="filter-input" type="text" placeholder="Filter by type or intent" />
    </div>
    <ul id="events-log"></ul>
  </section>
</div>
<script nonce="${safeNonce}">
(() => {
  const PATHS = {
    snapshot: ${JSON.stringify(ARK_RUN_INSPECTOR_SNAPSHOT_PATH)},
    graph: ${JSON.stringify(ARK_RUN_INSPECTOR_GRAPH_PATH)},
    outbox: ${JSON.stringify(ARK_RUN_INSPECTOR_OUTBOX_PATH)},
    workflows: ${JSON.stringify(ARK_RUN_INSPECTOR_WORKFLOWS_PATH)},
    events: ${JSON.stringify(ARK_RUN_INSPECTOR_EVENTS_PATH)},
  };

  const state = { paused: false, filter: '', events: [] };
  const statusEl = document.getElementById('status');
  const snapshotEl = document.getElementById('snapshot-view');
  const graphEl = document.getElementById('graph-view');
  const outboxEl = document.getElementById('outbox-view');
  const workflowsEl = document.getElementById('workflows-view');
  const eventsEl = document.getElementById('events-log');
  const pauseBtn = document.getElementById('pause-btn');
  const clearBtn = document.getElementById('clear-btn');
  const refreshBtn = document.getElementById('refresh-btn');
  const filterInput = document.getElementById('filter-input');
  const sliceSelect = document.getElementById('slice-select');
  const nodeIdsInput = document.getElementById('node-ids-input');
  const degreesInput = document.getElementById('degrees-input');
  const graphBtn = document.getElementById('graph-btn');

  async function fetchJson(url) {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  }

  function showJson(el, payload) {
    el.textContent = JSON.stringify(payload, null, 2);
  }

  async function loadGraph() {
    const params = new URLSearchParams();
    params.set('slice', sliceSelect.value);
    if (nodeIdsInput.value.trim()) params.set('nodeIds', nodeIdsInput.value.trim());
    if (degreesInput.value.trim()) params.set('degreesOfSeparation', degreesInput.value.trim());
    const result = await fetchJson(PATHS.graph + '?' + params.toString());
    showJson(graphEl, result.data);
  }

  async function refreshAll() {
    const [snap, outbox, workflows] = await Promise.all([
      fetchJson(PATHS.snapshot),
      fetchJson(PATHS.outbox),
      fetchJson(PATHS.workflows),
    ]);
    showJson(snapshotEl, snap.data);
    showJson(outboxEl, outbox.data);
    showJson(workflowsEl, workflows.data);
    await loadGraph();
  }

  function renderEvents() {
    const needle = state.filter.trim().toLowerCase();
    eventsEl.textContent = '';
    for (const entry of state.events) {
      const line = '[' + entry.kind + '] ' + entry.text;
      if (needle && !line.toLowerCase().includes(needle)) continue;
      const li = document.createElement('li');
      li.textContent = line;
      eventsEl.appendChild(li);
    }
  }

  function recordEvent(kind, rawData) {
    if (state.paused) return;
    state.events.unshift({ kind, text: rawData });
    if (state.events.length > 200) state.events.length = 200;
    renderEvents();
  }

  pauseBtn.addEventListener('click', () => {
    state.paused = !state.paused;
    pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';
  });
  clearBtn.addEventListener('click', () => {
    state.events = [];
    renderEvents();
  });
  filterInput.addEventListener('input', () => {
    state.filter = filterInput.value;
    renderEvents();
  });
  refreshBtn.addEventListener('click', () => {
    void refreshAll();
  });
  graphBtn.addEventListener('click', () => {
    void loadGraph();
  });

  const stream = new EventSource(PATHS.events);
  stream.addEventListener('open', () => {
    statusEl.textContent = 'connected';
  });
  stream.addEventListener('error', () => {
    statusEl.textContent = 'disconnected';
  });
  stream.addEventListener('snapshot', (ev) => {
    try {
      showJson(snapshotEl, JSON.parse(ev.data));
    } catch {
      snapshotEl.textContent = ev.data;
    }
    recordEvent('snapshot', ev.data);
  });
  stream.addEventListener('trace', (ev) => {
    recordEvent('trace', ev.data);
  });

  void refreshAll();
})();
</script>
</body>
</html>
`;
}
