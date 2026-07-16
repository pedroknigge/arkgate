/**
 * Canonical, pure contract for ark.config.json.
 *
 * Tooling adapters own filesystem I/O; this module owns JSON parsing, deterministic
 * migration, defaults, validation, diagnostics, and the published JSON Schema.
 * The standalone CLI artifact is generated into bin/lib/config-contract.mjs.
 */

import type {
  ArkConfig,
  ArkConfigIssue,
  ArkConfigLoadResult,
  ArkConfigMigrationResult,
  ArkConfigRule,
  ArkConfigSchemaVersion,
  SchemaNode,
  SchemaRoot,
} from './configTypes';

export type {
  ArkConfig,
  ArkConfigCyclePolicy,
  ArkConfigIssue,
  ArkConfigLayer,
  ArkConfigLoadResult,
  ArkConfigMigrationResult,
  ArkConfigRule,
  ArkConfigSafety,
  ArkConfigSchemaVersion,
} from './configTypes';

export const ARK_CONFIG_SCHEMA_VERSION: ArkConfigSchemaVersion = '1.0';
export const ARK_CONFIG_SCHEMA_URL =
  'https://unpkg.com/arkgate@2/schemas/ark.config.schema.json';

const DEFAULT_LAYER_NAMES = [
  'DomainModel',
  'ApplicationOrchestration',
  'PersistenceAdapters',
  'IntegrationAdapters',
  'WorkflowSagaEngine',
  'BackgroundJobsScheduling',
  'PresentationAdapters',
  'ReportingReadModels',
  'ExtensibilityMetadata',
  'SecurityAuditObservability',
  'Kernel',
] as const;

const DEFAULT_ALLOWED_FLOWS = new Set([
  'PresentationAdapters->ApplicationOrchestration',
  'ApplicationOrchestration->DomainModel',
  'WorkflowSagaEngine->ApplicationOrchestration',
  'WorkflowSagaEngine->DomainModel',
  'BackgroundJobsScheduling->ApplicationOrchestration',
]);

function createDefaultRules(): ArkConfigRule[] {
  const rules: ArkConfigRule[] = [];
  for (const from of DEFAULT_LAYER_NAMES) {
    for (const to of DEFAULT_LAYER_NAMES) {
      if (from === to || DEFAULT_ALLOWED_FLOWS.has(`${from}->${to}`)) continue;
      rules.push({ from, to, allowed: false });
    }
  }
  return rules;
}

export const DEFAULT_ARK_CONFIG_RULES = createDefaultRules();

export const ARK_CONFIG_MIGRATIONS = [
  { from: 'unversioned', to: ARK_CONFIG_SCHEMA_VERSION },
] as const;

const stringArraySchema = {
  type: 'array',
  items: { type: 'string', minLength: 1 },
  uniqueItems: true,
} as const;

