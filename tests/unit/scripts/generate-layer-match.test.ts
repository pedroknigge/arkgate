/**
 * Drives the real generate-layer-match script: --check must pass on a clean tree
 * and fail when the derived artifact is deliberately drifted.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const script = path.join(root, 'scripts/generate-layer-match.mjs');
const derived = path.join(root, 'bin/ark-layer-match.mjs');

function runGenerate(args: string[] = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

describe('generate-layer-match drift guard (real script)', () => {
  let backup: string | undefined;

  afterEach(() => {
    if (backup !== undefined) {
      fs.writeFileSync(derived, backup, 'utf8');
      backup = undefined;
    }
  });

  it('--check exits 0 when derived matches canonical', () => {
    const result = runGenerate(['--check']);
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toMatch(/up to date/i);
  });

  it('--check exits non-zero when derived is drifted', () => {
    backup = fs.readFileSync(derived, 'utf8');
    fs.writeFileSync(derived, backup + '\n// deliberate-drift\n', 'utf8');

    const result = runGenerate(['--check']);
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/out of date|regenerate/i);
  });

  it('regenerate restores a drifted file so --check passes', () => {
    backup = fs.readFileSync(derived, 'utf8');
    fs.writeFileSync(derived, backup + '\n// deliberate-drift\n', 'utf8');

    const gen = runGenerate([]);
    expect(gen.status, gen.stderr || gen.stdout).toBe(0);

    const check = runGenerate(['--check']);
    expect(check.status, check.stderr || check.stdout).toBe(0);

    // afterEach restores backup; re-generate so the tree stays correct for later tests
    backup = undefined;
    const finalGen = runGenerate([]);
    expect(finalGen.status).toBe(0);
  });
});
