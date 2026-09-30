/**
 * `npm run check:duplication` (jscpd) must see only hand-written code: every generated
 * mirror of src/domain (and the packaged-tooling compact builds) is ignored, and the
 * ignore list names nothing that is not generated.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function generatedOutputs(): string[] {
  const cliPure = [...read('scripts/generate-cli-pure.mjs').matchAll(/\bderived: '([^']+)'/g)].map(
    (match) => match[1]!
  );
  const packagedTooling = fs
    .readdirSync(path.join(root, 'bin/lib'))
    .filter((name) => name.endsWith('.source.mjs'))
    .map((name) => `bin/lib/${name.replace(/\.source\.mjs$/, '.mjs')}`);
  return [
    ...cliPure,
    ...packagedTooling,
    'bin/ark-layer-match.mjs',
    'bin/lib/analysis-engine.mjs',
  ].sort();
}

describe('.jscpd.json', () => {
  const config = JSON.parse(read('.jscpd.json')) as {
    path: string[];
    threshold: number;
    ignore: string[];
  };

  it('scans src, bin, and scripts with a zero-duplication threshold', () => {
    expect(config.path).toEqual(['src', 'bin', 'scripts']);
    expect(config.threshold).toBe(0);
    expect(config.ignore).toEqual(
      expect.arrayContaining(['**/node_modules/**', '**/dist/**', '**/*.d.ts'])
    );
  });

  it('ignores exactly the generated mirrors', () => {
    const ignoredGenerated = config.ignore
      .filter((pattern) => pattern.startsWith('**/bin/'))
      .map((pattern) => pattern.slice('**/'.length))
      .sort();
    expect(ignoredGenerated).toEqual(generatedOutputs());
    for (const rel of ignoredGenerated) {
      expect(fs.existsSync(path.join(root, rel)), rel).toBe(true);
    }
  });

  it('is wired as npm run check:duplication and runs in the CI build job', () => {
    const pkg = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.scripts['check:duplication']).toBe('jscpd --config .jscpd.json');
    expect(pkg.devDependencies.jscpd).toMatch(/^\d+\.\d+\.\d+$/);
    const ci = read('.github/workflows/ci.yml');
    const build = ci.slice(ci.indexOf('\n  build:\n'));
    const typecheck = build.indexOf('run: npm run typecheck');
    const duplication = build.indexOf('run: npm run check:duplication');
    expect(typecheck).toBeGreaterThan(-1);
    expect(duplication).toBeGreaterThan(typecheck);
  });
});