export const ARK_CONFIG_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: ARK_CONFIG_SCHEMA_URL,
  title: 'ArkGate architecture contract',
  description: 'Versioned contract consumed identically by ArkGate CLI, MCP, and ESLint surfaces.',
  type: 'object',
  additionalProperties: false,
  required: ['$schema', 'schemaVersion', 'include', 'layers', 'rules'],
  properties: {
    $schema: {
      type: 'string',
      minLength: 1,
      default: ARK_CONFIG_SCHEMA_URL,
      description: 'Editor-facing URL or local path for this JSON Schema.',
    },
    schemaVersion: {
      type: 'string',
      const: ARK_CONFIG_SCHEMA_VERSION,
      default: ARK_CONFIG_SCHEMA_VERSION,
    },
    name: { type: 'string', minLength: 1 },
    include: { ...stringArraySchema, minItems: 1, default: ['src'] },
    exclude: { ...stringArraySchema, default: [] },
    excludeGenerated: { type: 'boolean', default: true },
    frameworkOverlay: { type: 'string', minLength: 1 },
    layers: {
      type: 'array',
      default: [],
      items: { $ref: '#/$defs/layer' },
    },
    rules: {
      type: 'array',
      default: DEFAULT_ARK_CONFIG_RULES,
      items: { $ref: '#/$defs/rule' },
    },
    cyclePolicy: {
      type: 'string',
      enum: ['strict', 'soft', 'framework-soft', 'off'],
      default: 'strict',
    },
    dynamicImportAllowlist: { ...stringArraySchema, default: [] },
    safety: {
      $ref: '#/$defs/safety',
      default: {
        maxTsSuppressions: 0,
        maxAnyCasts: 0,
        allowInMemory: false,
        allowDisabledPeerIsolation: false,
      },
    },
  },
  $defs: {
    layer: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'patterns'],
      properties: {
        name: { type: 'string', minLength: 1 },
        patterns: { ...stringArraySchema, minItems: 1 },
        exclude: stringArraySchema,
        intentPrefixes: stringArraySchema,
        description: { type: 'string', minLength: 1 },
        forbiddenGlobals: stringArraySchema,
        mayImportInfrastructure: { type: 'boolean' },
        optional: { type: 'boolean' },
      },
    },
    rule: {
      type: 'object',
      additionalProperties: false,
      required: ['from', 'to', 'allowed'],
      properties: {
        from: { type: 'string', minLength: 1 },
        to: { type: 'string', minLength: 1 },
        allowed: { type: 'boolean' },
        message: { type: 'string', minLength: 1 },
        peerIsolation: { type: 'boolean' },
        sliceFolders: { ...stringArraySchema, minItems: 1 },
      },
    },
    safety: {
      type: 'object',
      additionalProperties: false,
      properties: {
        maxTsSuppressions: { type: 'integer', minimum: 0, default: 0 },
        maxAnyCasts: { type: 'integer', minimum: 0, default: 0 },
        allowInMemory: { type: 'boolean', default: false },
        allowDisabledPeerIsolation: { type: 'boolean', default: false },
      },
    },
  },
} as const;

export class ArkConfigValidationError extends Error {
  readonly issues: ArkConfigIssue[];
  readonly source: string;

  constructor(source: string, issues: ArkConfigIssue[]) {
    super(
      `Invalid ArkGate config (${source}):\n${issues
        .map((issue) => `- ${issue.path}: ${issue.message}`)
        .join('\n')}`
    );
    this.name = 'ArkConfigValidationError';
    this.source = source;
    this.issues = issues;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function propertyPath(parent: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `${parent}.${key}`
    : `${parent}[${JSON.stringify(key)}]`;
}

function valueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function resolveSchemaRef(ref: string, root: SchemaRoot): SchemaNode | undefined {
  const prefix = '#/$defs/';
  if (!ref.startsWith(prefix)) return undefined;
  return root.$defs[ref.slice(prefix.length)];
}

function validateNode(
  value: unknown,
  schema: SchemaNode,
  path: string,
  root: SchemaRoot,
  issues: ArkConfigIssue[]
): void {
  if (schema.$ref) {
    const referenced = resolveSchemaRef(schema.$ref, root);
    if (!referenced) {
      issues.push({ path, message: `schema reference ${schema.$ref} cannot be resolved` });
      return;
    }
    validateNode(value, referenced, path, root, issues);
    return;
  }

  if (schema.const !== undefined && !Object.is(value, schema.const)) {
    issues.push({ path, message: `must equal ${JSON.stringify(schema.const)}` });
    return;
  }
  if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    issues.push({ path, message: `must be one of ${schema.enum.map(String).join(', ')}` });
    return;
  }

  if (schema.type === 'object') {
    if (!isObject(value)) {
      issues.push({ path, message: `must be an object; received ${valueType(value)}` });
      return;
    }
    const properties = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (value[key] === undefined) {
        issues.push({ path: propertyPath(path, key), message: 'is required' });
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          issues.push({ path: propertyPath(path, key), message: 'unknown field' });
        }
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (value[key] !== undefined) {
        validateNode(value[key], childSchema, propertyPath(path, key), root, issues);
      }
    }
    return;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      issues.push({ path, message: `must be an array; received ${valueType(value)}` });
      return;
    }
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issues.push({ path, message: `must contain at least ${schema.minItems} item(s)` });
    }
    if (schema.uniqueItems) {
      const serialized = value.map((entry) => JSON.stringify(entry));
      if (new Set(serialized).size !== serialized.length) {
        issues.push({ path, message: 'must not contain duplicate items' });
      }
    }
    if (schema.items) {
      value.forEach((entry, index) =>
        validateNode(entry, schema.items!, `${path}[${index}]`, root, issues)
      );
    }
    return;
  }

  if (schema.type === 'string') {
    if (typeof value !== 'string') {
      issues.push({ path, message: `must be a string; received ${valueType(value)}` });
      return;
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push({ path, message: `must contain at least ${schema.minLength} character(s)` });
    }
    return;
  }

  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') {
      issues.push({ path, message: `must be a boolean; received ${valueType(value)}` });
    }
    return;
  }

  if (schema.type === 'integer') {
    if (!Number.isInteger(value)) {
      issues.push({ path, message: `must be an integer; received ${valueType(value)}` });
      return;
    }
    if (schema.minimum !== undefined && (value as number) < schema.minimum) {
      issues.push({ path, message: `must be at least ${schema.minimum}` });
    }
  }
}

