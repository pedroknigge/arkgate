/**
 * ADR 0037 — files nothing imports: Tooling pass (tests, outside source,
 * dynamic reach, generated copies), unused exports, and the three views.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runArchitectureScan } from '../../../bin/lib/architecture-scan.mjs';
import {
  computeOrphanModules,
  orphanModulesHtml,
  printOrphanModulesCompactLine,
  printOrphanModulesSection,
} from '../../../bin/lib/orphan-modules-io.mjs';

const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const CONFIG = {
  include: ['src'],
  layers: [{ name: 'App', patterns: ['src/**'] }],
  rules: [],
};

function tree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-orphans-'));
  roots.push(root);
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}

function importGraphOf(root: string) {
  return runArchitectureScan({
    root,
    config: CONFIG,
    manifest: null,
    rules: [],
    files: [],
    ts,
    args: { config: 'ark.config.json' },
    graphProjection: true,
  }).importGraph;
}

const BASE = {
  'ark.config.json': JSON.stringify(CONFIG),
  'package.json': JSON.stringify({ main: 'dist/index.js', dependencies: { next: '16' } }),
  'src/index.ts': "import { used } from './used';\nexport const main = used;\nexport function load(n: string) { return import(`./handlers/${n}`); }\n",
  'src/used.ts': 'export const used = 1;\nexport const spare = 2;\n',
  'src/orphan.ts': 'export const nobody = 1;\n',
  'src/only-tested.ts': 'export const t = 1;\n',
  'src/by-script.ts': 'export const s = 1;\n',
  'src/handlers/a.ts': 'export const a = 1;\n',
  'src/widgets/w.ts': 'export const w = 1;\n',
  'src/worker.ts': 'export const k = 1;\n',
  'src/ctx/c.ts': 'export const c = 1;\n',
  'src/reach.ts':
    "export const all = import.meta.glob('./widgets/*.ts');\nexport const u = new URL('./worker.ts', import.meta.url);\nexport const r = require.context('./ctx');\n",
  'src/commented.ts': "// import(`./ghost/${x}`)\nexport const x = 1;\n",
  'src/ghost/g.ts': 'export const g = 1;\n',
  'src/canonical.ts': 'export const fromCanonical = 1;\nexport const alsoCanonical = 2;\n',
  'src/copy.mjs': '/**\n * GENERATED FILE — do not edit.\n * Canonical: src/canonical.ts\n */\nexport const fromCanonical = 1;\n',
  'src/consumer.ts': "import { fromCanonical } from './copy.mjs';\nexport const z = fromCanonical;\n",
  'tests/only.test.ts': "import { t } from '../src/only-tested';\nimport { spare } from '../src/used';\nit('x', () => t);\n",
  'scripts/tool.ts': "import { s } from '../src/by-script';\nconsole.log(s);\n",
};

