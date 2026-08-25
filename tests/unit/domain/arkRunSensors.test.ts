import { describe, expect, it } from 'vitest';
import type { ArkConfigArkRun, ArkConfigLayer } from '../../../src/domain/configTypes';
import {
  ARKRUN_INTERACTION_NAME_INCOMPLETE,
  ARKRUN_RULE_IDS,
  evaluateArkRunSensors,
} from '../../../src/domain/arkRunSensors';
import { evaluateArkRunSensors as evaluateCliArkRunSensors } from '../../../bin/lib/ark-run-sensors.mjs';

const LAYERS: ArkConfigLayer[] = [
  { name: 'DomainModel', patterns: ['src/domain/**'] },
  { name: 'ApplicationOrchestration', patterns: ['src/application/**', 'src/main.ts'] },
];

function layerForFile(file: string): string | null {
  if (file.startsWith('src/domain/')) return 'DomainModel';
  if (file.startsWith('src/application/') || file === 'src/main.ts') {
    return 'ApplicationOrchestration';
  }
  return null;
}

function extra(mode: ArkConfigArkRun['mode'], overrides: Partial<ArkConfigArkRun> = {}): ArkConfigArkRun {
  return {
    mode,
    compositionRoots: ['src/main.ts'],
    managedLayers: ['ApplicationOrchestration', 'DomainModel'],
    requireDeclarations: true,
    ...overrides,
  };
}

function evaluate(mode: ArkConfigArkRun['mode'], rest: Partial<Parameters<typeof evaluateArkRunSensors>[0]> = {}) {
  return evaluateArkRunSensors({
    arkRun: extra(mode),
    layers: LAYERS,
    kernelCalls: [],
    managedNews: [],
    compositionRootHits: [],
    declarations: [],
    dependencies: [],
    layerForFile,
    ...rest,
  });
}

