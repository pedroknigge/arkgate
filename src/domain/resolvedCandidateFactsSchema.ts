/**
 * Published JSON Schema for resolved candidate facts.
 *
 * Import-free so scripts/generate-cli-pure.mjs can evaluate the schema export in isolation.
 * Runtime types/ops live in sibling Domain modules; version literal must stay aligned with
 * RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION in resolvedCandidateFactsTypes.ts.
 */

export const RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION = '1.2' as const;

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
    schemaVersion: { enum: ['1.0', '1.1', '1.2'] },
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
    classShapes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'file',
          'className',
          'exported',
          'hasPublicMutableFields',
          'hasPublicSetters',
          'hasPublicConstructor',
          'hasStaticFactory',
          'mutatingMethods',
        ],
        properties: {
          file: projectPathSchema,
          className: textSchema,
          exported: { type: 'boolean' },
          hasPublicMutableFields: { type: 'boolean' },
          hasPublicSetters: { type: 'boolean' },
          hasPublicConstructor: { type: 'boolean' },
          hasStaticFactory: { type: 'boolean' },
          dataOnly: { type: 'boolean' },
          mutatingMethods: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'referencesGuardOrPublish'],
              properties: {
                name: textSchema,
                referencesGuardOrPublish: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
    arkRunKernelCalls: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'line', 'kind', 'callee', 'viaImport'],
        properties: {
          file: projectPathSchema,
          line: lineSchema,
          kind: {
            enum: [
              'factory',
              'publisher',
              'publish',
              'raise',
              'send',
              'subscribe',
              'register-handler',
              'resolve',
              'resolve-singleton',
            ],
          },
          callee: textSchema,
          viaImport: { type: 'boolean' },
          receiver: textSchema,
          nameLiteral: textSchema,
        },
      },
    },
    arkRunManagedNews: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'line', 'typeName'],
        properties: {
          file: projectPathSchema,
          line: lineSchema,
          typeName: textSchema,
          importedFrom: textSchema,
        },
      },
    },
    arkRunCompositionRootHits: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'matchedRoot', 'hasKernelFactory'],
        properties: {
          file: projectPathSchema,
          matchedRoot: textSchema,
          hasKernelFactory: { type: 'boolean' },
        },
      },
    },
    arkRunDeclarations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'line', 'uses', 'reactsTo', 'raises', 'sends'],
        properties: {
          file: projectPathSchema,
          line: lineSchema,
          uses: { type: 'array', items: textSchema },
          reactsTo: { type: 'array', items: textSchema },
          raises: { type: 'array', items: textSchema },
          sends: { type: 'array', items: textSchema },
        },
      },
    },
    arkOrderPlaneCalls: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'line', 'callee'],
        properties: {
          file: projectPathSchema,
          line: lineSchema,
          callee: textSchema,
        },
      },
    },
    arkOrderGenericUpdates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'line', 'method'],
        properties: {
          file: projectPathSchema,
          line: lineSchema,
          method: textSchema,
        },
      },
    },
    arkOrderRootHits: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'matchedRoot', 'hasPlaneFactory'],
        properties: {
          file: projectPathSchema,
          matchedRoot: textSchema,
          hasPlaneFactory: { type: 'boolean' },
        },
      },
    },
    arkOrderXiFieldWrites: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'line', 'key'],
        properties: {
          file: projectPathSchema,
          line: lineSchema,
          key: textSchema,
        },
      },
    },
    arkOrderIngestWritesXi: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'line'],
        properties: {
          file: projectPathSchema,
          line: lineSchema,
        },
      },
    },
    arkOrderReleaseKeyCounts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'line', 'keyCount'],
        properties: {
          file: projectPathSchema,
          line: lineSchema,
          keyCount: { type: 'integer', minimum: 1 },
        },
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
