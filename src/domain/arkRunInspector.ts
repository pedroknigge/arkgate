/**
 * Closed ArkRun inspector bind + snapshot vocabulary (RN12).
 * Pure plan only — HTTP listen is Kernel. Not a durability claim.
 */
import {
  ARK_RUN_INFORMATION_PACKAGE_SCHEMA_VERSION,
  buildDependencyInformationPackage,
  type DependencyInformationPackage,
} from './arkRunInformationPackage';
import {
  ARK_RUN_EPHEMERAL_DEFAULT,
  ARK_RUN_TRANSPORT_KINDS,
  type ArkRunTransportKind,
} from './arkRunTransport';

export const ARK_RUN_INSPECTOR_SCHEMA_VERSION = '1.0' as const;
export const ARK_RUN_INSPECTOR_DEFAULT_HOST = '127.0.0.1';
export const ARK_RUN_INSPECTOR_DEFAULT_PORT = 0;
export const ARK_RUN_INSPECTOR_SNAPSHOT_PATH = '/snapshot';
export const ARK_RUN_INSPECTOR_EVENTS_PATH = '/events';
export const ARK_RUN_INSPECTOR_GRAPH_PATH = '/graph';
export const ARK_RUN_INSPECTOR_OUTBOX_PATH = '/outbox';
export const ARK_RUN_INSPECTOR_WORKFLOWS_PATH = '/workflows';
export const ARK_RUN_INSPECTOR_SSE_EVENT = 'snapshot';
export const ARK_RUN_INSPECTOR_TRANSPORT_FALLBACK = 'in-process-local' as const;

/** Outbox statuses the Queues monitor surfaces (dispatched is omitted). */
export const ARK_RUN_INSPECTOR_OUTBOX_MONITOR_STATUSES = ['pending', 'failed'] as const;
export type ArkRunInspectorOutboxMonitorStatus =
  (typeof ARK_RUN_INSPECTOR_OUTBOX_MONITOR_STATUSES)[number];

export type ArkRunInspectorOutboxRecordSummary = {
  id: string;
  status: ArkRunInspectorOutboxMonitorStatus;
  attempts: number;
  intent?: string;
  error?: string;
  updatedAt?: string;
};

export type ArkRunInspectorOutboxMonitor = {
  available: boolean;
  pendingCount: number;
  failedCount: number;
  pending: ArkRunInspectorOutboxRecordSummary[];
  failed: ArkRunInspectorOutboxRecordSummary[];
};

export type ArkRunInspectorWorkflowSummary = {
  id: string;
  name: string;
  status: string;
  currentStep?: string;
  error?: string;
};

export type ArkRunInspectorWorkflowsMonitor = {
  available: boolean;
  total: number;
  runningCount: number;
  compensatingCount: number;
  failedCount: number;
  pendingCount: number;
  workflows: ArkRunInspectorWorkflowSummary[];
};

export class ArkRunInspectorProductionError extends Error {
  constructor() {
    super('ArkRun inspector refuses to start when NODE_ENV=production.');
    this.name = 'ArkRunInspectorProductionError';
  }
}

export class ArkRunInspectorBindError extends Error {
  constructor(host: string) {
    super(
      `ArkRun inspector binds loopback only (default 127.0.0.1). Public host "${host}" is rejected.`
    );
    this.name = 'ArkRunInspectorBindError';
  }
}

export type ArkRunInspectorBind = {
  host: string;
  port: number;
};

export type ArkRunInspectorTransportFacts = {
  kinds: ArkRunTransportKind[];
  ephemeralDefault: boolean;
  brokerBound: boolean;
  cloudSdksShipped: false;
  fallback: typeof ARK_RUN_INSPECTOR_TRANSPORT_FALLBACK;
};

