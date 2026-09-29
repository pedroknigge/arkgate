/**
 * Every shipped bin/lib module must load in plain Node (zero-build CLI contract).
 * Regression: bin/lib/ark-order-invariants.mjs imported a missing './stableHash'.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const libDir = path.join(root, 'bin/lib');

function shippedLibModules(): string[] {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
    files: string[];
  };
  const excluded = new Set(
    pkg.files.filter((entry) => entry.startsWith('!bin/lib/')).map((entry) => entry.slice(1))
  );
  return fs
    .readdirSync(libDir)
    .filter((name) => name.endsWith('.mjs') && !name.startsWith('.'))
    .map((name) => `bin/lib/${name}`)
    .filter((rel) => !excluded.has(rel) && !rel.endsWith('.source.mjs'))
    .sort();
}

/** Load every module in one fresh Node process; print the ones that fail. */
const LOADER = `
const urls = JSON.parse(process.argv[1]);
const failures = [];
for (const url of urls) {
  try { await import(url); } catch (error) { failures.push(url + ': ' + error.message); }
}
process.stdout.write(JSON.stringify(failures));
`;

describe('shipped bin/lib modules are loadable', () => {
  const modules = shippedLibModules();

  it('finds the shipped module set', () => {
    expect(modules.length).toBeGreaterThan(50);
    expect(modules).toContain('bin/lib/ark-order-invariants.mjs');
    expect(modules).toContain('bin/lib/stable-hash.mjs');
  });

  it('no shipped module uses an extensionless relative import', () => {
    const offenders: string[] = [];
    for (const rel of modules) {
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      // Statement-level only (line-anchored), so comments quoting `import './x'` don't count.
      const re = /^\s*(?:import|export)\b[^;\n]*?(?:\bfrom\s*|^\s*import\s*)['"](\.{1,2}\/[^'"]+)['"]/gm;
      let match: RegExpExecArray | null;
      while ((match = re.exec(text)) !== null) {
        if (!/\.(?:mjs|js|cjs|json)$/.test(match[1]!)) offenders.push(`${rel} -> ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every shipped module imports without ERR_MODULE_NOT_FOUND', () => {
    const urls = modules.map((rel) => pathToFileURL(path.join(root, rel)).href);
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', LOADER, JSON.stringify(urls)],
      { cwd: root, encoding: 'utf8', timeout: 120_000 }
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout) as string[]).toEqual([]);
  }, 130_000);
});
