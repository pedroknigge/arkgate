import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repo = path.resolve(import.meta.dirname, '../../..');
const temporary: string[] = [];

afterEach(() => {
  for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('ark CLI entrypoint', () => {
  it('runs when Node receives a symlinked entrypoint path', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-entrypoint-'));
    temporary.push(directory);
    const link = path.join(directory, 'ark.mjs');
    fs.symlinkSync(path.join(repo, 'bin', 'ark.mjs'), link);

    const result = spawnSync(process.execPath, [link, '--version'], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
