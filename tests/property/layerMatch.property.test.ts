import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  findDeniedEdgeRule,
  globToRegExp,
  isEdgeDenied,
  layerForRelativePath,
  peerIsolationMustDeny,
} from '../../src/domain/layerMatch';
import { runFuzz } from '../helpers/fuzz';

const featureLayers = [{ name: 'Feature', patterns: ['src/features/**'] }];
const peerDeny = [
  { from: 'Feature', to: 'Feature', allowed: false as const, peerIsolation: true },
];

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
          const denied = isEdgeDenied(peerDeny, 'Feature', 'Feature', {
            fromPath: `src/features/${from}/api.ts`,
            toPath: `src/features/${to}/model.ts`,
            layers: featureLayers,
          });
          expect(denied).toBe(from !== to);
        }
      )
    );
  });

  it('peerIsolationMustDeny is true unless both paths and same non-empty slices exist', () => {
    runFuzz(
      'layer-peer-isolation-must-deny',
      fc.property(
        fc.option(fc.stringMatching(/^src\/features\/[a-z]{1,8}\/[a-z]{1,8}\.ts$/), {
          nil: undefined,
        }),
        fc.option(fc.stringMatching(/^src\/features\/[a-z]{1,8}\/[a-z]{1,8}\.ts$/), {
          nil: undefined,
        }),
        fc.integer({ min: 0, max: 3 }),
        fc.option(fc.stringMatching(/^features\/[a-z]{1,8}$/), { nil: undefined }),
        fc.option(fc.stringMatching(/^features\/[a-z]{1,8}$/), { nil: undefined }),
        (fromPath, toPath, folderCount, fromSlice, toSlice) => {
          const denied = peerIsolationMustDeny({
            fromPath,
            toPath,
            folderCount,
            fromSlice,
            toSlice,
          });
          const expected =
            !fromPath ||
            !toPath ||
            folderCount <= 0 ||
            !fromSlice ||
            !toSlice ||
            fromSlice !== toSlice;
          expect(denied).toBe(expected);
        }
      )
    );
  });

  /**
   * DF04 — peerIsolation fail-closed: isolation is configured, so insufficient
   * evidence (missing path, unclassifiable slice, empty folders) must deny.
   * Mutating `return rule` → continue/undefined would green-pass cross-slice edges.
   */
  it('fail-closes peerIsolation when paths, slices, or folders are insufficient', () => {
    runFuzz(
      'layer-peer-isolation-fail-closed',
      fc.property(
        fc.constantFrom(
          'missing-both-paths',
          'missing-from-path',
          'missing-to-path',
          'empty-from-path',
          'empty-to-path',
          'unclassifiable-paths',
          'wildcard-only-folders',
          'no-layers'
        ) as fc.Arbitrary<
          | 'missing-both-paths'
          | 'missing-from-path'
          | 'missing-to-path'
          | 'empty-from-path'
          | 'empty-to-path'
          | 'unclassifiable-paths'
          | 'wildcard-only-folders'
          | 'no-layers'
        >,
        (mode) => {
          const layers =
            mode === 'wildcard-only-folders'
              ? [{ name: 'Feature', patterns: ['**/*.ts'] }]
              : mode === 'no-layers'
                ? undefined
                : featureLayers;

          let options:
            | {
                fromPath?: string;
                toPath?: string;
                layers?: typeof featureLayers;
              }
            | undefined;

          switch (mode) {
            case 'missing-both-paths':
              options = { layers };
              break;
            case 'missing-from-path':
              options = { toPath: 'src/features/auth/api.ts', layers };
              break;
            case 'missing-to-path':
              options = { fromPath: 'src/features/auth/api.ts', layers };
              break;
            case 'empty-from-path':
              options = {
                fromPath: '',
                toPath: 'src/features/auth/api.ts',
                layers,
              };
              break;
            case 'empty-to-path':
              options = {
                fromPath: 'src/features/auth/api.ts',
                toPath: '',
                layers,
              };
              break;
            case 'unclassifiable-paths':
              options = {
                fromPath: 'src/elsewhere/a.ts',
                toPath: 'src/elsewhere/b.ts',
                layers,
              };
              break;
            case 'wildcard-only-folders':
              options = {
                fromPath: 'src/features/auth/api.ts',
                toPath: 'src/features/payments/model.ts',
                layers,
              };
              break;
            case 'no-layers':
              options = {
                fromPath: 'src/features/auth/api.ts',
                toPath: 'src/features/payments/model.ts',
                layers,
              };
              break;
          }

          expect(isEdgeDenied(peerDeny, 'Feature', 'Feature', options)).toBe(true);
          expect(findDeniedEdgeRule(peerDeny, 'Feature', 'Feature', options)).toBe(peerDeny[0]);
        }
      )
    );
  });
});
