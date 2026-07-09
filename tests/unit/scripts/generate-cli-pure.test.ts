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

function runGenerate(args: string[] = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

describe('generate-cli-pure drift guard (real script)', () => {
  let backup: string | undefined;

  afterEach(() => {
    if (backup !== undefined) {
      fs.writeFileSync(derived, backup, 'utf8');
      backup = undefined;
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
});
