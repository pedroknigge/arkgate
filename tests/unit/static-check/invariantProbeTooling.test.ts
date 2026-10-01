/**
 * ADR 0039 Tooling: AST sites, the temporary workspace, the runner adapters,
 * and the test-importer walk shared with files nothing imports.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { findProbeSites, parsesCleanly } from '../../../bin/lib/invariant-probe-sites.mjs';
import {
  PROBE_OWNER_MARKER,
  createProbeWorkspace,
  sweepStaleProbeWorkspaces,
} from '../../../bin/lib/invariant-probe-workspace.mjs';
import {
  buildProbeEnv,
  detectRunner,
  probeTimeoutMs,
  runCoveringTests,
  runnerArgv,
} from '../../../bin/lib/invariant-probe-runner.mjs';
import { testImportersOf } from '../../../bin/lib/outside-importers.mjs';
import { planMutants } from '../../../bin/lib/invariant-probe.mjs';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const roots: string[] = [];

function tempDir(prefix = 'ark-probe-tooling-'): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  roots.push(dir);
  return dir;
}

function write(root: string, rel: string, text: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

/** Every regular file under `root` (links included by target path), hashed. */
function treeHash(root: string): string {
  const hash = crypto.createHash('sha256');
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const abs = path.join(dir, entry.name);
      hash.update(path.relative(root, abs));
      if (entry.isSymbolicLink()) hash.update(`->${fs.readlinkSync(abs)}`);
      else if (entry.isDirectory()) visit(abs);
      else hash.update(fs.readFileSync(abs));
    }
  };
  visit(root);
  return hash.digest('hex');
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('findProbeSites', () => {
  const SOURCE = [
    'export function assertWindow(days) {',
    '  if (days > 30) {',
    "    throw new Error('closed');",
    '  }',
    '  return true;',
    '}',
    'export const add = (a, b) => a + b;',
    'export const WINDOW_DAYS = 14;',
    'export class Order {',
    '  ensure(total) { if (total < 0) return false; return true; }',
    '}',
    'export const Pricing = { quote(n) { return n >= 1; } };',
    'export interface Policy { days: number }',
    '',
  ].join('\n');

  it('locates a function and emits sites inside it only', () => {
    const found = findProbeSites(ts, 'src/a.ts', SOURCE, 'assertWindow');
    expect(found).toMatchObject({ ok: true, shape: 'function', line: 1 });
    if (!found.ok) return;
    expect(found.sites.map((site: { kind: string; text: string }) => [site.kind, site.text])).toEqual([
      ['guard', 'days > 30'],
      ['comparison', '>'],
      ['numeric', '30'],
      ['throw', "throw new Error('closed');"],
      ['boolean', 'true'],
    ]);
    expect(found.body.kind).toBe('block');
    expect(planMutants(found.sites).map((mutant) => mutant.operator)).toEqual([
      'negate-guard',
      'drop-throw',
      'flip-comparison',
    ]);
  });

  it('handles arrow consts, literal consts, class and object-literal methods', () => {
    expect(findProbeSites(ts, 'src/a.ts', SOURCE, 'add')).toMatchObject({ ok: true, shape: 'const', body: { kind: 'expression' } });
    const literal = findProbeSites(ts, 'src/a.ts', SOURCE, 'WINDOW_DAYS');
    expect(literal).toMatchObject({ ok: true, shape: 'const', body: { kind: 'initializer' } });
    if (literal.ok) expect(planMutants(literal.sites).map((m) => m.replacement)).toEqual(['15']);
    const method = findProbeSites(ts, 'src/a.ts', SOURCE, 'Order.ensure');
    expect(method).toMatchObject({ ok: true, shape: 'method' });
    if (method.ok) expect(method.sites.map((site: { kind: string }) => site.kind)).toContain('guard');
    expect(findProbeSites(ts, 'src/a.ts', SOURCE, 'Pricing.quote')).toMatchObject({ ok: true, shape: 'method' });
  });

  it('refuses declarations without behavior and names that are not there', () => {
    expect(findProbeSites(ts, 'src/a.ts', SOURCE, 'Policy')).toEqual({ ok: false, reason: 'declaration-only', shape: 'interface' });
    expect(findProbeSites(ts, 'src/a.ts', SOURCE, 'Order')).toEqual({ ok: false, reason: 'declaration-only', shape: 'class' });
    expect(findProbeSites(ts, 'src/a.ts', SOURCE, 'missing')).toEqual({ ok: false, reason: 'symbol-not-found' });
  });

  it('knows when a mutant does not parse', () => {
    expect(parsesCleanly(ts, 'src/a.mjs', 'export const x = 1;\n')).toBe(true);
    expect(parsesCleanly(ts, 'src/a.mjs', 'export const x = ;\n')).toBe(false);
  });
});

