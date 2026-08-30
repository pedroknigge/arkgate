import { describe, expect, it } from 'vitest';
import { evaluateArkOrderSensors } from '../../../src/domain/arkOrderSensors';
import type { ArkConfigArkOrder } from '../../../src/domain/configTypes';

const extra: ArkConfigArkOrder = {
  mode: 'enforced',
  planeRoots: ['src/main.ts'],
  managedLayers: ['ApplicationOrchestration'],
  maxXiKeys: 7,
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
});