describe('computeOrphanModules', () => {
  it('lists true orphans, tiers test-only and outside-only, labels dynamic reach', () => {
    const root = tree(BASE);
    const result = computeOrphanModules({ root, config: CONFIG, ts, importGraph: importGraphOf(root), today: '2026-09-30' });
    const byPath = Object.fromEntries(result.orphans.map((item: { path: string; certainty: string }) => [item.path, item.certainty]));
    expect(byPath['src/orphan.ts']).toBe('no-importer');
    expect(byPath['src/ghost/g.ts']).toBe('no-importer'); // a commented-out import is not reach
    expect(byPath['src/commented.ts']).toBe('no-importer');
    expect(byPath['src/handlers/a.ts']).toBe('maybe-dynamic');
    expect(byPath['src/widgets/w.ts']).toBe('maybe-dynamic');
    expect(byPath['src/worker.ts']).toBe('maybe-dynamic');
    expect(byPath['src/ctx/c.ts']).toBe('maybe-dynamic');
    expect(byPath['src/reach.ts']).toBe('no-importer');
    expect(byPath['src/only-tested.ts']).toBeUndefined();
    expect(byPath['src/by-script.ts']).toBeUndefined();
    expect(byPath['src/canonical.ts']).toBeUndefined(); // its generated copy is imported
    expect(byPath['src/index.ts']).toBeUndefined(); // package.json main → dist → src
    expect(result.testOnly.sample).toContain('src/only-tested.ts');
    expect(result.totals.outsideOnly).toBe(2);
    expect(result.status).toBe('partial'); // a dynamic import with no static path
    expect(result.orphans.find((item: { path: string }) => item.path === 'src/orphan.ts').layer).toBe('App');
    expect(result.unusedExports.status).toBe('deferred');
  });

  it('details adds unused exports; test and generated-copy use count, generated files are skipped', () => {
    const root = tree(BASE);
    const result = computeOrphanModules({
      root,
      config: CONFIG,
      ts,
      importGraph: importGraphOf(root),
      details: true,
      today: '2026-09-30',
    });
    const rows = Object.fromEntries(
      result.unusedExports.files.map((row: { path: string; exports: string[] }) => [row.path, row.exports])
    );
    expect(rows['src/used.ts']).toBeUndefined(); // `spare` is used by a test
    expect(rows['src/canonical.ts']).toEqual(['alsoCanonical']);
    expect(rows['src/copy.mjs']).toBeUndefined();
    expect(rows['src/index.ts']).toBeUndefined(); // entry
  });

  it('is complete when every file has an importer or an entry', () => {
    const root = tree({
      'ark.config.json': JSON.stringify(CONFIG),
      'package.json': JSON.stringify({ main: 'src/index.ts' }),
      'src/index.ts': "import { a } from './a';\nexport const b = a;\n",
      'src/a.ts': 'export const a = 1;\n',
    });
    const result = computeOrphanModules({ root, config: CONFIG, ts, importGraph: importGraphOf(root) });
    expect(result.status).toBe('complete');
    expect(result.orphans).toEqual([]);
  });

  it('is unavailable without an importer index or TypeScript', () => {
    const root = tree({ 'src/a.ts': '' });
    expect(computeOrphanModules({ root, config: CONFIG, ts }).status).toBe('unavailable');
    expect(
      computeOrphanModules({ root, config: CONFIG, ts: undefined, importGraph: importGraphOf(tree({ ...BASE })) }).status
    ).toBe('unavailable');
  });
});

describe('views', () => {
  function capture(run: () => void): string {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.join(' '));
    });
    run();
    return lines.join('\n');
  }
  const io = {
    warn: '!',
    line: (mark: string, text: string) => console.log(`${mark} ${text}`),
    color: { bold: (text: string) => text, dim: (text: string) => text },
  };

  it('compact prints one count line; details print the list, the next step and the honesty', () => {
    const root = tree(BASE);
    const section = computeOrphanModules({
      root,
      config: CONFIG,
      ts,
      importGraph: importGraphOf(root),
      details: true,
      today: '2026-09-30',
    });
    const compact = capture(() => printOrphanModulesCompactLine(section, io));
    expect(compact.trim().split('\n')).toHaveLength(1);
    expect(compact).toContain('nothing imports. Details: arkgate-check --doctor --all');
    const details = capture(() => printOrphanModulesSection(section, io));
    expect(details).toContain('Files nothing imports (not a score)');
    expect(details).toContain('! Nothing imports src/orphan.ts, and no entry point covers it.');
    expect(details).toContain('Next: Delete it through the write gate');
    expect(details).toContain('only tests import');
    expect(details).toContain('Exports nothing imports by name:');
    expect(details).not.toMatch(/dead code/i);
    const html = orphanModulesHtml(section);
    expect(html).toContain('data-advisory="orphanModules"');
    expect(html).toContain('section card');
    expect(html).toContain('src/orphan.ts');
  });

  it('silent when complete and empty; unavailable prints its reason', () => {
    const silent = capture(() =>
      printOrphanModulesSection(
        { notAScore: true, status: 'complete', orphans: [], totals: { listed: 0 }, testOnly: { count: 0 }, unusedExports: { files: [] } },
        io
      )
    );
    expect(silent).toBe('');
    const unavailable = computeOrphanModules({ root: tree({}), config: CONFIG, ts });
    expect(capture(() => printOrphanModulesSection(unavailable, io))).toContain('had no import facts');
    expect(capture(() => printOrphanModulesCompactLine(unavailable, io))).toBe('');
    expect(orphanModulesHtml(unavailable)).toContain('Unused exports: run');
  });
});