describe('probe workspace (ADR 0039 safety)', () => {
  function project(): string {
    const root = tempDir('ark-probe-project-');
    write(root, 'package.json', '{"name":"p","type":"module"}\n');
    write(root, 'src/a.mjs', 'export const a = 1;\n');
    write(root, 'test/a.test.mjs', "import '../src/a.mjs';\n");
    write(root, 'node_modules/dep/index.js', 'module.exports = 1;\n');
    write(root, 'node_modules/@scope/pkg/index.js', 'module.exports = 2;\n');
    write(root, 'node_modules/.vite/cache.json', '{}\n');
    write(root, '.git/HEAD', 'ref: refs/heads/main\n');
    write(root, 'dist/out.js', '\n');
    write(root, '.ark/reports/latest.json', '{}\n');
    return root;
  }

  it('copies the tree, links node_modules entries, and leaves the user tree byte-identical', () => {
    const root = project();
    const before = treeHash(root);
    const tmpRoot = tempDir('ark-probe-tmp-');
    const ws = createProbeWorkspace(root, { tmpRoot });
    expect(ws.ok).toBe(true);
    if (!ws.ok) return;
    expect(fs.readFileSync(path.join(ws.dir, PROBE_OWNER_MARKER), 'utf8')).toContain('arkgate-probe');
    expect(fs.existsSync(path.join(ws.project, 'src/a.mjs'))).toBe(true);
    for (const skipped of ['.git', 'dist', '.ark/reports']) expect(fs.existsSync(path.join(ws.project, skipped))).toBe(false);
    const modules = path.join(ws.project, 'node_modules');
    expect(fs.lstatSync(modules).isDirectory()).toBe(true);
    expect(fs.lstatSync(path.join(modules, 'dep')).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(path.join(modules, '@scope')).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(path.join(modules, '.vite'))).toBe(false);
    // Mutating and caching in the copy never reaches the user's tree.
    fs.writeFileSync(path.join(ws.project, 'src/a.mjs'), "throw new Error('ARK_PROBE_LOAD');\n");
    fs.mkdirSync(path.join(modules, '.vite'));
    fs.writeFileSync(path.join(modules, '.vite', 'x'), 'cache');
    ws.cleanup();
    expect(fs.existsSync(ws.dir)).toBe(false);
    expect(treeHash(root)).toBe(before);
  });

  it('a crash leaves the user tree intact, and the sweep removes only marked, old directories', () => {
    const root = project();
    const before = treeHash(root);
    const tmpRoot = tempDir('ark-probe-tmp-');
    const ws = createProbeWorkspace(root, { tmpRoot });
    if (!ws.ok) throw new Error('workspace refused');
    // Simulated crash: no cleanup ran.
    expect(treeHash(root)).toBe(before);
    const foreign = path.join(tmpRoot, 'arkgate-probe-foreign');
    fs.mkdirSync(foreign);
    write(foreign, 'keep.txt', 'not ours');
    const fresh = createProbeWorkspace(root, { tmpRoot });
    if (!fresh.ok) throw new Error('workspace refused');
    const old = Date.now() - 25 * 60 * 60 * 1000;
    fs.utimesSync(path.join(ws.dir, PROBE_OWNER_MARKER), old / 1000, old / 1000);
    fs.utimesSync(foreign, old / 1000, old / 1000);
    const swept = sweepStaleProbeWorkspaces({ tmpRoot });
    expect(swept.removed).toEqual([ws.dir]);
    expect(fs.existsSync(foreign)).toBe(true);
    expect(fs.existsSync(fresh.dir)).toBe(true);
    fresh.cleanup();
    expect(treeHash(root)).toBe(before);
  });

  it('refuses a tree over the caps without copying', () => {
    const root = project();
    const tmpRoot = tempDir('ark-probe-tmp-');
    expect(createProbeWorkspace(root, { tmpRoot, maxFiles: 1 })).toMatchObject({ ok: false, reasonCode: 'PROBE_TREE_TOO_LARGE' });
    expect(fs.readdirSync(tmpRoot)).toEqual([]);
  });
});

