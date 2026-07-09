import { describe, it, expect } from 'vitest';
// The CLIs are standalone .mjs; import the shared helpers directly.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_RULES,
  detectWorkspaces,
  globToRegExp,
  resolveIntentLayer,
} from '../../../bin/ark-shared.mjs';
import { normalizeToolsList } from '../../../bin/lib/agent-gates.mjs';
import { createArchitectureProfile, elevenLayerProfile } from '../../../src/index';

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

describe('resolveIntentLayer (CI/MCP intent-classification parity)', () => {
  // These configs deliberately use overlapping and dotless prefixes — the cases where the
  // old first-match/raw-startsWith logic disagreed with the library's resolveLayer.
  const overlapping = [
    { name: 'Adapters', prefixes: ['Adapter.'] },
    { name: 'Persistence', prefixes: ['Adapter.Persistence.'] },
  ];
  const dotless = [{ name: 'DomainModel', prefixes: ['Domain'] }];

  it('matches the longest prefix regardless of declaration order', () => {
    expect(resolveIntentLayer('Adapter.Persistence.Save', overlapping)).toBe('Persistence');
    expect(resolveIntentLayer('Adapter.Other.X', overlapping)).toBe('Adapters');
  });

  it('normalizes dotless prefixes to a segment boundary', () => {
    expect(resolveIntentLayer('Domain.Order', dotless)).toBe('DomainModel');
    expect(resolveIntentLayer('DomainFoo.Bar', dotless)).toBeUndefined();
  });

  it('agrees with the library ArchitectureProfile.resolveLayer the MCP gate uses', () => {
    for (const layers of [overlapping, dotless]) {
      const profile = createArchitectureProfile({ name: 'p', layers });
      for (const intent of [
        'Adapter.Persistence.Save',
        'Adapter.Other.X',
        'Domain.Order',
        'DomainFoo.Bar',
        'Unrelated.Thing',
      ]) {
        expect(resolveIntentLayer(intent, layers)).toBe(profile.resolveLayer(intent));
      }
    }
  });
});

describe('DEFAULT_RULES parity', () => {
  it('matches the runtime elevenLayerProfile rule matrix', () => {
    expect(DEFAULT_RULES).toEqual(elevenLayerProfile.rules);
  });
});

describe('detectWorkspaces (universal monorepo roots)', () => {
  it('reads Rush rush.json projectFolder top segments (JSONC comments ok)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-rush-'));
    fs.writeFileSync(
      path.join(root, 'rush.json'),
      `/**
 * comment
 */
{
  "projects": [
    { "packageName": "@x/a", "projectFolder": "packages/a" },
    { "packageName": "@x/b", "projectFolder": "plugins/b" },
    { "packageName": "@x/c", "projectFolder": "services/c" }
  ]
}
`
    );
    fs.mkdirSync(path.join(root, 'packages', 'a'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packages', 'a', 'package.json'), '{"name":"a"}\n');
    const dirs = detectWorkspaces(root);
    expect(dirs).toEqual(expect.arrayContaining(['packages', 'plugins', 'services']));
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('falls back to conventional multi-package dirs with package.json when no manifest', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-conv-mono-'));
    for (const name of ['packages', 'plugins']) {
      fs.mkdirSync(path.join(root, name, 'pkg'), { recursive: true });
      fs.writeFileSync(path.join(root, name, 'pkg', 'package.json'), '{"name":"p"}\n');
    }
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true }); // no package.json → not a root
    const dirs = detectWorkspaces(root);
    expect(dirs).toEqual(expect.arrayContaining(['packages', 'plugins']));
    expect(dirs).not.toContain('docs');
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('normalizeToolsList', () => {
  it('splits comma-separated tool strings (does not character-split)', () => {
    expect(normalizeToolsList('codex,grok')).toEqual(['codex', 'grok']);
    expect(normalizeToolsList(['claude', 'cursor'])).toEqual(['claude', 'cursor']);
    expect(normalizeToolsList('codex, grok , claude')).toEqual(['codex', 'grok', 'claude']);
  });
});