export type ArkRunInspectorSnapshot = {
  schemaVersion: typeof ARK_RUN_INSPECTOR_SCHEMA_VERSION;
  kernelInstanceId: string;
  bind: { host: string; port: number; loopback: true };
  package: DependencyInformationPackage;
  transport: ArkRunInspectorTransportFacts;
  observability: unknown;
  /** Optional OD04 queue facts when the caller supplies them (endpoints preferred). */
  outbox?: ArkRunInspectorOutboxMonitor;
  /** Optional OD04 workflow facts when the caller supplies them (endpoints preferred). */
  workflows?: ArkRunInspectorWorkflowsMonitor;
};

export type ArkRunInspectorBindInput = {
  host?: unknown;
  port?: unknown;
  nodeEnv?: unknown;
  processNodeEnv?: unknown;
};

export type ArkRunInspectorSnapshotInput = {
  kernelInstanceId?: unknown;
  host?: unknown;
  port?: unknown;
  package?: unknown;
  observability?: unknown;
  ephemeralDefault?: unknown;
  brokerBound?: unknown;
  outbox?: unknown;
  workflows?: unknown;
};

const PUBLIC_HOSTS = new Set([
  '',
  '*',
  '0',
  '0.0.0.0',
  '::',
  '::0',
  '[::]',
  '[::0]',
  '::ffff:0.0.0.0',
  '[::ffff:0.0.0.0]',
]);

export function isArkRunInspectorProductionEnv(nodeEnv: unknown): boolean {
  return nodeEnv === 'production';
}

function ipv4Octets(host: string): number[] | undefined {
  const parts = host.split('.');
  if (parts.length !== 4) return undefined;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined;
    const n = Number(part);
    if (n > 255) return undefined;
    octets.push(n);
  }
  return octets;
}

function unwrapIpv4Mapped(host: string): string | undefined {
  if (host.startsWith('[::ffff:') && host.endsWith(']')) {
    return host.slice(8, -1);
  }
  if (host.startsWith('::ffff:')) return host.slice(7);
  return undefined;
}

export function isArkRunInspectorLoopbackHost(host: unknown): boolean {
  if (typeof host !== 'string') return false;
  const normalized = host.trim().toLowerCase();
  if (normalized === 'localhost' || normalized === '::1' || normalized === '[::1]') {
    return true;
  }
  const mapped = unwrapIpv4Mapped(normalized);
  if (mapped) return isArkRunInspectorLoopbackHost(mapped);
  const octets = ipv4Octets(normalized);
  return octets !== undefined && octets[0] === 127;
}

function closedHost(value: unknown): string {
  if (value === undefined) return ARK_RUN_INSPECTOR_DEFAULT_HOST;
  if (typeof value !== 'string') {
    throw new ArkRunInspectorBindError(String(value));
  }
  const host = value.trim();
  if (PUBLIC_HOSTS.has(host.toLowerCase()) || !isArkRunInspectorLoopbackHost(host)) {
    throw new ArkRunInspectorBindError(host);
  }
  const lower = host.toLowerCase();
  if (lower === 'localhost') return ARK_RUN_INSPECTOR_DEFAULT_HOST;
  if (lower === '[::1]') return '::1';
  const mapped = unwrapIpv4Mapped(lower);
  if (mapped) return closedHost(mapped);
  return lower;
}

function closedPort(value: unknown): number {
  if (value === undefined) return ARK_RUN_INSPECTOR_DEFAULT_PORT;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 65535) {
    throw new ArkRunInspectorBindError(`port:${String(value)}`);
  }
  return value;
}

export function resolveArkRunInspectorBind(
  input: ArkRunInspectorBindInput = {}
): ArkRunInspectorBind {
  if (
    isArkRunInspectorProductionEnv(input.nodeEnv) ||
    isArkRunInspectorProductionEnv(input.processNodeEnv)
  ) {
    throw new ArkRunInspectorProductionError();
  }
  return {
    host: closedHost(input.host),
    port: closedPort(input.port),
  };
}

export function arkRunInspectorUrl(host: string, port: number, path: string): string {
  const authority = host.includes(':') ? `[${host}]` : host;
  return `http://${authority}:${port}${path}`;
}

