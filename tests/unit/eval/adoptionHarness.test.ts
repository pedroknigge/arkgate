import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const runner = path.join(repo, 'eval/adoption-run.mjs');
const manifest = path.join(repo, 'eval/adoption/manifest.v1.json');

describe('V03 external adoption harness', () => {
  it('validates all twelve pinned cells without cloning third-party source', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-adoption-dry-'));
    try {
      const result = spawnSync(process.execPath, [runner, '--manifest', manifest, '--out', out, '--dry-run', '--candidate-sha', 'a'.repeat(40)], { cwd: repo, encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
      const summary = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
      expect(summary.cells).toHaveLength(12);
      expect(new Set(summary.cells.map((cell: { repository: string }) => cell.repository)).size).toBe(12);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});
