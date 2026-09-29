import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { withDistLock } from '../helpers/distLock';

const root = process.cwd();

function run(command: string, args: string[] = []) {
  return execFileSync(command, args, {
    cwd: root,
    stdio: 'pipe',
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: path.join(os.tmpdir(), 'ark-npm-cache'),
    },
  });
}

describe('publish manifest', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-pack-test-'));
  const extract = path.join(tmp, 'extract');

  afterAll(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('package.json has only the intentional TypeScript host dep and dev scripts', () => {
    const p = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    // Gate host only — JS-API TypeScript for resolve when project ships TS7 version-only export.
    expect(Object.keys(p.dependencies ?? {}).sort()).toEqual(['typescript-ark-host']);
    expect(p.scripts.test).toBe('vitest');
    expect(p.scripts.typecheck).toBe('tsc --noEmit');
    // No build lifecycle script: `prepack` / `prepare` / an install script would
    // make `pnpm add git+https://…/arkgate` fail closed with
    // ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED. The publish path builds explicitly
    // (scripts/release-npm.mjs) and `prepublishOnly` backstops a bare publish —
    // pnpm does not run prepublishOnly when it prepares a git dependency.
    for (const hook of ['prepack', 'prepare', 'preinstall', 'install', 'postinstall']) {
      expect(p.scripts[hook], `package.json scripts.${hook} blocks pnpm git installs`).toBe(
        undefined
      );
    }
    expect(p.scripts.prepublishOnly).toBe('npm run build');
  });

  it('npm pack ships bin + dist + dual CLIs and typescript host dep', () => {
    // Nothing rebuilds dist/ on pack any more, so build first; that races with
    // the MCP suite's build — serialize.
    withDistLock(() => {
      run('npm', ['run', 'build']);
      run('npm', ['pack', '--pack-destination', tmp, '--silent', '--ignore-scripts']);
    });

    const files = fs.readdirSync(tmp).filter((f) => f.endsWith('.tgz'));
    expect(files.length).toBe(1);
    const tgzPath = path.join(tmp, files[0]);

    fs.mkdirSync(extract, { recursive: true });
    execFileSync('tar', ['-xzf', tgzPath, '-C', extract], { stdio: 'pipe' });

    const inner = JSON.parse(
      fs.readFileSync(path.join(extract, 'package', 'package.json'), 'utf8')
    );
    expect(Object.keys(inner.dependencies ?? {}).sort()).toEqual(['typescript-ark-host']);
    // ADR 0031: extras are real subpaths of package arkgate. Each code entry maps ESM and CJS
    // to their own declarations, so CommonJS TypeScript consumers type-check `require`.
    for (const [key, dir] of [
      ['.', ''],
      ['./eslint', 'eslint/'],
      ['./order', 'order/'],
      ['./runtime', 'runtime/'],
      ['./nestjs', 'nestjs/'],
    ]) {
      expect(inner.exports[key], key).toEqual({
        import: { types: `./dist/${dir}index.d.ts`, default: `./dist/${dir}index.js` },
        require: { types: `./dist/${dir}index.d.cts`, default: `./dist/${dir}index.cjs` },
      });
      for (const file of ['index.d.ts', 'index.js', 'index.d.cts', 'index.cjs']) {
        expect(fs.existsSync(path.join(extract, 'package', 'dist', dir, file)), `${dir}${file}`).toBe(true);
      }
      if (key !== '.') {
        expect(inner.typesVersions['*'][key.slice(2)]).toEqual([`./dist/${dir}index.d.ts`]);
      }
    }
    expect(inner.bin['arkgate-check']).toBe('bin/ark-check.mjs');
    expect(inner.bin['ark-check']).toBe('bin/ark-check.mjs');
    expect(fs.existsSync(path.join(extract, 'package', 'bin', 'ark-check.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(extract, 'package', 'dist', 'eslint', 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(extract, 'package', 'compat'))).toBe(false);
    expect(fs.existsSync(path.join(extract, 'package', 'dist', 'runtime', 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(extract, 'package', 'dist', 'nestjs', 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(extract, 'package', 'dist', 'order', 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(extract, 'package', 'docs', 'typescript-support.md'))).toBe(true);
    expect(fs.existsSync(path.join(extract, 'package', 'docs', 'package-surface.md'))).toBe(true);
  }, 240_000);

  /**
   * A consumer project with the packed package under node_modules/arkgate plus the peers it
   * needs, linked from this repo's node_modules (no network).
   */
  function packedConsumer(name: string): string {
    const consumer = path.join(tmp, name);
    const modules = path.join(consumer, 'node_modules');
    fs.mkdirSync(modules, { recursive: true });
    fs.cpSync(path.join(extract, 'package'), path.join(modules, 'arkgate'), { recursive: true });
    for (const dep of ['@nestjs', '@types', 'typescript', 'typescript-ark-host', 'reflect-metadata', 'rxjs']) {
      const source = path.join(root, 'node_modules', dep);
      if (fs.existsSync(source)) fs.symlinkSync(source, path.join(modules, dep), 'junction');
    }
    fs.writeFileSync(path.join(consumer, 'package.json'), '{"name":"consumer","private":true}\n');
    return consumer;
  }

  function tsc(consumer: string, args: string[]) {
    try {
      execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), ...args], {
        cwd: consumer,
        stdio: 'pipe',
        encoding: 'utf8',
      });
      return { status: 0, out: '' };
    } catch (error) {
      const failure = error as { status?: number; stdout?: string; stderr?: string };
      return { status: failure.status ?? 1, out: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
    }
  }

  it('packed types resolve for CommonJS TypeScript consumers (node16 .cts and node10)', () => {
    expect(fs.existsSync(path.join(extract, 'package', 'package.json'))).toBe(true);
    const consumer = packedConsumer('consumer-types');
    fs.mkdirSync(path.join(consumer, 't'), { recursive: true });
    fs.writeFileSync(
      path.join(consumer, 't', 'a.cts'),
      [
        "import ark = require('arkgate');",
        "import rt = require('arkgate/runtime');",
        "import ord = require('arkgate/order');",
        "import es = require('arkgate/eslint');",
        "import nest = require('arkgate/nestjs');",
        'export const all = [ark.createAICodeGate, rt.createStrictArkKernel, ord.createOrderPlane, es, nest.ArkModule];',
        '',
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(consumer, 't', 'probe.cts'),
      "import rt = require('arkgate/runtime');\nexport const n: number = rt.createStrictArkKernel;\n"
    );
    fs.writeFileSync(
      path.join(consumer, 't', 'c.ts'),
      [
        "import { createAICodeGate } from 'arkgate';",
        "import { createStrictArkKernel } from 'arkgate/runtime';",
        "import { createOrderPlane } from 'arkgate/order';",
        "import { ArkModule } from 'arkgate/nestjs';",
        'export const all = [createAICodeGate, createStrictArkKernel, createOrderPlane, ArkModule];',
        '',
      ].join('\n')
    );
    const node16 = ['--noEmit', '--strict', '--module', 'node16', '--moduleResolution', 'node16', '--types', 'node'];
    // Through 4.8.23: TS1471 on every entry (only ESM .d.ts shipped).
    expect(tsc(consumer, [...node16, 't/a.cts'])).toEqual({ status: 0, out: '' });
    // The CJS declarations carry the real types, not `any`.
    const probe = tsc(consumer, [...node16, 't/probe.cts']);
    expect(probe.status).not.toBe(0);
    expect(probe.out).toContain('TS2322');
    // Through 4.8.23: TS2307 on every subpath (node10 ignores `exports`; no typesVersions).
    expect(
      tsc(consumer, [
        '--noEmit', '--strict', '--module', 'commonjs', '--moduleResolution', 'node10',
        '--ignoreDeprecations', '5.0', '--esModuleInterop', '--types', 'node', 't/c.ts',
      ])
    ).toEqual({ status: 0, out: '' });
  }, 120_000);

  it('the MCP Registry descriptor (server.json) starts the stdio server from the packed default bin', () => {
    const inner = JSON.parse(fs.readFileSync(path.join(extract, 'package', 'package.json'), 'utf8'));
    const server = JSON.parse(fs.readFileSync(path.join(extract, 'package', 'server.json'), 'utf8'));
    const entry = server.packages[0];
    expect(entry.registryType).toBe('npm');
    expect(entry.identifier).toBe(inner.name);
    expect(entry.runtimeHint).toBe('npx');
    // `npx <identifier>@<version> <args>` runs the bin named after the package.
    const defaultBin = inner.bin[entry.identifier];
    expect(defaultBin).toBe('bin/ark.mjs');
    const argv: string[] = [];
    for (const arg of entry.packageArguments) {
      if (arg.type === 'positional') argv.push(arg.value);
      else argv.push(arg.name, arg.value);
    }
    // A registry client launches in whatever directory the host picked: often a fresh project
    // with no ark.config.json yet. The descriptor must not name a file that may be absent
    // (an explicit --config that is missing exits 1 before initialize).
    const consumer = packedConsumer('consumer-mcp');
    expect(fs.existsSync(path.join(consumer, 'ark.config.json'))).toBe(false);
    const initialize = `${JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } },
    })}\n`;
    const launch = (args: string[]) =>
      spawnSync(process.execPath, [path.join(consumer, 'node_modules', 'arkgate', defaultBin), ...args], {
        cwd: consumer,
        input: initialize,
        encoding: 'utf8',
        timeout: 60_000,
      });
    const expectInitialized = (args: string[]) => {
      const result = launch(args);
      expect(result.stdout, `${args.join(' ')}\n${result.stderr}`).toContain('"serverInfo"');
      const response = JSON.parse(result.stdout.split('\n').find((line) => line.includes('"id":1')) ?? '{}');
      expect(response.result?.serverInfo).toEqual({ name: 'arkgate', version: inner.version });
    };
    // The old `arkgate-mcp` first-argument spelling routes to the same server.
    const spellings = [argv, ['arkgate-mcp', ...argv.slice(1)]];
    // Fresh project (no ark.config.json), then a project that has one: both answer initialize.
    for (const args of spellings) expectInitialized(args);
    fs.writeFileSync(
      path.join(consumer, 'ark.config.json'),
      '{"include":["src"],"layers":[],"rules":[]}\n'
    );
    for (const args of spellings) expectInitialized(args);
  }, 120_000);
});
