/**
 * Issue #211: start --apply must stamp $schema on the current published major
 * (arkgate@4), not the leftover unpkg arkgate@2 pin.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ARK_CONFIG_SCHEMA_URL } from '../../../src/domain/configContract';

const ARK = path.resolve('bin/ark.mjs');
const TMP_ROOTS: string[] = [];

function tmpRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-start-schema-url-'));
  TMP_ROOTS.push(root);
  return root;
}

function write(root: string, rel: string, body: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

afterEach(() => {
  while (TMP_ROOTS.length > 0) {
    const root = TMP_ROOTS.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('start --apply schema URL (#211)', () => {
  it('writes $schema on the current major line, not arkgate@2', () => {
    const root = tmpRoot();
    write(
      root,
      'package.json',
      JSON.stringify({ name: 'schema-url-fresh', private: true, version: '0.0.0' }, null, 2)
    );
    write(root, 'src/index.ts', 'export const n = 1;\n');

    const result = spawnSync(
      process.execPath,
      [
        ARK,
        'start',
        '--root',
        root,
        '--tools',
        'claude',
        '--yes',
        '--no-install',
        '--no-strict',
        '--apply',
      ],
      { encoding: 'utf8', env: { ...process.env, ARK_ACTIVE_HOST: 'claude' } }
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);

    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8')) as {
      $schema?: string;
    };
    expect(config.$schema).toBe(ARK_CONFIG_SCHEMA_URL);
    expect(config.$schema).toContain('arkgate@4');
    expect(config.$schema).not.toContain('arkgate@2');
  }, 120_000);
});
