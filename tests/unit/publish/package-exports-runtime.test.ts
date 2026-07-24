/** C06: the gate and experimental runtime build and package independently. */
import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { withDistLock } from '../../helpers/distLock';

const root = process.cwd();
const runtimeRoot = path.join(root, 'packages/runtime');
const require = createRequire(path.join(runtimeRoot, 'package.json'));

function buildBoth() {
  withDistLock(() => {
    for (const script of ['build', 'build:runtime']) {
      const result = spawnSync('npm', ['run', script], { cwd: root, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    }
  });
}

describe('isolated runtime distribution', () => {
  beforeAll(buildBoth, 120_000);

  it('keeps the root gate bundle free of runtime and NestJS artifacts (AR04)', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    // Deprecated root forwarders removed in ArkGate 4 / AR04 — use @arkgate/runtime.
    expect(pkg.exports['./runtime']).toBeUndefined();
    expect(pkg.exports['./nestjs']).toBeUndefined();
    expect(fs.existsSync(path.join(root, 'compat'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'dist/runtime'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'dist/nestjs'))).toBe(false);
    const gate = await import(pathToFileURL(path.join(root, 'dist/index.js')).href);
    expect(typeof gate.createAICodeGate).toBe('function');
    expect(gate.createStrictArkKernel).toBeUndefined();
    expect(gate.InMemoryEventBuffer).toBeUndefined();
  });

  it('builds the experimental package independently for ESM and CJS', async () => {
    const esmPath = path.join(runtimeRoot, 'dist/index.js');
    const cjsPath = path.join(runtimeRoot, 'dist/index.cjs');
    const esm = await import(pathToFileURL(esmPath).href);
    expect(typeof esm.createStrictArkKernel).toBe('function');
    expect(typeof esm.InMemoryEventBuffer).toBe('function');
    delete require.cache[require.resolve(cjsPath)];
    const cjs = require(cjsPath);
    expect(typeof cjs.createStrictArkKernel).toBe('function');
    expect(typeof cjs.InMemoryEventBuffer).toBe('function');
  });

  it('labels runtime experimental and publishes no source-tree dependency', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('@arkgate/runtime');
    expect(pkg.version).toMatch(/^0\./);
    expect(pkg.publishConfig.tag).toBe('experimental');
    expect(pkg.files).toEqual(['dist', '!dist/**/*.d.cts', 'README.md']);
  });
});
