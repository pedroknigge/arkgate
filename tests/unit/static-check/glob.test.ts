import { describe, it, expect } from 'vitest';
// The CLIs are standalone .mjs; import the shared glob compiler directly.
import { globToRegExp } from '../../../bin/ark-shared.mjs';

describe('globToRegExp', () => {
  it('matches ** across nested directories', () => {
    expect(globToRegExp('src/kernel/**').test('src/kernel/a/b/c.ts')).toBe(true);
    expect(globToRegExp('src/kernel/**').test('src/kernel/index.ts')).toBe(true);
    expect(globToRegExp('src/kernel/**').test('src/other/x.ts')).toBe(false);
  });

  it('matches **/ as zero or more segments', () => {
    const re = globToRegExp('src/**/index.ts');
    expect(re.test('src/index.ts')).toBe(true);
    expect(re.test('src/a/b/index.ts')).toBe(true);
  });

  it('supports brace alternation', () => {
    const re = globToRegExp('src/**/*.{ts,tsx}');
    expect(re.test('src/a/x.ts')).toBe(true);
    expect(re.test('src/a/x.tsx')).toBe(true);
    expect(re.test('src/a/x.js')).toBe(false);
  });

  it('never throws on an unbalanced brace (treats it as a literal)', () => {
    expect(() => globToRegExp('src/{domain/**')).not.toThrow();
    const re = globToRegExp('src/{domain/**');
    expect(re.test('src/{domain/x.ts')).toBe(true);
    expect(re.test('src/domain/x.ts')).toBe(false);
  });

  it('honors backslash-escaped braces as literals', () => {
    const re = globToRegExp('src/\\{legacy\\}/**');
    expect(re.test('src/{legacy}/x.ts')).toBe(true);
  });
});
