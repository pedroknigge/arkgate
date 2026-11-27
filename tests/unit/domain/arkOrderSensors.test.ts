import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import {
  ARKORDER_TIER1_SENSOR_IDS,
  evaluateArkOrderEditorSensors,
  evaluateArkOrderSensors,
} from '../../../src/domain/arkOrderSensors';
import { evaluateArkRunSensors } from '../../../src/domain/arkRunSensors';
import { isDomainRoleLayerName } from '../../../src/domain/arkRuleSensors';
import { isDomainRoleLayer } from '../../../src/domain/sourcePolicy';
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

  it('every advertised tier-1 sensor has an emitter (xi-ttl, information-budget)', () => {
    const result = evaluateArkOrderSensors({
      arkOrder: extra,
      layers: [],
      planeCalls: [],
      genericUpdates: [{ file: 'src/main.ts', line: 3, method: 'update' }],
      planeRootHits: [{ file: 'src/main.ts', matchedRoot: 'src/main.ts', hasPlaneFactory: true }],
      xiTtlKeys: [{ file: 'src/main.ts', line: 7, key: 'ttl' }],
      budgetLeaks: [{ file: 'src/main.ts', line: 5, kind: 'LedgerRead' }],
      dependencies: [],
      layerForFile: () => 'ApplicationOrchestration',
      classification: { governedPercent: 100, populatedLayerCount: 2 },
    });
    const sensors = result.findings.map((item) => item.sensor);
    expect(sensors).toContain('arkorder-xi-ttl');
    expect(sensors).toContain('arkorder-information-budget');
    expect(result.findings.find((item) => item.sensor === 'arkorder-xi-ttl')?.failsStrict).toBe(true);
    expect(ARKORDER_TIER1_SENSOR_IDS).toContain('arkorder-xi-ttl');
    expect(ARKORDER_TIER1_SENSOR_IDS).toContain('arkorder-information-budget');
  });

  it('editor path reports xi-ttl and information-budget from source', () => {
    const findings = evaluateArkOrderEditorSensors({
      arkOrder: extra,
      file: 'src/main.ts',
      fromLayer: 'ApplicationOrchestration',
      source: `const plane = createOrderPlane({
  projector: () => ({ allowedKinds: ['Invoice', 'LedgerRead'], invalidated: [] }),
  informationBudget: { cannotObserve: ['LedgerRead'] },
});
plane.release({ plan: 'free', ttl: 30 });
`,
    });
    expect(findings.map((item) => item.ruleId).sort()).toEqual([
      'ARKORDER_INFORMATION_BUDGET',
      'ARKORDER_XI_TTL',
    ]);
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

  it('O-04: Entities and Aggregates trigger ARKORDER_KERNEL_IN_DOMAIN and agree across ArkOrder, ArkRun, and ArkRules', () => {
    const cases: Array<{ layer: string; prefixes?: string[]; expected: boolean }> = [
      { layer: 'Domain', expected: true },
      { layer: 'DomainModel', expected: true },
      { layer: 'domain-core', expected: true },
      { layer: 'Entity', expected: true },
      { layer: 'Entities', expected: true },
      { layer: 'Aggregate', expected: true },
      { layer: 'Aggregates', expected: true },
      { layer: 'AggregateRoot', expected: true },
      { layer: 'ReportingReadModels', expected: false },
      { layer: 'SharedKernel', expected: false },
      { layer: 'ApplicationOrchestration', prefixes: ['Domain.'], expected: true },
      { layer: 'ApplicationOrchestration', prefixes: ['Domain...'], expected: true },
      { layer: 'ApplicationOrchestration', prefixes: ['Domain.Billing.'], expected: true },
      { layer: 'ApplicationOrchestration', prefixes: ['DomainModel.'], expected: false },
      { layer: 'ApplicationOrchestration', prefixes: ['.'.repeat(200)], expected: false },
      { layer: 'ApplicationOrchestration', prefixes: ['Application.'], expected: false },
    ];

    for (const c of cases) {
      const prefixes = c.prefixes ?? [];
      expect(isDomainRoleLayer(c.layer, prefixes)).toBe(c.expected);
      expect(isDomainRoleLayerName(c.layer, prefixes)).toBe(c.expected);

      const orderRes = evaluateArkOrderSensors({
        arkOrder: extra,
        layers: [{ name: c.layer, patterns: ['src/x/**'], intentPrefixes: prefixes }],
        planeCalls: [],
        genericUpdates: [],
        planeRootHits: [{ file: 'src/main.ts', matchedRoot: 'src/main.ts', hasPlaneFactory: true }],
        dependencies: [
          {
            from: 'src/x/a.ts',
            specifier: 'arkgate/order',
            kind: 'import',
            typeOnly: false,
            line: 1,
            resolution: 'resolved-external',
          },
        ],
        layerForFile: () => c.layer,
        classification: { governedPercent: 100, populatedLayerCount: 2 },
      });
      expect(orderRes.findings.some((f) => f.ruleId === 'ARKORDER_KERNEL_IN_DOMAIN')).toBe(
        c.expected
      );

      const runRes = evaluateArkRunSensors({
        arkRun: {
          mode: 'enforced',
          compositionRoots: ['src/main.ts'],
          managedLayers: ['ApplicationOrchestration'],
          requireDeclarations: false,
        },
        layers: [{ name: c.layer, patterns: ['src/x/**'], intentPrefixes: prefixes }],
        kernelCalls: [],
        managedNews: [],
        compositionRootHits: [
          { file: 'src/main.ts', matchedRoot: 'src/main.ts', hasKernelFactory: true },
        ],
        declarations: [],
        dependencies: [
          {
            from: 'src/x/a.ts',
            specifier: 'arkgate/runtime',
            kind: 'import',
            typeOnly: false,
            line: 1,
            resolution: 'resolved-external',
          },
        ],
        layerForFile: () => c.layer,
        classification: { governedPercent: 100, populatedLayerCount: 2 },
      });
      expect(runRes.findings.some((f) => f.ruleId === 'ARKRUN_KERNEL_IN_DOMAIN')).toBe(c.expected);
    }

    // Editor sensor also enforces Entities / Aggregates with AST ts passed through.
    const editorFindings = evaluateArkOrderEditorSensors({
      arkOrder: extra,
      file: 'src/entities/order.ts',
      fromLayer: 'Entities',
      source: `import { createOrderPlane } from 'arkgate/order';\nvoid createOrderPlane;\n`,
      ts,
    });
    expect(editorFindings.map((f) => f.ruleId)).toContain('ARKORDER_KERNEL_IN_DOMAIN');
  });

  it('Phase 2.1: editor sensor passes ts AST to detect local const XI TTL and key counts', () => {
    const findings = evaluateArkOrderEditorSensors({
      arkOrder: { ...extra, maxXiKeys: 2 },
      file: 'src/main.ts',
      fromLayer: 'ApplicationOrchestration',
      ts,
      source: `import { createOrderPlane } from 'arkgate/order';
const BUDGET = { cannotObserve: ['LedgerRead'] };
const XI = { plan, region, ttl: 30 };
const plane = createOrderPlane({
  projector: () => ({ allowedKinds: ['Invoice', 'LedgerRead'], invalidated: [] }),
  informationBudget: BUDGET,
});
plane.release(XI);
`,
    });
    expect(findings.map((f) => f.ruleId).sort()).toEqual([
      'ARKORDER_INFORMATION_BUDGET',
      'ARKORDER_TOO_MANY_PARAMS',
      'ARKORDER_XI_TTL',
    ]);
  });
});