describe('runner detection and environment', () => {
  function pkg(root: string, json: object): void {
    write(root, 'package.json', `${JSON.stringify(json)}\n`);
  }

  it('reads scripts.test first, then a dependency with its config file', () => {
    const root = tempDir();
    pkg(root, { scripts: { test: 'node --test test/' } });
    expect(detectRunner({ root, tests: ['test/a.test.mjs'] })).toMatchObject({ ok: true, id: 'node', bin: null });
    expect(detectRunner({ root, tests: ['test/a.test.ts'] })).toMatchObject({ ok: false, reasonCode: 'PROBE_RUNNER_UNSUPPORTED' });
    expect(detectRunner({ root, tests: ['test/a.test.mjs'], override: 'vitest' })).toMatchObject({ ok: false, reasonCode: 'PROBE_RUNNER_UNKNOWN' });
    pkg(root, { scripts: { test: 'vitest run && jest' } });
    expect(detectRunner({ root, tests: ['test/a.test.mjs'] })).toMatchObject({ ok: false, reasonCode: 'PROBE_RUNNER_UNKNOWN' });
    expect(detectRunner({ root, tests: ['test/a.test.mjs'], override: 'node' })).toMatchObject({ ok: true, id: 'node' });
    pkg(root, {});
    expect(detectRunner({ root, tests: ['test/a.test.mjs'] })).toMatchObject({ ok: false, reasonCode: 'PROBE_RUNNER_UNKNOWN' });
    pkg(root, { devDependencies: { jest: '^29' } });
    expect(detectRunner({ root, tests: ['test/a.test.mjs'] })).toMatchObject({ ok: false });
    write(root, 'jest.config.js', 'module.exports = {};\n');
    // Declared, but not installed: refused, never guessed.
    expect(detectRunner({ root, tests: ['test/a.test.mjs'] })).toMatchObject({ ok: false, reasonCode: 'PROBE_RUNNER_UNKNOWN' });
  });

  it('passes an allowlist environment only (no tokens)', () => {
    const env = buildProbeEnv({
      home: '/h',
      tmp: '/t',
      parentEnv: { PATH: '/bin', GITHUB_TOKEN: 'secret', AWS_SECRET_ACCESS_KEY: 'x', NODE_OPTIONS: '--require evil' },
    });
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env).toMatchObject({ PATH: '/bin', HOME: '/h', TMPDIR: '/t', TZ: 'UTC', CI: '1', HTTPS_PROXY: 'http://127.0.0.1:9' });
  });

  it('clamps the per-run timeout between 10 s and 120 s', () => {
    expect(probeTimeoutMs(0)).toBe(10_000);
    expect(probeTimeoutMs(5_000)).toBe(20_000);
    expect(probeTimeoutMs(500_000)).toBe(120_000);
  });

  it('builds argv arrays per runner (no shell)', () => {
    const opts = { outputFile: '/o.json', cacheDir: '/c' };
    expect(runnerArgv({ id: 'vitest', bin: '/v.mjs' }, ['a.test.ts'], opts)).toEqual([
      '/v.mjs', 'run', '--no-coverage', '--reporter=json', '--outputFile=/o.json', 'a.test.ts',
    ]);
    expect(runnerArgv({ id: 'jest', bin: '/j.js' }, ['a.test.ts'], opts)).toEqual([
      '/j.js', '--ci', '--json', '--outputFile=/o.json', '--coverage=false', '--watchman=false', '--cacheDirectory=/c', '--runTestsByPath', 'a.test.ts',
    ]);
    expect(runnerArgv({ id: 'node', bin: null }, ['a.test.mjs'], opts)).toEqual(['--test', '--test-reporter=tap', 'a.test.mjs']);
  });
});

