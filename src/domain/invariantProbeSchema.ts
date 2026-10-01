/**
 * Published JSON Schema for `.ark/invariant-probe.json` (ADR 0039).
 *
 * Import-free so scripts/generate-cli-pure.mjs can evaluate the schema export in
 * isolation. The enums mirror the closed lists in invariantProbe.ts; a unit test
 * keeps them equal.
 */

export const ARK_INVARIANT_PROBE_SCHEMA_URL =
  'https://unpkg.com/arkgate@4/schemas/ark.invariant-probe.schema.json' as const;

const text = { type: 'string', minLength: 1 } as const;
const nullableText = { type: ['string', 'null'], minLength: 1 } as const;
const runStatus = { enum: ['killed', 'survived', 'timeout', 'runtime-error', 'invalid'] } as const;
const nullableRunStatus = {
  enum: ['killed', 'survived', 'timeout', 'runtime-error', 'invalid', null],
} as const;
const count = { type: 'integer', minimum: 0 } as const;

export const ARK_INVARIANT_PROBE_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: ARK_INVARIANT_PROBE_SCHEMA_URL,
  title: 'ArkGate invariant mutation probe',
  description:
    'Per-invariant evidence from arkgate-check --probe-invariants --write. Not a score. A fresh survived or not-reached row refuses promotion to enforced; every other state changes nothing.',
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'kind',
    'notAScore',
    'arkgateVersion',
    'operatorSet',
    'runner',
    'probedOn',
    'invariants',
    'totals',
  ],
  properties: {
    $schema: { type: 'string' },
    schemaVersion: { const: '1.0' },
    kind: { const: 'arkgate-invariant-probe' },
    notAScore: { const: true },
    arkgateVersion: text,
    operatorSet: text,
    runner: {
      oneOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'version'],
          properties: {
            id: { enum: ['vitest', 'jest', 'node'] },
            version: nullableText,
          },
        },
      ],
    },
    probedOn: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    invariants: { type: 'array', maxItems: 500, items: { $ref: '#/$defs/row' } },
    totals: {
      type: 'object',
      additionalProperties: false,
      required: ['probed', 'killed', 'survived', 'notReached', 'inconclusive', 'unprobeable'],
      properties: {
        probed: count,
        killed: count,
        survived: count,
        notReached: count,
        inconclusive: count,
        unprobeable: count,
      },
    },
  },
  $defs: {
    row: {
      type: 'object',
      additionalProperties: false,
      required: [
        'invariantId',
        'invariantHash',
        'layer',
        'sourceFile',
        'mode',
        'symbol',
        'symbolFile',
        'symbolFileHash',
        'tests',
        'baseline',
        'wiring',
        'mutants',
        'verdict',
        'reason',
      ],
      properties: {
        invariantId: text,
        invariantHash: text,
        layer: nullableText,
        sourceFile: nullableText,
        mode: { enum: ['advisory', 'enforced'] },
        symbol: nullableText,
        symbolFile: nullableText,
        symbolFileHash: nullableText,
        tests: {
          type: 'array',
          maxItems: 8,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['path', 'contentHash'],
            properties: { path: text, contentHash: text },
          },
        },
        baseline: {
          oneOf: [
            { type: 'null' },
            {
              type: 'object',
              additionalProperties: false,
              required: ['status', 'durationMs'],
              properties: {
                status: { enum: ['green', 'red', 'timeout', 'runtime-error'] },
                durationMs: count,
              },
            },
          ],
        },
        wiring: {
          oneOf: [
            { type: 'null' },
            {
              type: 'object',
              additionalProperties: false,
              required: ['load', 'reach'],
              properties: { load: nullableRunStatus, reach: nullableRunStatus },
            },
          ],
        },
        mutants: {
          type: 'array',
          maxItems: 3,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'operator', 'line', 'column', 'original', 'replacement', 'status', 'durationMs'],
            properties: {
              id: text,
              operator: {
                enum: ['negate-guard', 'drop-throw', 'flip-comparison', 'boundary-shift', 'const-shift'],
              },
              line: { type: 'integer', minimum: 1 },
              column: { type: 'integer', minimum: 1 },
              original: { type: 'string' },
              replacement: { type: 'string' },
              status: runStatus,
              durationMs: count,
            },
          },
        },
        verdict: { enum: ['killed', 'survived', 'not-reached', 'inconclusive', 'unprobeable'] },
        reason: {
          enum: [
            'all-killed',
            'mutant-survived',
            'reach-canary-survived',
            'baseline-red',
            'baseline-timeout',
            'runner-error',
            'file-not-loaded',
            'mutant-runtime-error',
            'no-symbol',
            'declaration-only',
            'symbol-not-found',
            'no-covering-test',
            'no-site',
          ],
        },
      },
    },
  },
} as const;
