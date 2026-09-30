/**
 * ADR 0037 D3 / D5 — closed entry sources and the `.ark/entry-points.json` sidecar.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ENTRY_POINTS_SIDECAR,
  ambientEntries,
  collectEntryPoints,
  entriesBySource,
  loadEntryPointsSidecar,
} from '../../../bin/lib/entry-points-io.mjs';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function tree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-entry-points-'));
  roots.push(root);
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}

const json = (value: unknown) => JSON.stringify(value);

describe('package.json entries', () => {
  it('maps exports conditions, bin maps, types and dist paths back to source', () => {
    const governed = [
      'src/index.ts',
      'src/cli.ts',
      'src/sub/feature.ts',
      'src/other.ts',
      'lib-src/tool.ts',
    ];
    const root = tree({
      'package.json': json({
        main: './dist/index.js',
        types: './dist/index.d.ts',
        bin: { tool: './out/tool.js', app: 'dist/cli.js' },
        exports: {
          '.': { import: { types: './dist/index.d.ts', default: './dist/index.js' } },
          './feature': { require: './dist/sub/feature.cjs' },
          './schema': './schemas/x.json',
          './missing': './dist/missing.js',
        },
      }),
      'tsconfig.json': '{ // comment\n "compilerOptions": { "outDir": "./out", "rootDir": "./lib-src", }\n}\n',
    });
    const result = collectEntryPoints(root, { governed, ts });
    expect(result.entries.get('src/index.ts')).toBe('package-json');
    expect(result.entries.get('src/cli.ts')).toBe('package-json');
    expect(result.entries.get('src/sub/feature.ts')).toBe('package-json');
    expect(result.entries.get('lib-src/tool.ts')).toBe('package-json');
    expect(result.entries.has('src/other.ts')).toBe(false);
    expect(result.unmapped).toEqual([
      { declared: 'dist/missing.js', source: 'package-json', reason: 'built path maps to no governed source file' },
    ]);
    expect(entriesBySource(result.entries)).toEqual({ 'package-json': 4 });
  });

  it('uses a bundler entry map in a config file before the dist → src fallback', () => {
    const governed = ['src/gate.ts', 'src/index.ts', 'src/kernel/order/index.ts'];
    const root = tree({
      'package.json': json({ exports: { '.': './dist/index.js', './order': './dist/order/index.js' } }),
      'tsup.config.ts':
        "export default { entry: { index: 'src/gate.ts', 'order/index': 'src/kernel/order/index.ts' } };\n",
    });
    const result = collectEntryPoints(root, { governed, ts });
    expect(result.entries.get('src/gate.ts')).toBe('package-json');
    expect(result.entries.get('src/kernel/order/index.ts')).toBe('package-json');
    expect(result.entries.has('src/index.ts')).toBe(false);
    expect(result.unmapped).toEqual([]);
  });

  it('marks pattern exports unmapped and ignores existing non-governed files', () => {
    const root = tree({
      'package.json': json({ main: 'index.js', exports: { './*': './dist/*.js' } }),
      'index.js': 'module.exports = 1;\n',
    });
    const result = collectEntryPoints(root, { governed: ['src/a.ts'], ts });
    expect(result.unmapped).toEqual([{ declared: 'dist/*.js', source: 'package-json', reason: 'pattern export' }]);
  });

  it('reads scripts and CI workflow run steps', () => {
    const governed = ['scripts/build.mjs', 'scripts/ci-only.mjs', 'src/server.ts', 'scripts/unused.mjs'];
    const root = tree({
      'package.json': json({ scripts: { build: 'node scripts/build.mjs --x', dev: 'tsx src/server.ts' } }),
      '.github/workflows/ci.yml': 'jobs:\n  a:\n    steps:\n      - run: node scripts/ci-only.mjs "$X"\n',
    });
    const result = collectEntryPoints(root, { governed, ts });
    expect(result.entries.get('scripts/build.mjs')).toBe('package-scripts');
    expect(result.entries.get('scripts/ci-only.mjs')).toBe('package-scripts');
    expect(result.entries.get('src/server.ts')).toBe('package-scripts');
    expect(result.entries.has('scripts/unused.mjs')).toBe(false);
  });

  it('covers workspace packages that hold governed files', () => {
    const governed = ['packages/api/src/main.ts', 'packages/api/src/extra.ts'];
    const root = tree({
      'package.json': json({ workspaces: ['packages/*'] }),
      'packages/api/package.json': json({ main: 'dist/main.js' }),
      'packages/docs/package.json': json({ main: 'dist/nothing.js' }),
    });
    const result = collectEntryPoints(root, { governed, ts });
    expect(result.entries.get('packages/api/src/main.ts')).toBe('package-json');
    expect(result.unmapped).toEqual([]);
  });
});

describe('framework conventions', () => {
  it('Next app/pages/middleware/proxy/instrumentation, with or without src/', () => {
    const governed = [
      'src/app/page.tsx',
      'src/app/(shop)/cart/layout.tsx',
      'app/api/items/route.ts',
      'src/pages/about.tsx',
      'middleware.ts',
      'src/proxy.ts',
      'instrumentation.ts',
      'src/app/helpers.ts',
      'src/lib/a.stories.tsx',
    ];
    const root = tree({ 'package.json': json({ dependencies: { next: '16.0.0' }, devDependencies: { '@storybook/react': '8' } }) });
    const result = collectEntryPoints(root, { governed, ts });
    for (const file of governed.slice(0, 7)) expect(result.entries.get(file), file).toBe('framework');
    expect(result.entries.has('src/app/helpers.ts')).toBe(false);
    expect(result.entries.get('src/lib/a.stories.tsx')).toBe('framework');
    expect(result.frameworks).toEqual(['next', 'storybook']);
  });

  it('Vite index.html module scripts, Nest main, Vercel api', () => {
    const governed = ['src/main.tsx', 'server/src/boot.ts', 'api/hello.ts', 'src/other.ts'];
    const root = tree({
      'package.json': json({ devDependencies: { vite: '6' }, dependencies: { '@nestjs/core': '11' } }),
      'index.html': '<html><script src="/src/main.tsx" type="module"></script></html>',
      'nest-cli.json': json({ sourceRoot: 'server/src', entryFile: 'boot' }),
      'vercel.json': '{}',
    });
    const result = collectEntryPoints(root, { governed, ts });
    expect(result.entries.get('src/main.tsx')).toBe('framework');
    expect(result.entries.get('server/src/boot.ts')).toBe('framework');
    expect(result.entries.get('api/hello.ts')).toBe('framework');
    expect(result.entries.has('src/other.ts')).toBe(false);
    expect(result.frameworks).toEqual(['nest', 'vercel', 'vite']);
  });
});

describe('config, ark-config and ambient sources', () => {
  it('config files, setup files, and the source files a config names', () => {
    const governed = ['vite.config.ts', 'src/setupTests.ts', 'src/test-setup.ts', 'src/a.ts'];
    const root = tree({ 'vitest.config.ts': "export default { test: { setupFiles: ['./src/test-setup.ts'] } };\n" });
    const result = collectEntryPoints(root, { governed, ts });
    expect(result.entries.get('vite.config.ts')).toBe('config-file');
    expect(result.entries.get('src/setupTests.ts')).toBe('config-file');
    expect(result.entries.get('src/test-setup.ts')).toBe('config-file');
    expect(result.entries.has('src/a.ts')).toBe(false);
  });

  it('arkRun, arkOrder and stopAt roots', () => {
    const governed = ['src/boot/kernel.ts', 'src/order/plane.ts', 'src/shared/root.ts', 'src/x.ts'];
    const root = tree({});
    const config = {
      arkRun: { compositionRoots: ['src/boot/**'] },
      arkOrder: { planeRoots: ['src/order/plane.ts'] },
      rules: [{ sharedImportsSlice: { mode: 'deny-cross-parent', stopAt: ['src/shared/root.ts'] } }],
    };
    const result = collectEntryPoints(root, { governed, config, ts });
    expect(result.entries.get('src/boot/kernel.ts')).toBe('ark-config');
    expect(result.entries.get('src/order/plane.ts')).toBe('ark-config');
    expect(result.entries.get('src/shared/root.ts')).toBe('ark-config');
    expect(result.entries.has('src/x.ts')).toBe(false);
  });

  it('ambient declaration files are entries', () => {
    const root = tree({
      'src/env.ts': 'declare global { interface Window { x: 1 } }\nexport {};\n',
      'src/mod.ts': "declare module 'thing' {}\n",
      'src/plain.ts': 'export const declareGlobal = 1;\n',
    });
    expect(ambientEntries(root, ['src/env.ts', 'src/mod.ts', 'src/plain.ts'])).toEqual(['src/env.ts', 'src/mod.ts']);
  });
});

describe('.ark/entry-points.json sidecar', () => {
  it('applies live globs, drops expired ones and annotates what they matched', () => {
    const root = tree({
      [ENTRY_POINTS_SIDECAR]: json({
        schemaVersion: '1',
        entryPoints: [
          { glob: 'src/plugins/**', reason: 'loaded by name at runtime' },
          { glob: 'src/legacy/**', reason: 'old loader', reviewBy: '2020-01-01' },
          { glob: 'src/soon/**', reason: 'kept', reviewBy: '2099-01-01' },
        ],
      }),
    });
    const governed = ['src/plugins/a.ts', 'src/legacy/b.ts', 'src/soon/c.ts'];
    const result = collectEntryPoints(root, { governed, ts, today: '2026-09-30' });
    expect(result.entries.get('src/plugins/a.ts')).toBe('sidecar');
    expect(result.entries.get('src/soon/c.ts')).toBe('sidecar');
    expect(result.entries.has('src/legacy/b.ts')).toBe(false);
    expect(result.expiredByPath.get('src/legacy/b.ts')?.[0]).toContain('passed reviewBy 2020-01-01');
    expect(result.sidecar.status).toBe('loaded');
  });

  it('a malformed sidecar suppresses nothing and says so', () => {
    const root = tree({ [ENTRY_POINTS_SIDECAR]: json({ schemaVersion: '1', entryPoints: [{ glob: 'src/**' }] }) });
    const result = collectEntryPoints(root, { governed: ['src/a.ts'], ts, today: '2026-09-30' });
    expect(result.entries.size).toBe(0);
    expect(result.sidecar.status).toBe('malformed');
    expect(result.sidecar.note).toContain('suppresses nothing');
  });

  it('bounds: over 200 entries or over 64 KiB is malformed; absent is silent', () => {
    const many = tree({
      [ENTRY_POINTS_SIDECAR]: json({
        schemaVersion: '1',
        entryPoints: Array.from({ length: 201 }, (_, i) => ({ glob: `a${i}`, reason: 'r' })),
      }),
    });
    expect(loadEntryPointsSidecar(many, '2026-09-30')).toMatchObject({ status: 'malformed' });
    const big = tree({ [ENTRY_POINTS_SIDECAR]: ' '.repeat(65 * 1024) });
    expect(loadEntryPointsSidecar(big, '2026-09-30')).toMatchObject({ status: 'malformed' });
    expect(loadEntryPointsSidecar(tree({}), '2026-09-30')).toEqual({ status: 'absent', active: [], expired: [] });
  });
});
