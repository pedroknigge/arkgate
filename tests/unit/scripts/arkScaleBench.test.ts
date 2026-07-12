import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('V01 scale benchmark contract', () => {
  it('records real cold, warm-cache, incremental, and RSS evidence without a network install', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-v01-bench-'));
    const reportPath = path.join(root, 'performance.v1.json');
    try {
      const result = spawnSync(process.execPath, [
        path.join(REPO, 'scripts', 'ark-scale-bench.mjs'),
        '--sizes', '20', '--runs', '2', '--json', '--out', reportPath, '--keep', '--out-dir', root,
      ], { cwd: REPO, encoding: 'utf8' });
      expect(result.status, result.stderr || result.stdout).toBe(0);
      const report = JSON.parse(result.stdout);
      const row = report.results[0];
      expect(report.schemaVersion).toBe(1);
      expect(row.cold.p95Ms).toBeGreaterThan(0);
      expect(row.warm.cacheHits).toBeGreaterThan(0);
      expect(row.incremental.policyHashPreserved).toBe(true);
      expect(row.incremental.contentHashPreserved).toBe(true);
      expect(row.peakRssBytes).toBeGreaterThan(0);
      expect(JSON.parse(fs.readFileSync(reportPath, 'utf8'))).toEqual(report);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
