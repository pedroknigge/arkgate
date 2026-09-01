#!/usr/bin/env node
import { parseArgs } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimePath = path.join(here, '..', 'dist', 'runtime', 'index.js');
let ArkRun = null;
if (fs.existsSync(runtimePath)) {
  const runtime = await import(runtimePath);
  ArkRun = runtime.ArkRun;
}


const args = parseArgs({
  options: {
    interval: {
      type: 'string',
      short: 'i',
      default: '2000'
    },
    url: {
      type: 'string',
      short: 'u',
      default: 'http://127.0.0.1:3000/snapshot'
    }
  },
  allowPositionals: true
});

const interval = parseInt(args.values.interval, 10) || 2000;
const targetUrl = args.values.url || 'http://127.0.0.1:3000/snapshot';

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

async function fetchJson(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchSnapshot() {
  return fetchJson(targetUrl);
}

function isObservabilityReady(obs) {
  if (!obs || typeof obs !== 'object' || Array.isArray(obs)) return false;
  if (Object.keys(obs).length === 0) return false;
  return [...DRIFT_FLOW_KEYS, ...DRIFT_ID_KEYS].some((k) => Array.isArray(obs[k]));
}

function formatFlow(flow) {
  if (!flow || typeof flow !== 'object') return String(flow);
  const from = flow.from ?? '?';
  const to = flow.to ?? '?';
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
    console.log(`Generated: ${observability.generatedAt}`);
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
    listSamples(items, (id) => String(id));
  }
}

function formatOutboxRow(row) {
  const intent = row.intent ? ` ${row.intent}` : '';
  const err = row.error ? ` err=${row.error}` : '';
  return `${row.status} ${row.id}${intent} attempts=${row.attempts ?? 0}${err}`;
}

function formatWorkflowRow(row) {
  const step = row.currentStep ? ` @${row.currentStep}` : '';
  const err = row.error ? ` err=${row.error}` : '';
  return `${row.status} ${row.name} (${row.id})${step}${err}`;
}

function isOutboxReady(outbox) {
  return Boolean(outbox && typeof outbox === 'object' && outbox.available === true);
}

function isWorkflowsReady(workflows) {
  return Boolean(workflows && typeof workflows === 'object' && workflows.available === true);
}

function renderQueuesAndWorkflows(outbox, workflows) {
  console.log(`\n--- Queues & Workflows ---`);

  if (!isOutboxReady(outbox) && !isWorkflowsReady(workflows)) {
    console.log(`${MUTED}Waiting for queues & workflows…${RESET}`);
    return;
  }

  if (!isOutboxReady(outbox)) {
    console.log(`${MUTED}Outbox: Waiting…${RESET}`);
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

  if (!isWorkflowsReady(workflows)) {
    console.log(`${MUTED}Workflows: Waiting…${RESET}`);
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

async function render() {
  process.stdout.write('\x1b[2J\x1b[H');
  console.log(`ArkGate Observability Dashboard`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Endpoint: ${targetUrl}\n`);

  const outboxUrl = siblingUrl(targetUrl, '/outbox');
  const workflowsUrl = siblingUrl(targetUrl, '/workflows');
  const [snapshot, outbox, workflows] = await Promise.all([
    fetchSnapshot(),
    fetchJson(outboxUrl),
    fetchJson(workflowsUrl),
  ]);

  console.log(`--- Hardening Status ---`);
  if (!snapshot) {
    console.log(`${YELLOW}Waiting for kernel...${RESET}`);
  } else {
    const components = snapshot.package?.components || [];
    const memoryStores = components.filter(c =>
      c.id && (c.id.includes('InMemoryEventBuffer') || c.id.includes('InMemoryAuditStore') || c.id.includes('InMemoryWorkflowStore'))
    );

    if (memoryStores.length > 0) {
      console.log(`${RED}[WARNING] Memory defaults in use!${RESET}`);
      memoryStores.forEach(c => console.log(`  - ${YELLOW}${c.id}${RESET}`));
    } else {
      console.log(`${GREEN}[OK] Durable Stores Configured${RESET}`);
    }
  }

  renderDriftRadar(snapshot?.observability);

  const outboxData = isOutboxReady(outbox)
    ? outbox
    : isOutboxReady(snapshot?.outbox)
      ? snapshot.outbox
      : outbox;
  const workflowsData = isWorkflowsReady(workflows)
    ? workflows
    : isWorkflowsReady(snapshot?.workflows)
      ? snapshot.workflows
      : workflows;
  renderQueuesAndWorkflows(outboxData, workflowsData);
}

async function startDashboard() {
  console.log(`Starting ArkGate Observability Dashboard (polling every ${interval}ms)`);

  while (true) {
    await render();
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

startDashboard().catch(err => {
  console.error(err);
  process.exit(1);
});
