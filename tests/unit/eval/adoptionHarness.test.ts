import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const runner = path.join(repo, 'eval/adoption-run.mjs');
const manifest = path.join(repo, 'eval/adoption/manifest.v1.json');
const betaExitManifest = path.join(repo, 'eval/beta-exit/public-matrix.v1.json');

describe('V03 external adoption harness', () => {
  it('labels its legacy timing honestly and does not fabricate unmeasured classifications', () => {
    const source = fs.readFileSync(runner, 'utf8');
    expect(source).toContain('durationMsExcludingDependencyInstall');
    expect(source).toContain('historical setup harness');
    expect(source).not.toContain('firstGreenMsExcludingDependencyInstall');
    expect(source).not.toContain('falseBlocks: 0');
    expect(source).not.toContain('bypasses: 0');
  });

  it('validates all twelve pinned cells without cloning third-party source', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-adoption-dry-'));
    try {
      const result = spawnSync(process.execPath, [runner, '--manifest', manifest, '--out', out, '--dry-run', '--candidate-sha', 'a'.repeat(40)], { cwd: repo, encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
      const summary = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
      expect(summary.cells).toHaveLength(12);
      expect(new Set(summary.cells.map((cell: { repository: string }) => cell.repository)).size).toBe(12);
      expect(new Set(summary.cells.map((cell: { shape: string }) => cell.shape))).toEqual(
        new Set(['library', 'api', 'frontend', 'monorepo'])
      );
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  it('keeps the public beta-exit matrix balanced without framework internals', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-beta-exit-dry-'));
    try {
      const result = spawnSync(process.execPath, [runner, '--manifest', betaExitManifest, '--out', out, '--dry-run', '--candidate-sha', 'a'.repeat(40)], { cwd: repo, encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
      const summary = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8')) as {
        cells: Array<{ shape: string; host: string; packageManager: string; size: string }>;
      };
      expect(summary.cells).toHaveLength(12);
      for (const field of ['shape', 'host', 'packageManager', 'size'] as const) {
        const counts = summary.cells.reduce<Record<string, number>>((result, cell) => {
          result[cell[field]] = (result[cell[field]] ?? 0) + 1;
          return result;
        }, {});
        expect(Object.values(counts)).toHaveLength(field === 'host' ? 4 : field === 'shape' ? 4 : 3);
        expect(Object.values(counts).every((count) => count === (field === 'shape' || field === 'host' ? 3 : 4))).toBe(true);
      }
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});
