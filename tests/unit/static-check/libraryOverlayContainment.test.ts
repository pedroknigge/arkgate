/**
 * Flat single-package library: day-one globs must not overlap, and a vacuous
 * map must not be reported as full governance.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { printDoctorCompactHuman } from '../../../bin/lib/doctor-human.mjs';
import {
  formatGovernedCoverageLine,
  vacuousContainmentNote,
} from '../../../bin/lib/product-copy.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARK = path.join(REPO, 'bin', 'ark.mjs');
const ARK_CHECK = path.join(REPO, 'bin', 'ark-check.mjs');
const roots: string[] = [];

function run(file: string, args: string[], root: string) {
  return spawnSync(process.execPath, [file, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ARK_ACTIVE_HOST: 'claude', CODEX_HOME: path.join(root, '.codex-home') },
  });
}

function write(root: string, rel: string, body: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('library overlay containment', () => {
  it('start on a flat single-package library does not write an overlapping catch-all', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-lib-flat-'));
    roots.push(root);
    write(
      root,
      'package.json',
      JSON.stringify({ name: 'sample-lib', type: 'module', exports: './src/a/one.ts' })
    );
    write(root, 'pnpm-workspace.yaml', 'allowBuilds:\n  esbuild: false\n');
    write(root, 'src/a/one.ts', 'export const one = 1;\n');
    write(root, 'src/a/two.ts', 'export const two = 2;\n');
    write(root, 'src/b/one.ts', 'export const bone = 1;\n');
    write(root, 'src/b/two.ts', 'export const btwo = 2;\n');

    const applied = run(
      ARK,
      ['start', '--root', root, '--tools', 'claude', '--yes', '--no-install', '--apply'],
      root
    );
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0);
    expect(applied.stdout).toContain('no layer rule can fail yet');
    expect(applied.stdout).not.toMatch(/Governed:\s*100%/);

    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8')) as {
      frameworkOverlay: string;
      layers: Array<{ name: string; patterns: string[] }>;
    };
    expect(config.frameworkOverlay).toBe('library');
    const application = config.layers.find((layer) => layer.name === 'ApplicationOrchestration');
    const domain = config.layers.find((layer) => layer.name === 'DomainModel');
    expect(application?.patterns).not.toContain('src/**');
    expect(application?.patterns).not.toContain('lib/**');
    expect(domain?.patterns).toContain('src/**/*.ts');

    const coverage = run(ARK_CHECK, ['--root', root, '--coverage', '--json'], root);
    expect(coverage.status, `${coverage.stdout}\n${coverage.stderr}`).toBe(0);
    const payload = JSON.parse(coverage.stdout) as {
      coverage: {
        governed: { percent: number };
        dualMembership: { count: number };
        layers: Array<{ name: string; files: number }>;
      };
    };
    expect(payload.coverage.governed.percent).toBe(100);
    expect(payload.coverage.dualMembership.count).toBe(0);
    const counts = Object.fromEntries(payload.coverage.layers.map((layer) => [layer.name, layer.files]));
    expect(counts.DomainModel).toBe(4);
    expect(counts.ApplicationOrchestration).toBe(0);
    expect(counts.PresentationAdapters).toBe(0);
    expect(counts.PersistenceAdapters).toBe(0);

    const coverageHuman = run(ARK_CHECK, ['--root', root, '--coverage'], root);
    expect(coverageHuman.status, `${coverageHuman.stdout}\n${coverageHuman.stderr}`).toBe(0);
    const coverageText = `${coverageHuman.stdout}\n${coverageHuman.stderr}`;
    expect(coverageText).toContain('1 of 4 layers populated, so no layer rule can fail yet');
    expect(coverageText).not.toMatch(/Governed:\s*100%/);
    expect(coverageText).not.toMatch(/Dual-match:/);

    const doctor = run(ARK_CHECK, ['--root', root, '--doctor'], root);
    expect(doctor.status, `${doctor.stdout}\n${doctor.stderr}`).toBe(0);
    const doctorText = `${doctor.stdout}\n${doctor.stderr}`;
    expect(doctorText).toContain('1 of 4 layers populated, so no layer rule can fail yet');
    expect(doctorText).not.toMatch(/Governed:\s*100%/);
    expect(doctorText).toContain('More: --doctor --all');
  }, 120_000);

  it('short doctor and coverage refuse full governance when every file dual-matches', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-lib-overlap-'));
    roots.push(root);
    write(root, 'src/a/one.ts', 'export const one = 1;\n');
    write(root, 'src/b/two.ts', 'export const two = 2;\n');
    write(
      root,
      'ark.config.json',
      JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'ApplicationOrchestration', patterns: ['src/**'] },
          { name: 'DomainModel', patterns: ['src/**/*.ts'] },
          { name: 'PresentationAdapters', patterns: ['src/**/ui/**'] },
          { name: 'PersistenceAdapters', patterns: ['src/**/db/**'] },
        ],
        rules: [{ from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false }],
      })
    );

    const coverage = run(ARK_CHECK, ['--root', root, '--coverage'], root);
    expect(coverage.status, `${coverage.stdout}\n${coverage.stderr}`).toBe(0);
    const coverageText = `${coverage.stdout}\n${coverage.stderr}`;
    expect(coverageText).toContain('2 of 2 files match more than one layer');
    expect(coverageText).not.toMatch(/Governed:\s*100%/);

    const doctor = run(ARK_CHECK, ['--root', root, '--doctor'], root);
    expect(doctor.status, `${doctor.stdout}\n${doctor.stderr}`).toBe(0);
    const doctorText = `${doctor.stdout}\n${doctor.stderr}`;
    expect(doctorText).toContain('2 of 2 files match more than one layer');
    expect(doctorText).not.toMatch(/Governed:\s*100%/);
    expect(doctorText).toContain('More: --doctor --all');
  }, 60_000);

  it('keeps a green governed line when two layers hold files and nothing dual-matches', () => {
    const healthy = {
      governed: { percent: 100, classifiedFiles: 2, totalFiles: 2 },
      layers: [
        { name: 'DomainModel', files: 1 },
        { name: 'ApplicationOrchestration', files: 1 },
      ],
      dualMembership: { count: 0 },
    };
    expect(vacuousContainmentNote(healthy)).toBeNull();
    expect(formatGovernedCoverageLine(healthy, 2, 2)).toBe('Governed: 100% (2/2 files).');

    const collapsed = {
      governed: { percent: 100, classifiedFiles: 2, totalFiles: 2 },
      layers: [
        { name: 'DomainModel', files: 1 },
        { name: 'ApplicationOrchestration', files: 1 },
      ],
      dualMembership: { count: 2 },
    };
    expect(vacuousContainmentNote(collapsed)).toBe('2 of 2 files match more than one layer');

    const lines: string[] = [];
    const color = {
      bold: (s: string) => s,
      dim: (s: string) => s,
      green: (s: string) => s,
      yellow: (s: string) => s,
      red: (s: string) => s,
    };
    const log = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    try {
      printDoctorCompactHuman({
        root: process.cwd(),
        analysisComplete: true,
        completeness: 'complete',
        doctorAdvisories: { parseHealth: { affectedFiles: 0 }, stewardNudge: null },
        operatingMode: 'enforce',
        designFitness: { designWeak: false, label: 'ok' },
        adopted: 'required-merge',
        stewardUnfinished: false,
        emptyScope: false,
        uniqueActions: ['keep the map'],
        ciMergeBoundary: { ci: { state: 'required', workflowPresent: true } },
        cov: collapsed,
        writePath: { gap: null, activeHost: 'claude' },
        writePathHonesty: {},
        gatesMissing: [],
        violations: [],
        color,
      });
    } finally {
      console.log = log;
    }
    const text = lines.join('\n');
    expect(text).toContain('2 of 2 files match more than one layer');
    expect(text).not.toMatch(/Governed:\s*100%/);
  });
});
