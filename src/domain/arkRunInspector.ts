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
export const ARK_RUN_INSPECTOR_SSE_EVENT = 'snapshot';
export const ARK_RUN_INSPECTOR_TRANSPORT_FALLBACK = 'in-process-local' as const;

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
  return {
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
}

export function formatArkRunInspectorSseEvent(snapshot: unknown): string {
  return `event: ${ARK_RUN_INSPECTOR_SSE_EVENT}\ndata: ${JSON.stringify(snapshot)}\n\n`;
}
