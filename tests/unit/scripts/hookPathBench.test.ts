import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Z07 hook and doctor benchmark evidence', () => {
  it('records a comparable one-shot warm doctor baseline without inventing a resident result', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z07-hook-bench-'));
    const reportPath = path.join(root, 'hook-performance.v3.json');
    try {
      const result = spawnSync(
        process.execPath,
        [
          path.resolve('scripts/hook-path-bench.mjs'),
          '--sizes',
          '20',
          '--runs',
          '3',
          '--json',
          '--out',
          reportPath,
        ],
        { encoding: 'utf8' }
      );
      expect(result.status, result.stderr || result.stdout).toBe(0);
      const report = JSON.parse(result.stdout);
      const row = report.results[0];
      expect(report).toMatchObject({ schemaVersion: 3, tool: 'hook-path-bench', ok: true });
      expect(row.fixture).toMatchObject({ unchanged: true });
      expect(row.fixture.treeHashBefore).toBe(row.fixture.treeHashAfter);
      expect(row.hook).toMatchObject({ exactOutputParity: true });
      expect(row.hook.coldFallback).toMatchObject({ runs: 3 });
      expect(row.hook.residentWarm).toMatchObject({ runs: 3, resultCache: false });
      expect(row.hook.coldFallback.p95Ms).toBeGreaterThan(0);
      expect(row.hook.residentWarm.p95Ms).toBeGreaterThan(0);
      expect(row.hook.residentWarm.primeMs).toBeGreaterThan(0);
      expect(row.hook.outputSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(row.doctor).toMatchObject({
        processMode: 'fresh-child-per-sample',
        cache: {
          mode: 'none',
          argvFlag: '--no-cache',
          legacyFlagOnly: true,
          legacyCacheAbsentBefore: true,
          legacyCacheAbsentAfter: true,
        },
        residentWarm: null,
        exactOutputParity: true,
      });
      expect(row.doctor.argv).toContain('--no-cache');
      expect(row.doctor.cold).toMatchObject({ runs: 3 });
      expect(row.doctor.oneShotWarm).toMatchObject({ runs: 3 });
      expect(row.doctor.cold.p95Ms).toBeGreaterThan(0);
      expect(row.doctor.oneShotWarm.p95Ms).toBeGreaterThan(0);
      expect(row.doctor.oneShotWarm.primeMs).toBeGreaterThan(0);
      expect(row.doctor.outputSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(JSON.parse(fs.readFileSync(reportPath, 'utf8'))).toEqual(report);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
