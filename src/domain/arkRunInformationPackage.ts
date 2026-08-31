/**
 * Serializable ArkRun information package (ADR 0023 D4).
 * Tooling snapshot only — never a gate verdict. Strips factories, live
 * instances, and input DTOs so inspectors cannot reach construction.
 */

export const ARK_RUN_INFORMATION_PACKAGE_SCHEMA_VERSION = '1.0' as const;

export const ARK_RUN_COMPONENT_LIFETIMES = ['singleton', 'transient'] as const;

export type ArkRunComponentLifetime = (typeof ARK_RUN_COMPONENT_LIFETIMES)[number];

export type ArkRunExtendedInfo = {
  label?: string;
  architectureKind?: string;
  tags?: string[];
  group?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type ArkRunInformationPackageComponent = {
  id: string;
  lifetime: ArkRunComponentLifetime;
  uses: string[];
  reactsTo: string[];
  raises: string[];
  sends: string[];
  extendedInfo?: ArkRunExtendedInfo;
};

export const ARK_RUN_DECISION_TAPE_RESIDUAL_KINDS = ['absorb', 'escalate_up', 'hold'] as const;
export type ArkRunDecisionTapeResidualKind = (typeof ARK_RUN_DECISION_TAPE_RESIDUAL_KINDS)[number];

/** Additive Order residual tape (ADR 0034 D6). Not a bus. Not durable. */
export type ArkRunDecisionTapeRecord = {
  xiHash: string;
  event: { kind: string; payload?: Record<string, string | number | boolean | null> };
  residual: {
    kind: ArkRunDecisionTapeResidualKind;
    reasonCode?: string;
    eventId?: string;
    target?: string;
  };
};

export type DependencyInformationPackage = {
  schemaVersion: typeof ARK_RUN_INFORMATION_PACKAGE_SCHEMA_VERSION;
  kernelInstanceId: string;
  components: ArkRunInformationPackageComponent[];
  /** Optional; omitted keeps the 4.8.x component snapshot shape. */
  decisionTape?: ArkRunDecisionTapeRecord[];
};

const LIFETIME = new Set<string>(ARK_RUN_COMPONENT_LIFETIMES);

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compare);
}

function nameList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0) names.push(item);
  }
  return uniqueSorted(names);
}

function jsonPrimitive(value: unknown): string | number | boolean | null | undefined {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

function closedLifetime(value: unknown): ArkRunComponentLifetime {
  return typeof value === 'string' && LIFETIME.has(value)
    ? (value as ArkRunComponentLifetime)
    : 'singleton';
}

function sanitizeMetadata(
  value: unknown
): Record<string, string | number | boolean | null> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort(compare)) {
    if (key.length === 0) continue;
    const primitive = jsonPrimitive((value as Record<string, unknown>)[key]);
    if (primitive === undefined) continue;
    out[key] = primitive;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function sanitizeArkRunExtendedInfo(value: unknown): ArkRunExtendedInfo | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const info: ArkRunExtendedInfo = {};
  if (typeof record.label === 'string' && record.label.length > 0) info.label = record.label;
  if (typeof record.architectureKind === 'string' && record.architectureKind.length > 0) {
    info.architectureKind = record.architectureKind;
  }
  const tags = nameList(record.tags);
  if (tags.length > 0) info.tags = tags;
  if (typeof record.group === 'string' && record.group.length > 0) info.group = record.group;
  const metadata = sanitizeMetadata(record.metadata);
  if (metadata) info.metadata = metadata;
  return Object.keys(info).length > 0 ? info : undefined;
}

export function sanitizeArkRunComponent(
  value: unknown
): ArkRunInformationPackageComponent | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!id) return undefined;
  const component: ArkRunInformationPackageComponent = {
    id,
    lifetime: closedLifetime(record.lifetime),
    uses: nameList(record.uses),
    reactsTo: nameList(record.reactsTo),
    raises: nameList(record.raises),
    sends: nameList(record.sends),
  };
  const extendedInfo = sanitizeArkRunExtendedInfo(record.extendedInfo);
  if (extendedInfo) component.extendedInfo = extendedInfo;
  return component;
}

