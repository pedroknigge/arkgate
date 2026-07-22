/** Pure, versioned contract for an optional architecture change map. */
import { deterministicHash, stableSerialize } from './stableHash';
import type { ArkConfig } from './configContract';
import { layerForRelativePath } from './layerMatch';

export const ARK_CHANGE_MAP_SCHEMA_VERSION = '1.0' as const;
export const ARK_CHANGE_MAP_SCHEMA_URL =
  'https://unpkg.com/arkgate@3/schemas/ark.change-map.schema.json';

export type ArchitectureChangeOperation = 'create' | 'update' | 'delete';

export type ArchitectureChangeMapFile = {
  path: string;
  operation: ArchitectureChangeOperation;
  layer: string;
};

export type ArchitectureChangeMapDependency = {
  from: string;
  to: string;
};

export type ArchitectureChangeMap = {
  $schema: string;
  schemaVersion: typeof ARK_CHANGE_MAP_SCHEMA_VERSION;
  files: ArchitectureChangeMapFile[];
  dependencies: ArchitectureChangeMapDependency[];
};

export type ArchitectureChangeMapContract = {
  map: ArchitectureChangeMap;
  hash: string;
};

export type ArchitectureChangeMapIssue = {
  path: string;
  message: string;
};

export class ArchitectureChangeMapValidationError extends Error {
  readonly issues: ArchitectureChangeMapIssue[];
  readonly source: string;

  constructor(source: string, issues: ArchitectureChangeMapIssue[]) {
    super(
      `Invalid architecture change map (${source}):\n${issues
        .map((issue) => `- ${issue.path}: ${issue.message}`)
        .join('\n')}`
    );
    this.name = 'ArchitectureChangeMapValidationError';
    this.source = source;
    this.issues = issues;
  }
}

const fileSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'operation', 'layer'],
  properties: {
    path: { type: 'string', minLength: 1 },
    operation: { type: 'string', enum: ['create', 'update', 'delete'] },
    layer: { type: 'string', minLength: 1 },
  },
} as const;

const dependencySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['from', 'to'],
  properties: {
    from: { type: 'string', minLength: 1 },
    to: { type: 'string', minLength: 1 },
  },
} as const;

export const ARK_CHANGE_MAP_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: ARK_CHANGE_MAP_SCHEMA_URL,
  title: 'ArkGate architecture change map',
  type: 'object',
  additionalProperties: false,
  required: ['$schema', 'schemaVersion', 'files'],
  properties: {
    $schema: { type: 'string', minLength: 1, default: ARK_CHANGE_MAP_SCHEMA_URL },
    schemaVersion: {
      type: 'string',
      const: ARK_CHANGE_MAP_SCHEMA_VERSION,
      default: ARK_CHANGE_MAP_SCHEMA_VERSION,
    },
    files: { type: 'array', minItems: 1, items: fileSchema },
    dependencies: { type: 'array', default: [], items: dependencySchema },
  },
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unknownFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  at: string,
  issues: ArchitectureChangeMapIssue[]
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push({ path: `${at}.${key}`, message: 'unknown field' });
  }
}

function requiredString(
  value: Record<string, unknown>,
  key: string,
  at: string,
  issues: ArchitectureChangeMapIssue[]
): string | undefined {
  const candidate = value[key];
  if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  issues.push({ path: `${at}.${key}`, message: 'must be a non-empty string' });
  return undefined;
}

function canonicalProjectPath(value: string): string | undefined {
  const portable = value.replace(/\\/g, '/');
  if (!portable || portable.startsWith('/') || /^[A-Za-z]:\//.test(portable) || portable.includes('\0')) {
    return undefined;
  }
  const segments: string[] = [];
  for (const segment of portable.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return undefined;
      segments.pop();
    } else segments.push(segment);
  }
  const normalized = segments.join('/');
  return normalized && normalized === portable ? normalized : undefined;
}

