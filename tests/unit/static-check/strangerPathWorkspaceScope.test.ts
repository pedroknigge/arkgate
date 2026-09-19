/**
 * #282 / #283 — stranger-path workspace evidence + start scope.
 * pnpm-workspace.yaml (no package.json#workspaces) is a monorepo;
 * playground/fixture/scaffold trees are not production layers.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ARCHITECTURE_PRESETS,
} from '../../../bin/lib/presets.mjs';
import { isSkippedSourceDir } from '../../../bin/lib/scan-files.mjs';
import {
  buildArchitectureRecommendation,
  collectRepoShapeSignals,
  detectTsPackageRoots,
  detectWorkspaces,
  discoverRepoUnits,
  isNonProductRelativePath,
  resolveIncludeRoots,
  whyFromMatchedSignals,
} from '../../../bin/ark-shared.mjs';

const ARK = path.resolve('bin/ark.mjs');
const ARK_CHECK = path.resolve('bin/ark-check.mjs');
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

function runArk(file: string, args: string[], root: string) {
  return spawnSync(process.execPath, [file, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ARK_ACTIVE_HOST: 'claude', CODEX_HOME: path.join(root, '.codex-home') },
  });
}

function seedPnpmLibraryMonorepo(root: string) {
  write(
    root,
    'package.json',
    JSON.stringify(
      {
        name: 'library-mono',
        private: true,
        packageManager: 'pnpm@9.12.0',
      },
      null,
      2
    )
  );
  write(root, 'pnpm-workspace.yaml', 'packages:\n  - packages/*\n  - playground/**\n');
  write(
    root,
    'packages/core/package.json',
    JSON.stringify({ name: '@scope/core', type: 'module', exports: './src/index.ts' }, null, 2)
  );
  write(root, 'packages/core/src/index.ts', 'export const core = true;\n');
  write(root, 'packages/core/src/parse.ts', 'export const parse = (v: unknown) => v;\n');
  write(root, 'packages/core/src/types.ts', 'export type Core = { ok: true };\n');
  write(
    root,
    'packages/mini/package.json',
    JSON.stringify({ name: '@scope/mini', type: 'module', exports: './src/index.ts' }, null, 2)
  );
  write(root, 'packages/mini/src/index.ts', 'export const mini = true;\n');
  write(root, 'packages/mini/src/util.ts', 'export const util = 1;\n');

  write(
    root,
    'tsconfig.json',
    JSON.stringify(
      {
        files: [],
        references: [{ path: './tsconfig.app.json' }, { path: './packages/core' }],
      },
      null,
      2
    )
  );
  write(root, 'tsconfig.app.json', JSON.stringify({ compilerOptions: { composite: true } }, null, 2));

  write(
    root,
    'playground/package.json',
    JSON.stringify(
      {
        name: '@scope/playground',
        dependencies: { react: '19.0.0', express: '4.21.0', prisma: '6.0.0' },
      },
      null,
      2
    )
  );
  write(root, 'playground/src/components/App.tsx', 'export const App = () => null;\n');
  write(root, 'playground/src/pages/index.tsx', 'export default function Page() { return null; }\n');
  write(root, 'playground/src/persistence/db.ts', 'export const db = {};\n');
  write(root, 'playground/src/routes/api.ts', 'export function list() {}\n');
  write(root, 'playground/ssr/a.ts', 'import { b } from "./b.js";\nexport const a = b;\n');
  write(root, 'playground/ssr/b.ts', 'import { a } from "./a.js";\nexport const b = a;\n');
  write(root, 'scaffold/templates/app.ts', 'export const scaffold = true;\n');
}

afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('#282 workspace manifest evidence', () => {
  it('treats pnpm-workspace.yaml (no package.json#workspaces) as a workspace monorepo', () => {
    const root = tmp('ark-282-pnpm-');
    seedPnpmLibraryMonorepo(root);

    const dirs = detectWorkspaces(root);
    expect(dirs).toEqual(expect.arrayContaining(['packages', 'playground']));

    const signals = collectRepoShapeSignals(root);
    expect(signals.workspaces).toBe(true);
    expect(signals.workspaceDirs).toEqual(expect.arrayContaining(['packages']));
    expect(signals.ui).toBe(false);
    expect(signals.nextFramework).toBe(false);

    const rec = buildArchitectureRecommendation(root);
    expect(rec.signals.workspaces).toBe(true);
    expect(rec.matchedSignals).not.toContain('!workspaces');
    expect(rec.why.join('\n')).not.toMatch(/not a workspace monorepo/i);
    expect(rec.evidence.every((item: { explanation: string }) => !/not a workspace monorepo/i.test(item.explanation))).toBe(
      true
    );
    expect(rec.archetype).toBe('multi-app-workspace');
    expect(rec.why.join('\n')).toMatch(/workspace/i);
  });

  it('does not print “not a workspace monorepo” when !workspaces scored a workspace tree', () => {
    const root = tmp('ark-282-copy-');
    write(
      root,
      'package.json',
      JSON.stringify({ name: 'mono', private: true, workspaces: { packages: ['packages/*'] } }, null, 2)
    );
    write(root, 'packages/core/src/index.ts', 'export const n = 1;\n');
    const signals = collectRepoShapeSignals(root);
    expect(signals.workspaces).toBe(true);
    const why = whyFromMatchedSignals(signals, ['!workspaces']);
    expect(why.join(' ')).not.toMatch(/not a workspace monorepo/i);
    expect(why.join(' ')).toMatch(/workspace monorepo/i);
  });

  it('counts an empty-packages pnpm-workspace.yaml as workspace evidence', () => {
    const root = tmp('ark-282-empty-yaml-');
    write(root, 'package.json', JSON.stringify({ name: 'root', packageManager: 'pnpm@9.0.0' }));
    write(root, 'pnpm-workspace.yaml', '# catalog only\ncatalog:\n  typescript: 5.6.0\n');
    write(root, 'src/index.ts', 'export const n = 1;\n');
    const signals = collectRepoShapeSignals(root);
    expect(signals.workspaces).toBe(true);
    const rec = buildArchitectureRecommendation(root);
    expect(rec.why.join('\n')).not.toMatch(/not a workspace monorepo/i);
  });

  it('--recommend --json on a pnpm workspace does not emit !workspaces or the stranger lie', () => {
    const root = tmp('ark-282-cli-');
    seedPnpmLibraryMonorepo(root);
    const stdout = execFileSync(process.execPath, [ARK_CHECK, '--root', root, '--recommend', '--json'], {
      encoding: 'utf8',
    });
    const rec = JSON.parse(stdout) as {
      archetype: string;
      matchedSignals: string[];
      why: string[];
      evidence?: Array<{ signal: string; effect: string; explanation: string }>;
    };
    expect(rec.archetype).toBe('multi-app-workspace');
    expect(rec.matchedSignals).not.toContain('!workspaces');
    expect(rec.why.join('\n')).not.toMatch(/not a workspace monorepo/i);
    expect(rec.evidence?.some((row) => /not a workspace monorepo/i.test(row.explanation))).toBeFalsy();
    expect(rec.matchedSignals).toContain('workspaces');
  });
});

describe('#283 start/recommend exclude playground fixtures', () => {
  it('skips playground/test/fixture/scaffold dir names (shared with check walk)', () => {
    expect(isSkippedSourceDir('playground')).toBe(true);
    expect(isSkippedSourceDir('fixtures')).toBe(true);
    expect(isSkippedSourceDir('scaffold')).toBe(true);
    expect(isSkippedSourceDir('testdata')).toBe(true);
    expect(isSkippedSourceDir('src')).toBe(false);
    expect(isNonProductRelativePath('playground/ssr')).toBe(true);
    expect(isNonProductRelativePath('packages/core')).toBe(false);
  });

  it('does not discover playground packages or tsconfig.*.json as source roots', () => {
    const root = tmp('ark-283-discover-');
    seedPnpmLibraryMonorepo(root);

    expect(detectTsPackageRoots(root)).not.toEqual(expect.arrayContaining([expect.stringMatching(/playground/)]));
    expect(resolveIncludeRoots(root)).not.toEqual(expect.arrayContaining([expect.stringMatching(/playground|scaffold/)]));
    expect(resolveIncludeRoots(root)).toEqual(expect.arrayContaining(['packages']));

    const units = discoverRepoUnits(root);
    expect(units.some((unit) => /playground|scaffold/.test(unit.root))).toBe(false);
    const rootUnit = units.find((unit) => unit.root === '.');
    expect(rootUnit?.sourceRoots ?? []).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/tsconfig.*\.json/)])
    );
    expect(rootUnit?.sourceRoots ?? []).toEqual(expect.arrayContaining(['packages/core']));
  });

  it('monorepo preset include/layers omit playground and json config globs', () => {
    const root = tmp('ark-283-preset-');
    seedPnpmLibraryMonorepo(root);
    const config = ARCHITECTURE_PRESETS.monorepo([], root) as {
      include: string[];
      layers: Array<{ name: string; patterns: string[] }>;
    };
    expect(config.include).not.toEqual(expect.arrayContaining([expect.stringMatching(/playground|scaffold/)]));
    const patterns = config.layers.flatMap((layer) => layer.patterns);
    expect(patterns.some((pattern) => /playground|scaffold|tsconfig.*\.json/.test(pattern))).toBe(false);
    expect(patterns).toEqual(expect.arrayContaining(['packages/core/src/**']));
  });

  it('start --apply excludes playground cycles; product cycles still report', () => {
    const root = tmp('ark-283-start-');
    seedPnpmLibraryMonorepo(root);
    write(root, 'packages/core/src/cycle-a.ts', 'import { cycleB } from "./cycle-b.js";\nexport const cycleA = cycleB;\n');
    write(root, 'packages/core/src/cycle-b.ts', 'import { cycleA } from "./cycle-a.js";\nexport const cycleB = cycleA;\n');

    const applied = runArk(
      ARK,
      ['start', '--root', root, '--tools', 'claude', '--yes', '--no-install', '--apply'],
      root
    );
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0);

    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8')) as {
      include: string[];
      layers: Array<{ name: string; patterns: string[] }>;
    };
    expect(config.include).not.toEqual(expect.arrayContaining([expect.stringMatching(/playground|scaffold/)]));
    const patterns = config.layers.flatMap((layer) => layer.patterns);
    expect(patterns.some((pattern) => /playground|tsconfig.*\.json/.test(pattern))).toBe(false);

    const check = runArk(ARK_CHECK, ['--root', root, '--json'], root);
    const payload = JSON.parse(check.stdout) as {
      violations?: Array<{ ruleId: string; file?: string; evidence?: { file?: string } }>;
      ok?: boolean;
    };
    const circular = (payload.violations ?? []).filter((row) => row.ruleId === 'CIRCULAR_DEPENDENCY');
    expect(circular.length).toBeGreaterThan(0);
    expect(
      circular.every((row) => {
        const file = row.file ?? row.evidence?.file ?? '';
        return !file.includes('playground') && !file.includes('scaffold');
      })
    ).toBe(true);
    expect(circular.some((row) => /packages\/core/.test(row.file ?? row.evidence?.file ?? ''))).toBe(true);

    const doctor = runArk(ARK_CHECK, ['--root', root, '--doctor'], root);
    expect(`${doctor.stdout}\n${doctor.stderr}`).not.toMatch(/playground\/ssr/);
  }, 120_000);
});
