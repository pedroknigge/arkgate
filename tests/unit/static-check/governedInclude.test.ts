/**
 * #361: include is the scan list, derived from the concrete paths layer patterns name.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { governedInclude, patternIncludeEntry } from '../../../bin/ark-shared.mjs';
import { ARCHITECTURE_PRESETS } from '../../../bin/lib/presets.mjs';
import { collectGovernedFiles, isGovernedSourcePath } from '../../../bin/lib/scan-files.mjs';

const roots: string[] = [];

function write(root: string, rel: string, text = 'export {}\n') {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('patternIncludeEntry', () => {
  it('keeps the static prefix and stops at a glob', () => {
    expect(patternIncludeEntry('components/**')).toBe('components');
    expect(patternIncludeEntry('lib/db.ts')).toBe('lib/db.ts');
    expect(patternIncludeEntry('lib/db/**')).toBe('lib/db');
    expect(patternIncludeEntry('src/**/domain/**')).toBe('src');
    expect(patternIncludeEntry('./middleware.ts')).toBe('middleware.ts');
    expect(patternIncludeEntry('src/./app/**')).toBe('src/app');
  });

  it('names no root for a leading glob, an absolute path, or an empty pattern', () => {
    expect(patternIncludeEntry('**/lib/db/**')).toBeNull();
    expect(patternIncludeEntry('*.ts')).toBeNull();
    expect(patternIncludeEntry('lib/?.ts')).toBe('lib');
    expect(patternIncludeEntry('app/[id]/**')).toBe('app');
    expect(patternIncludeEntry('/abs/file.ts')).toBeNull();
    expect(patternIncludeEntry('')).toBeNull();
    expect(patternIncludeEntry(undefined as unknown as string)).toBeNull();
  });
});

describe('governedInclude (#361)', () => {
  it('adds pattern paths that exist and are outside include', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-361-include-'));
    roots.push(root);
    write(root, 'app/page.tsx', 'export default function Page() { return null }\n');
    write(root, 'components/icons.tsx', 'export function Icons() { return null }\n');
    write(root, 'lib/db.ts', 'export const db = true;\n');
    write(root, 'lib/format.ts', 'export const format = true;\n');
    const config = {
      include: ['src', 'app', 'middleware.ts'],
      layers: [
        { name: 'PresentationAdapters', patterns: ['components/**', 'app/**'] },
        { name: 'PersistenceAdapters', patterns: ['lib/db.ts', 'lib/db/**', '**/lib/auth/**'] },
      ],
    };
    const written = governedInclude(config, root);
    expect(written).toEqual(['src', 'app', 'middleware.ts', 'components', 'lib/db.ts']);
    const narrow = collectGovernedFiles(root, config)
      .map((file) => path.relative(root, file).split(path.sep).join('/'))
      .sort();
    expect(narrow).toEqual(['app/page.tsx']);
    expect(isGovernedSourcePath(root, 'lib/db.ts', config)).toBe(false);
    const scanned = collectGovernedFiles(root, { ...config, include: written })
      .map((file) => path.relative(root, file).split(path.sep).join('/'))
      .sort();
    expect(scanned).toEqual(['app/page.tsx', 'components/icons.tsx', 'lib/db.ts']);
    expect(isGovernedSourcePath(root, 'lib/db.ts', { ...config, include: written })).toBe(true);
    expect(isGovernedSourcePath(root, 'lib/format.ts', { ...config, include: written })).toBe(false);
  });

  it('leaves include unchanged when the pattern path is missing or already covered', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-361-covered-'));
    roots.push(root);
    write(root, 'src/app/page.tsx');
    const config = {
      include: ['src'],
      layers: [{ name: 'PresentationAdapters', patterns: ['src/components/**', 'components/**'] }],
    };
    expect(governedInclude(config, root)).toEqual(['src']);
    expect(governedInclude(config)).toEqual(['src']);
    expect(governedInclude({ include: ['.'], layers: [{ patterns: ['lib/db.ts'] }] }, root)).toEqual(['.']);
  });

  it('start overlay on a root Next tree writes the pattern paths into include', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-361-overlay-'));
    roots.push(root);
    write(
      root,
      'package.json',
      JSON.stringify({ name: 'storefront', private: true, dependencies: { next: '15.0.0', react: '19.0.0' } })
    );
    write(root, 'next.config.mjs', 'export default {}\n');
    write(root, 'app/page.tsx', 'export default function Page() { return null }\n');
    write(root, 'components/icons.tsx', 'export function Icons() { return null }\n');
    write(root, 'lib/db.ts', 'import { Icons } from "../components/icons";\nexport const mark = Icons;\n');
    const config = ARCHITECTURE_PRESETS.hexagonal(undefined, root) as { include: string[] };
    expect(config.include).toEqual(expect.arrayContaining(['components', 'lib/db.ts']));
    expect(config.include).not.toContain('lib');
  });
});
