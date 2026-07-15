import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ARK_ANALYSIS_RESULT_SCHEMA,
  ARK_ANALYSIS_RESULT_SCHEMA_VERSION,
  createAdapterResult,
  toAdapterDiagnostic,
} from '../../../src/domain/adapterContract';
import { deterministicNextAction } from '../../../src/domain/remediation';
import { classifyPublishFacts, looksLikeArkIntent } from '../../../src/domain/sourcePolicy';

describe('cross-adapter result contract v1', () => {
  it('keeps the committed compatibility fixture byte-for-value stable', () => {
    const fixture = JSON.parse(
      fs.readFileSync(
        path.resolve('tests/fixtures/contracts/ark.analysis-result.v1.1.json'),
        'utf8'
      )
    );
    expect(
      createAdapterResult({
        valid: false,
        violations: [
          {
            ruleId: 'LAYER_IMPORT_VIOLATION',
            message: 'DomainModel must not import PersistenceAdapters.',
            file: 'src/domain/order.ts',
            line: 1,
            target: 'src/infra/db.ts',
            fromLayer: 'DomainModel',
            toLayer: 'PersistenceAdapters',
          },
        ],
      })
    ).toEqual(fixture);
    expect(ARK_ANALYSIS_RESULT_SCHEMA_VERSION).toBe('1.1');
    expect(ARK_ANALYSIS_RESULT_SCHEMA.properties.schemaVersion.const).toBe('1.1');
  });

  it('retains the 1.0 fixture without the additive action field', () => {
    const legacy = JSON.parse(
      fs.readFileSync(
        path.resolve('tests/fixtures/contracts/ark.analysis-result.v1.json'),
        'utf8'
      )
    );
    expect(legacy.schemaVersion).toBe('1.0');
    expect(legacy.diagnostics[0]).not.toHaveProperty('nextAction');
  });

  it('typechecks consumer-owned 1.0 diagnostics without nextAction', () => {
    const result = spawnSync(
      path.resolve('node_modules/.bin/tsc'),
      ['-p', 'tests/fixtures/public-api-compat/tsconfig.json'],
      { cwd: process.cwd(), encoding: 'utf8' }
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('normalizes legacy code fields, warnings, and invalid locations deterministically', () => {
    expect(
      createAdapterResult({
        valid: true,
        warnings: [{ code: 'LEGACY_WARNING', severity: 'warning', line: 0, column: -1 }],
      })
    ).toEqual({
      schemaVersion: '1.1',
      valid: true,
      diagnostics: [
        {
          ruleId: 'LEGACY_WARNING',
          severity: 'warning',
          message: 'LEGACY_WARNING',
          location: { file: '<unknown>', line: 1, column: 1 },
          evidence: {},
          nextAction:
            'Resolve LEGACY_WARNING without weakening ark.config.json, then run Ark again.',
        },
      ],
    });
    expect(toAdapterDiagnostic({})).toMatchObject({
      ruleId: 'ARK_UNKNOWN',
      severity: 'error',
      nextAction: 'Resolve ARK_UNKNOWN without weakening ark.config.json, then run Ark again.',
    });
    expect(
      ARK_ANALYSIS_RESULT_SCHEMA.properties.diagnostics.items.properties.nextAction
    ).toEqual({ type: 'string', minLength: 1 });
  });

  it('gives type-only boundary findings one deterministic mechanical next action', () => {
    expect(
      toAdapterDiagnostic({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        fromLayer: 'DomainModel',
        toLayer: 'Kernel',
        typeOnly: true,
      }).nextAction
    ).toBe(
      'Move the referenced type to a mutually allowed layer, use `import type`, then preflight again.'
    );
  });

  it('keeps adapter fallback actions aligned with preflight remediation actions', () => {
    const violations = [
      {
        ruleId: 'LAYER_IMPORT_VIOLATION',
        fromLayer: 'DomainModel',
        toLayer: 'Kernel',
      },
      { ruleId: 'LAYER_IMPORT_VIOLATION', typeOnly: true },
      { ruleId: 'LAYER_IMPORT_VIOLATION', peerIsolation: true },
      { ruleId: 'FORBIDDEN_GLOBAL', target: 'fetch' },
      { ruleId: 'CIRCULAR_DEPENDENCY' },
      { ruleId: 'RAW_EVENT_PUBLISH' },
      { ruleId: 'PUBLISH_MISSING_SOURCE' },
      { ruleId: 'CUSTOM_RULE' },
      {},
    ];

    for (const violation of violations) {
      expect(toAdapterDiagnostic(violation).nextAction).toBe(
        deterministicNextAction(violation)
      );
    }
  });
});

describe('shared source policy', () => {
  it('classifies raw and missing-source publish facts once for every adapter', () => {
    expect(looksLikeArkIntent('Domain.Order.Placed')).toBe(true);
    expect(looksLikeArkIntent('not-an-intent')).toBe(false);
    expect(
      classifyPublishFacts({
        publishCall: true,
        rawIntentName: 'Domain.Order.Placed',
        objectHasIntent: false,
        arkPublishCandidate: true,
        hasSource: false,
      }).map((finding) => finding.ruleId)
    ).toEqual(['RAW_EVENT_PUBLISH', 'PUBLISH_MISSING_SOURCE']);
    expect(
      classifyPublishFacts({
        publishCall: false,
        objectHasIntent: true,
        arkPublishCandidate: true,
        hasSource: false,
      })
    ).toEqual([]);
    expect(
      classifyPublishFacts({
        publishCall: true,
        objectHasIntent: false,
        arkPublishCandidate: false,
        hasSource: true,
      })
    ).toEqual([]);
  });
});
