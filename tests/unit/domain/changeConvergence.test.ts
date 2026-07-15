import { describe, expect, it } from 'vitest';
import type { ArchitectureChangeMapContract } from '../../../src/domain/changeMap';
import { analyzeArchitectureConvergence } from '../../../src/domain/changeConvergence';

const changeMap: ArchitectureChangeMapContract = {
  hash: 'fnv1a-map',
  map: {
    $schema: 'https://unpkg.com/arkgate@3/schemas/ark.change-map.schema.json',
    schemaVersion: '1.0',
    files: [
      { path: 'src/domain/order.ts', operation: 'update', layer: 'DomainModel' },
      { path: 'src/kernel/service.ts', operation: 'create', layer: 'Kernel' },
    ],
    dependencies: [{ from: 'src/domain/order.ts', to: 'src/kernel/service.ts' }],
  },
};

describe('architecture change convergence', () => {
  it('reports a clean structural result without claiming behavioral completion', () => {
    const input = {
      changeMap,
      changes: [
        { path: 'src/kernel/service.ts', operation: 'create' as const },
        { path: 'src/domain/order.ts', operation: 'update' as const },
      ],
      baseDependencies: [],
      candidateDependencies: [
        { from: 'src/domain/order.ts', to: 'src/kernel/service.ts' },
      ],
    };
    const before = structuredClone(input);

    expect(analyzeArchitectureConvergence(input)).toEqual({
      schemaVersion: '1.0',
      readOnly: true,
      changeMapHash: 'fnv1a-map',
      structurallyConverged: true,
      behavioralCompletion: 'not-evaluated',
      summary: { satisfied: 3, missing: 0, contradictory: 0, unplanned: 0 },
      findings: [
        expect.objectContaining({
          id: 'satisfied:file:src/domain/order.ts',
          classification: 'satisfied',
        }),
        expect.objectContaining({
          id: 'satisfied:file:src/kernel/service.ts',
          classification: 'satisfied',
        }),
        expect.objectContaining({
          id: 'satisfied:dependency:src/domain/order.ts->src/kernel/service.ts',
          classification: 'satisfied',
        }),
      ],
    });
    expect(input).toEqual(before);
  });

  it('distinguishes missing, contradictory, and unplanned structural impact', () => {
    const result = analyzeArchitectureConvergence({
      changeMap,
      changes: [
        { path: 'src/domain/order.ts', operation: 'delete' },
        { path: 'src/domain/extra.ts', operation: 'create' },
      ],
      baseDependencies: [
        { from: 'src/domain/order.ts', to: 'src/domain/legacy.ts' },
      ],
      candidateDependencies: [
        { from: 'src/kernel/service.ts', to: 'src/domain/order.ts' },
        { from: 'src/domain/extra.ts', to: 'src/domain/order.ts' },
      ],
    });

    expect(result.structurallyConverged).toBe(false);
    expect(result.behavioralCompletion).toBe('not-evaluated');
    expect(result.summary).toEqual({
      satisfied: 0,
      missing: 1,
      contradictory: 2,
      unplanned: 3,
    });
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'missing:file:src/kernel/service.ts',
          classification: 'missing',
        }),
        expect.objectContaining({
          id: 'contradictory:file:src/domain/order.ts',
          classification: 'contradictory',
          expectedOperation: 'update',
          actualOperation: 'delete',
        }),
        expect.objectContaining({
          id: 'contradictory:dependency:src/domain/order.ts->src/kernel/service.ts',
          classification: 'contradictory',
        }),
        expect.objectContaining({
          id: 'unplanned:file:src/domain/extra.ts',
          classification: 'unplanned',
        }),
        expect.objectContaining({
          id: 'unplanned:dependency-added:src/domain/extra.ts->src/domain/order.ts',
          classification: 'unplanned',
        }),
        expect.objectContaining({
          id: 'unplanned:dependency-removed:src/domain/order.ts->src/domain/legacy.ts',
          classification: 'unplanned',
        }),
      ])
    );
  });
});
