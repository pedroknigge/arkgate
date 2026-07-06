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

  it('package.json has zero runtime dependencies and dev scripts', () => {
    const p = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(p.dependencies ?? {}).toEqual({});
    expect(p.scripts.test).toBe('vitest');
    expect(p.scripts.typecheck).toBe('tsc --noEmit');
    expect(p.scripts.prepack).toBe('npm run build');
  });

  it('npm pack ships bin + dist with zero runtime deps', () => {
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
    expect(inner.dependencies ?? {}).toEqual({});
    expect(inner.exports['./nestjs']).toEqual({
      types: './dist/nestjs/index.d.ts',
      import: './dist/nestjs/index.js',
      require: './dist/nestjs/index.cjs',
    });
    expect(inner.exports['./eslint']).toEqual({
      types: './dist/eslint/index.d.ts',
      import: './dist/eslint/index.js',
      require: './dist/eslint/index.cjs',
    });
    expect(inner.bin['ark-check']).toBe('bin/ark-check.mjs');
    expect(fs.existsSync(path.join(extract, 'package', 'bin', 'ark-check.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(extract, 'package', 'dist', 'eslint', 'index.js'))).toBe(true);
  }, 30_000);
});
