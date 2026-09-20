/**
 * #288 — stranger-path UI label honesty + start layer placement.
 * When uiHeavy / a web UI package is present, recommend must not say
 * "without UI", and monorepo start must not park web/** on Application.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ARCHITECTURE_PRESETS } from '../../../bin/lib/presets.mjs';
import { layerForRelativePath } from '../../../bin/ark-layer-match.mjs';
import {
  buildArchitectureRecommendation,
  collectRepoShapeSignals,
  honestArchetypeLabel,
  isUiApplicationSource,
  isUiPackageUnit,
  sourcePathLooksLikeUi,
} from '../../../bin/ark-shared.mjs';

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

/** Nest API + React web package — api-backend can still win, but UI is real. */
function seedApiUiMonorepo(root: string) {
  write(
    root,
    'package.json',
    JSON.stringify({ name: 'photo-mono', private: true, packageManager: 'pnpm@9.12.0' }, null, 2)
  );
  write(root, 'pnpm-workspace.yaml', 'packages:\n  - server\n  - web\n');
  write(
    root,
    'server/package.json',
    JSON.stringify(
      {
        name: '@photo/server',
        dependencies: { '@nestjs/common': '^11', '@nestjs/core': '^11', prisma: '^6' },
      },
      null,
      2
    )
  );
  write(root, 'server/src/app.module.ts', 'export class AppModule {}\n');
  write(root, 'server/src/app.controller.ts', 'export class AppController {}\n');
  write(root, 'server/src/app.service.ts', 'export class AppService {}\n');
  write(root, 'server/src/photos.controller.ts', 'export class PhotosController {}\n');
  write(root, 'server/src/repositories/photo-repo.ts', 'export class PhotoRepo {}\n');
  write(root, 'server/src/application/list-photos.ts', 'export function listPhotos() {}\n');
  write(
    root,
    'web/package.json',
    JSON.stringify(
      { name: '@photo/web', dependencies: { react: '^19', 'react-dom': '^19' } },
      null,
      2
    )
  );
  write(root, 'web/src/components/Gallery.tsx', 'export const Gallery = () => null;\n');
  write(root, 'web/src/components/Photo.tsx', 'export const Photo = () => null;\n');
  write(root, 'web/src/ui/Thumb.tsx', 'export const Thumb = () => null;\n');
  write(root, 'web/src/main.tsx', 'export const boot = () => null;\n');
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('honestArchetypeLabel (#288)', () => {
  it('leaves the playbook label alone when there is no heavy UI', () => {
    expect(
      honestArchetypeLabel('API server without UI in this repository', {
        uiHeavy: false,
        apiSurface: true,
      })
    ).toBe('API server without UI in this repository');
  });

  it('does not say without UI when uiHeavy is true', () => {
    expect(
      honestArchetypeLabel('API server without UI in this repository', {
        uiHeavy: true,
        apiSurface: true,
        workspaces: true,
      })
    ).toBe('API-heavy monorepo with UI packages');
    expect(
      honestArchetypeLabel('API server without UI in this repository', {
        uiHeavy: true,
        apiSurface: true,
        workspaces: false,
      })
    ).not.toMatch(/without UI/i);
  });
});

describe('UI package source routing (#288)', () => {
  it('treats web/frontend/client/ui path tokens as UI', () => {
    expect(sourcePathLooksLikeUi('web/src')).toBe(true);
    expect(sourcePathLooksLikeUi('apps/web')).toBe(true);
    expect(sourcePathLooksLikeUi('frontend')).toBe(true);
    expect(sourcePathLooksLikeUi('server/src')).toBe(false);
    expect(isUiPackageUnit({ root: 'web', role: 'application', productionDeps: {} })).toBe(true);
    expect(
      isUiPackageUnit({
        root: 'apps/photo',
        role: 'application',
        productionDeps: { react: '^19' },
      })
    ).toBe(true);
    expect(
      isUiApplicationSource({ root: '.', role: 'application', productionDeps: {} }, 'web')
    ).toBe(true);
    expect(
      isUiApplicationSource(
        { root: 'server', role: 'application', productionDeps: { '@nestjs/core': '^11' } },
        'src'
      )
    ).toBe(false);
  });
});

describe('#288 recommend label vs uiHeavy', () => {
  it('does not print “without UI” when uiHeavy and a web package are present', () => {
    const root = tmp('ark-288-label-');
    seedApiUiMonorepo(root);

    const signals = collectRepoShapeSignals(root);
    expect(signals.ui).toBe(true);
    expect(signals.uiHeavy).toBe(true);
    expect(signals.workspaces).toBe(true);
    expect(signals.nestFramework).toBe(true);
    expect(signals.repoUnits.some((unit) => unit.root === 'web')).toBe(true);

    const rec = buildArchitectureRecommendation(root);
    expect(rec.signals.uiHeavy).toBe(true);
    expect(rec.label).not.toMatch(/without UI/i);
    expect(rec.label).toMatch(/UI/i);
    expect(rec.matchedSignals).toContain('!uiHeavy');
    expect(rec.why.join('\n')).toMatch(/heavy UI surface/i);
    expect(rec.why.join('\n')).not.toMatch(/without UI/i);
    expect(JSON.stringify(rec.evidence)).not.toMatch(/without UI/i);
  });

  it('--recommend --json label is consistent with uiHeavy evidence', () => {
    const root = tmp('ark-288-cli-');
    seedApiUiMonorepo(root);
    const stdout = execFileSync(process.execPath, [ARK_CHECK, '--root', root, '--recommend', '--json'], {
      encoding: 'utf8',
    });
    const rec = JSON.parse(stdout) as {
      label: string;
      archetype: string;
      matchedSignals: string[];
      why: string[];
      evidence?: Array<{ signal: string; effect: string; explanation: string }>;
      signals?: { uiHeavy?: boolean; ui?: boolean };
    };
    expect(rec.signals?.uiHeavy).toBe(true);
    expect(rec.label).not.toMatch(/without UI/i);
    expect(rec.matchedSignals).toContain('!uiHeavy');
    expect(rec.evidence?.some((row) => row.signal === 'uiHeavy' && row.effect === 'negative')).toBe(
      true
    );
    expect(rec.why.join('\n')).not.toMatch(/without UI/i);
  });

  it('keeps the without-UI playbook label on a true API-only tree', () => {
    const root = tmp('ark-288-api-only-');
    write(root, 'package.json', JSON.stringify({ name: 'api', version: '0.0.0' }));
    write(root, 'src/routes/orders.ts', 'export function list() {}\n');
    write(root, 'src/repositories/order-repo.ts', 'export class OrderRepo {}\n');
    write(root, 'src/application/place-order.ts', 'export function place() {}\n');
    const rec = buildArchitectureRecommendation(root);
    expect(rec.archetype).toBe('api-backend');
    expect(rec.signals.uiHeavy).toBeFalsy();
    expect(rec.label).toBe('API server without UI in this repository');
  });
});

describe('#288 monorepo start does not park web/ on Application', () => {
  it('puts web/** and web/src/** on PresentationAdapters', () => {
    const root = tmp('ark-288-preset-');
    seedApiUiMonorepo(root);
    const config = ARCHITECTURE_PRESETS.monorepo([], root) as {
      layers: Array<{ name: string; patterns: string[] }>;
    };
    const application =
      config.layers.find((layer) => layer.name === 'ApplicationOrchestration')?.patterns ?? [];
    const presentation =
      config.layers.find((layer) => layer.name === 'PresentationAdapters')?.patterns ?? [];
    expect(application).not.toEqual(expect.arrayContaining(['web/**', 'web/src/**']));
    expect(presentation).toEqual(expect.arrayContaining(['web/**', 'web/src/**']));
    expect(application).toEqual(expect.arrayContaining(['server/src/**']));
    expect(layerForRelativePath('web/src/main.tsx', config.layers)).toBe('PresentationAdapters');
    expect(layerForRelativePath('web/src/components/Gallery.tsx', config.layers)).toBe(
      'PresentationAdapters'
    );
    expect(layerForRelativePath('server/src/application/list-photos.ts', config.layers)).toBe(
      'ApplicationOrchestration'
    );
  });

  it('Next API routes under apps/web still win Application over the UI package bag', () => {
    const root = tmp('ark-288-next-api-');
    write(
      root,
      'package.json',
      JSON.stringify({ name: 'apps-mono', private: true, workspaces: ['apps/*'] }, null, 2)
    );
    write(
      root,
      'apps/web/package.json',
      JSON.stringify({ name: 'web', dependencies: { next: '16', react: '^19' } }, null, 2)
    );
    write(root, 'apps/web/src/app/page.tsx', 'export default function Page() { return null; }\n');
    write(root, 'apps/web/src/app/api/health/route.ts', 'export function GET() { return null; }\n');
    write(root, 'apps/web/src/components/A.tsx', 'export const A = () => null;\n');
    write(root, 'apps/web/src/components/B.tsx', 'export const B = () => null;\n');
    write(root, 'apps/web/src/components/C.tsx', 'export const C = () => null;\n');
    const config = ARCHITECTURE_PRESETS.monorepo([], root);
    expect(layerForRelativePath('apps/web/src/app/api/health/route.ts', config.layers)).toBe(
      'ApplicationOrchestration'
    );
    expect(layerForRelativePath('apps/web/src/app/page.tsx', config.layers)).toBe(
      'PresentationAdapters'
    );
    const application =
      config.layers.find((layer) => layer.name === 'ApplicationOrchestration')?.patterns ?? [];
    expect(application.some((pattern) => /^apps\/web(\/src)?\/\*\*$/.test(pattern))).toBe(false);
  });
});
