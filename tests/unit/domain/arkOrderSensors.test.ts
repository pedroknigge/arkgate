import { describe, expect, it } from 'vitest';
import { evaluateArkOrderSensors } from '../../../src/domain/arkOrderSensors';
import type { ArkConfigArkOrder } from '../../../src/domain/configTypes';

const extra: ArkConfigArkOrder = {
  mode: 'enforced',
  planeRoots: ['src/main.ts'],
  managedLayers: ['ApplicationOrchestration'],
  maxXiKeys: 7,
  xiKeys: ['plan', 'cycle', 'tenancy'],
};

describe('evaluateArkOrderSensors', () => {
  it('emits nothing when the extra is absent', () => {
    const result = evaluateArkOrderSensors({
      arkOrder: undefined,
      layers: [],
      planeCalls: [],
      genericUpdates: [],
      planeRootHits: [],
      dependencies: [],
      layerForFile: () => 'ApplicationOrchestration',
    });
    expect(result.findings).toEqual([]);
  });

  it('fails closed on missing plane factory when enforced', () => {
    const result = evaluateArkOrderSensors({
      arkOrder: extra,
      layers: [],
      planeCalls: [],
      genericUpdates: [],
      planeRootHits: [{ file: 'src/main.ts', matchedRoot: 'src/main.ts', hasPlaneFactory: false }],
      dependencies: [],
      layerForFile: () => 'ApplicationOrchestration',
      classification: { governedPercent: 100, populatedLayerCount: 2 },
    });
    expect(result.findings.map((item) => item.ruleId)).toEqual(['ARKORDER_MISSING_PLANE']);
    expect(result.findings[0]?.failsStrict).toBe(true);
  });

  it('flags a persistence write of a declared slow key in a managed layer', () => {
    const result = evaluateArkOrderSensors({
      arkOrder: extra,
      layers: [],
      planeCalls: [],
      genericUpdates: [],
      planeRootHits: [{ file: 'src/main.ts', matchedRoot: 'src/main.ts', hasPlaneFactory: true }],
      xiFieldWrites: [{ file: 'src/application/save.ts', line: 4, key: 'plan' }],
      dependencies: [],
      layerForFile: (file) =>
        file.includes('application') ? 'ApplicationOrchestration' : 'DomainModel',
      classification: { governedPercent: 100, populatedLayerCount: 2 },
    });
    expect(result.findings.map((item) => item.ruleId)).toEqual(['ARKORDER_XI_FIELD_WRITE']);
    expect(result.findings[0]?.target).toBe('plan');
  });

  it('stays silent on xi field writes when xiKeys is empty', () => {
    const result = evaluateArkOrderSensors({
      arkOrder: { ...extra, xiKeys: [] },
      layers: [],
      planeCalls: [],
      genericUpdates: [],
      planeRootHits: [{ file: 'src/main.ts', matchedRoot: 'src/main.ts', hasPlaneFactory: true }],
      xiFieldWrites: [{ file: 'src/application/save.ts', line: 4, key: 'plan' }],
      dependencies: [],
      layerForFile: () => 'ApplicationOrchestration',
      classification: { governedPercent: 100, populatedLayerCount: 2 },
    });
    expect(result.findings.map((item) => item.ruleId)).toEqual([]);
  });

  it('emits ingest-writes-ξ and too-many-params from direct evidence', () => {
    const result = evaluateArkOrderSensors({
      arkOrder: { ...extra, xiKeys: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] },
      layers: [],
      planeCalls: [],
      genericUpdates: [],
      planeRootHits: [{ file: 'src/main.ts', matchedRoot: 'src/main.ts', hasPlaneFactory: true }],
      ingestWritesXi: [{ file: 'src/main.ts', line: 8 }],
      releaseKeyCounts: [{ file: 'src/main.ts', line: 6, keyCount: 8 }],
      dependencies: [],
      layerForFile: () => 'ApplicationOrchestration',
      classification: { governedPercent: 100, populatedLayerCount: 2 },
    });
    expect(result.findings.map((item) => item.ruleId).sort()).toEqual([
      'ARKORDER_INGEST_WRITES_XI',
      'ARKORDER_TOO_MANY_PARAMS',
      'ARKORDER_TOO_MANY_PARAMS',
    ]);
  });
});
