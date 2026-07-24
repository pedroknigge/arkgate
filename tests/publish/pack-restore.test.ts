import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
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
    expect(p.scripts.prepack).toBe('npm run build');
  });

  it('npm pack ships bin + dist + dual CLIs and typescript host dep', () => {
    // prepack rebuilds dist/, which races with the MCP suite's build — serialize.
    withDistLock(() => run('npm', ['pack', '--pack-destination', tmp, '--silent']));

    const files = fs.readdirSync(tmp).filter((f) => f.endsWith('.tgz'));
    expect(files.length).toBe(1);
    const tgzPath = path.join(tmp, files[0]);

    const extract = path.join(tmp, 'extract');
    fs.mkdirSync(extract, { recursive: true });
    execFileSync('tar', ['-xzf', tgzPath, '-C', extract], { stdio: 'pipe' });

    const inner = JSON.parse(
      fs.readFileSync(path.join(extract, 'package', 'package.json'), 'utf8')
    );
    expect(Object.keys(inner.dependencies ?? {}).sort()).toEqual(['typescript-ark-host']);
    // AR04: root forwarders removed — experimental runtime is @arkgate/runtime only.
    expect(inner.exports['./nestjs']).toBeUndefined();
    expect(inner.exports['./runtime']).toBeUndefined();
    expect(inner.exports['./eslint']).toEqual({
      types: './dist/eslint/index.d.ts',
      import: './dist/eslint/index.js',
      require: './dist/eslint/index.cjs',
    });
    expect(inner.bin['arkgate-check']).toBe('bin/ark-check.mjs');
    expect(inner.bin['ark-check']).toBe('bin/ark-check.mjs');
    expect(fs.existsSync(path.join(extract, 'package', 'bin', 'ark-check.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(extract, 'package', 'dist', 'eslint', 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(extract, 'package', 'compat'))).toBe(false);
    expect(fs.existsSync(path.join(extract, 'package', 'dist', 'runtime'))).toBe(false);
    expect(fs.existsSync(path.join(extract, 'package', 'dist', 'nestjs'))).toBe(false);
    expect(fs.existsSync(path.join(extract, 'package', 'docs', 'typescript-support.md'))).toBe(true);
    expect(fs.existsSync(path.join(extract, 'package', 'docs', 'package-surface.md'))).toBe(true);
  }, 30_000);
});
