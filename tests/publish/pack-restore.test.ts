import { describe, it, expect, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const root = process.cwd();

function run(cmd: string) {
  return execSync(cmd, {
    cwd: root,
    stdio: 'pipe',
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: path.join(os.tmpdir(), 'ark-npm-cache'),
    },
  });
}

describe('publish manifest model (dev-first workflow)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-pack-test-'));
  const tgzDir = tmp;

  afterAll(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    try {
      run('node scripts/dev-teardown.cjs');
    } catch {
      /* ignore */
    }
  });

  it('checked-in package.json is the dev manifest with test/typecheck scripts', () => {
    run('node scripts/dev-teardown.cjs');
    const rootP = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const dev = JSON.parse(fs.readFileSync(path.join(root, 'package.dev.json'), 'utf8'));
    expect(rootP).toEqual(dev);
    expect(rootP.scripts.test).toBe('vitest');
    expect(rootP.scripts.typecheck).toBe('tsc --noEmit');
    expect(rootP.devDependencies).toBeDefined();
  });

  it('package.publish.json documents the minimal publish manifest', () => {
    const p = JSON.parse(fs.readFileSync(path.join(root, 'package.publish.json'), 'utf8'));
    expect(p.devDependencies).toBeUndefined();
    expect(p.scripts.build).toBe('tsup');
  });

  it('plain npm pack succeeds from the dev manifest with zero runtime deps', () => {
    run('node scripts/dev-setup.cjs');
    run(`npm pack --pack-destination ${tgzDir} --silent`);

    const files = fs.readdirSync(tgzDir).filter((f) => f.endsWith('.tgz'));
    expect(files.length).toBe(1);
    const tgzPath = path.join(tgzDir, files[0]);

    const extract = path.join(tmp, 'extract');
    fs.mkdirSync(extract, { recursive: true });
    execSync(`tar -xzf ${tgzPath} -C ${extract}`, { stdio: 'pipe' });

    const inner = JSON.parse(
      fs.readFileSync(path.join(extract, 'package', 'package.json'), 'utf8')
    );
    expect(inner.dependencies).toEqual({});
    expect(inner.scripts.test).toBe('vitest');
    expect(inner.scripts.typecheck).toBe('tsc --noEmit');
    expect(inner.scripts.prepack).toBe('npm run build');
    expect(inner.scripts.postpack).toBeUndefined();
  });

  it('dev-setup.cjs restores devDeps from stripped state', () => {
    const stripped = {
      name: 'ark',
      version: '0.2.0',
      scripts: { build: 'tsup' },
      dependencies: {},
      files: ['dist'],
    };
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(stripped, null, 2));

    run('node scripts/dev-setup.cjs');

    const p = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(p.devDependencies).toBeDefined();
    expect(Object.keys(p.devDependencies).length).toBeGreaterThan(0);
  });
});
