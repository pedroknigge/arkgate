import { describe, expect, it } from 'vitest';
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '../../..');
const ARK_CHECK = path.join(REPO, 'bin/ark-check.mjs');
const EXAMPLES = path.join(REPO, 'examples');

const GALLERY_STARTERS = [
  { dir: 'crud-product-starter', archetype: 'crud-product' },
  { dir: 'api-backend-starter', archetype: 'api-backend' },
  { dir: 'worker-pipeline-starter', archetype: 'worker-pipeline' },
  { dir: 'multi-app-workspace-starter', archetype: 'multi-app-workspace' },
] as const;

type CheckJson = { ok: boolean; violations: unknown[]; warnings: unknown[] };

function runStrictCheck(root: string): CheckJson {
  const stdout = execFileSync(
    'node',
    [ARK_CHECK, '--root', root, '--config', 'ark.config.json', '--strict-config', '--json'],
    { encoding: 'utf8' }
  );
  return JSON.parse(stdout) as CheckJson;
}

function copyDir(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

describe('Phase D — example gallery starters', () => {
  for (const starter of GALLERY_STARTERS) {
    it(`${starter.dir} passes ark-check --strict-config`, () => {
      const root = path.join(EXAMPLES, starter.dir);
      expect(fs.existsSync(path.join(root, 'ark.config.json'))).toBe(true);
      expect(fs.existsSync(path.join(root, 'README.md'))).toBe(true);

      const result = runStrictCheck(root);
      expect(result.ok).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it(`${starter.dir} package.json is self-contained for copy-paste`, () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(EXAMPLES, starter.dir, 'package.json'), 'utf8')
      ) as {
        scripts: { check: string };
        devDependencies?: Record<string, string>;
      };
      expect(pkg.scripts.check).toBe(
        'ark-check --root . --config ark.config.json --strict-config'
      );
      expect(pkg.scripts.check).not.toContain('../..');
      expect(pkg.devDependencies?.['ark-runtime-kernel']).toBeDefined();
    });
  }

  it('crud-product-starter npm run check works when copied and installed', () => {
    const src = path.join(EXAMPLES, 'crud-product-starter');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-gallery-copy-'));
    copyDir(src, tmp);

    const pkgPath = path.join(tmp, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      devDependencies: Record<string, string>;
    };
    pkg.devDependencies['ark-runtime-kernel'] = `file:${REPO}`;
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

    execSync('npm install --ignore-scripts', { cwd: tmp, stdio: 'pipe' });
    const out = execSync('npm run check', { cwd: tmp, encoding: 'utf8' });
    expect(out).toContain('Ark check passed');
  }, 60_000);

  it('gallery README indexes every starter archetype', () => {
    const readme = fs.readFileSync(path.join(EXAMPLES, 'README.md'), 'utf8');
    for (const starter of GALLERY_STARTERS) {
      expect(readme).toContain(starter.dir);
      expect(readme).toContain(starter.archetype);
    }
    expect(readme).toContain('hexagonal-order-api');
    expect(readme).toContain('basic/');
  });
});