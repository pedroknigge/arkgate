/**
 * Issue #269: monorepo start must not dump whole-app roots onto DomainModel,
 * and doctor #1 must name overlapping globs when dual-match is huge.
 */
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ARCHITECTURE_PRESETS } from '../../../bin/lib/presets.mjs';
import {
  collectDoctorNextActions,
  dualMatchNeedsGlobRepair,
  overlappingGlobNextAction,
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
  }, 120_000);
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