describe('runner adapters against tiny projects', () => {
  const env = (root: string) => {
    fs.mkdirSync(path.join(root, '.h'), { recursive: true });
    return buildProbeEnv({ home: path.join(root, '.h'), tmp: root });
  };

  it('node:test: passed, failed, and a load failure counts as failed', async () => {
    const root = tempDir();
    write(root, 'package.json', '{"type":"module","scripts":{"test":"node --test"}}\n');
    write(root, 'src/a.mjs', 'export const a = 1;\n');
    write(root, 'test/a.test.mjs', "import { test } from 'node:test';\nimport assert from 'node:assert';\nimport { a } from '../src/a.mjs';\ntest('a', () => assert.equal(a, 1));\n");
    const runner = detectRunner({ root, tests: ['test/a.test.mjs'] });
    if (!runner.ok) throw new Error(runner.reason);
    const run = () => runCoveringTests({ runner, cwd: root, files: ['test/a.test.mjs'], timeoutMs: 30_000, env: env(root), scratch: root });
    expect((await run()).outcome).toBe('passed');
    write(root, 'src/a.mjs', 'export const a = 2;\n');
    expect((await run()).outcome).toBe('failed');
    write(root, 'src/a.mjs', "throw new Error('ARK_PROBE_LOAD');\nexport const a = 1;\n");
    expect((await run()).outcome).toBe('failed');
  }, 60_000);

  it('a timeout kills the whole process group', async () => {
    const root = tempDir();
    write(root, 'package.json', '{"type":"module","scripts":{"test":"node --test"}}\n');
    const pidFile = path.join(root, 'grandchild.pid');
    write(
      root,
      'test/hang.test.mjs',
      [
        "import { spawn } from 'node:child_process';",
        "import fs from 'node:fs';",
        "import { test } from 'node:test';",
        "test('hang', async () => {",
        "  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
        `  fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
        '  await new Promise(() => {});',
        '});',
        '',
      ].join('\n')
    );
    const runner = detectRunner({ root, tests: ['test/hang.test.mjs'] });
    if (!runner.ok) throw new Error(runner.reason);
    const result = await runCoveringTests({ runner, cwd: root, files: ['test/hang.test.mjs'], timeoutMs: 2_000, env: env(root), scratch: root });
    expect(result.outcome).toBe('timeout');
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(() => process.kill(pid, 0)).toThrow();
  }, 30_000);

  it('vitest from the repo\'s own dependency', async () => {
    const root = tempDir();
    write(root, 'package.json', '{"type":"module","scripts":{"test":"vitest run"}}\n');
    fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(root, 'node_modules'));
    write(root, 'src/a.mjs', 'export const a = 1;\n');
    write(root, 'a.test.mjs', "import { expect, it } from 'vitest';\nimport { a } from './src/a.mjs';\nit('a', () => expect(a).toBe(1));\n");
    const runner = detectRunner({ root, tests: ['a.test.mjs'] });
    if (!runner.ok) throw new Error(runner.reason);
    expect(runner.id).toBe('vitest');
    const run = () => runCoveringTests({ runner, cwd: root, files: ['a.test.mjs'], timeoutMs: 60_000, env: env(root), scratch: root });
    expect((await run()).outcome).toBe('passed');
    write(root, 'src/a.mjs', 'export const a = 2;\n');
    expect((await run()).outcome).toBe('failed');
    write(root, 'src/a.mjs', "throw new Error('ARK_PROBE_LOAD');\n");
    expect((await run()).outcome).toBe('failed');
  }, 120_000);

  it('jest through a fake bin that writes jest JSON', async () => {
    const root = tempDir();
    write(root, 'package.json', '{"scripts":{"test":"jest"}}\n');
    write(root, 'node_modules/jest/package.json', '{"name":"jest","version":"29.7.0","bin":{"jest":"bin/jest.js"}}\n');
    write(
      root,
      'node_modules/jest/bin/jest.js',
      [
        "const fs = require('node:fs');",
        "const args = process.argv.slice(2);",
        "const out = args.find((a) => a.startsWith('--outputFile=')).slice('--outputFile='.length);",
        "const files = args.slice(args.indexOf('--runTestsByPath') + 1);",
        "const ok = ['--ci', '--json', '--coverage=false', '--watchman=false'].every((f) => args.includes(f));",
        "const failed = files.filter((f) => fs.readFileSync(f, 'utf8').includes('FAIL')).length;",
        "if (!ok) process.exit(3);",
        "fs.writeFileSync(out, JSON.stringify({ numFailedTests: failed, numFailedTestSuites: 0, numTotalTests: files.length }));",
        'process.exit(failed > 0 ? 1 : 0);',
        '',
      ].join('\n')
    );
    write(root, 'a.test.js', 'pass\n');
    const runner = detectRunner({ root, tests: ['a.test.js'] });
    if (!runner.ok) throw new Error(runner.reason);
    expect(runner).toMatchObject({ id: 'jest', version: '29.7.0' });
    const run = () => runCoveringTests({ runner, cwd: root, files: ['a.test.js'], timeoutMs: 30_000, env: env(root), scratch: root });
    expect((await run()).outcome).toBe('passed');
    write(root, 'a.test.js', 'FAIL\n');
    expect((await run()).outcome).toBe('failed');
  }, 60_000);

  it('a non-zero exit with no reported failure is a runtime error, never a caught change', async () => {
    const root = tempDir();
    write(root, 'package.json', '{"scripts":{"test":"jest"}}\n');
    write(root, 'node_modules/jest/package.json', '{"name":"jest","version":"29.7.0","bin":"bin/jest.js"}\n');
    write(root, 'node_modules/jest/bin/jest.js', 'process.exit(7);\n');
    write(root, 'a.test.js', '\n');
    const runner = detectRunner({ root, tests: ['a.test.js'] });
    if (!runner.ok) throw new Error(runner.reason);
    const result = await runCoveringTests({ runner, cwd: root, files: ['a.test.js'], timeoutMs: 30_000, env: env(root), scratch: root });
    expect(result.outcome).toBe('runtime-error');
  }, 30_000);
});

describe('testImportersOf (shared with files nothing imports)', () => {
  it('finds tests importing a file directly or through one re-exporting barrel', () => {
    const root = tempDir();
    write(root, 'src/rules/window.ts', 'export function w() { return 1; }\n');
    write(root, 'src/rules/index.ts', "export { w } from './window';\n");
    write(root, 'src/other.ts', 'export const o = 1;\n');
    write(root, 'tests/direct.test.ts', "import { w } from '../src/rules/window';\n");
    write(root, 'tests/barrel.test.ts', "import { w } from '../src/rules';\n");
    write(root, 'tests/none.test.ts', "import { o } from '../src/other';\n");
    const governed = new Set(['src/rules/window.ts', 'src/rules/index.ts', 'src/other.ts']);
    const { byTarget } = testImportersOf({ root, ts, config: {}, governed, targets: ['src/rules/window.ts', 'src/other.ts'] });
    expect(byTarget.get('src/rules/window.ts')).toEqual(['tests/barrel.test.ts', 'tests/direct.test.ts']);
    expect(byTarget.get('src/other.ts')).toEqual(['tests/none.test.ts']);
  });
});
