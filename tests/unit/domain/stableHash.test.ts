import { describe, expect, it } from 'vitest';
import { deterministicHash, stableHash, stableSerialize } from '../../../src/domain/stableHash';

const reference = (value: unknown): string => deterministicHash(stableSerialize(value));

describe('stableHash (streaming)', () => {
  it('matches deterministicHash(stableSerialize(value)) byte for byte', () => {
    const sparse: unknown[] = [1, , 3]; // eslint-disable-line no-sparse-arrays
    const cases: unknown[] = [
      null,
      0,
      'text',
      true,
      [],
      {},
      [1, 'a', null, undefined, () => 1, [2, { b: 1, a: 2 }]],
      sparse,
      { z: 1, a: undefined, m: [{ y: 'é "', x: null }], fn: () => 1, nested: { k: [] } },
      {
        files: Array.from({ length: 200 }, (_, i) => ({ path: `src/f${i}.ts`, contentHash: `h${i}` })),
        dependencies: Array.from({ length: 300 }, (_, i) => ({
          from: `src/f${i}.ts`,
          kind: 'import',
          namedBindings: ['b', 'a'],
          typeOnly: i % 2 === 0,
          line: i,
        })),
      },
    ];
    for (const value of cases) expect(stableHash(value)).toBe(reference(value));
  });
});
