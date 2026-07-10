/**
 * W3 — loop-cost harness structure + fixture run (deterministic).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HARNESS = path.join(REPO, 'eval/loop-cost-run.mjs');
const REPORT = path.join(REPO, 'eval/loop-cost-report.json');
const BASELINE = path.join(REPO, 'eval/loop-cost-baseline.json');

describe('W3 loop-cost eval harness', () => {
  it('ships harness + baseline artifact and runs fixture mode green', () => {
    expect(fs.existsSync(HARNESS)).toBe(true);
    expect(fs.existsSync(BASELINE)).toBe(true);

    const res = spawnSync(process.execPath, [HARNESS], {
      cwd: REPO,
      encoding: 'utf8',
    });
    expect(res.status, res.stderr || res.stdout).toBe(0);
    expect(fs.existsSync(REPORT)).toBe(true);

    const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
    expect(report.mode).toBe('fixture-measured');
    expect(report.cases.length).toBeGreaterThanOrEqual(2);

    const typeOnly = report.cases.find((c: { kind: string }) => c.kind === 'type-only');
    const judgment = report.cases.find((c: { kind: string }) => c.kind === 'judgment');
    expect(typeOnly).toBeTruthy();
    expect(typeOnly.status).toBe('PASS');
    expect(typeOnly.turnsToGreen).toBe(1);
    expect(typeOnly.cheated).toBe(false);

    expect(judgment).toBeTruthy();
    expect(judgment.status).toBe('JUDGMENT_REQUIRED');
    expect(judgment.cheated).toBe(false);

    expect(report.summary.medianTurnsTypeOnly).toBe(1);
    expect(report.summary.cheatedRate).toBe(0);

    const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    expect(baseline.summary.medianTurnsTypeOnly).toBe(1);
  });
});
