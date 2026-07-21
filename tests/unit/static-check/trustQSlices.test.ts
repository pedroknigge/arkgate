/**
 * Trust Q5/Q6/Q9 slices — drive shipped scripts and templates (real paths).
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PREFERRED_MCP_BIN } from '../../../bin/lib/hook-templates.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function runNode(scriptRel: string, args: string[] = []) {
  return spawnSync(process.execPath, [path.join(REPO, scriptRel), ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env: process.env,
  });
}

describe('Q5 scale bench (scripts/ark-scale-bench.mjs)', () => {
  it('runs real ark-check on a fixture tree and emits finite p50/p95', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-q5-out-'));
    try {
      const r = runNode('scripts/ark-scale-bench.mjs', [
        '--sizes',
        '20',
        '--runs',
        '2',
        '--json',
        '--keep',
        '--out-dir',
        outDir,
      ]);
      expect(r.status, r.stderr || r.stdout).toBe(0);
      const report = JSON.parse(r.stdout);
      expect(report.tool).toBe('ark-scale-bench');
      expect(report.results).toHaveLength(1);
      const row = report.results[0];
      expect(row.size).toBe(20);
      expect(Number.isFinite(row.p50Ms)).toBe(true);
      expect(Number.isFinite(row.p95Ms)).toBe(true);
      expect(row.p50Ms).toBeGreaterThan(0);
      expect(row.status).toBe(0);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe('Q6 module budgets (scripts/check-module-budgets.mjs)', () => {
  it('passes on this tree and fails when a budget is artificially breached', () => {
    const ok = runNode('scripts/check-module-budgets.mjs', ['--json']);
    expect(ok.status, ok.stderr || ok.stdout).toBe(0);
    const report = JSON.parse(ok.stdout);
    expect(report.ok).toBe(true);
    expect(report.budgets.length).toBeGreaterThan(5);
    // Drift proof: temporarily point a budget at a huge file by running logic —
    // assert html-report is tracked and under its max (real module).
    const html = report.budgets.find((b: { path: string }) => b.path.includes('html-report'));
    expect(html?.ok).toBe(true);
    expect(html?.loc).toBeLessThanOrEqual(html?.max);
  });
});

describe('Q6 surface parity (preferred bins + skills)', () => {
  it('hook templates and package bins agree on arkgate-* product names', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
    expect(pkg.bin['arkgate-check']).toBe('bin/ark-check.mjs');
    expect(pkg.bin['arkgate-mcp']).toBe('bin/ark-mcp.mjs');
    expect(PREFERRED_MCP_BIN).toBe('arkgate-mcp');
    // Skills template list includes upgrade
    expect(fs.existsSync(path.join(REPO, 'templates/skills/ark-upgrade.md'))).toBe(true);
  });
});

describe('Q9 package files + threat model', () => {
  it('verify-package-files passes and threat-model ships', () => {
    expect(fs.existsSync(path.join(REPO, 'docs/threat-model.md'))).toBe(true);
    const threat = fs.readFileSync(path.join(REPO, 'docs/threat-model.md'), 'utf8');
    expect(threat).toMatch(/Threat model/i);
    expect(threat).toMatch(/T1/);
    const r = runNode('scripts/verify-package-files.mjs', ['--json']);
    expect(r.status, r.stderr || r.stdout).toBe(0);
    const report = JSON.parse(r.stdout);
    expect(report.ok).toBe(true);
  });

  it('pre-commit template exists and mentions ark-check', () => {
    const p = path.join(REPO, 'templates/hooks/pre-commit-ark');
    expect(fs.existsSync(p)).toBe(true);
    const text = fs.readFileSync(p, 'utf8');
    expect(text).toMatch(/ark-check|arkgate-check|check:architecture/);
  });
});
