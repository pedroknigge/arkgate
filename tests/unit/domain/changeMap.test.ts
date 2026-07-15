import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadContract } from '../../../src/gate';
import {
  ARK_CHANGE_MAP_SCHEMA,
  ARK_CHANGE_MAP_SCHEMA_URL,
  ArchitectureChangeMapValidationError,
  loadArchitectureChangeMap,
} from '../../../src/domain/changeMap';

const contract = loadContract({
  include: ['src'],
  layers: [
    { name: 'DomainModel', patterns: ['src/domain/**'] },
    { name: 'Kernel', patterns: ['src/kernel/**'] },
  ],
  rules: [],
});

function validMap() {
  return {
    $schema: ARK_CHANGE_MAP_SCHEMA_URL,
    schemaVersion: '1.0',
    files: [
      { path: 'src/kernel/service.ts', operation: 'create', layer: 'Kernel' },
      { path: 'src/domain/order.ts', operation: 'update', layer: 'DomainModel' },
    ],
    dependencies: [{ from: 'src/domain/order.ts', to: 'src/kernel/service.ts' }],
  };
}

describe('architecture change map contract', () => {
  it('normalizes order and hashes the strict structural plan deterministically', () => {
    const input = validMap();
    const before = structuredClone(input);
    const first = loadArchitectureChangeMap(input, contract.config, 'change-map.json');
    const second = loadArchitectureChangeMap(input, contract.config, 'change-map.json');

    expect(first).toEqual(second);
    expect(first.hash).toMatch(/^fnv1a-/);
    expect(first.map.files.map((file) => file.path)).toEqual([
      'src/domain/order.ts',
      'src/kernel/service.ts',
    ]);
    expect(input).toEqual(before);
  });

  it.each([
    {
      name: 'future version',
      mutate: (map: ReturnType<typeof validMap>) => ({ ...map, schemaVersion: '2.0' }),
      issue: '$.schemaVersion',
    },
    {
      name: 'unknown field',
      mutate: (map: ReturnType<typeof validMap>) => ({ ...map, requirements: ['not structural'] }),
      issue: '$.requirements',
    },
    {
      name: 'escaping path',
      mutate: (map: ReturnType<typeof validMap>) => ({
        ...map,
        files: [{ path: '../escape.ts', operation: 'create', layer: 'Kernel' }],
        dependencies: [],
      }),
      issue: '$.files[0].path',
    },
    {
      name: 'wrong layer',
      mutate: (map: ReturnType<typeof validMap>) => ({
        ...map,
        files: [{ path: 'src/domain/order.ts', operation: 'update', layer: 'Kernel' }],
        dependencies: [],
      }),
      issue: 'resolves to DomainModel, not Kernel',
    },
    {
      name: 'edge outside the plan',
      mutate: (map: ReturnType<typeof validMap>) => ({
        ...map,
        dependencies: [{ from: 'src/domain/order.ts', to: 'src/kernel/missing.ts' }],
      }),
      issue: 'must reference a planned file path',
    },
    {
      name: 'edge to a deleted file',
      mutate: (map: ReturnType<typeof validMap>) => ({
        ...map,
        files: map.files.map((file) =>
          file.path === 'src/kernel/service.ts' ? { ...file, operation: 'delete' } : file
        ),
      }),
      issue: 'cannot depend on deleted file',
    },
  ])('fails closed for $name', ({ mutate, issue }) => {
    expect(() => loadArchitectureChangeMap(mutate(validMap()), contract.config, 'map.json')).toThrow(
      issue
    );
  });

  it('publishes the generated schema through stable package subpaths', () => {
    const packaged = JSON.parse(
      fs.readFileSync(path.resolve('schemas/ark.change-map.schema.json'), 'utf8')
    );
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')) as {
      exports: Record<string, unknown>;
    };

    expect(packaged).toEqual(ARK_CHANGE_MAP_SCHEMA);
    expect(pkg.exports['./schema/change-map']).toBe('./schemas/ark.change-map.schema.json');
    expect(pkg.exports['./schema/ark.change-map.schema.json']).toBe(
      './schemas/ark.change-map.schema.json'
    );
  });

  it('uses one source-aware validation error type', () => {
    try {
      loadArchitectureChangeMap(null, contract.config, 'bad-map.json');
    } catch (error) {
      expect(error).toBeInstanceOf(ArchitectureChangeMapValidationError);
      expect(error).toMatchObject({ source: 'bad-map.json' });
    }
  });
});
