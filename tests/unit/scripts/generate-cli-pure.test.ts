/**
 * Drift guard for R4 pure CLI generators — drives the real script.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const script = path.join(root, 'scripts/generate-cli-pure.mjs');
const derived = path.join(root, 'bin/lib/remediation.mjs');
const resolvedFactsSchema = path.join(
  root,
  'schemas/ark.resolved-candidate-facts.schema.json'
);
const probeCanonical = path.join(root, 'src/domain/arkOrderError.ts');

function runGenerate(args: string[] = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

describe('generate-cli-pure drift guard (real script)', () => {
  let backup: string | undefined;
  let schemaBackup: string | undefined;
  let canonicalBackup: string | undefined;

  afterEach(() => {
    if (canonicalBackup !== undefined) {
      fs.writeFileSync(probeCanonical, canonicalBackup, 'utf8');
      canonicalBackup = undefined;
    }
    if (backup !== undefined) {
      fs.writeFileSync(derived, backup, 'utf8');
      backup = undefined;
    }
    if (schemaBackup !== undefined) {
      fs.writeFileSync(resolvedFactsSchema, schemaBackup, 'utf8');
      schemaBackup = undefined;
    }
  });

  it('--check exits 0 when derived pure modules match domain sources', () => {
    const result = runGenerate(['--check']);
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toMatch(/up to date/i);
  });

  it('--check exits non-zero when a derived file is drifted', () => {
    backup = fs.readFileSync(derived, 'utf8');
    fs.writeFileSync(derived, backup + '\n// deliberate-drift\n', 'utf8');
    const result = runGenerate(['--check']);
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/out of date|regenerate/i);
  });

  it('--check exits non-zero when a schema-only artifact is drifted', () => {
    schemaBackup = fs.readFileSync(resolvedFactsSchema, 'utf8');
    fs.writeFileSync(resolvedFactsSchema, `${schemaBackup}\n`, 'utf8');
    const result = runGenerate(['--check']);
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/resolved-candidate-facts.*out of date/i);
  });

  it('fails closed on a relative Domain import with no generated sibling', () => {
    // ark-order-invariants.mjs once shipped `from './stableHash'` (no bin/lib sibling,
    // ERR_MODULE_NOT_FOUND on load) while --check reported parity.
    canonicalBackup = fs.readFileSync(probeCanonical, 'utf8');
    fs.writeFileSync(
      probeCanonical,
      `${canonicalBackup}\nexport { probe as __unmappedProbe } from './notAGeneratedModule';\n`,
      'utf8'
    );
    const result = runGenerate(['--check']);
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/unmapped relative import '\.\/notAGeneratedModule'/);
  });
});
