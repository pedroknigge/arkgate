/**
 * Canonical, pure contract for ArkGate MCP project identity.
 *
 * Filesystem canonicalization, hashing, clocks, and runtime ids belong to the
 * Tooling adapter. This module owns the stable payload and published schemas so
 * every MCP surface speaks the same identity/binding language.
 */

export const ARK_PROJECT_IDENTITY_SCHEMA_VERSION = '1.0' as const;
export const ARK_PROJECT_IDENTITY_SCHEMA_URL =
  'https://unpkg.com/arkgate@4/schemas/ark.project-identity.schema.json';

export type ProjectIdentity = {
  schemaVersion: typeof ARK_PROJECT_IDENTITY_SCHEMA_VERSION;
  projectId: string;
  resolvedRoot: string;
  resolvedConfigPath: string;
  arkgateVersion: string;
  contractHash: string;
  contractSource: 'project' | 'default-profile' | 'manifest';
  runtimeId: string;
  processStartedAt: string;
};

export type ProjectExpectation = {
  expectedRoot?: string;
  expectedProjectId?: string;
};

export type ProjectBinding = {
  status: 'matched' | 'unverified' | 'mismatch';
  authoritative: boolean;
  expectedRoot?: string;
  expectedProjectId?: string;
  code?: 'PROJECT_ROOT_MISMATCH' | 'PROJECT_ID_MISMATCH' | 'INVALID_PROJECT_EXPECTATION';
  message?: string;
};

const sha256Pattern = '^sha256:[a-f0-9]{64}$';

export const PROJECT_EXPECTATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    expectedRoot: {
      type: 'string',
      minLength: 1,
      description:
        'Absolute expected workspace/project directory. The initial authoritative handshake ' +
        'requires the exact project root; descendant calls also require expectedProjectId.',
    },
    expectedProjectId: {
      type: 'string',
      pattern: sha256Pattern,
      description: 'Project id previously returned by ark_identity or ark_manifest.',
    },
  },
} as const;

export const PROJECT_BINDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'authoritative'],
  properties: {
    status: { enum: ['matched', 'unverified', 'mismatch'] },
    authoritative: { type: 'boolean' },
    expectedRoot: { type: 'string', minLength: 1 },
    expectedProjectId: { type: 'string', pattern: sha256Pattern },
    code: {
      enum: [
        'PROJECT_ROOT_MISMATCH',
        'PROJECT_ID_MISMATCH',
        'INVALID_PROJECT_EXPECTATION',
      ],
    },
    message: { type: 'string', minLength: 1 },
  },
} as const;

export const ARK_PROJECT_IDENTITY_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: ARK_PROJECT_IDENTITY_SCHEMA_URL,
  title: 'ArkGate MCP project identity',
  description:
    'Stable project binding plus separate runtime and architecture-contract evidence.',
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'projectId',
    'resolvedRoot',
    'resolvedConfigPath',
    'arkgateVersion',
    'contractHash',
    'contractSource',
    'runtimeId',
    'processStartedAt',
  ],
  properties: {
    schemaVersion: { const: ARK_PROJECT_IDENTITY_SCHEMA_VERSION },
    projectId: { type: 'string', pattern: sha256Pattern },
    resolvedRoot: { type: 'string', minLength: 1 },
    resolvedConfigPath: { type: 'string', minLength: 1 },
    arkgateVersion: { type: 'string', minLength: 1 },
    contractHash: { type: 'string', pattern: sha256Pattern },
    contractSource: { enum: ['project', 'default-profile', 'manifest'] },
    runtimeId: { type: 'string', minLength: 1 },
    processStartedAt: { type: 'string', format: 'date-time' },
  },
  $defs: {
    expectation: PROJECT_EXPECTATION_SCHEMA,
    binding: PROJECT_BINDING_SCHEMA,
  },
} as const;

/**
 * Stable identity: contract edits and MCP restarts must not change which project
 * this is. Callers must pass canonical real paths and a SHA-256 hex function.
 */
export function createProjectId(
  resolvedRoot: string,
  resolvedConfigPath: string,
  sha256Hex: (value: string) => string
): string {
  if (!resolvedRoot || !resolvedConfigPath) {
    throw new Error('Project identity requires resolvedRoot and resolvedConfigPath.');
  }
  const digest = sha256Hex(JSON.stringify({ resolvedRoot, resolvedConfigPath })).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error('Project identity hash adapter must return 64 hexadecimal SHA-256 characters.');
  }
  return `sha256:${digest}`;
}

export function createProjectIdentity(
  input: Omit<ProjectIdentity, 'schemaVersion'>
): ProjectIdentity {
  return {
    schemaVersion: ARK_PROJECT_IDENTITY_SCHEMA_VERSION,
    ...input,
  };
}