function defaultedConfig(input: Record<string, unknown>): Record<string, unknown> {
  return {
    ...input,
    $schema: input.$schema === undefined ? ARK_CONFIG_SCHEMA_URL : input.$schema,
    schemaVersion:
      input.schemaVersion === undefined ? ARK_CONFIG_SCHEMA_VERSION : input.schemaVersion,
    include: input.include === undefined ? ['src'] : input.include,
    layers: input.layers === undefined ? [] : input.layers,
    rules:
      input.rules === undefined
        ? DEFAULT_ARK_CONFIG_RULES.map((rule) => ({ ...rule }))
        : input.rules,
  };
}

export function migrateArkConfig(
  input: unknown,
  source = 'ark.config.json'
): ArkConfigMigrationResult {
  if (!isObject(input)) {
    throw new ArkConfigValidationError(source, [
      { path: '$', message: `must be an object; received ${valueType(input)}` },
    ]);
  }

  const migratedFrom = input.schemaVersion === undefined ? 'unversioned' : null;
  if (
    input.schemaVersion !== undefined &&
    input.schemaVersion !== ARK_CONFIG_SCHEMA_VERSION
  ) {
    throw new ArkConfigValidationError(source, [
      {
        path: '$.schemaVersion',
        message: `unsupported version ${JSON.stringify(input.schemaVersion)}; expected ${ARK_CONFIG_SCHEMA_VERSION}`,
      },
    ]);
  }

  return { candidate: defaultedConfig(input), migratedFrom };
}

export function loadArkConfigContract(
  input: unknown,
  source = 'ark.config.json'
): ArkConfigLoadResult {
  const { candidate, migratedFrom } = migrateArkConfig(input, source);
  const issues: ArkConfigIssue[] = [];
  validateNode(
    candidate,
    ARK_CONFIG_SCHEMA as unknown as SchemaRoot,
    '$',
    ARK_CONFIG_SCHEMA as unknown as SchemaRoot,
    issues
  );
  if (issues.length > 0) throw new ArkConfigValidationError(source, issues);

  return { config: candidate as ArkConfig, migratedFrom };
}

export function parseArkConfigJson(
  json: string,
  source = 'ark.config.json'
): ArkConfigLoadResult {
  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch (error) {
    throw new ArkConfigValidationError(source, [
      {
        path: '$',
        message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      },
    ]);
  }
  return loadArkConfigContract(input, source);
}

export function withArkConfigMetadata<T extends Record<string, unknown>>(
  config: T
): T & Pick<ArkConfig, '$schema' | 'schemaVersion'> {
  const result: Record<string, unknown> = {
    $schema:
      typeof config.$schema === 'string' && config.$schema.length > 0
        ? config.$schema
        : ARK_CONFIG_SCHEMA_URL,
    schemaVersion: ARK_CONFIG_SCHEMA_VERSION,
  };
  for (const [key, value] of Object.entries(config)) {
    if (key !== '$schema' && key !== 'schemaVersion') result[key] = value;
  }
  return result as T & Pick<ArkConfig, '$schema' | 'schemaVersion'>;
}
