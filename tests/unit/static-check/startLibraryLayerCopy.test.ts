/**
 * Issue #213: library / package-monorepo start must not emit Next-flavored
 * layer captions (or doctor coverage blurbs) unless Next is actually present.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyFrameworkLayoutOverlays,
  isLibraryPackageMonorepo,
  LIBRARY_LAYER_DESCRIPTIONS,
  NEXT_LAYER_DESCRIPTIONS,
  collectRepoShapeSignals,
} from '../../../bin/ark-shared.mjs';
import { ARCHITECTURE_PRESETS } from '../../../bin/lib/presets.mjs';

const ARK = path.resolve('bin/ark.mjs');
const ARK_CHECK = path.resolve('bin/ark-check.mjs');
const TMP_ROOTS: string[] = [];
const NEXT_COPY = /Next App Router|Pages API|`?app\/api`?|`?pages\/api`?/i;

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

function runArk(file: string, args: string[], root: string) {
  return spawnSync(process.execPath, [file, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ARK_ACTIVE_HOST: 'claude', CODEX_HOME: path.join(root, '.codex-home') },
  });
}

function layerDescriptions(config: {
  layers?: Array<{ name: string; description?: string }>;
}): string {
  return (config.layers ?? [])
    .map((layer) => `${layer.name}: ${layer.description ?? ''}`)
    .join('\n');
}

function seedZodClassLibraryMonorepo(root: string) {
  write(
    root,
    'package.json',
    JSON.stringify(
      {
        name: 'zod-class-fixture',
        private: true,
        workspaces: ['packages/*'],
      },
      null,
      2
    )
  );
  write(
    root,
    'packages/core/package.json',
    JSON.stringify({ name: '@fixture/core', type: 'module', exports: './src/index.ts' }, null, 2)
  );
  write(root, 'packages/core/src/index.ts', 'export const schema = true;\n');
  write(root, 'packages/core/src/parse.ts', 'export const parse = (v: unknown) => v;\n');
  write(root, 'packages/core/src/types.ts', 'export type Schema = { ok: true };\n');
  write(
    root,
    'packages/mini/package.json',
    JSON.stringify({ name: '@fixture/mini', type: 'module', exports: './src/index.ts' }, null, 2)
  );
  write(root, 'packages/mini/src/index.ts', 'export const mini = true;\n');
}

function seedNextApp(root: string) {
  write(
    root,
    'package.json',
    JSON.stringify({ name: 'next-app-fixture', dependencies: { next: '15.0.0', react: '19.0.0' } }, null, 2)
  );
  write(root, 'next.config.js', 'module.exports = {}\n');
  write(root, 'src/app/page.tsx', 'export default function Page() { return null }\n');
  write(root, 'src/app/api/health/route.ts', 'export async function GET() { return Response.json({ ok: true }) }\n');
}

afterEach(() => {
  while (TMP_ROOTS.length > 0) {
    const root = TMP_ROOTS.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('start library layer copy (#213)', () => {
  it('preset defaults no longer hardcode Next App Router / Pages API captions', () => {
    const monorepo = ARCHITECTURE_PRESETS.monorepo();
    const ui = ARCHITECTURE_PRESETS['ui-surface']();
    expect(layerDescriptions(monorepo)).not.toMatch(NEXT_COPY);
    expect(layerDescriptions(ui)).not.toMatch(NEXT_COPY);
  });

  it('classifies a packages/* library monorepo as library-shaped, not Next', () => {
    const root = tmpRoot('ark-213-signals-');
    seedZodClassLibraryMonorepo(root);
    const signals = collectRepoShapeSignals(root);
    expect(signals.nextFramework).toBe(false);
    expect(isLibraryPackageMonorepo(signals)).toBe(true);
  });

  it('overlay writes library-native captions on a zod-class tree', () => {
    const root = tmpRoot('ark-213-overlay-lib-');
    seedZodClassLibraryMonorepo(root);
    const config = applyFrameworkLayoutOverlays(ARCHITECTURE_PRESETS.monorepo([], root), root);
    const blob = layerDescriptions(config);
    expect(blob).not.toMatch(NEXT_COPY);
    expect(config.layers.find((l) => l.name === 'ApplicationOrchestration')?.description).toBe(
      LIBRARY_LAYER_DESCRIPTIONS.ApplicationOrchestration
    );
    expect(config.layers.find((l) => l.name === 'PresentationAdapters')?.description).toBe(
      LIBRARY_LAYER_DESCRIPTIONS.PresentationAdapters
    );
  });

  it('overlay writes Next captions when Next is detected', () => {
    const root = tmpRoot('ark-213-overlay-next-');
    seedNextApp(root);
    const config = applyFrameworkLayoutOverlays(ARCHITECTURE_PRESETS.monorepo([], root), root);
    expect(config.frameworkOverlay).toMatch(/next/);
    expect(config.layers.find((l) => l.name === 'ApplicationOrchestration')?.description).toBe(
      NEXT_LAYER_DESCRIPTIONS.ApplicationOrchestration
    );
    expect(config.layers.find((l) => l.name === 'PresentationAdapters')?.description).toBe(
      NEXT_LAYER_DESCRIPTIONS.PresentationAdapters
    );
    expect(layerDescriptions(config)).toMatch(/Next App Router/);
  });

  it('start --apply on a library monorepo does not mention Next in config or doctor', () => {
    const root = tmpRoot('ark-213-start-lib-');
    seedZodClassLibraryMonorepo(root);
    const applied = runArk(
      ARK,
      ['start', '--root', root, '--tools', 'claude', '--yes', '--no-install', '--apply'],
      root
    );
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0);

    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8')) as {
      layers: Array<{ name: string; description?: string }>;
    };
    const configBlob = layerDescriptions(config);
    expect(configBlob).not.toMatch(NEXT_COPY);
    expect(configBlob).toContain(LIBRARY_LAYER_DESCRIPTIONS.ApplicationOrchestration);

    const doctorJson = runArk(ARK_CHECK, ['--root', root, '--doctor', '--json'], root);
    expect(doctorJson.status, `${doctorJson.stdout}\n${doctorJson.stderr}`).toBe(0);
    const payload = JSON.parse(doctorJson.stdout) as {
      doctor?: { layers?: Array<{ name: string; description?: string }> };
      coverage?: { layers?: Array<{ name: string; description?: string }> };
    };
    const captionBlob = [
      layerDescriptions({ layers: payload.doctor?.layers }),
      layerDescriptions({ layers: payload.coverage?.layers }),
    ].join('\n');
    expect(captionBlob).not.toMatch(NEXT_COPY);
    expect(captionBlob).toContain(LIBRARY_LAYER_DESCRIPTIONS.ApplicationOrchestration);

    const doctorHuman = runArk(ARK_CHECK, ['--root', root, '--doctor'], root);
    expect(doctorHuman.status, `${doctorHuman.stdout}\n${doctorHuman.stderr}`).toBe(0);
    const coverageLines = `${doctorHuman.stdout}\n${doctorHuman.stderr}`
      .split('\n')
      .filter((line) => /ApplicationOrchestration|PresentationAdapters/.test(line))
      .join('\n');
    expect(coverageLines).not.toMatch(NEXT_COPY);
  }, 120_000);

  it('start --apply on a Next app still writes Next-flavored guidance', () => {
    const root = tmpRoot('ark-213-start-next-');
    seedNextApp(root);
    const applied = runArk(
      ARK,
      ['start', '--root', root, '--tools', 'claude', '--yes', '--no-install', '--apply'],
      root
    );
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0);
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8')) as {
      layers: Array<{ name: string; description?: string }>;
      frameworkOverlay?: string;
    };
    expect(config.frameworkOverlay).toMatch(/next/);
    expect(layerDescriptions(config)).toMatch(/Next App Router/);
    expect(layerDescriptions(config)).toMatch(/Pages API/);
  }, 120_000);
});
