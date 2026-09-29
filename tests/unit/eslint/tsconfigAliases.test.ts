import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseJsonc } from '../../../src/eslint/jsonc';
import {
  clearTsconfigAliasCache,
  readTsconfigPathAliases,
  resolveImportSpecifier,
} from '../../../src/eslint/tsconfigAliases';

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function tree(files: Record<string, string>): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-tsconfig-')));
  temps.push(root);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

describe('parseJsonc', () => {
  it('keeps comment-like text inside strings and drops real comments', () => {
    expect(
      parseJsonc('{ "paths": { "@/*": ["./src/*"] }, "include": ["**/*.ts"] /* c */ } // end')
    ).toEqual({ paths: { '@/*': ['./src/*'] }, include: ['**/*.ts'] });
    expect(parseJsonc('{"url": "http://x//y", "esc": "a\\"//b"}')).toEqual({
      url: 'http://x//y',
      esc: 'a"//b',
    });
  });

  it('accepts trailing commas at every nesting level, including before comments', () => {
    expect(parseJsonc('{"a":[1,2,],"b":{"c":1,/* x */},}')).toEqual({ a: [1, 2], b: { c: 1 } });
  });

  it('still rejects invalid JSON', () => {
    expect(() => parseJsonc('{"a":')).toThrow();
  });
});

describe('readTsconfigPathAliases / resolveImportSpecifier', () => {
  it('follows array and package extends; a child paths object replaces the parent one', () => {
    const root = tree({
      'node_modules/@acme/tsconfig/base.json':
        '{ "compilerOptions": { "strict": true, "paths": { "#pkg/*": ["pkg/*"] } } }',
      'tsconfig.base.json': '{ "compilerOptions": { "paths": { "~/*": ["./lib/*"] } } }',
      'tsconfig.json':
        '{ "extends": ["@acme/tsconfig/base.json", "./tsconfig.base"], "compilerOptions": {} }',
      'lib/util.ts': 'export {};\n',
      'src/a.ts': '',
    });
    const set = readTsconfigPathAliases(path.join(root, 'src'));
    expect(set.aliases.map((alias) => alias.from)).toEqual(['~/']);
    expect(resolveImportSpecifier(path.join(root, 'src/a.ts'), '~/util')).toBe(
      path.join(root, 'lib/util.ts')
    );
  });

  it('tries every target and supports a suffix after *', () => {
    const root = tree({
      'tsconfig.json':
        '{ "compilerOptions": { "baseUrl": ".", "paths": { "@m/*/api": ["missing/*", "mods/*/api"] } } }',
      'mods/billing/api.ts': 'export {};\n',
      'src/a.ts': '',
    });
    expect(resolveImportSpecifier(path.join(root, 'src/a.ts'), '@m/billing/api')).toBe(
      path.join(root, 'mods/billing/api.ts')
    );
  });

  it('caches parsed tsconfig and re-reads only when the file changes', () => {
    const root = tree({
      'tsconfig.json': '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }',
      'src/x.ts': 'export {};\n',
      'src/y.ts': 'export {};\n',
    });
    clearTsconfigAliasCache();
    const from = path.join(root, 'src/a.ts');
    const tsconfig = path.join(root, 'tsconfig.json');
    const spy = vi.spyOn(fs, 'readFileSync');
    for (let i = 0; i < 50; i += 1) {
      expect(resolveImportSpecifier(from, 'react')).toBeNull();
      expect(resolveImportSpecifier(from, '@/x')).toBe(path.join(root, 'src/x.ts'));
    }
    const reads = () => spy.mock.calls.filter(([file]) => file === tsconfig).length;
    expect(reads()).toBe(1);

    fs.writeFileSync(tsconfig, '{ "compilerOptions": { "paths": { "#/*": ["./src/*"] } } }  ');
    expect(resolveImportSpecifier(from, '#/y')).toBe(path.join(root, 'src/y.ts'));
    expect(resolveImportSpecifier(from, '@/x')).toBeNull();
    expect(reads()).toBe(2);
  });
});
