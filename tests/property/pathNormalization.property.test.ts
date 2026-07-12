import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { layerForRelativePath } from '../../src/domain/layerMatch';
import { runFuzz } from '../helpers/fuzz';

describe('path normalization properties', () => {
  it('classifies equivalent POSIX and Windows paths identically', () => {
    runFuzz(
      'path-normalization',
      fc.property(
        fc.array(fc.stringMatching(/^[a-z]{1,12}$/), { minLength: 0, maxLength: 5 }),
        (segments) => {
          const posix = ['src', 'domain', ...segments, 'model.ts'].join('/');
          const windows = posix.replaceAll('/', '\\');
          const layers = [{ name: 'DomainModel', patterns: ['src/domain/**'] }];
          expect(layerForRelativePath(posix, layers)).toBe('DomainModel');
          expect(layerForRelativePath(windows, layers)).toBe('DomainModel');
        }
      )
    );
  });
});
