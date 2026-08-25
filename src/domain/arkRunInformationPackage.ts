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

export type DependencyInformationPackage = {
  schemaVersion: typeof ARK_RUN_INFORMATION_PACKAGE_SCHEMA_VERSION;
  kernelInstanceId: string;
  components: ArkRunInformationPackageComponent[];
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
export function buildDependencyInformationPackage(input: {
  kernelInstanceId?: unknown;
  components?: unknown;
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
  return {
    schemaVersion: ARK_RUN_INFORMATION_PACKAGE_SCHEMA_VERSION,
    kernelInstanceId,
    components,
  };
}
