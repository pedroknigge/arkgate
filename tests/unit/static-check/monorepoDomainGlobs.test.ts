/**
 * Issue #269: monorepo start must not dump whole-app roots onto DomainModel,
 * and doctor #1 must name overlapping globs when dual-match is a glob leak.
 * H-P0-3: intentional file+glob dual-lists must not steal #1 or sermon `api/**`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ARCHITECTURE_PRESETS } from '../../../bin/lib/presets.mjs';
import { sharedLibraryLayer } from '../../../bin/ark-shared.mjs';
import { matchingLayersForRelativePath } from '../../../src/domain/layerMatch';
import {
  collectDoctorNextActions,
  dualMatchNeedsGlobRepair,
  overlappingGlobNextAction,
  preferredDoctorPrimaryNextAction,
} from '../../../bin/lib/doctor-next-actions.mjs';
import { ADOPTED_NOT, NOT_ADOPTED_NEXT_ACTION } from '../../../bin/lib/adoption-stance.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARK = path.join(REPO, 'bin', 'ark.mjs');
const TMP_ROOTS: string[] = [];

function tmpRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  TMP_ROOTS.push(root);
  return root;
}

function write(root: string, rel: string, body: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

function seedBroadMonorepo(root: string) {
  write(
    root,
    'package.json',
    JSON.stringify(
      {
        name: 'field-mono',
        private: true,
        type: 'module',
        exports: './packages/schema/src/index.ts',
        workspaces: ['api', 'client', 'packages/*'],
      },
      null,
      2
    )
  );
  write(
    root,
    'api/package.json',
    JSON.stringify({ name: '@field/api', type: 'module', main: './src/index.ts', types: './src/index.ts' }, null, 2)
  );
  write(root, 'api/src/index.ts', 'export const api = true;\n');
  write(root, 'api/src/app/page.ts', 'export const page = true;\n');
  write(root, 'api/src/services/run.ts', 'export const run = true;\n');
  write(
    root,
    'client/package.json',
    JSON.stringify({ name: '@field/client', type: 'module', main: './src/index.ts', types: './src/index.ts' }, null, 2)
  );
  write(root, 'client/src/index.ts', 'export const client = true;\n');
  write(root, 'client/src/app/page.ts', 'export const page = true;\n');
  write(root, 'client/src/components/button.ts', 'export const button = true;\n');
  write(
    root,
    'packages/schema/package.json',
    JSON.stringify({ name: '@field/schema', type: 'module', exports: './src/index.ts' }, null, 2)
  );
  write(root, 'packages/schema/src/index.ts', 'export const schema = true;\n');
  write(root, 'packages/schema/src/parse.ts', 'export const parse = (v: unknown) => v;\n');
}

afterEach(() => {
  while (TMP_ROOTS.length > 0) {
    const root = TMP_ROOTS.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

function domainPatterns(config: { layers?: Array<{ name: string; patterns?: string[] }> }): string[] {
  return config.layers?.find((layer) => layer.name === 'DomainModel')?.patterns ?? [];
}

function nextActionsCtx(cov: Record<string, unknown>, adopted = ADOPTED_NOT) {
  return {
    operatingMode: 'adapt',
    activeCount: 0,
    gatesMissing: [],
    analysisComplete: true,
    designSmells: [],
    postGreenPath: null,
    coverageHonesty: { greenIsNotEnforcement: false, worseThanNoGate: false },
    cov,
    skillGaps: [],
    agentHomeGaps: [],
    staleRunners: [],
    adoption: { gaps: [] },
    designFitness: {},
    adopted,
    root: '/tmp',
  };
}

describe('monorepo DomainModel globs (#269)', () => {
  it('keeps package-scoped library bags and drops whole-app roots', () => {
    const root = tmpRoot('ark-269-globs-');
    seedBroadMonorepo(root);
    const config = ARCHITECTURE_PRESETS.monorepo([], root);
    const domain = domainPatterns(config);
    expect(domain).toContain('packages/schema/src/**');
    expect(domain).toEqual(expect.arrayContaining(['**/domain/**', '**/entities/**']));
    expect(domain).not.toContain('api/**');
    expect(domain).not.toContain('api/src/**');
    expect(domain).not.toContain('client/**');
    expect(domain).not.toContain('client/src/**');
  });

  it('start --apply does not write api/** or client/** onto DomainModel', () => {
    const root = tmpRoot('ark-269-start-');
    seedBroadMonorepo(root);
    const applied = spawnSync(
      process.execPath,
      [ARK, 'start', '--root', root, '--preset', 'monorepo', '--tools', 'claude', '--yes', '--no-install', '--apply', '--force'],
      {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, ARK_ACTIVE_HOST: 'claude', CODEX_HOME: path.join(root, '.codex-home') },
      }
    );
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0);
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8')) as {
      layers: Array<{ name: string; patterns?: string[] }>;
    };
    const domain = domainPatterns(config);
    expect(domain).toContain('packages/schema/src/**');
    expect(domain).not.toEqual(expect.arrayContaining(['api/**', 'api/src/**', 'client/**', 'client/src/**']));
    expect(applied.stdout).toMatch(/Start apply complete\. Next: .*ark-check --doctor/);
  }, 120_000);
});

describe('monorepo role roots do not overlap generic globs (#373)', () => {
  function seedOverlapMonorepo(root: string) {
    write(
      root,
      'package.json',
      JSON.stringify({ name: 'globpack', private: true, packageManager: 'pnpm@10.33.4' })
    );
    write(root, 'pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n  - "apps/*"\n');
    write(root, 'packages/planner/package.json', JSON.stringify({ name: '@globpack/planner', private: true }));
    write(root, 'packages/planner/src/plan.ts', 'export function plan(id: string) { return { id }; }\n');
    write(
      root,
      'packages/planner/src/adapters/store/get.ts',
      'import { plan } from "../../plan";\nexport function get(id: string) { return plan(id); }\n'
    );
    write(
      root,
      'packages/planner/src/pages/home.ts',
      'import { get } from "../adapters/store/get";\nexport function home() { return get("home"); }\n'
    );
    write(
      root,
      'packages/schema/package.json',
      JSON.stringify({ name: '@globpack/schema', type: 'module', exports: './src/index.ts' })
    );
    write(root, 'packages/schema/src/index.ts', 'export const schema = { name: "trip" };\n');
    write(
      root,
      'packages/schema/src/adapters/parse/read.ts',
      'import { schema } from "../../index";\nexport function read() { return schema; }\n'
    );
    write(
      root,
      'apps/site/package.json',
      JSON.stringify({ name: '@globpack/site', private: true, dependencies: { react: '^19.0.0' } })
    );
    write(root, 'apps/site/tsconfig.json', JSON.stringify({ compilerOptions: { rootDir: 'og-image' } }));
    write(root, 'apps/site/og-image/utils/font.ts', 'export const font = "sans";\n');
    write(
      root,
      'apps/site/og-image/adapters/store.ts',
      'import { font } from "../utils/font";\nexport function ogStore() { return font; }\n'
    );
    write(root, 'apps/site/pages/index.ts', 'import { font } from "../og-image/utils/font";\nexport function page() { return font; }\n');
    write(root, 'apps/site/pages/api/health.ts', 'export function health() { return { ok: true }; }\n');
    write(
      root,
      'apps/web/package.json',
      JSON.stringify({ name: 'web', dependencies: { next: '16', react: '^19' } })
    );
    write(root, 'apps/web/src/app/page.tsx', 'export default function Page() { return null; }\n');
    write(root, 'apps/web/src/app/api/health/route.ts', 'export function GET() { return null; }\n');
  }

  function layerNames(root: string, rel: string): string[] {
    const config = ARCHITECTURE_PRESETS.monorepo([], root) as {
      layers: Array<{ name: string; patterns?: string[]; exclude?: string[] }>;
    };
    return matchingLayersForRelativePath(rel, config.layers).map((hit) => hit.layer).sort();
  }

  it('maps each contested file to one layer and keeps Next API on Application', () => {
    const root = tmpRoot('ark-373-globs-');
    seedOverlapMonorepo(root);
    expect(layerNames(root, 'packages/planner/src/adapters/store/get.ts')).toEqual([
      'ApplicationOrchestration',
    ]);
    expect(layerNames(root, 'packages/planner/src/pages/home.ts')).toEqual(['ApplicationOrchestration']);
    expect(layerNames(root, 'packages/planner/src/plan.ts')).toEqual(['ApplicationOrchestration']);
    expect(layerNames(root, 'packages/planner/src/domain/trip.ts')).toEqual(['DomainModel']);
    expect(layerNames(root, 'packages/schema/src/adapters/parse/read.ts')).toEqual(['DomainModel']);
    expect(layerNames(root, 'apps/site/og-image/adapters/store.ts')).toEqual(['PresentationAdapters']);
    expect(layerNames(root, 'apps/site/og-image/utils/font.ts')).toEqual(['PresentationAdapters']);
    expect(layerNames(root, 'apps/site/pages/index.ts')).toEqual(['PresentationAdapters']);
    expect(layerNames(root, 'apps/site/pages/api/health.ts')).toEqual(['ApplicationOrchestration']);
    expect(layerNames(root, 'apps/web/src/app/page.tsx')).toEqual(['PresentationAdapters']);
    expect(layerNames(root, 'apps/web/src/app/api/health/route.ts')).toEqual(['ApplicationOrchestration']);
    expect(layerNames(root, 'tools/adapters/store.ts')).toEqual(['PersistenceAdapters']);

    const config = ARCHITECTURE_PRESETS.monorepo([], root) as {
      layers: Array<{ name: string; exclude?: string[] }>;
    };
    const exclude = (name: string) => config.layers.find((layer) => layer.name === name)?.exclude ?? [];
    expect(exclude('DomainModel')).not.toEqual(expect.arrayContaining(['packages/planner/src/**']));
    expect(exclude('ApplicationOrchestration')).toEqual(expect.arrayContaining(['packages/schema/src/**']));
    expect(exclude('ApplicationOrchestration')).not.toEqual(
      expect.arrayContaining(['packages/planner/src/**', 'apps/site/og-image/**', 'apps/web/src/**'])
    );
    expect(exclude('PresentationAdapters')).toEqual(
      expect.arrayContaining(['packages/planner/src/**', '**/pages/api/**'])
    );
    expect(exclude('PersistenceAdapters')).toEqual(
      expect.arrayContaining(['packages/planner/src/**', 'apps/site/og-image/**', 'packages/schema/src/**'])
    );
  });
});

describe('doctor overlapping-glob priority (#269)', () => {
  const hugeDual = {
    suggestions: [],
    totalFiles: 270,
    dualMembership: {
      count: 265,
      samples: [
        {
          file: 'api/src/app/page.ts',
          layers: ['DomainModel', 'PresentationAdapters'],
          winner: 'DomainModel',
        },
      ],
    },
  };

  it('treats a Domain vacuum dual-match pile-up as glob repair', () => {
    expect(dualMatchNeedsGlobRepair(hugeDual)).toBe(true);
    expect(overlappingGlobNextAction(hugeDual)).toMatch(/Fix overlapping layer globs/);
    expect(overlappingGlobNextAction(hugeDual)).toContain('api/src/app/page.ts matches DomainModel + PresentationAdapters');
    expect(overlappingGlobNextAction(hugeDual)).toMatch(/api\/\*\*/);
    expect(overlappingGlobNextAction(hugeDual)).not.toMatch(/packages\/\*\/src\/domain/);
  });

  it('does not steal doctor #1 for mother-like Domain+Tooling file+glob dual-lists', () => {
    const motherLike = {
      suggestions: [],
      totalFiles: 343,
      layers: [
        {
          name: 'DomainModel',
          patterns: ['src/domain/**', 'bin/ark-layer-match.mjs', 'bin/lib/remediation.mjs'],
        },
        { name: 'Tooling', patterns: ['src/eslint/**', 'bin/**', 'scripts/**'] },
      ],
      dualMembership: {
        count: 24,
        samples: [
          {
            file: 'bin/ark-layer-match.mjs',
            layers: ['DomainModel', 'Tooling'],
            winner: 'DomainModel',
          },
        ],
      },
    };
    expect(dualMatchNeedsGlobRepair(motherLike)).toBe(false);
    const actions = collectDoctorNextActions(nextActionsCtx(motherLike));
    expect(actions[0]).toBe(NOT_ADOPTED_NEXT_ACTION);
    expect(actions[0]).not.toMatch(/api\/\*\*/);
    expect(actions.some((action) => /Fix overlapping layer globs/.test(String(action)))).toBe(false);
  });

  it('names the tree overlapping roots instead of a canned api/** sermon', () => {
    const webLeak = {
      suggestions: [],
      totalFiles: 80,
      layers: [
        { name: 'DomainModel', patterns: ['apps/web/**', '**/domain/**'] },
        { name: 'PresentationAdapters', patterns: ['**/app/**'] },
      ],
      dualMembership: {
        count: 40,
        samples: [
          {
            file: 'apps/web/src/app/page.ts',
            layers: ['DomainModel', 'PresentationAdapters'],
            winner: 'DomainModel',
          },
        ],
      },
    };
    expect(dualMatchNeedsGlobRepair(webLeak)).toBe(true);
    const copy = overlappingGlobNextAction(webLeak);
    expect(copy).toContain('apps/web/src/app/page.ts matches DomainModel + PresentationAdapters');
    expect(copy).toContain('apps/web/**');
    expect(copy).not.toMatch(/api\/\*\*/);
    expect(copy).not.toMatch(/packages\/\*\/src\/domain/);
    expect(collectDoctorNextActions(nextActionsCtx(webLeak))[0]).toBe(copy);
  });

  it('does not displace CI-required for a handful of non-Domain dual-matches', () => {
    const small = {
      suggestions: [],
      totalFiles: 2000,
      dualMembership: {
        count: 8,
        samples: [
          {
            file: 'src/app/api/health/route.ts',
            layers: ['ApplicationOrchestration', 'PresentationAdapters'],
            winner: 'ApplicationOrchestration',
          },
        ],
      },
    };
    expect(dualMatchNeedsGlobRepair(small)).toBe(false);
    const actions = collectDoctorNextActions(nextActionsCtx(small));
    expect(actions[0]).toBe(NOT_ADOPTED_NEXT_ACTION);
  });

  it('makes overlapping-glob repair doctor #1 even when not adopted', () => {
    const actions = collectDoctorNextActions(nextActionsCtx(hugeDual));
    expect(actions[0]).toMatch(/Fix overlapping layer globs/);
    expect(actions[0]).toMatch(/\/ark-adopt/);
    expect(actions).toContain(NOT_ADOPTED_NEXT_ACTION);
    expect(actions[0]).not.toBe(NOT_ADOPTED_NEXT_ACTION);
  });
});

