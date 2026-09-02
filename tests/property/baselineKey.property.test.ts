import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  baselineKey,
  baselineOccurrenceKeys,
  isFreezableBaselineViolation,
  structureFreezeTarget,
} from '../../src/domain/baselineKey';
import { runFuzz } from '../helpers/fuzz';

const violation = fc.record({
  ruleId: fc.string({ maxLength: 24 }),
  file: fc.string({ maxLength: 24 }),
  fromLayer: fc.option(fc.string({ maxLength: 16 }), { nil: undefined }),
  toLayer: fc.option(fc.string({ maxLength: 16 }), { nil: undefined }),
  target: fc.option(fc.string({ maxLength: 24 }), { nil: undefined }),
  sensor: fc.option(fc.string({ maxLength: 24 }), { nil: undefined }),
  symbol: fc.option(fc.string({ maxLength: 16 }), { nil: undefined }),
  message: fc.option(fc.string({ maxLength: 48 }), { nil: undefined }),
  freezable: fc.option(fc.boolean(), { nil: undefined }),
});

describe('baseline occurrence key properties', () => {
  it('uses stable ordinal suffixes per duplicate identity', () => {
    runFuzz(
      'baseline-occurrence-keys',
      fc.property(fc.array(violation, { maxLength: 80 }), (violations) => {
        const seen = new Map<string, number>();
        for (const [index, key] of baselineOccurrenceKeys(violations).entries()) {
          if (!isFreezableBaselineViolation(violations[index])) {
            expect(key).toBe('');
            continue;
          }
          const base = baselineKey(violations[index]);
          const occurrence = (seen.get(base) ?? 0) + 1;
          seen.set(base, occurrence);
          expect(key).toBe(occurrence === 1 ? base : `${base}#${occurrence}`);
        }
      })
    );
  });

  it('STRUCTURE freeze keys distinguish sensors and keep an explicit target', () => {
    runFuzz(
      'baseline-structure-freeze-target',
      fc.property(
        fc.string({ minLength: 1, maxLength: 24 }),
        fc.string({ minLength: 1, maxLength: 16 }),
        fc.string({ minLength: 1, maxLength: 24 }),
        fc.string({ minLength: 1, maxLength: 24 }),
        (file, layer, sensorA, sensorB) => {
          const left = baselineKey({
            ruleId: 'ARKRULE_STRUCTURE',
            file,
            fromLayer: layer,
            sensor: sensorA,
          });
          const right = baselineKey({
            ruleId: 'ARKRULE_STRUCTURE',
            file,
            fromLayer: layer,
            sensor: sensorB,
          });
          expect(left).toContain(structureFreezeTarget({ sensor: sensorA }));
          expect(right).toContain(structureFreezeTarget({ sensor: sensorB }));
          if (sensorA !== sensorB) {
            expect(left).not.toBe(right);
          }
        }
      )
    );
  });
});
