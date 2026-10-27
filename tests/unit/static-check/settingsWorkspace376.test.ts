/**
 * #376 — a settings-only pnpm-workspace.yaml is not a multi-app workspace.
 * Root *.config.* files stay out of DomainModel. Apply does not call coverage
 * clean when the first check would fail on a tool config that placement created.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isScanExcludedRelative, layerForRelativePath } from '../../../bin/ark-layer-match.mjs';
import { ARCHITECTURE_PRESETS } from '../../../bin/lib/presets.mjs';
import {
  isPnpmWorkspaceRoot,
  packageInstallArgv,
  readPnpmWorkspacePackageGlobs,
} from '../../../bin/lib/package-manager.mjs';
import {
  annotateApplyHonesty,
  renderStartPreview,
} from '../../../bin/lib/start-preview.mjs';
import {
  buildArchitectureRecommendation,
  collectRepoShapeSignals,
  detectWorkspaces,
  resolveStartInitPreset,
} from '../../../bin/ark-shared.mjs';

const roots: string[] = [];

function tmp(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

function write(root: string, rel: string, body: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

function seedLibrary(root: string, workspaceYaml: string) {
  write(
    root,
    'package.json',
    JSON.stringify({
      name: 'rollpack',
      type: 'module',
      exports: './src/index.ts',
      packageManager: 'pnpm@10.15.0',
    })
  );
  write(root, 'pnpm-workspace.yaml', workspaceYaml);
  write(root, 'src/index.ts', 'export function greet(name: string): string { return name; }\n');
  write(root, 'index.js', 'export const entry = true;\n');
  write(root, 'rollup.config.mjs', 'export default { cwd: process.cwd() };\n');
  write(root, 'vite.config.ts', 'export default { root: process.cwd() };\n');
  write(root, 'eslint.config.mjs', 'export default [{ ignores: [process.cwd()] }];\n');
}

afterEach(() => {
  vi.restoreAllMocks();
  while (roots.length) {
    const root = roots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('#376 settings-only pnpm workspace', () => {
  it('does not install with -w and does not score multi-app when packages: is absent', () => {
    const root = tmp('ark-376-settings-');
    seedLibrary(root, '# pnpm 10 settings only\nallowBuilds:\n  esbuild: false\n');

    expect(readPnpmWorkspacePackageGlobs(root)).toBeNull();
    expect(isPnpmWorkspaceRoot(root)).toBe(false);
    expect(packageInstallArgv(root, '^4.8.29')).toEqual(['pnpm', ['add', '-D', 'arkgate@^4.8.29']]);

    const signals = collectRepoShapeSignals(root);
    expect(signals.workspaces).toBe(false);
    expect(detectWorkspaces(root)).toEqual([]);

    const rec = buildArchitectureRecommendation(root);
    expect(rec.archetype).toBe('library-sdk');
    expect(resolveStartInitPreset(root, rec)).not.toBe('monorepo');
  });

  it('keeps -w for a packages: key whose directories are not on disk, without a multi-app shape', () => {
    const root = tmp('ark-376-phantom-');
    seedLibrary(root, "packages:\n  - 'missing/*'\nallowBuilds:\n  esbuild: false\n");

    expect(readPnpmWorkspacePackageGlobs(root)).toEqual(['missing/*']);
    expect(isPnpmWorkspaceRoot(root)).toBe(true);
    expect(packageInstallArgv(root)[1]).toContain('-w');
    expect(detectWorkspaces(root)).toEqual(['missing']);
    expect(collectRepoShapeSignals(root).workspaces).toBe(false);
    expect(buildArchitectureRecommendation(root).archetype).toBe('library-sdk');
    expect(resolveStartInitPreset(root, buildArchitectureRecommendation(root))).not.toBe('monorepo');
  });

  it('still treats a package directory declared by packages: as a workspace', () => {
    const root = tmp('ark-376-real-');
    write(
      root,
      'package.json',
      JSON.stringify({ name: 'mono', private: true, packageManager: 'pnpm@10.15.0' })
    );
    write(root, 'pnpm-workspace.yaml', 'packages:\n  - packages/*\n');
    write(root, 'packages/core/package.json', JSON.stringify({ name: '@scope/core', exports: './src/index.ts' }));
    write(root, 'packages/core/src/index.ts', 'export const n = 1;\n');

    expect(isPnpmWorkspaceRoot(root)).toBe(true);
    expect(collectRepoShapeSignals(root).workspaces).toBe(true);
    expect(buildArchitectureRecommendation(root).archetype).toBe('multi-app-workspace');
  });

  it('scan-excludes root tool configs and leaves a root package entrypoint in DomainModel', () => {
    const root = tmp('ark-376-layers-');
    seedLibrary(root, 'allowBuilds:\n  esbuild: false\n');
    const config = ARCHITECTURE_PRESETS.layered(undefined, root) as {
      exclude: string[];
      layers: Array<{ name: string; patterns: string[]; exclude?: string[] }>;
    };

    expect(config.exclude).toEqual(expect.arrayContaining(['*.config.mjs', '*.config.ts']));
    const domain = config.layers.find((layer) => layer.name === 'DomainModel');
    expect(domain?.exclude).toEqual(expect.arrayContaining(['*.config.mjs', '*.config.ts']));
    expect(domain?.patterns).toContain('*.js');

    for (const file of ['rollup.config.mjs', 'vite.config.ts', 'eslint.config.mjs']) {
      expect(isScanExcludedRelative(file, config)).toBe(true);
      expect(layerForRelativePath(file, config.layers)).not.toBe('DomainModel');
    }
    expect(isScanExcludedRelative('index.js', config)).toBe(false);
    expect(layerForRelativePath('index.js', config.layers)).toBe('DomainModel');
    expect(isScanExcludedRelative('src/index.ts', config)).toBe(false);
  });
});

describe('#376 apply honesty', () => {
  it('names the tool config and does not print coverage as a clean result', () => {
    const preview = annotateApplyHonesty(
      {
        projectedCoverage: { percent: 94, classifiedFiles: 47, totalFiles: 50 },
        unresolvedDecisions: [],
        changes: [{ path: 'ark.config.json', action: 'create' }],
        setupBudget: { ok: true },
      },
      {
        ok: false,
        arkCreated: [{ file: 'rollup.config.mjs', ruleId: 'FORBIDDEN_GLOBAL', message: 'process' }],
      }
    );
    expect(preview.claimedClean).toBe(false);
    expect(preview.unresolvedDecisions.join('\n')).toMatch(/rollup\.config\.mjs \(FORBIDDEN_GLOBAL\)/);

    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((value = '') => {
      lines.push(String(value));
    });
    renderStartPreview(preview, { applying: true });
    const text = lines.join('\n');
    expect(text).toContain('The first check would fail. Projected coverage is not a clean result.');
    expect(text).toContain('FORBIDDEN_GLOBAL  rollup.config.mjs');
    expect(text).not.toContain('Projected governed coverage');
  });

  it('still calls coverage clean when the first check fails on product code', () => {
    const preview = annotateApplyHonesty(
      {
        projectedCoverage: { percent: 80, classifiedFiles: 8, totalFiles: 10 },
        unresolvedDecisions: [],
      },
      { ok: false, arkCreated: [] }
    );
    expect(preview.claimedClean).toBe(true);
    expect(preview.unresolvedDecisions).toEqual([]);
  });
});
