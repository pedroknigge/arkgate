/**
 * Safety net: domain canonical (TS) and CLI derived (generated ESM) must agree.
 * Drift of the generated file is enforced separately by `npm run check:layer-match`.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  globToRegExp as globTs,
  patternSpecificity as specTs,
  layerForRelativePath as layerTs,
  isEdgeDenied as edgeTs,
  findDeniedEdgeRule as findTs,
  findDeniedEdgeDecision as decisionTs,
  sliceIdForPath as sliceTs,
  inferSliceFoldersFromPatterns as inferTs,
  scanExcludePatterns as scanTs,
  isScanExcludedRelative as exclTs,
  DEFAULT_GENERATED_FILE_GLOBS as genTs,
} from '../../../src/domain/layerMatch';

const binUrl = pathToFileURL(path.resolve('bin/ark-layer-match.mjs')).href;

describe('layer-match parity (domain TS ↔ generated bin ESM)', async () => {
  const bin = await import(binUrl);

  const layers = [
    { name: 'DomainModel', patterns: ['src/domain/**'], exclude: ['src/domain/vendor/**'] },
    { name: 'Kernel', patterns: ['src/kernel/**', 'src/kernel/app/**'] },
    { name: 'PresentationAdapters', patterns: ['src/app/**', 'src/**/*.page.ts'] },
    { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
  ];

  const cases = [
    'src/domain/user.ts',
    'src/domain/vendor/skip.ts',
    'src/kernel/index.ts',
    'src/kernel/app/facade.ts',
    'src/app/page.ts',
    'src/infra/db.ts',
    'src/foo/bar.page.ts',
    'src/unclassified.ts',
  ];

  it('layerForRelativePath matches for fixture paths', () => {
    for (const rel of cases) {
      expect(layerTs(rel, layers)).toBe(bin.layerForRelativePath(rel, layers));
    }
  });

  it('patternSpecificity and globToRegExp agree', () => {
    const patterns = ['src/**', 'src/kernel/**', 'src/kernel/app/**', '*.{ts,tsx}', 'src/**/domain/**'];
    for (const p of patterns) {
      expect(specTs(p)).toBe(bin.patternSpecificity(p));
      const a = globTs(p);
      const b = bin.globToRegExp(p);
      expect(a.source).toBe(b.source);
      expect(a.test('src/kernel/app/x.ts')).toBe(b.test('src/kernel/app/x.ts'));
    }
  });

  it('isEdgeDenied agrees', () => {
    const rules = [
      { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
      { from: 'ApplicationOrchestration', to: 'DomainModel', allowed: true },
    ];
    expect(edgeTs(rules, 'DomainModel', 'PersistenceAdapters')).toBe(
      bin.isEdgeDenied(rules, 'DomainModel', 'PersistenceAdapters')
    );
    expect(edgeTs(rules, 'ApplicationOrchestration', 'DomainModel')).toBe(
      bin.isEdgeDenied(rules, 'ApplicationOrchestration', 'DomainModel')
    );
    expect(edgeTs(rules, 'DomainModel', 'DomainModel')).toBe(false);
  });

  it('peerIsolation path-aware edges agree', () => {
    const rules = [
      { from: 'Features', to: 'Features', allowed: false, peerIsolation: true },
    ];
    const featLayers = [{ name: 'Features', patterns: ['src/features/**'] }];
    const opts = {
      fromPath: 'src/features/auth/a.ts',
      toPath: 'src/features/payments/b.ts',
      layers: featLayers,
    };
    expect(edgeTs(rules, 'Features', 'Features', opts)).toBe(
      bin.isEdgeDenied(rules, 'Features', 'Features', opts)
    );
    expect(edgeTs(rules, 'Features', 'Features', opts)).toBe(true);
    const same = {
      fromPath: 'src/features/auth/a.ts',
      toPath: 'src/features/auth/b.ts',
      layers: featLayers,
    };
    expect(edgeTs(rules, 'Features', 'Features', same)).toBe(false);
    expect(bin.isEdgeDenied(rules, 'Features', 'Features', same)).toBe(false);
    expect(sliceTs('src/features/auth/x.ts', ['features'])).toBe(
      bin.sliceIdForPath('src/features/auth/x.ts', ['features'])
    );
    expect(inferTs(['src/features/**'])).toEqual(bin.inferSliceFoldersFromPatterns(['src/features/**']));
    expect(findTs(rules, 'Features', 'Features', opts)?.peerIsolation).toBe(true);
    expect(bin.findDeniedEdgeRule(rules, 'Features', 'Features', opts)?.peerIsolation).toBe(true);
  });

  it('sharedRoots / allowedCrossSlice declarations agree', () => {
    const rules = [
      {
        from: 'Features',
        to: 'Features',
        allowed: false,
        peerIsolation: true,
        sharedRoots: ['ui'],
        allowedCrossSlice: [{ from: 'checkout', to: 'catalog' }],
      },
    ];
    const featLayers = [{ name: 'Features', patterns: ['src/features/**'] }];
    const cases2 = [
      ['src/features/auth/a.ts', 'src/ui/button.tsx'],
      ['src/features/auth/a.ts', 'src/widgets/spinner.tsx'],
      ['src/features/checkout/a.ts', 'src/features/catalog/b.ts'],
      ['src/features/catalog/b.ts', 'src/features/checkout/a.ts'],
    ];
    for (const [fromPath, toPath] of cases2) {
      const opts = { fromPath, toPath, layers: featLayers };
      expect(edgeTs(rules, 'Features', 'Features', opts)).toBe(
        bin.isEdgeDenied(rules, 'Features', 'Features', opts)
      );
      expect(decisionTs(rules, 'Features', 'Features', opts)?.peerIsolationReason).toBe(
        bin.findDeniedEdgeDecision(rules, 'Features', 'Features', opts)?.peerIsolationReason
      );
    }
    expect(bin.pathUnderSharedRoot('src/ui/x.ts', ['ui'])).toBe(true);
    expect(bin.crossSliceEdgeAllowed([{ from: 'a', to: 'b' }], 'features/a', 'features/b')).toBe(
      true
    );
  });

  it('layerForFile (bin) matches relative classification', () => {
    const root = '/proj';
    for (const rel of cases.filter((c) => !c.includes('unclassified'))) {
      const abs = path.posix.join(root, rel);
      expect(bin.layerForFile(root, abs, layers)).toBe(layerTs(rel, layers));
    }
  });

  it('scan exclude patterns and generated defaults agree', () => {
    expect(genTs).toEqual(bin.DEFAULT_GENERATED_FILE_GLOBS);
    expect(scanTs({})).toEqual(bin.scanExcludePatterns({}));
    expect(scanTs({ excludeGenerated: false })).toEqual(bin.scanExcludePatterns({ excludeGenerated: false }));
    expect(exclTs('src/app/routeTree.gen.ts', {})).toBe(true);
    expect(exclTs('src/app/routeTree.gen.ts', {})).toBe(
      bin.isScanExcludedRelative('src/app/routeTree.gen.ts', {})
    );
    expect(exclTs('src/app/routeTree.gen.ts', { excludeGenerated: false })).toBe(false);
    expect(exclTs('src/vendor/x.ts', { exclude: ['**/vendor/**'] })).toBe(
      bin.isScanExcludedRelative('src/vendor/x.ts', { exclude: ['**/vendor/**'] })
    );
  });
});
