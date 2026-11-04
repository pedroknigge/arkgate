/**
 * Stock pnpm + turbo workspace (#383). The generated monorepo contract must not
 * make the untouched tree red: api may import db, app UI may import a shared
 * schema, and app-local auth/ is Application so App Router routes can import it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startApplyNextLine } from '../../../bin/lib/analysis-completeness.mjs';
import { ARCHITECTURE_PRESETS, writeArkRulesTemplates } from '../../../bin/lib/presets.mjs';
import { matchingLayersForRelativePath } from '../../../src/domain/layerMatch';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = path.join(REPO, 'tests/fixtures/journey/routepack');
const CHECK = path.join(REPO, 'bin/ark-check.mjs');
const ARK = path.join(REPO, 'bin/ark.mjs');
const TMP: string[] = [];

afterEach(() => {
  for (const dir of TMP.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const EDGES = [
  'apps/next/src/app/api/trpc/route.ts',
  'apps/next/src/app/api/auth/route.ts',
  'packages/api/src/rows.ts',
  'packages/api/src/parse.ts',
  'packages/api/src/query.ts',
  'apps/next/src/components/account-form.tsx',
  'apps/next/src/auth/server.ts',
  'apps/expo/src/auth/server.ts',
  'apps/start/src/auth/server.ts',
] as const;

function denied(
  rules: Array<{ from?: string; to?: string; allowed?: boolean }>,
  from: string,
  to: string
) {
  return rules.some((rule) => rule.from === from && rule.to === to && rule.allowed === false);
}

function linkWorkspaces(root: string) {
  const links: Array<[string, string]> = [
    ['@routepack/api', 'packages/api'],
    ['@routepack/auth', 'packages/auth'],
    ['@routepack/db', 'packages/db'],
    ['@routepack/ui', 'packages/ui'],
    ['@routepack/validators', 'packages/validators'],
    ['@routepack/tsconfig', 'tooling/typescript'],
    ['@routepack/next', 'apps/next'],
    ['@routepack/expo', 'apps/expo'],
    ['@routepack/start', 'apps/start'],
    ['@routepack/lint', 'tooling/lint'],
  ];
  for (const [name, rel] of links) {
    const dest = path.join(root, 'node_modules', ...name.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.symlinkSync(path.resolve(root, rel), dest);
  }
}

describe('stock pnpm workspace baseline (#383)', () => {
  it('keeps app-local auth on Application and does not deny api → db or UI → schema', () => {
    const config = ARCHITECTURE_PRESETS.monorepo([], FIXTURE) as {
      layers: Array<{ name: string; patterns?: string[]; exclude?: string[] }>;
      rules: Array<{ from?: string; to?: string; allowed?: boolean }>;
    };
    const names = (rel: string) =>
      matchingLayersForRelativePath(rel, config.layers)
        .map((hit) => hit.layer)
        .sort();
    expect(names('apps/next/src/app/api/trpc/route.ts')).toEqual(['ApplicationOrchestration']);
    expect(names('apps/next/src/auth/server.ts')).toEqual(['ApplicationOrchestration']);
    expect(names('apps/expo/src/auth/server.ts')).toEqual(['ApplicationOrchestration']);
    expect(names('apps/start/src/auth/server.ts')).toEqual(['ApplicationOrchestration']);
    expect(names('apps/next/src/app/page.tsx')).toEqual(['PresentationAdapters']);
    expect(names('apps/next/src/components/account-form.tsx')).toEqual(['PresentationAdapters']);
    expect(names('packages/api/src/rows.ts')).toEqual(['ApplicationOrchestration']);
    expect(names('packages/db/src/schema.ts')).toEqual(['PersistenceAdapters']);
    expect(names('packages/auth/src/index.ts')).toEqual(['PersistenceAdapters']);
    expect(denied(config.rules, 'ApplicationOrchestration', 'PersistenceAdapters')).toBe(false);
    expect(denied(config.rules, 'PresentationAdapters', 'PersistenceAdapters')).toBe(false);
    expect(denied(config.rules, 'DomainModel', 'PersistenceAdapters')).toBe(true);
    expect(denied(config.rules, 'ApplicationOrchestration', 'PresentationAdapters')).toBe(true);
    expect(denied(config.rules, 'PersistenceAdapters', 'PresentationAdapters')).toBe(true);
    const hexagonal = ARCHITECTURE_PRESETS.hexagonal([]) as {
      rules: Array<{ from?: string; to?: string; allowed?: boolean }>;
    };
    expect(denied(hexagonal.rules, 'ApplicationOrchestration', 'PersistenceAdapters')).toBe(true);
    expect(denied(hexagonal.rules, 'PresentationAdapters', 'PersistenceAdapters')).toBe(true);
  });

  it('check on the linked tree exits 0', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-383-'));
    TMP.push(root);
    fs.cpSync(FIXTURE, root, { recursive: true });
    linkWorkspaces(root);
    const config = ARCHITECTURE_PRESETS.monorepo([], root);
    fs.writeFileSync(path.join(root, 'ark.config.json'), `${JSON.stringify(config, null, 2)}\n`);
    writeArkRulesTemplates(root, config);
    const check = spawnSync(process.execPath, [CHECK, '--root', root, '--json', '--no-cache'], {
      cwd: root,
      encoding: 'utf8',
    });
    const parsed = JSON.parse(check.stdout || '{}') as {
      ok?: boolean;
      completeness?: string;
      violations?: Array<{ file?: string; message?: string }>;
    };
    const files = (parsed.violations ?? []).map((row) => `${row.file}: ${row.message}`).sort();
    expect(files, `${check.stdout}\n${check.stderr}`).toEqual([]);
    expect(parsed.completeness, check.stderr).toBe('complete');
    expect(check.status, files.join('\n')).toBe(0);
    expect(parsed.ok).toBe(true);
    for (const edge of EDGES) {
      expect(fs.existsSync(path.join(root, edge)), edge).toBe(true);
    }
  }, 60_000);

  it('names a full install when a tsconfig extend is not linked', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-383-next-'));
    TMP.push(root);
    fs.writeFileSync(
      path.join(root, 'package.json'),
      `${JSON.stringify({ name: 'partial', private: true, packageManager: 'pnpm@10.33.4' })}\n`
    );
    fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
    fs.mkdirSync(path.join(root, 'apps/next/src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'apps/next/tsconfig.json'),
      `${JSON.stringify({ extends: '@routepack/tsconfig/base.json', include: ['src'] })}\n`
    );
    fs.writeFileSync(path.join(root, 'apps/next/src/page.ts'), 'export const page = 1;\n');
    const pending = startApplyNextLine(root, 'ark-check --doctor');
    expect(pending).toContain('`pnpm install`');
    expect(pending).toContain('partial count');
    expect(pending).toContain('ark-check --doctor');
    const applied = spawnSync(
      process.execPath,
      [ARK, 'start', '--root', root, '--apply', '--yes', '--no-install', '--force', '--tools', 'claude', '--preset', 'monorepo'],
      { cwd: root, encoding: 'utf8', env: { ...process.env, ARK_ACTIVE_HOST: 'claude' } }
    );
    const text = `${applied.stdout}\n${applied.stderr}`.replace(/\u001b\[[0-9;]*m/g, '');
    expect(applied.status, text).toBe(0);
    expect(text).toMatch(/Start apply complete\. Next: `pnpm install`, then .*ark-check --doctor/);
    expect(text).toContain('partial count');
    fs.mkdirSync(path.join(root, 'node_modules/@routepack/tsconfig'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'node_modules/@routepack/tsconfig/package.json'),
      '{"name":"@routepack/tsconfig"}\n'
    );
    expect(startApplyNextLine(root, 'ark-check --doctor')).toBe('Start apply complete. Next: ark-check --doctor');
  }, 60_000);
});
