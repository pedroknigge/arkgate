import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { globToRegExp, isEdgeDenied, layerForRelativePath } from '../../src/domain/layerMatch';
import { runFuzz } from '../helpers/fuzz';

describe('layer matching properties', () => {
  it('keeps a concrete feature path in its most specific layer', () => {
    runFuzz(
      'layer-match',
      fc.property(fc.stringMatching(/^[a-z]{1,12}$/), (feature) => {
        const path = `src/features/${feature}/model.ts`;
        expect(globToRegExp('src/features/**').test(path)).toBe(true);
        expect(
          layerForRelativePath(path, [
            { name: 'Source', patterns: ['src/**'] },
            { name: 'Feature', patterns: ['src/features/**'] },
          ])
        ).toBe('Feature');
      })
    );
  });

  it('denies peer-isolated edges only across different slices', () => {
    runFuzz(
      'layer-peer-isolation',
      fc.property(
        fc.stringMatching(/^[a-z]{1,12}$/),
        fc.stringMatching(/^[a-z]{1,12}$/),
        (from, to) => {
          const denied = isEdgeDenied(
            [{ from: 'Feature', to: 'Feature', allowed: false, peerIsolation: true }],
            'Feature',
            'Feature',
            {
              fromPath: `src/features/${from}/api.ts`,
              toPath: `src/features/${to}/model.ts`,
              layers: [{ name: 'Feature', patterns: ['src/features/**'] }],
            }
          );
          expect(denied).toBe(from !== to);
        }
      )
    );
  });
});
