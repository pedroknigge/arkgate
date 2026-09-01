#!/usr/bin/env node
import { parseArgs } from 'node:util';

const DEFAULT_INTERVAL_MS = '2000';
const DEFAULT_SNAPSHOT_URL = 'http://127.0.0.1:3000/snapshot';
const DEFAULT_FETCH_TIMEOUT_MS = 5_000;
const MAX_FIELD_LEN = 120;

const args = parseArgs({
  options: {
    interval: {
      type: 'string',
      short: 'i',
      default: DEFAULT_INTERVAL_MS
    },
    url: {
      type: 'string',
      short: 'u',
      default: DEFAULT_SNAPSHOT_URL
    },
    timeout: {
      type: 'string',
      short: 't',
      default: String(DEFAULT_FETCH_TIMEOUT_MS)
    }
  },
  allowPositionals: true
});

const parsedInterval = parseInt(args.values.interval, 10);
const interval =
  Number.isFinite(parsedInterval) && parsedInterval >= 200 && parsedInterval <= 60_000
    ? parsedInterval
    : Number(DEFAULT_INTERVAL_MS);
const targetUrl = args.values.url || DEFAULT_SNAPSHOT_URL;
const parsedTimeout = parseInt(args.values.timeout, 10);
const fetchTimeoutMs =
  Number.isFinite(parsedTimeout) && parsedTimeout >= 200 && parsedTimeout <= 60_000
    ? parsedTimeout
    : DEFAULT_FETCH_TIMEOUT_MS;

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const MUTED = '\x1b[2m';
const SAMPLE_LIMIT = 8;

const DRIFT_FLOW_KEYS = [
  'declaredButUnobserved',
  'observedButUndeclared',
  'unknownSources',
];
const DRIFT_ID_KEYS = [
  'unregisteredObservedSources',
  'unregisteredObservedIntents',
  'registeredButNeverObserved',
];

/** Strip ANSI CSI / OSC / other C0+C1 terminal control sequences; bound length. */
function sanitizeField(value, maxLen = MAX_FIELD_LEN) {
  let text = value === undefined || value === null ? '' : String(value);
  // OSC: ESC ] … BEL or ESC ]
  text = text.replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?/g, '');
  // CSI / Fe sequences
  text = text.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
  // Remaining ESC + final byte / 8-bit C1
  text = text.replace(/\u001b[@-Z\\-_]/g, '');
  text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '');
  if (text.length > maxLen) {
    return `${text.slice(0, Math.max(0, maxLen - 1))}…`;
  }
  return text;
}

