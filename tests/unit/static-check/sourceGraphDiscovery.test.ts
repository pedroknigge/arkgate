import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildArchitectureRecommendation,
  discoverRepoUnits,
} from '../../../bin/ark-shared.mjs';

const roots: string[] = [];

function fixture(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-o01-'));
  roots.push(root);
  for (const [rel, contents] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
  return root;
}

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('source/graph-first recommendation discovery', () => {
  it('does not classify a Ky-like library as an API server from a dev-only Express dependency', () => {
    const root = fixture({
      'package.json': JSON.stringify({
        name: 'http-client',
        exports: './source/index.js',
        devDependencies: { express: '^5.0.0' },
      }),
      'source/index.ts': 'export const request = () => true;\n',
      'source/options.ts': 'export type Options = { retry: number };\n',
      'source/errors.ts': 'export class HttpError extends Error {}\n',
      'source/headers.ts': 'export const headers = {};\n',
      'source/hooks.ts': 'export const hooks = [];\n',
      'source/utils.ts': 'export const noop = () => {};\n',
      'source/types.ts': 'export type Result = unknown;\n',
      'source/client.ts': 'export const client = {};\n',
    });
    const recommendation = buildArchitectureRecommendation(root);
    expect(recommendation.archetype).toBe('library-sdk');
    expect(recommendation.signals.expressLike).toBe(false);
    expect(recommendation.signals.discoveredRoots).toContain('source');
    expect(recommendation.signals.packageUnits[0].devOnlyDependencies).toContain('express');
  });

  it('discovers source and referenced workspace package roots', () => {
    const root = fixture({
      'package.json': JSON.stringify({ private: true, workspaces: ['packages/*'] }),
      'tsconfig.json': JSON.stringify({ references: [{ path: './packages/core' }] }),
      'source/index.ts': 'export const root = true;\n',
      'packages/core/package.json': JSON.stringify({ name: '@acme/core', exports: './source/index.js' }),
      'packages/core/source/index.ts': 'export const core = true;\n',
    });
    const units = discoverRepoUnits(root);
    expect(units.find((unit) => unit.root === '.')?.sourceRoots).toEqual(
      expect.arrayContaining(['source', 'packages/core'])
    );
    expect(units.find((unit) => unit.root === 'packages/core')?.sourceRoots).toContain('source');
  });

  it('keeps docs packages from turning a root library into a CRUD product', () => {
    const root = fixture({
      'package.json': JSON.stringify({ name: 'schema-lib', exports: './src/index.js', workspaces: ['docs'] }),
      'src/index.ts': 'export const schema = {};\n',
      'src/a.ts': 'export const a = 1;\n',
      'src/b.ts': 'export const b = 1;\n',
      'src/c.ts': 'export const c = 1;\n',
      'src/d.ts': 'export const d = 1;\n',
      'src/e.ts': 'export const e = 1;\n',
      'src/f.ts': 'export const f = 1;\n',
      'src/g.ts': 'export const g = 1;\n',
      'docs/package.json': JSON.stringify({ dependencies: { react: '19', next: '15', prisma: '6' } }),
      'docs/src/app/page.tsx': 'export default function Page() { return null; }\n',
    });
    const recommendation = buildArchitectureRecommendation(root);
    expect(recommendation.archetype).not.toBe('crud-product');
    expect(recommendation.signals.packageUnits.find((unit: { root: string }) => unit.root === 'docs').role).toBe('docs');
    expect(recommendation.signals.nextFramework).toBe(false);
    expect(recommendation.evidence.every((item: { effect: string }) => ['positive', 'negative'].includes(item.effect))).toBe(true);
  });
});
