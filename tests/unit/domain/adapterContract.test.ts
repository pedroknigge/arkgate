import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ARK_ANALYSIS_RESULT_SCHEMA,
  ARK_ANALYSIS_RESULT_SCHEMA_VERSION,
  createAdapterResult,
  toAdapterDiagnostic,
} from '../../../src/domain/adapterContract';
import { classifyPublishFacts, looksLikeArkIntent } from '../../../src/domain/sourcePolicy';

describe('cross-adapter result contract v1', () => {
  it('keeps the committed compatibility fixture byte-for-value stable', () => {
    const fixture = JSON.parse(
      fs.readFileSync(
        path.resolve('tests/fixtures/contracts/ark.analysis-result.v1.json'),
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
    expect(ARK_ANALYSIS_RESULT_SCHEMA_VERSION).toBe('1.0');
    expect(ARK_ANALYSIS_RESULT_SCHEMA.properties.schemaVersion.const).toBe('1.0');
  });

  it('normalizes legacy code fields, warnings, and invalid locations deterministically', () => {
    expect(
      createAdapterResult({
        valid: true,
        warnings: [{ code: 'LEGACY_WARNING', severity: 'warning', line: 0, column: -1 }],
      })
    ).toEqual({
      schemaVersion: '1.0',
      valid: true,
      diagnostics: [
        {
          ruleId: 'LEGACY_WARNING',
          severity: 'warning',
          message: 'LEGACY_WARNING',
          location: { file: '<unknown>', line: 1, column: 1 },
          evidence: {},
        },
      ],
    });
    expect(toAdapterDiagnostic({})).toMatchObject({
      ruleId: 'ARK_UNKNOWN',
      severity: 'error',
    });
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
