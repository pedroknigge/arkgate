/**
 * Soft no-Domain / all-logic-in-frontend residual. Silent unless Domain is
 * declared empty and the UI holds the rules. Never a gate fail.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  NO_DOMAIN_FRONTEND_ASK,
  NO_DOMAIN_FRONTEND_NEXT,
  collectNoDomainFrontendResidual,
  isPresentationRoleLayerName,
} from '../../../bin/lib/no-domain-frontend.mjs';
import { runDoctor } from '../../../bin/lib/doctor-plan.mjs';

const temps: string[] = [];

function mk(prefix = 'ark-ndf-'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(root);
  return root;
}

afterEach(() => {
  for (const root of temps.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function writeFile(root: string, rel: string, body: string) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body);
}

function hexagonalConfig() {
  return {
    include: ['src'],
    layers: [
      { name: 'DomainModel', patterns: ['src/domain/**'] },
      { name: 'PresentationAdapters', patterns: ['src/components/**', 'src/pages/**'] },
    ],
    rules: [],
  };
}

function coverage(layers: { name: string; files: number }[], totalFiles: number, emptyLayers: string[]) {
  return {
    totalFiles,
    governed: { totalFiles, classifiedFiles: totalFiles, percent: 100 },
    layers,
    emptyLayers,
  };
}

describe('no-domain / frontend residual helper', () => {
  it('names presentation-role houses and stays quiet on Domain or backend-only shapes', () => {
    expect(isPresentationRoleLayerName('PresentationAdapters')).toBe(true);
    expect(isPresentationRoleLayerName('FrontendUi')).toBe(true);
    expect(isPresentationRoleLayerName('DomainModel')).toBe(false);
    expect(collectNoDomainFrontendResidual({})).toBeNull();
    expect(
      collectNoDomainFrontendResidual({
        config: hexagonalConfig(),
        coverage: coverage(
          [
            { name: 'DomainModel', files: 4 },
            { name: 'PresentationAdapters', files: 12 },
          ],
          16,
          []
        ),
      })
    ).toBeNull();
    expect(
      collectNoDomainFrontendResidual({
        config: hexagonalConfig(),
        coverage: coverage([{ name: 'DomainModel', files: 0 }], 3, ['DomainModel']),
      })
    ).toBeNull();
  });

  it('fires when Domain is empty and the UI bag is the tree, or a UI rule smell is already present', () => {
    const bag = collectNoDomainFrontendResidual({
      config: hexagonalConfig(),
      coverage: coverage(
        [
          { name: 'DomainModel', files: 0 },
          { name: 'PresentationAdapters', files: 8 },
        ],
        10,
        ['DomainModel']
      ),
    });
    expect(bag?.kind).toBe('presentation-bag');
    expect(bag?.ask).toBe(NO_DOMAIN_FRONTEND_ASK);
    expect(bag?.nextAction).toBe(NO_DOMAIN_FRONTEND_NEXT);
    expect(bag?.ask).not.toMatch(/Haken|ξ|xiHash/i);
    expect(bag?.nextAction).not.toMatch(/Haken|ξ|xiHash/i);

    const thin = collectNoDomainFrontendResidual({
      config: hexagonalConfig(),
      coverage: coverage(
        [
          { name: 'DomainModel', files: 0 },
          { name: 'PresentationAdapters', files: 2 },
        ],
        8,
        ['DomainModel']
      ),
    });
    expect(thin).toBeNull();

    const uiLogic = collectNoDomainFrontendResidual({
      config: hexagonalConfig(),
      coverage: coverage(
        [
          { name: 'DomainModel', files: 0 },
          { name: 'PresentationAdapters', files: 1 },
        ],
        4,
        ['DomainModel']
      ),
      designSmells: [{ id: 'domain-logic-in-ui' }],
    });
    expect(uiLogic?.kind).toBe('ui-logic');
    expect(uiLogic?.nextAction).toContain('/ark-place');
  });
});

describe('doctor residual', () => {
  it('omits noDomainFrontend unless Domain is empty and the UI holds the rules', () => {
    const quiet = mk('ark-ndf-doc-q-');
    writeFile(quiet, 'src/domain/value.ts', 'export const value = 1;\n');
    writeFile(quiet, 'src/components/Page.tsx', 'export const Page = () => null;\n');
    fs.writeFileSync(path.join(quiet, 'ark.config.json'), JSON.stringify(hexagonalConfig()));
    const quietFiles = [
      path.join(quiet, 'src/domain/value.ts'),
      path.join(quiet, 'src/components/Page.tsx'),
    ];
    let silent: { doctor?: { noDomainFrontend?: { kind?: string }; ok?: boolean }; ok?: boolean } | undefined;
    runDoctor(quiet, hexagonalConfig(), quietFiles, [], [], true, {
      completeness: 'complete',
      writeJson: (text: string) => {
        silent = JSON.parse(text);
      },
    });
    expect(silent?.doctor?.noDomainFrontend).toBeUndefined();
    expect(silent?.ok).toBe(true);

    const bag = mk('ark-ndf-doc-b-');
    writeFile(bag, 'src/components/a.tsx', 'export const A = () => null;\n');
    writeFile(bag, 'src/components/b.tsx', 'export const B = () => null;\n');
    writeFile(bag, 'src/pages/home.tsx', 'export const Home = () => null;\n');
    fs.mkdirSync(path.join(bag, 'src/domain'), { recursive: true });
    fs.writeFileSync(path.join(bag, 'ark.config.json'), JSON.stringify(hexagonalConfig()));
    const bagFiles = [
      path.join(bag, 'src/components/a.tsx'),
      path.join(bag, 'src/components/b.tsx'),
      path.join(bag, 'src/pages/home.tsx'),
    ];
    let fired: { doctor?: { noDomainFrontend?: { kind?: string; nextAction?: string } }; ok?: boolean } | undefined;
    runDoctor(bag, hexagonalConfig(), bagFiles, [], [], true, {
      completeness: 'complete',
      writeJson: (text: string) => {
        fired = JSON.parse(text);
      },
    });
    expect(fired?.ok).toBe(true);
    expect(fired?.doctor?.noDomainFrontend?.kind).toBe('presentation-bag');
    expect(fired?.doctor?.noDomainFrontend?.nextAction).toContain('/ark-place');
  });
});

describe('live doctor CLI', () => {
  it('prints the next step when Domain is empty and the UI holds the tree, and stays quiet otherwise', () => {
    const missing = mk('ark-ndf-cli-m-');
    writeFile(missing, 'src/components/a.tsx', 'export const A = () => null;\n');
    writeFile(missing, 'src/components/b.tsx', 'export const B = () => null;\n');
    writeFile(missing, 'src/pages/home.tsx', 'export const Home = () => null;\n');
    fs.mkdirSync(path.join(missing, 'src/domain'), { recursive: true });
    fs.writeFileSync(path.join(missing, 'ark.config.json'), JSON.stringify(hexagonalConfig()));
    const missingOut = execFileSync(
      process.execPath,
      [path.resolve('bin/ark-check.mjs'), '--root', missing, '--doctor'],
      { encoding: 'utf8' }
    );
    expect(missingOut).toContain(NO_DOMAIN_FRONTEND_ASK);
    expect(missingOut).toContain('/ark-place');
    expect(missingOut).not.toMatch(/Haken|ξ/);

    const quiet = mk('ark-ndf-cli-q-');
    writeFile(quiet, 'src/domain/value.ts', 'export const value = 1;\n');
    writeFile(quiet, 'src/components/Page.tsx', 'export const Page = () => null;\n');
    fs.writeFileSync(path.join(quiet, 'ark.config.json'), JSON.stringify(hexagonalConfig()));
    const quietOut = execFileSync(
      process.execPath,
      [path.resolve('bin/ark-check.mjs'), '--root', quiet, '--doctor'],
      { encoding: 'utf8' }
    );
    expect(quietOut).not.toContain(NO_DOMAIN_FRONTEND_ASK);
  });
});
