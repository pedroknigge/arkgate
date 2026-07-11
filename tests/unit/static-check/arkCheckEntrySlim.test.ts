/**
 * R3: ark-check entry is orchestration-only; scan/rule guts live in bin/lib/*
 * under the ~500 LOC soft budget for newly extracted modules.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const entry = path.join(root, 'bin/ark-check.mjs');

/** New modules extracted for R3 (budget applies to these, not legacy agent-gates/html-report). */
const R3_EXTRACTS = [
  'bin/lib/scan-files.mjs',
  'bin/lib/config-warnings.mjs',
  'bin/lib/ts-resolve.mjs',
  'bin/lib/ast-scan.mjs',
  'bin/lib/graph-cycles.mjs',
  'bin/lib/architecture-scan.mjs',
] as const;

const LOC_BUDGET_NEW = 500;
/** Pre-R3 shell was ~2369; orchestration should stay well under that. */
const ENTRY_MAX_LOC = 1600;

function lineCount(rel: string): number {
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  return text.split('\n').length;
}

describe('ark-check entry slim-down (R3)', () => {
  it('the primary bin points at the Structrail wrapper and keeps the slim implementation', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8')
    ) as { bin: Record<string, string> };
    expect(pkg.bin['structrail-check']).toBe('bin/structrail-check.mjs');
    expect(fs.existsSync(path.join(root, 'bin/structrail-check.mjs'))).toBe(true);
    expect(fs.existsSync(entry)).toBe(true);
  });

  it('entry is substantially thinner and does not house scan-graph guts', () => {
    const loc = lineCount('bin/ark-check.mjs');
    expect(loc).toBeLessThan(ENTRY_MAX_LOC);
    const src = fs.readFileSync(entry, 'utf8');
    // Must wire the extracted pipeline
    expect(src).toMatch(/from ['"]\.\/lib\/architecture-scan\.mjs['"]/);
    expect(src).toMatch(/runArchitectureScan\s*\(/);
    // Must not re-implement Tarjan / walk / resolveImport inline
    expect(src).not.toMatch(/function detectCycles\s*\(/);
    expect(src).not.toMatch(/function collectGovernedFiles\s*\(/);
    expect(src).not.toMatch(/function resolveImport\s*\(/);
    expect(src).not.toMatch(/function createModuleResolutionHost\s*\(/);
    expect(src).not.toMatch(/function collectConfigWarnings\s*\(/);
  });

  it('each R3 extract module exists and is within ~500 LOC', () => {
    for (const rel of R3_EXTRACTS) {
      expect(fs.existsSync(path.join(root, rel)), rel).toBe(true);
      const loc = lineCount(rel);
      expect(loc, `${rel} has ${loc} LOC`).toBeLessThanOrEqual(LOC_BUDGET_NEW);
    }
  });

  it('real structrail-check still passes on this repo (orchestration wires the scan)', () => {
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, 'bin/structrail-check.mjs'),
        '--root',
        root,
        '--config',
        'structrail.config.json',
        '--strict-config',
      ],
      { cwd: root, encoding: 'utf8' }
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout + result.stderr).toMatch(/Structrail check passed/);
  });
});
