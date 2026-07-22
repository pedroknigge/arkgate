/**
 * Published JSON Schema for resolved candidate facts.
 *
 * Import-free so scripts/generate-cli-pure.mjs can evaluate the schema export in isolation.
 * Runtime types/ops live in sibling Domain modules; version literal must stay aligned with
 * RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION in resolvedCandidateFactsTypes.ts.
 */

export const RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION = '1.0' as const;

const RESOLVED_CAPABILITY_IDS = [
  'network',
  'filesystem',
  'clock',
  'randomness',
  'environment',
  'process',
  'persistence',
] as const;

const textSchema = { type: 'string', minLength: 1 } as const;
const lineSchema = { type: 'integer', minimum: 1 } as const;
const projectPathSchema = {
  type: 'string',
  minLength: 1,
  pattern:
    '^(?!/)(?![A-Za-z]:/)(?!.*\\\\)(?!.*//)(?!.*(?:^|/)\\.{1,2}(?:/|$))(?!.*[\\u0000-\\u001f\\u007f])(?!.*\\/$).+$',
} as const;

export const RESOLVED_CANDIDATE_FACTS_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://unpkg.com/arkgate@3/schemas/ark.resolved-candidate-facts.schema.json',
  title: 'ArkGate resolved candidate facts',
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'completeness',
    'completenessReasons',
    'resolverIdentity',
    'compilerIdentity',
    'compilerOptionsHash',
    'tsconfigHash',
    'candidateTreeHash',
    'evidenceRequirementsHash',
    'files',
    'dependencies',
    'capabilityUses',
    'ambientUses',
    'publishCalls',
    'intentReferences',
    'safetyUses',
    'factsHash',
  ],
  properties: {
    schemaVersion: { const: RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION },
    completeness: { enum: ['complete', 'partial', 'unavailable'] },
    completenessReasons: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'message'],
        properties: { code: textSchema, message: textSchema, file: projectPathSchema },
      },
    },
    resolverIdentity: textSchema,
    compilerIdentity: textSchema,
    compilerOptionsHash: textSchema,
    tsconfigHash: textSchema,
    candidateTreeHash: textSchema,
    evidenceRequirementsHash: textSchema,
    projectPackageName: textSchema,
    files: {
      type: 'array',
      uniqueItems: true,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'path',
          'contentHash',
          'parseStatus',
          'parseDiagnosticCount',
          'exportsOnlyTypes',
          'typeOnlyExportNames',
          'hasTopLevelSideEffects',
        ],
        properties: {
          path: projectPathSchema,
          contentHash: textSchema,
          parseStatus: { enum: ['parsed', 'invalid'] },
          parseDiagnosticCount: { type: 'integer', minimum: 0 },
          exportsOnlyTypes: { type: 'boolean' },
          typeOnlyExportNames: { type: 'array', items: textSchema },
          hasTopLevelSideEffects: { type: 'boolean' },
        },
        allOf: [
          {
            if: { properties: { parseStatus: { const: 'parsed' } } },
            then: { properties: { parseDiagnosticCount: { const: 0 } } },
          },
          {
            if: { properties: { parseStatus: { const: 'invalid' } } },
            then: { properties: { parseDiagnosticCount: { minimum: 1 } } },
          },
        ],
      },
    },
    dependencies: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'kind', 'typeOnly', 'line', 'resolution'],
        properties: {
          from: projectPathSchema,
          specifier: textSchema,
          kind: { enum: ['import', 'export', 'dynamic-import', 'require'] },
          typeOnly: { type: 'boolean' },
          line: lineSchema,
          resolution: {
            enum: ['resolved-project', 'resolved-external', 'unresolved', 'dynamic'],
          },
          target: projectPathSchema,
          namedBindings: { type: 'array', items: textSchema },
          targetTypeOnlyExports: { type: 'boolean' },
          sourcePureTypeModule: { type: 'boolean' },
          namedBindingsTypeOnly: { type: 'boolean' },
          portProofEligible: { type: 'boolean' },
        },
        allOf: [
          {
            if: { properties: { resolution: { const: 'resolved-project' } } },
            then: { required: ['target'] },
            else: { not: { required: ['target'] } },
          },
          {
            if: { properties: { resolution: { const: 'dynamic' } } },
            else: { required: ['specifier'] },
          },
        ],
      },
    },
    capabilityUses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'line', 'symbol', 'capability', 'source'],
        properties: {
          file: projectPathSchema,
          line: lineSchema,
          symbol: textSchema,
          capability: { enum: RESOLVED_CAPABILITY_IDS },
          source: { enum: ['ambient-global', 'import-based'] },
        },
      },
    },
    ambientUses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'line', 'symbol'],
        properties: { file: projectPathSchema, line: lineSchema, symbol: textSchema },
      },
    },
    publishCalls: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'file',
          'line',
          'objectHasIntent',
          'arkPublishCandidate',
          'hasSource',
        ],
        properties: {
          file: projectPathSchema,
          line: lineSchema,
          rawIntentName: textSchema,
          objectHasIntent: { type: 'boolean' },
          arkPublishCandidate: { type: 'boolean' },
          hasSource: { type: 'boolean' },
          sourceIntent: textSchema,
        },
      },
    },
    intentReferences: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'line', 'intent'],
        properties: { file: projectPathSchema, line: lineSchema, intent: textSchema },
      },
    },
    safetyUses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'line', 'kind'],
        properties: {
          file: projectPathSchema,
          line: lineSchema,
          kind: {
            enum: [
              'ts-suppression',
              'any-cast',
              'dynamic-import',
              'dynamic-require',
              'in-memory-store',
            ],
          },
          symbol: textSchema,
        },
        allOf: [
          {
            if: { properties: { kind: { const: 'in-memory-store' } } },
            then: { required: ['symbol'] },
            else: { not: { required: ['symbol'] } },
          },
        ],
      },
    },
    factsHash: textSchema,
  },
  allOf: [
    {
      if: { properties: { completeness: { const: 'complete' } } },
      then: {
        properties: {
          completenessReasons: { maxItems: 0 },
          files: {
            items: { properties: { parseStatus: { const: 'parsed' } } },
          },
        },
      },
    },
    {
      if: { properties: { completeness: { enum: ['partial', 'unavailable'] } } },
      then: { properties: { completenessReasons: { minItems: 1 } } },
    },
  ],
} as const;
