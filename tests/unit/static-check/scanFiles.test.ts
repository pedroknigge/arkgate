import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectGovernedFiles } from '../../../bin/lib/scan-files.mjs';

describe('governed source scan symlink policy', () => {
  it('follows internal directory symlinks so coverage matches TypeScript', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-scan-symlink-internal-'));
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/entry.ts'), 'export const entry = 1;\n');
    fs.writeFileSync(path.join(root, 'shared/linked.ts'), 'export const linked = 1;\n');
    fs.symlinkSync(path.join(root, 'shared'), path.join(root, 'src/shared'));

    const files = collectGovernedFiles(root, { include: ['src'] });
    expect(files.map((file) => path.relative(root, file).split(path.sep).join('/')).sort()).toEqual([
      'src/entry.ts',
      'src/shared/linked.ts',
    ]);
  });

  it('fails closed when an included symlink escapes the project root', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-scan-symlink-external-'));
    const root = path.join(parent, 'project');
    const outside = path.join(parent, 'outside');
    fs.mkdirSync(root);
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'external.ts'), 'export const external = 1;\n');
    fs.symlinkSync(outside, path.join(root, 'src'));

    expect(() => collectGovernedFiles(root, { include: ['src'] })).toThrow(
      'Refusing to scan symlink outside project root'
    );
  });

  it('deduplicates cycles created by internal symlink directories', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-scan-symlink-cycle-'));
    fs.mkdirSync(path.join(root, 'src/a'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/a/value.ts'), 'export const value = 1;\n');
    fs.symlinkSync(path.join(root, 'src'), path.join(root, 'src/a/back'));

    const files = collectGovernedFiles(root, { include: ['src'] });
    expect(files).toHaveLength(1);
  });
});
