import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { memoryBudgetFailures } from '../../../scripts/memory-bench.mjs';

const BUDGETS = JSON.parse(
  fs.readFileSync(path.resolve('eval/performance/memory-budgets.v1.json'), 'utf8')
) as {
  scenarios: Record<string, { maxPeakRssBytes: number; maxHeapGrowthBytes?: number }>;
};

describe('memory regression guard', () => {
  it('keeps one-shot peaks under budget and the MCP heap flat across 50 calls', () => {
    const result = spawnSync(
      process.execPath,
      [path.resolve('scripts/memory-bench.mjs'), '--size', '600', '--calls', '50', '--json', '--fail-budget'],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({ schemaVersion: 1, tool: 'memory-bench', ok: true, failures: [] });
    const { check, hookWrite, hookPatch, mcp } = report.scenarios;
    // The fixture carries one real cross-sibling import: check fails, the Write
    // hook allows a clean one-line write, the complete patch preflight denies.
    expect(check.status).toBe(1);
    expect(hookWrite.status).toBe(0);
    expect(hookPatch.status).toBe(2);
    for (const row of [check, hookWrite, hookPatch, mcp]) {
      expect(row.peakRssBytes).toBeGreaterThan(0);
    }
    // A one-line write never walks or parses the tree: it stays well below the
    // whole-tree check.
    expect(hookWrite.peakRssBytes).toBeLessThan(check.peakRssBytes);
    expect(mcp).toMatchObject({ calls: 50, failedCalls: 0 });
    expect(mcp.heapGrowthBytes).toBeLessThanOrEqual(BUDGETS.scenarios.mcp.maxHeapGrowthBytes!);
  });

  it('fails closed on a heap leak, a missing sample, or a peak over budget', () => {
    const scenarios = BUDGETS.scenarios;
    const ok = {
      scenarios: {
        check: { peakRssBytes: 1 },
        hookWrite: { peakRssBytes: 1 },
        hookPatch: { peakRssBytes: 1 },
        mcp: { calls: 50, warmupCalls: 10, failedCalls: 0, heapGrowthBytes: 0, peakRssBytes: 1 },
      },
    };
    expect(memoryBudgetFailures(ok, BUDGETS)).toEqual([]);

    const leak = structuredClone(ok);
    leak.scenarios.mcp.heapGrowthBytes = scenarios.mcp.maxHeapGrowthBytes! + 1;
    expect(memoryBudgetFailures(leak, BUDGETS).join('\n')).toMatch(/post-GC heap grew/);

    const peak = structuredClone(ok);
    peak.scenarios.hookWrite.peakRssBytes = scenarios.hookWrite.maxPeakRssBytes + 1;
    expect(memoryBudgetFailures(peak, BUDGETS).join('\n')).toMatch(/hookWrite: peak RSS/);

    const missing = structuredClone(ok) as { scenarios: Record<string, { peakRssBytes: unknown }> };
    missing.scenarios.check.peakRssBytes = null;
    expect(memoryBudgetFailures(missing, BUDGETS).join('\n')).toMatch(/check: peak RSS was not recorded/);
  });
});
