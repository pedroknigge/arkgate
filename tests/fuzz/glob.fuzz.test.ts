import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { globToRegExp } from '../../src/domain/layerMatch';
import { runFuzz } from '../helpers/fuzz';

describe('glob fuzzing', () => {
  it('compiles arbitrary bounded glob input deterministically without crashing', () => {
    runFuzz(
      'glob-pattern',
      fc.property(fc.string({ maxLength: 128 }), fc.string({ maxLength: 128 }), (pattern, candidate) => {
        const first = globToRegExp(pattern);
        const second = globToRegExp(pattern);
        expect(first.source).toBe(second.source);
        expect(first.flags).toBe(second.flags);
        expect(typeof first.test(candidate)).toBe('boolean');
      })
    );
  });
});