describe('shared workspace package layers (#366)', () => {
  it('classifies shared libraries by leaf, then by dependencies', () => {
    const layer = (root: string, deps: Record<string, string> = {}) =>
      sharedLibraryLayer({ role: 'library', root, productionDeps: deps });
    expect(layer('packages/ui')).toBe('PresentationAdapters');
    expect(layer('packages/db')).toBe('PersistenceAdapters');
    expect(layer('packages/auth')).toBe('PersistenceAdapters');
    expect(layer('packages/api', { react: '19.0.0' })).toBe('ApplicationOrchestration');
    expect(layer('packages/validators')).toBe('ApplicationOrchestration');
    expect(layer('packages/schema')).toBe('DomainModel');
    expect(layer('packages/kit', { react: '19.0.0' })).toBe('PresentationAdapters');
    expect(layer('packages/data', { prisma: '6.0.0' })).toBe('PersistenceAdapters');
    expect(layer('packages/client', { prisma: '6.0.0' })).toBe('PersistenceAdapters');
    expect(layer('packages/gateway', { hono: '4.0.0' })).toBe('ApplicationOrchestration');
    expect(sharedLibraryLayer({ role: 'application', root: 'apps/web', productionDeps: { react: '19.0.0' } })).toBe(
      null
    );
  });

  it('puts ui, db, auth, and api on their layers and keeps schema and billing on Domain', () => {
    const root = tmpRoot('ark-366-layers-');
    write(root, 'package.json', JSON.stringify({ name: 'workpack', private: true, workspaces: ['packages/*'] }));
    write(root, 'pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n');
    const lib = (name: string, pkgName: string) => {
      write(root, `packages/${name}/package.json`, JSON.stringify({ name: pkgName, exports: './src/index.ts' }));
      write(root, `packages/${name}/src/index.ts`, 'export const value = true;\n');
    };
    lib('ui', '@repo/ui');
    lib('db', '@repo/data');
    lib('auth', '@repo/auth');
    lib('api', '@repo/api');
    lib('validators', '@repo/validators');
    lib('billing', '@repo/billing');
    lib('schema', '@repo/schema');
    const config = ARCHITECTURE_PRESETS.monorepo([], root) as {
      layers: Array<{ name: string; patterns?: string[] }>;
    };
    const patterns = (name: string) => config.layers.find((layer) => layer.name === name)?.patterns ?? [];
    expect(patterns('DomainModel')).not.toEqual(
      expect.arrayContaining([
        'packages/ui/src/**',
        'packages/db/src/**',
        'packages/auth/src/**',
        'packages/api/src/**',
        'packages/validators/src/**',
      ])
    );
    expect(patterns('DomainModel')).toEqual(
      expect.arrayContaining(['packages/billing/src/**', 'packages/schema/src/**'])
    );
    expect(patterns('PresentationAdapters')).toContain('packages/ui/src/**');
    expect(patterns('PersistenceAdapters')).toEqual(
      expect.arrayContaining(['packages/db/src/**', 'packages/auth/src/**'])
    );
    expect(patterns('ApplicationOrchestration')).toEqual(
      expect.arrayContaining(['packages/api/src/**', 'packages/validators/src/**'])
    );
  });

  it('keeps Expo and Start UI entries on Presentation so a Button import stays in-layer', () => {
    const root = tmpRoot('ark-366-apps-');
    write(root, 'package.json', JSON.stringify({ name: 'workpack', private: true, workspaces: ['apps/*', 'packages/*'] }));
    write(root, 'pnpm-workspace.yaml', 'packages:\n  - "apps/*"\n  - "packages/*"\n');
    write(root, 'apps/expo/package.json', JSON.stringify({ name: '@repo/expo', private: true, dependencies: { '@repo/ui': '*' } }));
    write(root, 'apps/expo/app/index.tsx', 'import { Button } from "@repo/ui";\nexport function Home() { return Button; }\n');
    write(root, 'apps/start/package.json', JSON.stringify({ name: '@repo/start', private: true, dependencies: { '@repo/ui': '*' } }));
    write(root, 'apps/start/src/routes/index.tsx', 'import { Button } from "@repo/ui";\nexport function StartHome() { return Button; }\n');
    write(root, 'packages/ui/package.json', JSON.stringify({ name: '@repo/ui', exports: './src/index.ts' }));
    write(root, 'packages/ui/src/button.tsx', 'export function Button() { return null; }\n');
    const config = ARCHITECTURE_PRESETS.monorepo([], root) as {
      layers: Array<{ name: string; patterns?: string[]; exclude?: string[] }>;
    };
    const names = (rel: string) => matchingLayersForRelativePath(rel, config.layers).map((hit) => hit.layer).sort();
    expect(names('apps/expo/app/index.tsx')).toEqual(['PresentationAdapters']);
    expect(names('apps/start/src/routes/index.tsx')).toEqual(['PresentationAdapters']);
    expect(names('packages/ui/src/button.tsx')).toEqual(['PresentationAdapters']);
  });
});