function siblingUrl(snapshotUrl, suffix) {
  try {
    const u = new URL(snapshotUrl);
    let basePath = u.pathname;
    if (basePath.endsWith('/snapshot')) {
      basePath = basePath.slice(0, -'/snapshot'.length);
    } else if (basePath.endsWith('/snapshot/')) {
      basePath = basePath.slice(0, -'/snapshot/'.length);
    }
    u.pathname = `${basePath}${suffix}`;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * @returns {{ ok: true, data: unknown } | { ok: false, kind: 'waiting' | 'failure', error?: string }}
 */
async function fetchJsonResult(url) {
  if (!url) return { ok: false, kind: 'waiting' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return { ok: false, kind: 'failure', error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const aborted =
      (error && typeof error === 'object' && error.name === 'AbortError') ||
      /aborted|timeout/i.test(message);
    return {
      ok: false,
      kind: 'failure',
      error: sanitizeField(aborted ? `timeout after ${fetchTimeoutMs}ms` : message),
    };
  } finally {
    clearTimeout(timer);
  }
}

function isObservabilityReady(obs) {
  if (!obs || typeof obs !== 'object' || Array.isArray(obs)) return false;
  if (Object.keys(obs).length === 0) return false;
  return [...DRIFT_FLOW_KEYS, ...DRIFT_ID_KEYS].some((k) => Array.isArray(obs[k]));
}

function formatFlow(flow) {
  if (!flow || typeof flow !== 'object') return sanitizeField(flow);
  const from = sanitizeField(flow.from ?? '?');
  const to = sanitizeField(flow.to ?? '?');
  return `${from}→${to}`;
}

function listSamples(items, formatter) {
  const sample = items.slice(0, SAMPLE_LIMIT);
  for (const item of sample) {
    console.log(`    • ${formatter(item)}`);
  }
  if (items.length > SAMPLE_LIMIT) {
    console.log(`    … +${items.length - SAMPLE_LIMIT} more`);
  }
}

function renderDriftRadar(observability) {
  console.log(`\n--- Drift Radar ---`);
  if (!isObservabilityReady(observability)) {
    console.log(`${MUTED}Waiting for observability…${RESET}`);
    return;
  }

  const flows = Object.fromEntries(
    DRIFT_FLOW_KEYS.map((k) => [k, Array.isArray(observability[k]) ? observability[k] : []]),
  );
  const ids = Object.fromEntries(
    DRIFT_ID_KEYS.map((k) => [k, Array.isArray(observability[k]) ? observability[k] : []]),
  );

  const counts = {
    declaredButUnobserved: flows.declaredButUnobserved.length,
    observedButUndeclared: flows.observedButUndeclared.length,
    unknownSources: flows.unknownSources.length,
    unregisteredObservedSources: ids.unregisteredObservedSources.length,
    unregisteredObservedIntents: ids.unregisteredObservedIntents.length,
    registeredButNeverObserved: ids.registeredButNeverObserved.length,
  };
  const totalDrift = Object.values(counts).reduce((a, b) => a + b, 0);

  if (observability.generatedAt) {
    console.log(`Generated: ${sanitizeField(observability.generatedAt)}`);
  }

  console.log(
    `Counts: declaredButUnobserved=${counts.declaredButUnobserved} ` +
      `observedButUndeclared=${counts.observedButUndeclared} ` +
      `unknownSources=${counts.unknownSources} ` +
      `unregisteredSources=${counts.unregisteredObservedSources} ` +
      `unregisteredIntents=${counts.unregisteredObservedIntents} ` +
      `neverObserved=${counts.registeredButNeverObserved}`,
  );

  if (totalDrift === 0) {
    console.log(`${GREEN}No drift${RESET}`);
    return;
  }

  const critical =
    counts.observedButUndeclared > 0 ||
    counts.unknownSources > 0 ||
    counts.unregisteredObservedSources > 0 ||
    counts.unregisteredObservedIntents > 0;
  const color = critical ? RED : YELLOW;
  console.log(`${color}[DRIFT] ${totalDrift} issue(s) detected${RESET}`);

  for (const key of DRIFT_FLOW_KEYS) {
    const items = flows[key];
    if (items.length === 0) continue;
    console.log(`  ${YELLOW}${key}${RESET} (${items.length}):`);
    listSamples(items, formatFlow);
  }
  for (const key of DRIFT_ID_KEYS) {
    const items = ids[key];
    if (items.length === 0) continue;
    console.log(`  ${YELLOW}${key}${RESET} (${items.length}):`);
    listSamples(items, (id) => sanitizeField(id));
  }
}

function formatOutboxRow(row) {
  const intent = row.intent ? ` ${sanitizeField(row.intent)}` : '';
  const err = row.error ? ` err=${sanitizeField(row.error)}` : '';
  return `${sanitizeField(row.status)} ${sanitizeField(row.id)}${intent} attempts=${row.attempts ?? 0}${err}`;
}

function formatWorkflowRow(row) {
  const step = row.currentStep ? ` @${sanitizeField(row.currentStep)}` : '';
  const err = row.error ? ` err=${sanitizeField(row.error)}` : '';
  return `${sanitizeField(row.status)} ${sanitizeField(row.name)} (${sanitizeField(row.id)})${step}${err}`;
}

function isOutboxReady(outbox) {
  return Boolean(outbox && typeof outbox === 'object' && outbox.available === true);
}

function isWorkflowsReady(workflows) {
  return Boolean(workflows && typeof workflows === 'object' && workflows.available === true);
}

function renderFetchStatus(label, result) {
  if (result.ok) return;
  if (result.kind === 'waiting') {
    console.log(`${MUTED}${label}: Waiting…${RESET}`);
    return;
  }
  const detail = result.error ? ` (${result.error})` : '';
  console.log(`${RED}${label}: Failure${detail}${RESET}`);
}

function renderQueuesAndWorkflows(outboxResult, workflowsResult, snapshotOutbox, snapshotWorkflows) {
  console.log(`\n--- Queues & Workflows ---`);

  const outbox = isOutboxReady(outboxResult.ok ? outboxResult.data : null)
    ? outboxResult.data
    : isOutboxReady(snapshotOutbox)
      ? snapshotOutbox
      : null;
  const workflows = isWorkflowsReady(workflowsResult.ok ? workflowsResult.data : null)
    ? workflowsResult.data
    : isWorkflowsReady(snapshotWorkflows)
      ? snapshotWorkflows
      : null;

  if (!outbox && !workflows) {
    if (!outboxResult.ok && !workflowsResult.ok) {
      renderFetchStatus('Outbox', outboxResult);
      renderFetchStatus('Workflows', workflowsResult);
      return;
    }
    console.log(`${MUTED}Waiting for queues & workflows…${RESET}`);
    return;
  }

  if (!outbox) {
    renderFetchStatus('Outbox', outboxResult.ok ? { ok: false, kind: 'waiting' } : outboxResult);
  } else {
    const pending = Array.isArray(outbox.pending) ? outbox.pending : [];
    const failed = Array.isArray(outbox.failed) ? outbox.failed : [];
    const pendingCount = outbox.pendingCount ?? pending.length;
    const failedCount = outbox.failedCount ?? failed.length;
    console.log(`Outbox: pending=${pendingCount} failed=${failedCount}`);

    if (pendingCount === 0 && failedCount === 0) {
      console.log(`${GREEN}Outbox empty${RESET}`);
    } else {
      if (failedCount > 0) {
        console.log(`${RED}[OUTBOX] ${failedCount} failed${RESET}`);
        listSamples(failed, (row) => `${RED}${formatOutboxRow(row)}${RESET}`);
      }
      if (pendingCount > 0) {
        console.log(`${YELLOW}[OUTBOX] ${pendingCount} pending${RESET}`);
        listSamples(pending, (row) => `${YELLOW}${formatOutboxRow(row)}${RESET}`);
      }
    }
  }

  if (!workflows) {
    renderFetchStatus(
      'Workflows',
      workflowsResult.ok ? { ok: false, kind: 'waiting' } : workflowsResult,
    );
    return;
  }

  const rows = Array.isArray(workflows.workflows) ? workflows.workflows : [];
  const running = workflows.runningCount ?? rows.filter((w) => w.status === 'running').length;
  const compensating =
    workflows.compensatingCount ?? rows.filter((w) => w.status === 'compensating').length;
  const failedWf = workflows.failedCount ?? rows.filter((w) => w.status === 'failed').length;
  const pendingWf =
    workflows.pendingCount ??
    rows.filter((w) => w.status === 'idle' || w.status === 'waiting').length;
  console.log(
    `Workflows: total=${workflows.total ?? rows.length} running=${running} ` +
      `compensating=${compensating} failed=${failedWf} pending=${pendingWf}`,
  );

  if (failedWf === 0 && running === 0 && compensating === 0 && pendingWf === 0) {
    console.log(`${GREEN}No active workflows${RESET}`);
    return;
  }

  if (failedWf > 0) {
    console.log(`${RED}[WORKFLOWS] ${failedWf} failed${RESET}`);
    listSamples(
      rows.filter((w) => w.status === 'failed'),
      (row) => `${RED}${formatWorkflowRow(row)}${RESET}`,
    );
  }
  const yellowRows = rows.filter((w) =>
    w.status === 'running' ||
    w.status === 'compensating' ||
    w.status === 'idle' ||
    w.status === 'waiting',
  );
  if (yellowRows.length > 0) {
    console.log(`${YELLOW}[WORKFLOWS] ${yellowRows.length} pending/running/compensating${RESET}`);
    listSamples(yellowRows, (row) => `${YELLOW}${formatWorkflowRow(row)}${RESET}`);
  }
}

function durabilityStores(snapshot) {
  const stores = snapshot?.hardening?.durability?.stores;
  return Array.isArray(stores) ? stores : [];
}

function renderHardening(snapshotResult) {
  console.log(`--- Hardening Status ---`);
  if (!snapshotResult.ok) {
    if (snapshotResult.kind === 'waiting') {
      console.log(`${YELLOW}Waiting for kernel...${RESET}`);
    } else {
      const detail = snapshotResult.error ? ` (${snapshotResult.error})` : '';
      console.log(`${RED}Failure contacting kernel${detail}${RESET}`);
    }
    return;
  }

  const snapshot = snapshotResult.data;
  const stores = durabilityStores(snapshot);
  const memoryStores = stores.filter((s) => s && s.kind === 'memory');
  const durableStores = stores.filter((s) => s && s.kind === 'durable');

  if (stores.length === 0) {
    // Missing durability facts must never read as green OK.
    console.log(`${YELLOW}[WARNING] Store durability facts unavailable${RESET}`);
    return;
  }

  if (memoryStores.length > 0) {
    console.log(`${RED}[WARNING] Memory defaults in use!${RESET}`);
    for (const store of memoryStores) {
      const role = sanitizeField(store.role ?? 'store');
      const id = sanitizeField(store.id ?? store.name ?? 'unknown');
      console.log(`  - ${YELLOW}${role}: ${id}${RESET}`);
    }
    if (durableStores.length > 0) {
      for (const store of durableStores) {
        const role = sanitizeField(store.role ?? 'store');
        const id = sanitizeField(store.id ?? store.name ?? 'unknown');
        console.log(`  - ${MUTED}${role}: ${id} (durable)${RESET}`);
      }
    }
    return;
  }

  console.log(`${GREEN}[OK] Durable Stores Configured${RESET}`);
  for (const store of durableStores) {
    const role = sanitizeField(store.role ?? 'store');
    const id = sanitizeField(store.id ?? store.name ?? 'unknown');
    console.log(`  - ${MUTED}${role}: ${id}${RESET}`);
  }
}

async function render() {
  process.stdout.write('\x1b[2J\x1b[H');
  console.log(`ArkGate Observability Dashboard`);
  console.log(`Time: ${sanitizeField(new Date().toISOString())}`);
  console.log(`Endpoint: ${sanitizeField(targetUrl)}\n`);

  const outboxUrl = siblingUrl(targetUrl, '/outbox');
  const workflowsUrl = siblingUrl(targetUrl, '/workflows');
  const [snapshotResult, outboxResult, workflowsResult] = await Promise.all([
    fetchJsonResult(targetUrl),
    fetchJsonResult(outboxUrl),
    fetchJsonResult(workflowsUrl),
  ]);

  renderHardening(snapshotResult);

  const snapshot = snapshotResult.ok ? snapshotResult.data : null;
  renderDriftRadar(snapshot?.observability);
  renderQueuesAndWorkflows(
    outboxResult,
    workflowsResult,
    snapshot?.outbox,
    snapshot?.workflows,
  );
}

async function startDashboard() {
  console.log(
    `Starting ArkGate Observability Dashboard (polling every ${interval}ms, fetch timeout ${fetchTimeoutMs}ms)`,
  );

  while (true) {
    await render();
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

startDashboard().catch((err) => {
  console.error(err);
  process.exit(1);
});