function jsonClone(value: unknown): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return undefined;
  }
}

function closedTransportFacts(input: {
  ephemeralDefault?: unknown;
  brokerBound?: unknown;
}): ArkRunInspectorTransportFacts {
  return {
    kinds: [...ARK_RUN_TRANSPORT_KINDS],
    ephemeralDefault: input.ephemeralDefault === false ? false : ARK_RUN_EPHEMERAL_DEFAULT,
    brokerBound: input.brokerBound === true,
    cloudSdksShipped: false,
    fallback: ARK_RUN_INSPECTOR_TRANSPORT_FALLBACK,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function closedOutboxSummary(value: unknown): ArkRunInspectorOutboxRecordSummary | undefined {
  const row = asRecord(value);
  if (!row || typeof row.id !== 'string') return undefined;
  const status = row.status;
  if (status !== 'pending' && status !== 'failed') return undefined;
  const event = asRecord(row.event);
  const intent =
    event && typeof event.intent === 'string'
      ? event.intent
      : typeof row.intent === 'string'
        ? row.intent
        : undefined;
  const summary: ArkRunInspectorOutboxRecordSummary = {
    id: row.id,
    status,
    attempts: typeof row.attempts === 'number' && Number.isFinite(row.attempts) ? row.attempts : 0,
  };
  if (intent) summary.intent = intent;
  if (typeof row.error === 'string' && row.error.length > 0) summary.error = row.error;
  if (typeof row.updatedAt === 'string') summary.updatedAt = row.updatedAt;
  return summary;
}

/**
 * Sanitize EventBufferStore.list rows into pending/failed monitor facts (no payloads).
 */
export function buildArkRunInspectorOutboxMonitor(
  records: unknown = []
): ArkRunInspectorOutboxMonitor {
  const list = Array.isArray(records) ? records : [];
  const pending: ArkRunInspectorOutboxRecordSummary[] = [];
  const failed: ArkRunInspectorOutboxRecordSummary[] = [];
  for (const row of list) {
    const summary = closedOutboxSummary(row);
    if (!summary) continue;
    if (summary.status === 'pending') pending.push(summary);
    else failed.push(summary);
  }
  return {
    available: true,
    pendingCount: pending.length,
    failedCount: failed.length,
    pending,
    failed,
  };
}

export function unavailableArkRunInspectorOutboxMonitor(): ArkRunInspectorOutboxMonitor {
  return {
    available: false,
    pendingCount: 0,
    failedCount: 0,
    pending: [],
    failed: [],
  };
}

function closedWorkflowSummary(value: unknown): ArkRunInspectorWorkflowSummary | undefined {
  const row = asRecord(value);
  if (!row || typeof row.id !== 'string') return undefined;
  const name =
    typeof row.workflowName === 'string'
      ? row.workflowName
      : typeof row.name === 'string'
        ? row.name
        : undefined;
  if (!name) return undefined;
  const summary: ArkRunInspectorWorkflowSummary = {
    id: row.id,
    name,
    status: typeof row.status === 'string' ? row.status : 'unknown',
  };
  if (typeof row.currentStep === 'string') summary.currentStep = row.currentStep;
  if (typeof row.error === 'string' && row.error.length > 0) summary.error = row.error;
  return summary;
}

function isPendingWorkflowStatus(status: string): boolean {
  return status === 'idle' || status === 'waiting';
}

/**
 * Sanitize WorkflowEngine.list rows into monitor facts (id/name/status/step/error only).
 */
export function buildArkRunInspectorWorkflowsMonitor(
  snapshots: unknown = []
): ArkRunInspectorWorkflowsMonitor {
  const list = Array.isArray(snapshots) ? snapshots : [];
  const workflows: ArkRunInspectorWorkflowSummary[] = [];
  let runningCount = 0;
  let compensatingCount = 0;
  let failedCount = 0;
  let pendingCount = 0;
  for (const row of list) {
    const summary = closedWorkflowSummary(row);
    if (!summary) continue;
    workflows.push(summary);
    if (summary.status === 'running') runningCount += 1;
    else if (summary.status === 'compensating') compensatingCount += 1;
    else if (summary.status === 'failed') failedCount += 1;
    else if (isPendingWorkflowStatus(summary.status)) pendingCount += 1;
  }
  return {
    available: true,
    total: workflows.length,
    runningCount,
    compensatingCount,
    failedCount,
    pendingCount,
    workflows,
  };
}

export function unavailableArkRunInspectorWorkflowsMonitor(): ArkRunInspectorWorkflowsMonitor {
  return {
    available: false,
    total: 0,
    runningCount: 0,
    compensatingCount: 0,
    failedCount: 0,
    pendingCount: 0,
    workflows: [],
  };
}

function closedOutboxMonitor(value: unknown): ArkRunInspectorOutboxMonitor | undefined {
  if (value === undefined) return undefined;
  const row = asRecord(value);
  if (!row) return unavailableArkRunInspectorOutboxMonitor();
  if (row.available === false) return unavailableArkRunInspectorOutboxMonitor();
  if (Array.isArray(row.pending) || Array.isArray(row.failed) || Array.isArray(row.records)) {
    const records = [
      ...(Array.isArray(row.pending) ? row.pending : []),
      ...(Array.isArray(row.failed) ? row.failed : []),
      ...(Array.isArray(row.records) ? row.records : []),
    ];
    return buildArkRunInspectorOutboxMonitor(records);
  }
  return unavailableArkRunInspectorOutboxMonitor();
}

function closedWorkflowsMonitor(value: unknown): ArkRunInspectorWorkflowsMonitor | undefined {
  if (value === undefined) return undefined;
  const row = asRecord(value);
  if (!row) return unavailableArkRunInspectorWorkflowsMonitor();
  if (row.available === false) return unavailableArkRunInspectorWorkflowsMonitor();
  if (Array.isArray(row.workflows)) {
    return buildArkRunInspectorWorkflowsMonitor(row.workflows);
  }
  return unavailableArkRunInspectorWorkflowsMonitor();
}

export function buildArkRunInspectorSnapshot(
  input: ArkRunInspectorSnapshotInput = {}
): ArkRunInspectorSnapshot {
  const bind = resolveArkRunInspectorBind({
    host: input.host,
    port: input.port,
  });
  const pkg = buildDependencyInformationPackage({
    kernelInstanceId: input.kernelInstanceId,
    components:
      input.package &&
      typeof input.package === 'object' &&
      !Array.isArray(input.package) &&
      Array.isArray((input.package as { components?: unknown }).components)
        ? (input.package as { components: unknown[] }).components
        : [],
  });
  const outbox = closedOutboxMonitor(input.outbox);
  const workflows = closedWorkflowsMonitor(input.workflows);
  const snapshot: ArkRunInspectorSnapshot = {
    schemaVersion: ARK_RUN_INSPECTOR_SCHEMA_VERSION,
    kernelInstanceId:
      typeof input.kernelInstanceId === 'string'
        ? input.kernelInstanceId
        : pkg.kernelInstanceId,
    bind: { host: bind.host, port: bind.port, loopback: true },
    package: {
      ...pkg,
      schemaVersion: ARK_RUN_INFORMATION_PACKAGE_SCHEMA_VERSION,
    },
    transport: closedTransportFacts(input),
    observability: jsonClone(input.observability) ?? {},
  };
  if (outbox) snapshot.outbox = outbox;
  if (workflows) snapshot.workflows = workflows;
  return snapshot;
}

export function formatArkRunInspectorSseEvent(snapshot: unknown): string {
  return `event: ${ARK_RUN_INSPECTOR_SSE_EVENT}\ndata: ${JSON.stringify(snapshot)}\n\n`;
}