describe('RN04 ArkRun tier-1 sensors', () => {
  it('is silent when arkRun is absent', () => {
    const result = evaluateArkRunSensors({
      arkRun: undefined,
      layers: LAYERS,
      kernelCalls: [
        {
          file: 'src/main.ts',
          line: 2,
          kind: 'publisher',
          callee: 'publisher',
          viaImport: false,
          nameLiteral: 'Domain.Order.Placed',
        },
      ],
      managedNews: [{ file: 'src/application/billing.ts', line: 2, typeName: 'OrderService' }],
      compositionRootHits: [],
      declarations: [],
      dependencies: [
        {
          from: 'src/domain/order.ts',
          specifier: '@arkgate/runtime',
          kind: 'import',
          typeOnly: false,
          line: 1,
          resolution: 'resolved-external',
        },
      ],
      layerForFile,
    });
    expect(result.findings).toEqual([]);
    expect(result.completenessReasons).toEqual([]);
  });

  it('emits ARKRUN_MISSING_ROOT without flipping failsStrict in advisory', () => {
    const advisory = evaluate('advisory', {
      compositionRootHits: [
        { file: 'src/main.ts', matchedRoot: 'src/main.ts', hasKernelFactory: false },
      ],
    });
    expect(advisory.findings).toEqual([
      expect.objectContaining({
        ruleId: 'ARKRUN_MISSING_ROOT',
        sensor: 'arkrun-missing-root',
        file: 'src/main.ts',
        failsStrict: false,
        severity: 'warning',
      }),
    ]);
    const enforced = evaluate('enforced', {
      compositionRootHits: [
        { file: 'src/main.ts', matchedRoot: 'src/main.ts', hasKernelFactory: false },
      ],
    });
    expect(enforced.findings[0]).toMatchObject({ failsStrict: true, severity: 'error' });
  });

  it('treats a glob composition root as a set: one factory among many files is enough', () => {
    const result = evaluate('enforced', {
      arkRun: extra('enforced', { compositionRoots: ['src/nestjs/**'] }),
      compositionRootHits: [
        { file: 'src/nestjs/app.module.ts', matchedRoot: 'src/nestjs/**', hasKernelFactory: false },
        { file: 'src/nestjs/health.ts', matchedRoot: 'src/nestjs/**', hasKernelFactory: false },
        { file: 'src/nestjs/main.ts', matchedRoot: 'src/nestjs/**', hasKernelFactory: true },
      ],
    });
    expect(result.findings.some((item) => item.ruleId === 'ARKRUN_MISSING_ROOT')).toBe(false);
  });

  it('emits one ARKRUN_MISSING_ROOT when a glob set has files but no factory', () => {
    const result = evaluate('enforced', {
      arkRun: extra('enforced', { compositionRoots: ['src/nestjs/**'] }),
      compositionRootHits: [
        { file: 'src/nestjs/app.module.ts', matchedRoot: 'src/nestjs/**', hasKernelFactory: false },
        { file: 'src/nestjs/health.ts', matchedRoot: 'src/nestjs/**', hasKernelFactory: false },
      ],
    });
    expect(result.findings).toEqual([
      expect.objectContaining({
        ruleId: 'ARKRUN_MISSING_ROOT',
        file: 'src/nestjs/app.module.ts',
        target: 'src/nestjs/**',
      }),
    ]);
  });

  it('emits ARKRUN_KERNEL_IN_DOMAIN for Domain imports of the companion', () => {
    const result = evaluate('enforced', {
      compositionRootHits: [
        { file: 'src/main.ts', matchedRoot: 'src/main.ts', hasKernelFactory: true },
      ],
      dependencies: [
        {
          from: 'src/domain/order.ts',
          specifier: '@arkgate/runtime',
          kind: 'import',
          typeOnly: true,
          line: 1,
          resolution: 'resolved-external',
        },
      ],
    });
    expect(result.findings).toEqual([
      expect.objectContaining({
        ruleId: 'ARKRUN_KERNEL_IN_DOMAIN',
        file: 'src/domain/order.ts',
        target: '@arkgate/runtime',
        fromLayer: 'DomainModel',
        failsStrict: true,
      }),
    ]);
  });

  it('does not treat ReportingReadModels as Domain-role', () => {
    const result = evaluateArkRunSensors({
      arkRun: extra('enforced'),
      layers: [
        ...LAYERS,
        {
          name: 'ReportingReadModels',
          patterns: ['src/reporting/**'],
          intentPrefixes: ['Reporting.'],
        },
      ],
      kernelCalls: [],
      managedNews: [],
      compositionRootHits: [
        { file: 'src/main.ts', matchedRoot: 'src/main.ts', hasKernelFactory: true },
      ],
      declarations: [],
      dependencies: [
        {
          from: 'src/reporting/order-list.ts',
          specifier: '@arkgate/runtime',
          kind: 'import',
          typeOnly: true,
          line: 1,
          resolution: 'resolved-external',
        },
      ],
      layerForFile: (file) => {
        if (file.startsWith('src/reporting/')) return 'ReportingReadModels';
        return layerForFile(file);
      },
    });
    expect(result.findings.some((item) => item.ruleId === 'ARKRUN_KERNEL_IN_DOMAIN')).toBe(false);
  });

  it('does not treat a Domain import of the gate package as kernel-in-domain', () => {
    const result = evaluate('enforced', {
      compositionRootHits: [
        { file: 'src/main.ts', matchedRoot: 'src/main.ts', hasKernelFactory: true },
      ],
      dependencies: [
        {
          from: 'src/domain/order.ts',
          specifier: 'arkgate',
          kind: 'import',
          typeOnly: false,
          line: 1,
          resolution: 'resolved-external',
        },
      ],
    });
    expect(result.findings.some((item) => item.ruleId === 'ARKRUN_KERNEL_IN_DOMAIN')).toBe(false);
  });

  it('emits ARKRUN_DIRECT_NEW outside composition-root factories, not in Domain', () => {
    const result = evaluate('enforced', {
      compositionRootHits: [
        { file: 'src/main.ts', matchedRoot: 'src/main.ts', hasKernelFactory: true },
      ],
      managedNews: [
        { file: 'src/application/billing.ts', line: 4, typeName: 'OrderService' },
        { file: 'src/domain/order.ts', line: 8, typeName: 'Money' },
        { file: 'src/main.ts', line: 6, typeName: 'OrderService' },
      ],
    });
    expect(result.findings).toEqual([
      expect.objectContaining({
        ruleId: 'ARKRUN_DIRECT_NEW',
        file: 'src/application/billing.ts',
        target: 'OrderService',
        failsStrict: true,
      }),
    ]);
  });

  it('emits undeclared emit/handle/depend against file-scoped declarations', () => {
    const result = evaluate('advisory', {
      compositionRootHits: [
        { file: 'src/main.ts', matchedRoot: 'src/main.ts', hasKernelFactory: true },
      ],
      kernelCalls: [
        {
          file: 'src/application/billing.ts',
          line: 5,
          kind: 'publisher',
          callee: 'publisher',
          viaImport: false,
          nameLiteral: 'Domain.Order.Placed',
        },
        {
          file: 'src/application/billing.ts',
          line: 6,
          kind: 'subscribe',
          callee: 'subscribe',
          viaImport: false,
          nameLiteral: 'Domain.Order.Paid',
        },
        {
          file: 'src/application/billing.ts',
          line: 7,
          kind: 'resolve',
          callee: 'resolve',
          viaImport: false,
          nameLiteral: 'Clock',
        },
      ],
      declarations: [
        {
          file: 'src/application/billing.ts',
          line: 2,
          uses: ['OrderService'],
          reactsTo: ['Domain.Order.Placed'],
          raises: ['Application.Billed'],
          sends: [],
        },
      ],
    });
    expect(result.findings.map((item) => item.ruleId).sort()).toEqual([
      'ARKRUN_UNDECLARED_DEPEND',
      'ARKRUN_UNDECLARED_EMIT',
      'ARKRUN_UNDECLARED_HANDLE',
    ]);
    expect(result.findings.every((item) => item.failsStrict === false)).toBe(true);
  });

  it('does not emit undeclared sensors when requireDeclarations is false', () => {
    const result = evaluate('enforced', {
      arkRun: extra('enforced', { requireDeclarations: false }),
      compositionRootHits: [
        { file: 'src/main.ts', matchedRoot: 'src/main.ts', hasKernelFactory: true },
      ],
      kernelCalls: [
        {
          file: 'src/application/billing.ts',
          line: 5,
          kind: 'publisher',
          callee: 'publisher',
          viaImport: false,
          nameLiteral: 'Domain.Order.Placed',
        },
      ],
    });
    expect(result.findings.some((item) => item.ruleId === 'ARKRUN_UNDECLARED_EMIT')).toBe(false);
  });

  it('reports incomplete (never fake green) for enforced interaction calls without a literal', () => {
    const result = evaluate('enforced', {
      compositionRootHits: [
        { file: 'src/main.ts', matchedRoot: 'src/main.ts', hasKernelFactory: true },
      ],
      kernelCalls: [
        {
          file: 'src/application/billing.ts',
          line: 5,
          kind: 'publish',
          callee: 'publish',
          viaImport: false,
        },
      ],
    });
    expect(result.findings.some((item) => item.ruleId === 'ARKRUN_UNDECLARED_EMIT')).toBe(false);
    expect(result.completenessReasons).toEqual([
      expect.objectContaining({
        code: ARKRUN_INTERACTION_NAME_INCOMPLETE,
        file: 'src/application/billing.ts',
      }),
    ]);
    const advisory = evaluate('advisory', {
      compositionRootHits: [
        { file: 'src/main.ts', matchedRoot: 'src/main.ts', hasKernelFactory: true },
      ],
      kernelCalls: [
        {
          file: 'src/application/billing.ts',
          line: 5,
          kind: 'publish',
          callee: 'publish',
          viaImport: false,
        },
      ],
    });
    expect(advisory.completenessReasons).toEqual([]);
  });

  it('emits ARKRUN_TRANSPORT_BYPASS for value imports of closed emitters', () => {
    const result = evaluate('enforced', {
      compositionRootHits: [
        { file: 'src/main.ts', matchedRoot: 'src/main.ts', hasKernelFactory: true },
      ],
      dependencies: [
        {
          from: 'src/application/bus.ts',
          specifier: 'events',
          kind: 'import',
          typeOnly: false,
          line: 1,
          resolution: 'resolved-external',
        },
        {
          from: 'src/application/bus.ts',
          specifier: 'events',
          kind: 'import',
          typeOnly: true,
          line: 2,
          resolution: 'resolved-external',
        },
      ],
    });
    expect(result.findings).toEqual([
      expect.objectContaining({
        ruleId: 'ARKRUN_TRANSPORT_BYPASS',
        target: 'events',
        failsStrict: true,
      }),
    ]);
  });

  it('CLI generated sensor matches Domain for the closed rule ids', () => {
    const input = {
      arkRun: extra('enforced'),
      layers: LAYERS,
      kernelCalls: [],
      managedNews: [],
      compositionRootHits: [
        { file: 'src/main.ts', matchedRoot: 'src/main.ts', hasKernelFactory: false },
      ],
      declarations: [],
      dependencies: [],
      layerForFile,
    };
    expect(evaluateCliArkRunSensors(input).findings.map((item: { ruleId: string }) => item.ruleId)).toEqual(
      evaluateArkRunSensors(input).findings.map((item) => item.ruleId)
    );
    expect(Object.values(ARKRUN_RULE_IDS)).toEqual([
      'ARKRUN_MISSING_ROOT',
      'ARKRUN_KERNEL_IN_DOMAIN',
      'ARKRUN_DIRECT_NEW',
      'ARKRUN_UNDECLARED_EMIT',
      'ARKRUN_UNDECLARED_HANDLE',
      'ARKRUN_UNDECLARED_DEPEND',
      'ARKRUN_TRANSPORT_BYPASS',
    ]);
  });
});
