import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHECK = path.resolve('bin/ark-check.mjs');

type CheckResult = {
  status: number;
  ok: boolean;
  violations: Array<{ ruleId: string; target?: string; edgeKind?: string }>;
  warnings: Array<{ ruleId: string }>;
};

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeProject(source: string) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-scanner-corpus-')));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/domain/check.ts'), source);
  fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};\n');
  fs.writeFileSync(
    path.join(root, 'ark.config.json'),
    JSON.stringify({
      include: ['src'],
      layers: [
        {
          name: 'DomainModel',
          patterns: ['src/domain/**'],
          forbiddenGlobals: ['fetch', 'Date.now', 'console'],
        },
        { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
      ],
      rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
    })
  );
  return root;
}

function runCheck(root: string, extraArgs: string[] = []): CheckResult {
  const run = spawnSync(
    process.execPath,
    [CHECK, '--root', root, '--config', 'ark.config.json', '--json', '--no-cache', ...extraArgs],
    { cwd: root, encoding: 'utf8' }
  );
  const result = JSON.parse(run.stdout || '{}') as Omit<CheckResult, 'status'>;
  return { status: run.status ?? 2, ...result };
}

describe('ark-check confirmed scanner bypass corpus', () => {
  it('does not treat locally bound fetch or Date names as ambient globals', () => {
    const root = makeProject(
      [
        'export function load(fetch: (url: string) => string) { return fetch("/orders"); }',
        'const Date = { now: () => 123 };',
        'export const now = Date.now();',
      ].join('\n')
    );

    const result = runCheck(root);

    expect(result.violations.filter((v) => v.ruleId === 'FORBIDDEN_GLOBAL')).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('still catches ambient aliases and explicit globalThis access', () => {
    const root = makeProject(
      [
        'const request = fetch;',
        'export const load = () => request("/orders");',
        'export const now = globalThis.Date.now();',
        'globalThis.console.log(now);',
      ].join('\n')
    );

    const globals = runCheck(root)
      .violations.filter((v) => v.ruleId === 'FORBIDDEN_GLOBAL')
      .map((v) => v.target)
      .sort();

    expect(globals).toEqual(['Date.now', 'console', 'fetch']);
  });

  it('treats TypeScript import-equals require syntax as a dependency edge', () => {
    const root = makeProject(
      'import db = require("../infra/db");\nexport const connection = db;\n'
    );

    const violation = runCheck(root).violations.find(
      (entry) => entry.ruleId === 'LAYER_IMPORT_VIOLATION'
    );

    expect(violation).toMatchObject({ edgeKind: 'require' });
  });

  it('fails strict mode for a non-literal require dependency', () => {
    const root = makeProject(
      'const target = "../infra/db";\nexport const connection = require(target);\n'
    );

    const result = runCheck(root, ['--strict-config']);

    expect(result.status).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.warnings.map((warning) => warning.ruleId)).toContain(
      'DYNAMIC_REQUIRE_NOT_ALLOWLISTED'
    );
  });

  it('continues to resolve and enforce workspace package imports', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-workspace-corpus-')));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'packages/domain/src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'packages/infra/src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'node_modules/@acme'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'workspace-root', private: true, workspaces: ['packages/*'] })
    );
    fs.writeFileSync(
      path.join(root, 'packages/infra/package.json'),
      JSON.stringify({ name: '@acme/infra', main: 'src/index.ts' })
    );
    fs.writeFileSync(path.join(root, 'packages/infra/src/index.ts'), 'export const db = {};\n');
    fs.writeFileSync(
      path.join(root, 'packages/domain/src/order.ts'),
      'import { db } from "@acme/infra";\nexport const orderDb = db;\n'
    );
    fs.symlinkSync(
      path.join(root, 'packages/infra'),
      path.join(root, 'node_modules/@acme/infra'),
      'dir'
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['packages'],
        layers: [
          { name: 'DomainModel', patterns: ['packages/domain/src/**'] },
          { name: 'PersistenceAdapters', patterns: ['packages/infra/src/**'] },
        ],
        rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
      })
    );

    const result = runCheck(root);

    expect(result.violations.some((v) => v.ruleId === 'LAYER_IMPORT_VIOLATION')).toBe(true);
  });
});
