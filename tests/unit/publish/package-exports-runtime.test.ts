/**
 * R2: drive real package.json exports + built dist entries for arkgate/runtime
 * and root compat (kernel symbols still on the main barrel).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { withDistLock } from '../../helpers/distLock';

const root = process.cwd();
const require = createRequire(path.join(root, 'package.json'));

function ensureBuild() {
  withDistLock(() => {
    const runtimeJs = path.join(root, 'dist/runtime/index.js');
    const runtimeCjs = path.join(root, 'dist/runtime/index.cjs');
    if (fs.existsSync(runtimeJs) && fs.existsSync(runtimeCjs)) return;
    const result = spawnSync('npm', ['run', 'build'], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (result.status !== 0) {
      throw new Error(
        `npm run build failed:\n${result.stderr || result.stdout || ''}`
      );
    }
  });
}

describe('package exports — arkgate/runtime (R2)', () => {
  beforeAll(() => {
    ensureBuild();
  }, 120_000);

  it('package.json exports map declares ./runtime with types + import + require', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8')
    ) as {
      exports: Record<string, { types?: string; import?: string; require?: string }>;
    };
    expect(pkg.exports['./runtime']).toEqual({
      types: './dist/runtime/index.d.ts',
      import: './dist/runtime/index.js',
      require: './dist/runtime/index.cjs',
    });
    // Root still present for compat
    expect(pkg.exports['.']).toMatchObject({
      types: './dist/index.d.ts',
      import: './dist/index.js',
      require: './dist/index.cjs',
    });
  });

  it('built dist/runtime artifacts exist', () => {
    for (const rel of [
      'dist/runtime/index.js',
      'dist/runtime/index.cjs',
      'dist/runtime/index.d.ts',
      'dist/runtime/index.d.cts',
    ]) {
      expect(fs.existsSync(path.join(root, rel)), rel).toBe(true);
    }
  });

  it('ESM import of dist/runtime exposes a callable createStrictArkKernel', async () => {
    const url = pathToFileURL(path.join(root, 'dist/runtime/index.js')).href;
    const mod = await import(url);
    expect(typeof mod.createStrictArkKernel).toBe('function');
    expect(typeof mod.createStrictArkKernelFromConfig).toBe('function');
    expect(typeof mod.createArkKernel).toBe('function');
    const ark = mod.createStrictArkKernel({ instanceId: 'r2-runtime-esm' });
    expect(ark).toBeTruthy();
    expect(ark.instanceId).toBe('r2-runtime-esm');
    expect(typeof ark.publisher).toBe('function');
  });

  it('CJS require of dist/runtime exposes the same kernel factory', () => {
    const cjsPath = path.join(root, 'dist/runtime/index.cjs');
    // Bust cache so a rebuild in another suite does not serve a stale module.
    delete require.cache[require.resolve(cjsPath)];
    const mod = require(cjsPath) as {
      createStrictArkKernel: (opts?: { instanceId?: string }) => {
        instanceId: string;
        publisher: unknown;
      };
    };
    expect(typeof mod.createStrictArkKernel).toBe('function');
    const ark = mod.createStrictArkKernel({ instanceId: 'r2-runtime-cjs' });
    expect(ark.instanceId).toBe('r2-runtime-cjs');
  });

  it('root dist entry still re-exports kernel factories (compat)', async () => {
    const url = pathToFileURL(path.join(root, 'dist/index.js')).href;
    const mod = await import(url);
    expect(typeof mod.createStrictArkKernel).toBe('function');
    expect(typeof mod.createArkKernel).toBe('function');
    const ark = mod.createStrictArkKernel({ instanceId: 'r2-root-compat' });
    expect(ark.instanceId).toBe('r2-root-compat');
  });
});
