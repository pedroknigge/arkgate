import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('V05 beta exit audit', () => {
  it('rejects otherwise valid adoption evidence from a different candidate', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-beta-exit-audit-'));
    roots.push(root);
    const candidate = 'a'.repeat(40);
    const adoption = path.join(root, 'adoption.json');
    const reviewer = path.join(root, 'reviewer.json');
    const out = path.join(root, 'out');
    fs.writeFileSync(adoption, JSON.stringify({
      candidate: { sha: 'b'.repeat(40) },
      cellCount: 12,
      acceptance: { dimensionsRepresented: true, noOpenP0P1: true, medianFirstGreenUnderFiveMinutes: true, medianCoverageAtLeast90: true },
      medians: { governedCoveragePercent: 100 },
      dimensions: { hosts: { claude: 3, grok: 3, cursor: 3, codex: 3 } },
    }));
    fs.writeFileSync(reviewer, JSON.stringify({ candidate, independent: true, decision: 'pass', reviewer: 'independent' }));

    const result = spawnSync(process.execPath, ['scripts/beta-exit-audit.mjs', '--candidate', candidate, '--out', out, '--reviewer', reviewer, '--adoption-summary', adoption], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    const report = JSON.parse(fs.readFileSync(path.join(out, 'audit.json'), 'utf8')) as { checks: Array<{ id: string; status: string }> };
    expect(report.checks.find((check) => check.id === 'adoption-candidate')?.status).toBe('fail');
  });
});
