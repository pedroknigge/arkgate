import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { analyzePolicyDelta } from '../../src';
import { runFuzz } from '../helpers/fuzz';

function config(maxAnyCasts: number, include = ['src', 'packages']) {
  return {
    include,
    layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
    rules: [{ from: 'DomainModel', to: 'DomainModel', allowed: false, peerIsolation: true }],
    safety: { maxAnyCasts },
  };
}

describe('policy delta properties', () => {
  it('classifies safety thresholds monotonically', () => {
    runFuzz(
      'policy-delta-safety-monotonicity',
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (before, after) => {
          const result = analyzePolicyDelta({
            baseConfig: config(before),
            candidateConfig: config(after),
          });
          if (after > before) {
            expect(result).toMatchObject({ classification: 'weakening', valid: false });
          } else if (after < before) {
            expect(result).toMatchObject({ classification: 'strengthening', valid: true });
          } else {
            expect(result).toMatchObject({ classification: 'neutral', valid: true });
          }
        }
      )
    );
  });

  it('is invariant to ordering and descriptive metadata', () => {
    runFuzz(
      'policy-delta-order-invariance',
      fc.property(fc.string({ minLength: 1, maxLength: 60 }), (description) => {
        const base = config(0);
        const candidate = {
          ...config(0, ['packages', 'src']),
          name: description,
          layers: [{ ...config(0).layers[0], description }],
          rules: [{ ...config(0).rules[0], message: description }],
        };
        expect(analyzePolicyDelta({ baseConfig: base, candidateConfig: candidate })).toMatchObject({
          classification: 'neutral',
          valid: true,
          findings: [],
        });
      })
    );
  });
});
