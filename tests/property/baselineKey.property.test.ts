import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { baselineKey, baselineOccurrenceKeys } from '../../src/domain/baselineKey';
import { runFuzz } from '../helpers/fuzz';

const violation = fc.record({
  ruleId: fc.string({ maxLength: 24 }),
  file: fc.string({ maxLength: 24 }),
  fromLayer: fc.option(fc.string({ maxLength: 16 }), { nil: undefined }),
  toLayer: fc.option(fc.string({ maxLength: 16 }), { nil: undefined }),
  target: fc.option(fc.string({ maxLength: 24 }), { nil: undefined }),
});

describe('baseline occurrence key properties', () => {
  it('uses stable ordinal suffixes per duplicate identity', () => {
    runFuzz(
      'baseline-occurrence-keys',
      fc.property(fc.array(violation, { maxLength: 80 }), (violations) => {
        const seen = new Map<string, number>();
        for (const [index, key] of baselineOccurrenceKeys(violations).entries()) {
          const base = baselineKey(violations[index]);
          const occurrence = (seen.get(base) ?? 0) + 1;
          seen.set(base, occurrence);
          expect(key).toBe(occurrence === 1 ? base : `${base}#${occurrence}`);
        }
      })
    );
  });
});
