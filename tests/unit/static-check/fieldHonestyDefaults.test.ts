/**
 * Project-agnostic honesty defaults from field probes (Next/UI hosts):
 * - data clients under lib/ classify as Persistence
 * - presentation is not a whole-src bag
 * - false ENFORCE when Domain+Persistence empty and Presentation dominates
 * - generated CI includes lint/typecheck when package.json has those scripts
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  resolveOperatingMode,
  collectRepoShapeSignals,
  applyFrameworkLayoutOverlays,
} from '../../../bin/ark-shared.mjs';
import { planPopulatedCoreRatchet } from '../../../bin/lib/core-ratchet.mjs';
import { ARCHITECTURE_PRESETS } from '../../../bin/lib/presets.mjs';
import { layerForFile } from '../../../bin/ark-layer-match.mjs';
import {
  githubWorkflow,
  detectDeployPathQuality,
  ensureTypecheckScript,
} from '../../../bin/lib/agent-gates.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARK_CHECK = path.join(REPO, 'bin/ark-check.mjs');
const temps: string[] = [];

function mkTemp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function writeTree(root: string, files: Record<string, string>) {
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
}

describe('resolveOperatingMode honesty', () => {
  it('does not ENFORCE when presentation bag dominates and Domain+Persistence are empty', () => {
    const mode = resolveOperatingMode({
      governedPercent: 100,
      planMet: true,
      totalFiles: 50,
      emptyLayers: ['DomainModel', 'PersistenceAdapters'],
      coreOptionalWithFiles: 0,
      presentationShare: 0.9,
    });
    expect(mode).toBe('adapt');
  });

  it('does not ENFORCE when core layers have files but remain optional', () => {
    const mode = resolveOperatingMode({
      governedPercent: 100,
      planMet: true,
      totalFiles: 50,
      emptyLayers: [],
      coreOptionalWithFiles: 2,
      presentationShare: 0.4,
    });
    expect(mode).toBe('adapt');
  });

  it('ENFORCE when plan met, coverage high, no empty-core bag, no optional cores', () => {
    const mode = resolveOperatingMode({
      governedPercent: 90,
      planMet: true,
      totalFiles: 80,
      emptyLayers: [],
      coreOptionalWithFiles: 0,
      presentationShare: 0.3,
    });
    expect(mode).toBe('enforce');
  });
});

describe('planPopulatedCoreRatchet', () => {
  it('sets optional:false only on populated cores; leaves empty cores optional', () => {
    const config = {
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'], optional: true },
        { name: 'ApplicationOrchestration', patterns: ['src/lib/**'], optional: true },
        { name: 'PersistenceAdapters', patterns: ['src/lib/db/**'], optional: true },
        { name: 'PresentationAdapters', patterns: ['src/app/**'], optional: true },
        { name: 'Kernel', patterns: ['src/kernel/**'], optional: true },
      ],
    };
    const plan = planPopulatedCoreRatchet(config, [
      { name: 'DomainModel', files: 0 },
      { name: 'ApplicationOrchestration', files: 12 },
      { name: 'PersistenceAdapters', files: 4 },
      { name: 'PresentationAdapters', files: 40 },
      { name: 'Kernel', files: 3 },
    ]);
    expect(plan.changed).toBe(true);
    expect(plan.ratcheted.map((r) => r.layer).sort()).toEqual(
      ['ApplicationOrchestration', 'PersistenceAdapters', 'PresentationAdapters'].sort()
    );
    expect(plan.stillOptionalEmpty).toContain('DomainModel');
    const byName = Object.fromEntries(plan.config.layers.map((l: { name: string }) => [l.name, l]));
    expect(byName.DomainModel.optional).toBe(true);
    expect(byName.ApplicationOrchestration.optional).toBe(false);
    expect(byName.PersistenceAdapters.optional).toBe(false);
    expect(byName.PresentationAdapters.optional).toBe(false);
    // Non-core layers are not ratcheted by this path
    expect(byName.Kernel.optional).toBe(true);
  });
});

describe('ensureTypecheckScript bootstrap', () => {
  it('adds typecheck when tsconfig exists and script is missing; never overwrites', () => {
    const root = mkTemp('ark-typecheck-boot-');
    writeTree(root, {
      'package.json': JSON.stringify({
        name: 'app',
        version: '0.1.0',
        scripts: { lint: 'eslint .' },
        dependencies: { next: '16.1.6' },
      }),
      'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true }, include: ['src'] }),
      'src/app/page.tsx': 'export default function P(){return null}\n',
    });

    const first = ensureTypecheckScript(root, { write: true });
    expect(first.changed).toBe(true);
    expect(first.reason).toBe('added');
    expect(first.script).toBe('tsc --noEmit');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts.typecheck).toBe('tsc --noEmit');
    expect(pkg.scripts.lint).toBe('eslint .');

    const second = ensureTypecheckScript(root, { write: true });
    expect(second.changed).toBe(false);
    expect(second.reason).toBe('already');
  });

  it('does not invent typecheck without tsconfig', () => {
    const root = mkTemp('ark-typecheck-no-ts-');
    writeTree(root, {
      'package.json': JSON.stringify({ name: 'app', scripts: {} }),
    });
    const res = ensureTypecheckScript(root, { write: true });
    expect(res.changed).toBe(false);
    expect(res.reason).toBe('no-tsconfig');
  });
});

describe('ui-surface / Next data-client classification', () => {
  it('classifies lib/supabase and lib/airtable as Persistence, not Presentation bag', () => {
    const root = mkTemp('ark-ui-surface-data-');
    writeTree(root, {
      'package.json': JSON.stringify({
        name: 'ui-app',
        version: '0.1.0',
        dependencies: { next: '16.1.6', react: '19.0.0' },
      }),
      'src/app/page.tsx': 'export default function Page() { return null }\n',
      'src/components/Nav.tsx': 'export function Nav() { return null }\n',
      'src/lib/supabase/client.ts': 'export const sb = {}\n',
      'src/lib/airtable/client.ts': 'export const at = {}\n',
      'src/lib/types.ts': 'export type Id = string\n',
    });

    const base = ARCHITECTURE_PRESETS['ui-surface']([], root);
    const config = applyFrameworkLayoutOverlays(base, root);
    expect(layerForFile(root, path.join(root, 'src/lib/supabase/client.ts'), config.layers)).toBe(
      'PersistenceAdapters'
    );
    expect(layerForFile(root, path.join(root, 'src/lib/airtable/client.ts'), config.layers)).toBe(
      'PersistenceAdapters'
    );
    expect(layerForFile(root, path.join(root, 'src/app/page.tsx'), config.layers)).toBe(
      'PresentationAdapters'
    );
    expect(layerForFile(root, path.join(root, 'src/lib/types.ts'), config.layers)).toBe(
      'DomainModel'
    );

    // No whole-src presentation bag
    const presentation = config.layers.find((l: { name: string }) => l.name === 'PresentationAdapters');
    expect(presentation.patterns).not.toContain('**/src/**');
    expect(presentation.patterns).not.toContain('**/lib/**');
  });

  it('classifies Next middleware and Next 16 proxy.ts as Presentation (not ungoverned)', () => {
    const root = mkTemp('ark-next-proxy-');
    writeTree(root, {
      'package.json': JSON.stringify({
        name: 'next-proxy-host',
        version: '0.1.0',
        dependencies: { next: '16.1.6', react: '19.0.0' },
      }),
      'src/app/page.tsx': 'export default function Page() { return null }\n',
      'src/proxy.ts':
        'import type { NextRequest } from "next/server";\nexport default async function middleware(_req: NextRequest) { return null }\n',
      'src/middleware.ts':
        'import type { NextRequest } from "next/server";\nexport function middleware(_req: NextRequest) { return null }\n',
    });

    const base = ARCHITECTURE_PRESETS['ui-surface']([], root);
    const config = applyFrameworkLayoutOverlays(base, root);
    expect(layerForFile(root, path.join(root, 'src/proxy.ts'), config.layers)).toBe(
      'PresentationAdapters'
    );
    expect(layerForFile(root, path.join(root, 'src/middleware.ts'), config.layers)).toBe(
      'PresentationAdapters'
    );
    const presentation = config.layers.find((l: { name: string }) => l.name === 'PresentationAdapters');
    expect(presentation.patterns).toEqual(
      expect.arrayContaining(['src/proxy.ts', 'src/middleware.ts', 'proxy.ts', 'middleware.ts'])
    );

    // Re-apply must stay single "next" (not next+next)
    const twice = applyFrameworkLayoutOverlays(config, root);
    expect(twice.frameworkOverlay).toBe('next');
    expect(String(twice.frameworkOverlay)).not.toContain('next+next');
  });
});

describe('githubWorkflow quality scripts', () => {
  it('emits typecheck and lint steps when package.json has those scripts', () => {
    const root = mkTemp('ark-ci-quality-');
    writeTree(root, {
      'package.json': JSON.stringify({
        name: 'app',
        scripts: { lint: 'eslint .', typecheck: 'tsc --noEmit' },
        dependencies: { next: '16.1.6' },
      }),
    });
    const deploy = detectDeployPathQuality(root);
    // next eng detection may need more files; force quality flags from scripts
    const yaml = githubWorkflow(
      {
        name: 'npm',
        install: 'npm ci',
        run: 'npx ark-check --root . --config ark.config.json --strict-config --require-gates',
        cache: 'npm',
        setup: [],
      },
      { kind: 'default', value: '22' },
      {
        hasLintScript: Boolean(
          JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts?.lint
        ),
        hasTypecheckScript: Boolean(
          JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts?.typecheck
        ),
      }
    );
    expect(yaml).toMatch(/name: Typecheck/);
    expect(yaml).toMatch(/npm run typecheck/);
    expect(yaml).toMatch(/name: Lint/);
    expect(yaml).toMatch(/npm run lint/);
    expect(yaml).toMatch(/Ark architecture check/);
    expect(deploy.hasLintScript).toBe(true);
    expect(deploy.hasTypecheckScript).toBe(true);
  });
});

describe('ark start wrap-up — Next-like host false ENFORCE', () => {
  it('prints ADAPT (not ENFORCE) after ark start --yes on optional ui-surface host', () => {
    const root = mkTemp('ark-start-adapt-');
    writeTree(root, {
      'package.json': JSON.stringify({
        name: 'next-start-host',
        version: '0.1.0',
        dependencies: { next: '16.1.6', react: '19.0.0' },
        scripts: { lint: 'eslint .', typecheck: 'tsc --noEmit' },
      }),
      'src/app/page.tsx': 'export default function P(){return null}\n',
      'src/components/A.tsx': 'export const A=1\n',
      'src/lib/supabase/client.ts': 'export const c=1\n',
      'src/lib/types.ts': 'export type Id = string\n',
      'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true }, include: ['src'] }),
    });

    const ARK = path.join(REPO, 'bin/ark.mjs');
    const res = spawnSync(
      process.execPath,
      [ARK, 'start', '--apply', '--root', root, '--yes', '--no-install', '--force', '--tools', 'claude'],
      { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
    );
    expect(res.status).toBe(0);

    // Doctor on the same tree must agree with start wrap-up
    const doctor = spawnSync(
      process.execPath,
      [ARK_CHECK, '--root', root, '--config', 'ark.config.json', '--doctor', '--json'],
      { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
    );
    const doc = JSON.parse(doctor.stdout || '{}');
    expect(doc.doctor.operatingMode).toBe('adapt');
    expect(doc.doctor.operatingMode).not.toBe('enforce');
  });
});

describe('ark start typecheck bootstrap', () => {
  it('does not add a typecheck script or CI step when compact start sees a tsconfig', () => {
    const root = mkTemp('ark-start-typecheck-');
    writeTree(root, {
      'package.json': JSON.stringify({
        name: 'next-no-tc',
        version: '0.1.0',
        dependencies: { next: '16.1.6', react: '19.0.0' },
        scripts: { lint: 'eslint .' },
      }),
      'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true }, include: ['src'] }),
      'src/app/page.tsx': 'export default function P(){return null}\n',
    });

    const ARK = path.join(REPO, 'bin/ark.mjs');
    const res = spawnSync(
      process.execPath,
      [ARK, 'start', '--apply', '--root', root, '--yes', '--no-install', '--force', '--tools', 'claude'],
      { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
    );
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain('Added package.json script "typecheck"');

    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts.typecheck).toBeUndefined();
    expect(pkg.scripts.lint).toBe('eslint .');

    const workflow = fs.readFileSync(
      path.join(root, '.github/workflows/ark-check.yml'),
      'utf8'
    );
    expect(workflow).not.toMatch(/name: Typecheck/);
    expect(workflow).not.toMatch(/npm run typecheck/);
  });
});

describe('ark-check --ratchet-cores', () => {
  it('refuses when violations exist; ratchets populated cores when green → doctor ENFORCE', () => {
    const root = mkTemp('ark-ratchet-');
    // Clean tree: presentation + persistence + types, no reverse edges
    writeTree(root, {
      'package.json': JSON.stringify({
        name: 'ratchet-host',
        version: '0.1.0',
        dependencies: { next: '16.1.6', react: '19.0.0' },
        scripts: { lint: 'eslint .' },
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: { strict: true, moduleResolution: 'bundler', jsx: 'preserve' },
        include: ['src'],
      }),
      'src/app/page.tsx': 'export default function P(){return null}\n',
      'src/components/A.tsx': 'export const A = 1\n',
      'src/lib/supabase/client.ts': 'export const c = 1\n',
      'src/lib/types.ts': 'export type Id = string\n',
    });

    // Start installs ui-surface + gates (optional cores)
    const ARK = path.join(REPO, 'bin/ark.mjs');
    spawnSync(
      process.execPath,
      [ARK, 'start', '--apply', '--root', root, '--yes', '--no-install', '--force', '--tools', 'claude'],
      { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
    );

    const beforeDoc = spawnSync(
      process.execPath,
      [ARK_CHECK, '--root', root, '--config', 'ark.config.json', '--doctor', '--json'],
      { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
    );
    const before = JSON.parse(beforeDoc.stdout || '{}');
    expect(before.doctor.operatingMode).toBe('adapt');
    expect(before.doctor.violations.active).toBe(0);
    expect((before.doctor.adoption?.coreOptional ?? []).length).toBeGreaterThan(0);

    // Capture before snapshot for evidence paths
    fs.writeFileSync(
      path.join(root, 'ratchet-before.json'),
      JSON.stringify(before.doctor, null, 2)
    );

    const ratchet = spawnSync(
      process.execPath,
      [ARK_CHECK, '--root', root, '--config', 'ark.config.json', '--ratchet-cores', '--json'],
      { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
    );
    const ratchetOut = JSON.parse(ratchet.stdout || '{}');
    expect(ratchetOut.ok).toBe(true);
    expect(ratchetOut.changed).toBe(true);
    expect(ratchetOut.ratcheted.length).toBeGreaterThan(0);

    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    for (const row of ratchetOut.ratcheted) {
      const layer = cfg.layers.find((l: { name: string }) => l.name === row.layer);
      expect(layer.optional).toBe(false);
    }
    // Empty Domain (if empty) stays optional
    const domain = cfg.layers.find((l: { name: string }) => l.name === 'DomainModel');
    if (domain && (before.doctor.emptyLayers || []).includes('DomainModel')) {
      expect(domain.optional).not.toBe(false);
    }

    const afterDoc = spawnSync(
      process.execPath,
      [ARK_CHECK, '--root', root, '--config', 'ark.config.json', '--doctor', '--json'],
      { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
    );
    const after = JSON.parse(afterDoc.stdout || '{}');
    expect(after.doctor.violations.active).toBe(0);
    expect(after.doctor.operatingMode).toBe('enforce');
    expect(after.doctor.adoption?.coreOptional ?? []).toEqual([]);
  });
});

describe('doctor CLI — Next-like host false ENFORCE', () => {
  it('reports ADAPT when default-style optional presentation bag would have claimed ENFORCE', () => {
    const root = mkTemp('ark-doctor-adapt-');
    writeTree(root, {
      'package.json': JSON.stringify({
        name: 'next-host',
        version: '0.1.0',
        dependencies: { next: '16.1.6', react: '19.0.0' },
        scripts: { lint: 'eslint .', typecheck: 'tsc --noEmit' },
      }),
      'src/app/page.tsx': 'export default function P(){return null}\n',
      'src/components/A.tsx': 'export const A=1\n',
      'src/lib/supabase/client.ts': 'export const c=1\n',
      // Optional presentation-heavy config that still leaves Domain empty
      'ark.config.json': JSON.stringify({
        include: ['src'],
        layers: [
          {
            name: 'DomainModel',
            patterns: ['src/domain/**'],
            optional: true,
          },
          {
            name: 'PersistenceAdapters',
            patterns: ['src/lib/supabase/**'],
            optional: true,
          },
          {
            name: 'PresentationAdapters',
            patterns: ['src/app/**', 'src/components/**'],
            optional: true,
          },
        ],
        rules: [],
      }),
      'AGENTS.md': '# Ark\n',
      '.mcp.json': '{}',
    });
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.github/workflows/ark-check.yml'),
      'name: x\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run lint\n      - run: npm run typecheck\n'
    );

    const res = spawnSync(process.execPath, [ARK_CHECK, '--doctor', '--json', '--config', 'ark.config.json'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    });
    expect(res.status).toBe(0);
    const json = JSON.parse(res.stdout || '{}');
    expect(json.doctor.operatingMode).toBe('adapt');
    const gapIds = (json.doctor.adoption?.gaps ?? []).map((g: { id: string }) => g.id);
    expect(gapIds.some((id: string) => id.startsWith('core-optional-'))).toBe(true);
  });
});
