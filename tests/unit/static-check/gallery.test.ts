import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { GALLERY_STARTERS } from '../../../bin/ark-shared.mjs';

const REPO = path.resolve(import.meta.dirname, '../../..');
const ARK_CHECK = path.join(REPO, 'bin/ark-check.mjs');
const EXAMPLES = path.join(REPO, 'examples');

type CheckJson = { ok: boolean; violations: unknown[]; warnings: unknown[] };

function runStrictCheck(root: string): CheckJson {
  const stdout = execFileSync(
    'node',
    [ARK_CHECK, '--root', root, '--config', 'ark.config.json', '--strict-config', '--json'],
    { encoding: 'utf8' }
  );
  return JSON.parse(stdout) as CheckJson;
}

describe('Phase D — example gallery starters', () => {
  for (const starter of GALLERY_STARTERS) {
    const name = path.basename(starter.directory);

    it(`${name} passes ark-check --strict-config`, () => {
      const root = path.join(REPO, starter.directory);
      expect(fs.existsSync(path.join(root, 'ark.config.json'))).toBe(true);
      expect(fs.existsSync(path.join(root, 'README.md'))).toBe(true);
      const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
      expect(readme).toContain('npm install');
      expect(readme).toContain('npm run check');

      const result = runStrictCheck(root);
      expect(result.ok).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it(`${name} package.json is self-contained for copy-paste`, () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(REPO, starter.directory, 'package.json'), 'utf8')
      ) as {
        scripts: { check: string };
        devDependencies?: Record<string, string>;
      };
      expect(pkg.scripts.check).toBe(
        'ark-check --root . --config ark.config.json --strict-config'
      );
      expect(pkg.scripts.check).not.toContain('../..');
      expect(pkg.devDependencies?.['arkgate']).toBe('^3.7.0');
    });
  }

  it('defines exactly six unique frozen starters and excludes the deep teaching demo', () => {
    expect(Object.isFrozen(GALLERY_STARTERS)).toBe(true);
    expect(GALLERY_STARTERS.every((starter) => Object.isFrozen(starter))).toBe(true);
    expect(GALLERY_STARTERS).toHaveLength(6);
    expect(new Set(GALLERY_STARTERS.map((starter) => starter.archetype))).toHaveProperty('size', 6);
    expect(new Set(GALLERY_STARTERS.map((starter) => starter.directory))).toHaveProperty('size', 6);
    expect(GALLERY_STARTERS.some((starter) => starter.directory.includes('hexagonal-order-api'))).toBe(
      false
    );
  });

  it('gallery README indexes every starter archetype', () => {
    const readme = fs.readFileSync(path.join(EXAMPLES, 'README.md'), 'utf8');
    for (const starter of GALLERY_STARTERS) {
      expect(readme).toContain(path.basename(starter.directory));
      expect(readme).toContain(starter.archetype);
    }
    expect(readme).toContain('hexagonal-order-api');
    expect(readme).toContain('basic/');
  });
});