/**
 * Build a JSON-serializable snapshot from unknown component records.
 * Only id, lifetime, the four declaration lists, and optional extendedInfo
 * survive — extra keys (factory, instance, DTO payloads) are dropped.
 */
const RESIDUAL_KINDS = new Set<string>(ARK_RUN_DECISION_TAPE_RESIDUAL_KINDS);

function sanitizeTapePayload(
  value: unknown
): Record<string, string | number | boolean | null> | undefined {
  return sanitizeMetadata(value);
}

export function sanitizeDecisionTapeRecord(value: unknown): ArkRunDecisionTapeRecord | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const xiHash = typeof record.xiHash === 'string' ? record.xiHash.trim() : '';
  if (!xiHash) return undefined;
  const eventRaw = record.event;
  if (eventRaw === null || typeof eventRaw !== 'object' || Array.isArray(eventRaw)) return undefined;
  const eventRecord = eventRaw as Record<string, unknown>;
  const kind = typeof eventRecord.kind === 'string' ? eventRecord.kind.trim() : '';
  if (!kind) return undefined;
  const residualRaw = record.residual;
  if (residualRaw === null || typeof residualRaw !== 'object' || Array.isArray(residualRaw)) {
    return undefined;
  }
  const residualRecord = residualRaw as Record<string, unknown>;
  const residualKind =
    typeof residualRecord.kind === 'string' && RESIDUAL_KINDS.has(residualRecord.kind)
      ? (residualRecord.kind as ArkRunDecisionTapeResidualKind)
      : undefined;
  if (!residualKind) return undefined;
  const event: ArkRunDecisionTapeRecord['event'] = { kind };
  const payload = sanitizeTapePayload(eventRecord.payload);
  if (payload) event.payload = payload;
  const residual: ArkRunDecisionTapeRecord['residual'] = { kind: residualKind };
  if (typeof residualRecord.reasonCode === 'string' && residualRecord.reasonCode.length > 0) {
    residual.reasonCode = residualRecord.reasonCode;
  }
  if (typeof residualRecord.eventId === 'string' && residualRecord.eventId.length > 0) {
    residual.eventId = residualRecord.eventId;
  }
  if (typeof residualRecord.target === 'string' && residualRecord.target.length > 0) {
    residual.target = residualRecord.target;
  }
  return { xiHash, event, residual };
}

export function sanitizeDecisionTape(value: unknown): ArkRunDecisionTapeRecord[] {
  if (!Array.isArray(value)) return [];
  const out: ArkRunDecisionTapeRecord[] = [];
  for (const entry of value) {
    const record = sanitizeDecisionTapeRecord(entry);
    if (record) out.push(record);
  }
  return out;
}

export function buildDependencyInformationPackage(input: {
  kernelInstanceId?: unknown;
  components?: unknown;
  decisionTape?: unknown;
}): DependencyInformationPackage {
  const kernelInstanceId =
    typeof input.kernelInstanceId === 'string' ? input.kernelInstanceId : '';
  const raw = Array.isArray(input.components) ? input.components : [];
  const seen = new Set<string>();
  const components: ArkRunInformationPackageComponent[] = [];
  for (const entry of raw) {
    const component = sanitizeArkRunComponent(entry);
    if (!component || seen.has(component.id)) continue;
    seen.add(component.id);
    components.push(component);
  }
  components.sort((left, right) => compare(left.id, right.id));
  const decisionTape = sanitizeDecisionTape(input.decisionTape);
  return {
    schemaVersion: ARK_RUN_INFORMATION_PACKAGE_SCHEMA_VERSION,
    kernelInstanceId,
    components,
    ...(decisionTape.length > 0 ? { decisionTape } : {}),
  };
}

export function appendDecisionTape(
  pack: DependencyInformationPackage,
  record: unknown
): DependencyInformationPackage {
  const next = sanitizeDecisionTapeRecord(record);
  const existing = pack.decisionTape ?? [];
  const tape = next ? [...existing, next] : [...existing];
  return {
    schemaVersion: pack.schemaVersion,
    kernelInstanceId: pack.kernelInstanceId,
    components: pack.components,
    ...(tape.length > 0 ? { decisionTape: tape } : {}),
  };
}