export function loadArchitectureChangeMap(
  input: unknown,
  config: ArkConfig,
  source = 'architecture change map'
): ArchitectureChangeMapContract {
  const issues: ArchitectureChangeMapIssue[] = [];
  if (!isObject(input)) {
    throw new ArchitectureChangeMapValidationError(source, [
      { path: '$', message: 'must be an object' },
    ]);
  }
  unknownFields(input, ['$schema', 'schemaVersion', 'files', 'dependencies'], '$', issues);
  const schema = requiredString(input, '$schema', '$', issues);
  const version = requiredString(input, 'schemaVersion', '$', issues);
  if (version && version !== ARK_CHANGE_MAP_SCHEMA_VERSION) {
    issues.push({
      path: '$.schemaVersion',
      message: `unsupported version ${JSON.stringify(version)}; expected ${ARK_CHANGE_MAP_SCHEMA_VERSION}`,
    });
  }

  const knownLayers = new Set(config.layers.map((layer) => layer.name));
  const files: ArchitectureChangeMapFile[] = [];
  const seenPaths = new Set<string>();
  if (!Array.isArray(input.files) || input.files.length === 0) {
    issues.push({ path: '$.files', message: 'must be a non-empty array' });
  } else {
    input.files.forEach((entry, index) => {
      const at = `$.files[${index}]`;
      if (!isObject(entry)) {
        issues.push({ path: at, message: 'must be an object' });
        return;
      }
      unknownFields(entry, ['path', 'operation', 'layer'], at, issues);
      const rawPath = requiredString(entry, 'path', at, issues);
      const operation = requiredString(entry, 'operation', at, issues);
      const layer = requiredString(entry, 'layer', at, issues);
      const path = rawPath ? canonicalProjectPath(rawPath) : undefined;
      if (rawPath && !path) {
        issues.push({ path: `${at}.path`, message: 'must be a canonical project-relative path' });
      }
      if (operation && !['create', 'update', 'delete'].includes(operation)) {
        issues.push({ path: `${at}.operation`, message: 'must be create, update, or delete' });
      }
      if (layer && !knownLayers.has(layer)) {
        issues.push({ path: `${at}.layer`, message: `references unknown layer ${JSON.stringify(layer)}` });
      }
      if (path && seenPaths.has(path)) {
        issues.push({ path: `${at}.path`, message: `duplicates planned path ${path}` });
      }
      if (path) seenPaths.add(path);
      const resolvedLayer = path ? layerForRelativePath(path, config.layers) : undefined;
      if (path && layer && knownLayers.has(layer) && resolvedLayer !== layer) {
        issues.push({
          path: `${at}.layer`,
          message: resolvedLayer
            ? `${path} resolves to ${resolvedLayer}, not ${layer}`
            : `${path} is not assigned to an architecture layer`,
        });
      }
      if (path && operation && ['create', 'update', 'delete'].includes(operation) && layer) {
        files.push({ path, operation: operation as ArchitectureChangeOperation, layer });
      }
    });
  }

  const dependencies: ArchitectureChangeMapDependency[] = [];
  const operations = new Map(files.map((file) => [file.path, file.operation]));
  const seenDependencies = new Set<string>();
  const rawDependencies = input.dependencies ?? [];
  if (!Array.isArray(rawDependencies)) {
    issues.push({ path: '$.dependencies', message: 'must be an array' });
  } else {
    rawDependencies.forEach((entry, index) => {
      const at = `$.dependencies[${index}]`;
      if (!isObject(entry)) {
        issues.push({ path: at, message: 'must be an object' });
        return;
      }
      unknownFields(entry, ['from', 'to'], at, issues);
      const from = requiredString(entry, 'from', at, issues);
      const to = requiredString(entry, 'to', at, issues);
      if (from && !seenPaths.has(from)) {
        issues.push({ path: `${at}.from`, message: `must reference a planned file path: ${from}` });
      }
      if (to && !seenPaths.has(to)) {
        issues.push({ path: `${at}.to`, message: `must reference a planned file path: ${to}` });
      }
      if (from && operations.get(from) === 'delete') {
        issues.push({ path: `${at}.from`, message: `cannot depend from deleted file ${from}` });
      }
      if (to && operations.get(to) === 'delete') {
        issues.push({ path: `${at}.to`, message: `cannot depend on deleted file ${to}` });
      }
      if (from && to && from === to) {
        issues.push({ path: at, message: 'must not declare a self dependency' });
      }
      const key = from && to ? `${from}\0${to}` : undefined;
      if (key && seenDependencies.has(key)) {
        issues.push({ path: at, message: `duplicates dependency ${from} -> ${to}` });
      }
      if (key) seenDependencies.add(key);
      if (from && to) dependencies.push({ from, to });
    });
  }

  if (issues.length > 0) throw new ArchitectureChangeMapValidationError(source, issues);
  const map: ArchitectureChangeMap = {
    $schema: schema!,
    schemaVersion: ARK_CHANGE_MAP_SCHEMA_VERSION,
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    dependencies: dependencies.sort(
      (left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to)
    ),
  };
  return { map, hash: deterministicHash(stableSerialize(map)) };
}
