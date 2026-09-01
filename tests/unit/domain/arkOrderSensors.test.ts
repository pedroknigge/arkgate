import { describe, expect, it } from 'vitest';
import { evaluateArkOrderSensors } from '../../../src/domain/arkOrderSensors';
import type { ArkConfigArkOrder } from '../../../src/domain/configTypes';
import { globToRegExp } from '../../../src/domain/layerMatch';

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

  it('emits ingest-writes-ξ and too-many-params from release() evidence only', () => {
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
    ]);
    expect(result.findings.find((item) => item.ruleId === 'ARKORDER_TOO_MANY_PARAMS')?.file).toBe(
      'src/main.ts'
    );
  });

  it('XICAP-001: watchlist longer than maxXiKeys does not emit too-many-params', () => {
    const result = evaluateArkOrderSensors({
      arkOrder: { ...extra, xiKeys: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] },
      layers: [],
      planeCalls: [],
      genericUpdates: [],
      planeRootHits: [{ file: 'src/main.ts', matchedRoot: 'src/main.ts', hasPlaneFactory: true }],
      dependencies: [],
      layerForFile: () => 'ApplicationOrchestration',
      classification: { governedPercent: 100, populatedLayerCount: 2 },
    });
    expect(result.findings.map((item) => item.ruleId)).toEqual([]);
  });

  it('XICAP-001: release() keyCount over maxXiKeys still emits too-many-params', () => {
    const result = evaluateArkOrderSensors({
      arkOrder: extra,
      layers: [],
      planeCalls: [],
      genericUpdates: [],
      planeRootHits: [{ file: 'src/main.ts', matchedRoot: 'src/main.ts', hasPlaneFactory: true }],
      releaseKeyCounts: [{ file: 'src/main.ts', line: 6, keyCount: 8 }],
      dependencies: [],
      layerForFile: () => 'ApplicationOrchestration',
      classification: { governedPercent: 100, populatedLayerCount: 2 },
    });
    expect(result.findings.map((item) => item.ruleId)).toEqual(['ARKORDER_TOO_MANY_PARAMS']);
    expect(result.findings[0]?.file).toBe('src/main.ts');
    expect(result.findings[0]?.target).toBe('8');
  });

  it('XIWRITE-001: PersistenceAdapters write outside appliesTo stays silent', () => {
    const result = evaluateArkOrderSensors({
      arkOrder: {
        ...extra,
        managedLayers: ['ApplicationOrchestration', 'PersistenceAdapters'],
        appliesTo: ['src/application/eos/**'],
      },
      layers: [],
      planeCalls: [],
      genericUpdates: [],
      planeRootHits: [{ file: 'src/main.ts', matchedRoot: 'src/main.ts', hasPlaneFactory: true }],
      xiFieldWrites: [{ file: 'src/persistence/plan-repo.ts', line: 4, key: 'plan' }],
      dependencies: [],
      layerForFile: (file) =>
        file.includes('persistence') ? 'PersistenceAdapters' : 'ApplicationOrchestration',
      classification: { governedPercent: 100, populatedLayerCount: 2 },
    });
    expect(result.findings.map((item) => item.ruleId)).toEqual([]);
  });

  it('XIWRITE-001: matching EOS path in a managed layer emits xi-field-write', () => {
    const result = evaluateArkOrderSensors({
      arkOrder: {
        ...extra,
        managedLayers: ['ApplicationOrchestration', 'PersistenceAdapters'],
        appliesTo: ['src/application/eos/**'],
      },
      layers: [],
      planeCalls: [],
      genericUpdates: [],
      planeRootHits: [{ file: 'src/main.ts', matchedRoot: 'src/main.ts', hasPlaneFactory: true }],
      xiFieldWrites: [{ file: 'src/application/eos/save.ts', line: 4, key: 'plan' }],
      dependencies: [],
      layerForFile: () => 'ApplicationOrchestration',
      classification: { governedPercent: 100, populatedLayerCount: 2 },
    });
    expect(result.findings.map((item) => item.ruleId)).toEqual(['ARKORDER_XI_FIELD_WRITE']);
    expect(result.findings[0]?.target).toBe('plan');
  });

  it('XIWRITE-001: unmanaged layer stays silent even when appliesTo matches', () => {
    const result = evaluateArkOrderSensors({
      arkOrder: {
        ...extra,
        appliesTo: ['src/application/eos/**'],
      },
      layers: [],
      planeCalls: [],
      genericUpdates: [],
      planeRootHits: [{ file: 'src/main.ts', matchedRoot: 'src/main.ts', hasPlaneFactory: true }],
      xiFieldWrites: [{ file: 'src/application/eos/save.ts', line: 4, key: 'plan' }],
      dependencies: [],
      layerForFile: () => 'PersistenceAdapters',
      classification: { governedPercent: 100, populatedLayerCount: 2 },
    });
    expect(result.findings.map((item) => item.ruleId)).toEqual([]);
  });

  it('XIWRITE-001: appliesTo globs use globToRegExp from layerMatch', () => {
    expect(globToRegExp('src/application/eos/**').test('src/application/eos/save.ts')).toBe(true);
    expect(globToRegExp('src/application/eos/**').test('src/persistence/plan-repo.ts')).toBe(false);
    expect(globToRegExp('src/application/{eos,billing}/**').test('src/application/eos/save.ts')).toBe(
      true
    );
  });

  it('XIWRITE-001: brace globs match the layers engine', () => {
    const result = evaluateArkOrderSensors({
      arkOrder: {
        ...extra,
        appliesTo: ['src/application/{eos,billing}/**'],
      },
      layers: [],
      planeCalls: [],
      genericUpdates: [],
      planeRootHits: [{ file: 'src/main.ts', matchedRoot: 'src/main.ts', hasPlaneFactory: true }],
      xiFieldWrites: [
        { file: 'src/application/eos/save.ts', line: 4, key: 'plan' },
        { file: 'src/application/other/save.ts', line: 5, key: 'plan' },
      ],
      dependencies: [],
      layerForFile: () => 'ApplicationOrchestration',
      classification: { governedPercent: 100, populatedLayerCount: 2 },
    });
    expect(result.findings.map((item) => item.file)).toEqual(['src/application/eos/save.ts']);
  });

  it('XIWRITE-001: empty appliesTo keeps current managed-layer behavior', () => {
    const result = evaluateArkOrderSensors({
      arkOrder: { ...extra, appliesTo: [] },
      layers: [],
      planeCalls: [],
      genericUpdates: [],
      planeRootHits: [{ file: 'src/main.ts', matchedRoot: 'src/main.ts', hasPlaneFactory: true }],
      xiFieldWrites: [{ file: 'src/application/save.ts', line: 4, key: 'plan' }],
      dependencies: [],
      layerForFile: () => 'ApplicationOrchestration',
      classification: { governedPercent: 100, populatedLayerCount: 2 },
    });
    expect(result.findings.map((item) => item.ruleId)).toEqual(['ARKORDER_XI_FIELD_WRITE']);
  });
});