describe('nested pages-router helpers (#380)', () => {
  const fixture = path.join(REPO, 'tests/fixtures/journey/pagepack');

  it('keeps pages/api and sibling utils/lib on Application, and pages on Presentation', () => {
    const config = ARCHITECTURE_PRESETS.monorepo([], fixture) as {
      layers: Array<{ name: string; patterns?: string[]; exclude?: string[] }>;
    };
    const names = (rel: string) =>
      matchingLayersForRelativePath(rel, config.layers).map((hit) => hit.layer).sort();
    expect(names('site/studio/pages/api/blog.ts')).toEqual(['ApplicationOrchestration']);
    expect(names('site/studio/utils/fetchFont.ts')).toEqual(['ApplicationOrchestration']);
    expect(names('site/studio/utils/params.ts')).toEqual(['ApplicationOrchestration']);
    expect(names('site/studio/utils/env.ts')).toEqual(['ApplicationOrchestration']);
    expect(names('site/studio/lib/parse.ts')).toEqual(['ApplicationOrchestration']);
    expect(names('site/studio/pages/index.ts')).toEqual(['PresentationAdapters']);
    expect(names('site/src/mark.ts')).toEqual(['ApplicationOrchestration']);
    const presentation = config.layers.find((layer) => layer.name === 'PresentationAdapters');
    expect(presentation?.patterns ?? []).toEqual(expect.arrayContaining(['site/studio/**']));
    expect(presentation?.exclude ?? []).toEqual(
      expect.arrayContaining(['site/studio/utils/**', 'site/studio/lib/**'])
    );
  });

  it('does not rank strict-merge first while blocking violations remain', () => {
    const actions = collectDoctorNextActions({
      ...nextActionsCtx({ suggestions: [] }),
      activeCount: 7,
      blockingCount: 7,
    });
    expect(actions[0]).toMatch(/non-baselined violations/);
    expect(actions.some((action) => /strict-merge/i.test(String(action)))).toBe(false);
    const primary = preferredDoctorPrimaryNextAction({
      adopted: ADOPTED_NOT,
      analysisComplete: true,
      blockingCount: 7,
      root: '/tmp',
    });
    expect(primary).toMatch(/non-baselined violations/);
    expect(primary).not.toMatch(/strict-merge/);
  });

  it('short doctor names failing violations and does not require strict-merge while the check is red', () => {
    const root = tmpRoot('ark-380-doctor-');
    write(root, 'package.json', JSON.stringify({ name: 'pagepack-red', private: true }));
    write(
      root,
      'site/studio/utils/fetchFont.ts',
      'export function fetchFont(name: string) { return name; }\n'
    );
    write(
      root,
      'site/studio/pages/api/blog.ts',
      'import { fetchFont } from "../../utils/fetchFont";\nexport function blog() { return fetchFont("serif"); }\n'
    );
    write(
      root,
      'ark.config.json',
      JSON.stringify(
        {
          include: ['site/studio'],
          layers: [
            { name: 'ApplicationOrchestration', patterns: ['**/pages/api/**'] },
            {
              name: 'PresentationAdapters',
              patterns: ['site/studio/**'],
              exclude: ['**/pages/api/**'],
            },
          ],
          rules: [{ from: 'ApplicationOrchestration', to: 'PresentationAdapters', allowed: false }],
        },
        null,
        2
      )
    );
    const doctor = spawnSync(
      process.execPath,
      [path.join(REPO, 'bin/ark-check.mjs'), '--root', root, '--doctor', '--no-cache'],
      { cwd: root, encoding: 'utf8' }
    );
    const text = `${doctor.stdout}\n${doctor.stderr}`.replace(/\u001b\[[0-9;]*m/g, '');
    expect(doctor.status, text).toBe(0);
    expect(text).toMatch(/1 failing violation/);
    expect(text).toMatch(/ApplicationOrchestration → PresentationAdapters/);
    const lines = text.split('\n').map((line) => line.trim());
    const primary = lines[lines.findIndex((line) => line === 'Primary next action') + 1] ?? '';
    expect(primary).toMatch(/non-baselined violations/);
    expect(primary).not.toMatch(/strict-merge/);
    expect(text).not.toMatch(/Make arkgate-check --strict-merge/);
  });
});
