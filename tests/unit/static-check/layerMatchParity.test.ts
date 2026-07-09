/**
 * Structural single-source lock: bin/ark-layer-match.mjs (CLI) and
 * src/domain/layerMatch.ts (library/eslint) must agree on classification.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  globToRegExp as globTs,
  patternSpecificity as specTs,
  layerForRelativePath as layerTs,
  isEdgeDenied as edgeTs,
  scanExcludePatterns as scanTs,
  isScanExcludedRelative as exclTs,
  DEFAULT_GENERATED_FILE_GLOBS as genTs,
} from '../../../src/domain/layerMatch';

const binUrl = pathToFileURL(path.resolve('bin/ark-layer-match.mjs')).href;

describe('layer-match parity (domain TS ↔ bin ESM)', async () => {
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
