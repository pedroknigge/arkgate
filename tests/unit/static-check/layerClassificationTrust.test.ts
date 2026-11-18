/**
 * One classification for every file. Fixtures reproduce the dogfood misses:
 * nested tool configs counted as source (#407), a declared workspace left out
 * of include while coverage still said 100% (#410), and a catch-all that
 * overlaps another layer (#391). A deeper package directory under a parent
 * catch-all stays legal — that is not the #387 role-dump.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { LayerClassification, layerForRelativePath } from '../../../bin/ark-layer-match.mjs';

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

function tempRoot(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

function findingsOf(stdout: string): Array<{ ruleId: string; message?: string }> {
  const payload = JSON.parse(stdout) as {
    warnings?: Array<{ ruleId: string; message?: string }>;
    violations?: Array<{ ruleId: string; message?: string }>;
  };
  return [...(payload.violations ?? []), ...(payload.warnings ?? [])];
}

function ruleIds(stdout: string): string[] {
  return findingsOf(stdout).map((finding) => finding.ruleId);
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('layer classification trust', () => {
  it('refuses a classification built any way other than resolve', () => {
    expect(() => new (LayerClassification as unknown as new () => unknown)()).toThrow(
      /only constructed by LayerClassification\.resolve/
    );
    const ledger = LayerClassification.resolve({
      files: ['packages/core/vite.config.ts', 'src/a.ts'],
      layers: [
        { name: 'ApplicationOrchestration', patterns: ['src/**'] },
        { name: 'DomainModel', patterns: ['src/**/*.ts'] },
      ],
      include: ['src'],
      declaredWorkspaces: ['website'],
    });
    expect(ledger.paths.map((row) => row.kind)).toEqual(['tooling', 'catch-all-overlap']);
    expect(ledger.findings.map((finding) => finding.ruleId)).toEqual([
      'CONFIG_CATCH_ALL_OVERLAP',
      'CONFIG_WORKSPACE_OUT_OF_INCLUDE',
    ]);
    expect(
      layerForRelativePath('src/a.ts', [
        { name: 'ApplicationOrchestration', patterns: ['src/**'] },
        { name: 'DomainModel', patterns: ['src/**/*.ts'] },
      ])
    ).toBeUndefined();
    expect(layerForRelativePath('packages/core/eslint.config.js', [
      { name: 'DomainModel', patterns: ['packages/**'] },
    ])).toBeUndefined();
  });

  it('counts nested tool configs as tooling, never as unclassified source (#407)', () => {
    const root = tempRoot('ark-trust-407-');
    write(root, 'package.json', JSON.stringify({ name: 'bindings', private: true }));
    write(root, 'packages/core/src/index.ts', 'export const core = 1;\n');
    write(root, 'packages/ui/src/button.ts', 'export const button = 1;\n');
    write(root, 'packages/core/eslint.config.js', 'export default [];\n');
    write(root, 'packages/core/vite.config.ts', 'export default {};\n');
    write(root, 'packages/ui/tsdown.config.ts', 'export default {};\n');
    write(root, 'packages/ui/svelte.config.js', 'export default {};\n');
    write(
      root,
      'ark.config.json',
      JSON.stringify({
        include: ['packages'],
        layers: [{ name: 'DomainModel', patterns: ['packages/*/src/**'] }],
        rules: [],
      })
    );

    const coverage = run(ARK_CHECK, ['--root', root, '--coverage'], root);
    expect(coverage.status, `${coverage.stdout}\n${coverage.stderr}`).toBe(0);
    const text = `${coverage.stdout}\n${coverage.stderr}`;
    expect(text).toContain('4 tool configs are tooling, not source.');
    expect(text).toContain('Governed: 100% (2/2 files).');
    expect(text).not.toContain('/ark-adopt');
    expect(text).not.toContain('unrecognized, you classify');

    const json = run(ARK_CHECK, ['--root', root, '--coverage', '--json'], root);
    const payload = JSON.parse(json.stdout) as {
      coverage: {
        governed: { percent: number; classifiedFiles: number; totalFiles: number };
        unclassified: { files: string[] };
        tooling: { files: string[] };
      };
    };
    expect(payload.coverage.governed).toEqual({ percent: 100, classifiedFiles: 2, totalFiles: 2 });
    expect(payload.coverage.unclassified.files).toEqual([]);
    expect(payload.coverage.tooling.files.sort()).toEqual([
      'packages/core/eslint.config.js',
      'packages/core/vite.config.ts',
      'packages/ui/svelte.config.js',
      'packages/ui/tsdown.config.ts',
    ]);

    const check = run(ARK_CHECK, ['--root', root, '--json'], root);
    expect(ruleIds(check.stdout)).not.toContain('CONFIG_UNCLASSIFIED_FILES');

    const doctor = run(ARK_CHECK, ['--root', root, '--doctor'], root);
    expect(`${doctor.stdout}\n${doctor.stderr}`).toContain('4 tool configs are tooling, not source');
    expect(`${doctor.stdout}\n${doctor.stderr}`).not.toContain('unrecognized, you classify');
  }, 60_000);

  it('fails the check when a declared workspace is neither included nor excluded (#410)', () => {
    const root = tempRoot('ark-trust-410-missing-');
    write(
      root,
      'package.json',
      JSON.stringify({ private: true, workspaces: ['packages/*', 'website'] })
    );
    write(root, 'packages/lib/package.json', JSON.stringify({ name: 'lib', main: './src/index.ts' }));
    write(root, 'packages/lib/src/index.ts', 'export const value = 1;\n');
    write(root, 'website/package.json', JSON.stringify({ name: 'website' }));
    write(root, 'website/src/page.tsx', 'export const page = 1;\n');
    write(
      root,
      'ark.config.json',
      JSON.stringify({
        include: ['packages'],
        layers: [{ name: 'DomainModel', patterns: ['packages/*/src/**'] }],
        rules: [],
      })
    );

    const check = run(ARK_CHECK, ['--root', root, '--json'], root);
    expect(check.status, `${check.stdout}\n${check.stderr}`).not.toBe(0);
    const payload = JSON.parse(check.stdout) as { ok: boolean };
    expect(payload.ok).toBe(false);
    const finding = findingsOf(check.stdout).find(
      (item) => item.ruleId === 'CONFIG_WORKSPACE_OUT_OF_INCLUDE'
    );
    expect(finding?.message).toContain('website is a declared workspace and is not in include');
    expect(finding?.message).toContain('workspaceExclusions');

    const coverage = run(ARK_CHECK, ['--root', root, '--coverage'], root);
    const text = `${coverage.stdout}\n${coverage.stderr}`;
    expect(text).toContain('website declared workspace not in include');
    expect(text).toContain('not full governance');
    expect(text).not.toMatch(/Governed:\s*100%/);

    const recommend = run(ARK_CHECK, ['--root', root, '--recommend'], root);
    const recommendText = `${recommend.stdout}\n${recommend.stderr}`;
    expect(recommendText).toContain('website declared workspace not in include');
    expect(recommendText).not.toContain('Projected governed coverage: 100%');

    const blankReason = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8')) as {
      workspaceExclusions?: unknown;
    };
    blankReason.workspaceExclusions = [{ root: 'website', reason: '   ' }];
    write(root, 'ark.config.json', JSON.stringify(blankReason));
    const stillMissing = run(ARK_CHECK, ['--root', root, '--json'], root);
    expect(ruleIds(stillMissing.stdout)).toContain('CONFIG_WORKSPACE_OUT_OF_INCLUDE');
  }, 60_000);

  it('start records why a declared docs workspace stays out of include (#410)', () => {
    const root = tempRoot('ark-trust-410-start-');
    write(
      root,
      'package.json',
      JSON.stringify({ private: true, workspaces: ['packages/*', 'website'] })
    );
    write(root, 'packages/lib/package.json', JSON.stringify({ name: 'lib', main: './src/index.ts' }));
    write(root, 'packages/lib/src/index.ts', 'export const value = 1;\n');
    write(root, 'website/package.json', JSON.stringify({ name: 'website' }));
    write(root, 'website/src/page.tsx', 'export const page = 1;\n');

    const started = run(ARK, ['start', '--yes', '--apply', '--no-install', '--root', root], root);
    expect(started.status, `${started.stdout}\n${started.stderr}`).toBe(0);
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8')) as {
      include: string[];
      workspaceExclusions?: Array<{ root: string; reason: string }>;
    };
    const website = (config.workspaceExclusions ?? []).find((entry) => entry.root === 'website');
    const included = (config.include ?? []).some(
      (entry) => entry === 'website' || entry.startsWith('website/')
    );
    expect(included || (website && website.reason.trim().length > 0)).toBe(true);

    const coverage = run(ARK_CHECK, ['--root', root, '--coverage'], root);
    const text = `${coverage.stdout}\n${coverage.stderr}`;
    if (!included) {
      expect(text).toContain('website/ (declared workspace) out of scope: docs site. Add it to include to govern it.');
    }
    const check = run(ARK_CHECK, ['--root', root, '--json'], root);
    expect(ruleIds(check.stdout)).not.toContain('CONFIG_WORKSPACE_OUT_OF_INCLUDE');
    expect(`${started.stdout}\n${started.stderr}`).not.toContain('Projected governed coverage: 100%');
    if (!included) {
      expect(`${started.stdout}\n${started.stderr}`).toContain('out of scope: docs site');
    }
  }, 90_000);

  it('blocks a catch-all that overlaps another layer and names the fix (#391)', () => {
    const root = tempRoot('ark-trust-391-');
    write(root, 'package.json', JSON.stringify({ name: 'overlap' }));
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
        ],
        rules: [{ from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false }],
      })
    );

    const check = run(ARK_CHECK, ['--root', root, '--json'], root);
    expect(check.status, `${check.stdout}\n${check.stderr}`).not.toBe(0);
    const payload = JSON.parse(check.stdout) as { ok: boolean };
    expect(payload.ok).toBe(false);
    const finding = findingsOf(check.stdout).find((item) => item.ruleId === 'CONFIG_CATCH_ALL_OVERLAP');
    expect(finding?.message).toContain('Catch-all src/** on ApplicationOrchestration overlaps src/**/*.ts on DomainModel');
    expect(finding?.message).toContain('A catch-all may not overlap another layer');
    expect(finding?.message).toContain('deeper directory');

    const coverage = run(ARK_CHECK, ['--root', root, '--coverage'], root);
    const text = `${coverage.stdout}\n${coverage.stderr}`;
    expect(text).toContain('2 of 2 files match more than one layer');
    expect(text).toContain('not full governance');
    expect(text).not.toMatch(/Governed:\s*100%/);
  }, 60_000);

  it('lets a deeper package directory win under a parent catch-all', () => {
    const root = tempRoot('ark-trust-deeper-');
    write(root, 'package.json', JSON.stringify({ name: 'deeper' }));
    write(root, 'packages/common/src/money.ts', 'export const money = 1;\n');
    write(root, 'packages/app/src/main.ts', 'export const main = 1;\n');
    const layers = [
      { name: 'ApplicationOrchestration', patterns: ['packages/**'] },
      { name: 'DomainModel', patterns: ['packages/common/**'] },
    ];
    write(
      root,
      'ark.config.json',
      JSON.stringify({
        include: ['packages'],
        layers,
        rules: [{ from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false }],
      })
    );

    expect(layerForRelativePath('packages/common/src/money.ts', layers)).toBe('DomainModel');
    expect(layerForRelativePath('packages/app/src/main.ts', layers)).toBe('ApplicationOrchestration');

    const check = run(ARK_CHECK, ['--root', root, '--json'], root);
    expect(ruleIds(check.stdout)).not.toContain('CONFIG_CATCH_ALL_OVERLAP');
    const coverage = run(ARK_CHECK, ['--root', root, '--coverage', '--json'], root);
    const payload = JSON.parse(coverage.stdout) as {
      coverage: { layers: Array<{ name: string; files: number }>; catchAllOverlap: { count: number } };
    };
    expect(payload.coverage.catchAllOverlap.count).toBe(0);
    expect(payload.coverage.layers.find((row) => row.name === 'DomainModel')?.files).toBe(1);
    expect(payload.coverage.layers.find((row) => row.name === 'ApplicationOrchestration')?.files).toBe(1);
  }, 60_000);
});
