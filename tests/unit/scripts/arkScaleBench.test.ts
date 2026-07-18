import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { budgetFailures } from '../../../scripts/ark-scale-bench.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('Phase Z scale benchmark contract', () => {
  it('records cold, uncached one-shot warm, incremental, and RSS evidence without a network install', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-v01-bench-'));
    const reportPath = path.join(root, 'performance.v2.json');
    try {
      const result = spawnSync(process.execPath, [
        path.join(REPO, 'scripts', 'ark-scale-bench.mjs'),
        '--sizes', '20', '--runs', '2', '--json', '--out', reportPath, '--keep', '--out-dir', root,
      ], { cwd: REPO, encoding: 'utf8' });
      expect(result.status, result.stderr || result.stdout).toBe(0);
      const report = JSON.parse(result.stdout);
      const row = report.results[0];
      expect(report.schemaVersion).toBe(2);
      expect(report.ok).toBe(true);
      expect(report.failures).toEqual([]);
      expect(row.cold.p95Ms).toBeGreaterThan(0);
      expect(row.oneShotWarm).toMatchObject({
        cacheMode: 'none',
        legacyCacheAbsent: true,
        coldOutputParity: true,
        primeStatus: 0,
      });
      expect(row.oneShotWarm).not.toHaveProperty('cacheHits');
      expect(fs.existsSync(path.join(root, 'n20', 'node_modules', '.cache', 'ark-check.json'))).toBe(
        false
      );
      expect(row.incremental.policyHashPreserved).toBe(true);
      expect(row.incremental.contentHashPreserved).toBe(true);
      expect(row.peakRssBytes).toBeGreaterThan(0);
      expect(JSON.parse(fs.readFileSync(reportPath, 'utf8'))).toEqual(report);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails the budget when incremental semantic identities drift', () => {
    const budgets = JSON.parse(
      fs.readFileSync(path.join(REPO, 'eval/performance/budgets.v2.json'), 'utf8')
    );
    const report = {
      results: [
        {
          size: 10000,
          status: 0,
          peakRssBytes: 1,
          cold: { p95Ms: 1 },
          oneShotWarm: {
            p95Ms: 1,
            cacheMode: 'none',
            legacyCacheAbsent: true,
            coldOutputParity: true,
          },
          incremental: {
            p95Ms: 1,
            policyHashPreserved: false,
            contentHashPreserved: false,
          },
        },
      ],
    };

    expect(budgetFailures(report, budgets)).toEqual([
      'incremental policy hash changed for n=10000',
      'incremental unchanged-content hash changed for n=10000',
    ]);
  });
});
