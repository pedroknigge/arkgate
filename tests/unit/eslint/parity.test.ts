/**
 * Dual-driver parity: shipped ESLint rules + shipped ark-check CLI on the same fixtures.
 * Does not re-implement layer resolution in the assertions — only compares outcomes.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  noDomainInfraImports,
  noDeniedCapabilities,
  noForbiddenGlobals,
  layerForRelativePath,
  isEdgeDenied,
  loadArkConfig,
  findConfigPath,
  resolveRelativeImport,
} from '../../../src/eslint/index';

const CHECK = path.resolve('bin/ark-check.mjs');

const HEX_CONFIG = {
  include: ['src'],
  layers: [
    {
      name: 'DomainModel',
      patterns: ['src/domain/**'],
      forbiddenGlobals: ['fetch', 'process', 'Date.now', 'Math.random'],
    },
    { name: 'ApplicationOrchestration', patterns: ['src/application/**'] },
    { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
  ],
  rules: [
    { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
    { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
    { from: 'ApplicationOrchestration', to: 'DomainModel', allowed: true },
    { from: 'ApplicationOrchestration', to: 'PersistenceAdapters', allowed: true },
    { from: 'PersistenceAdapters', to: 'DomainModel', allowed: true },
    { from: 'PersistenceAdapters', to: 'ApplicationOrchestration', allowed: false },
  ],
};

function createContext(filename: string, options?: unknown[]) {
  const reports: Array<Record<string, unknown>> = [];
  return {
    reports,
    context: {
      getFilename: () => filename,
      options,
      report: (descriptor: Record<string, unknown>) => reports.push(descriptor),
    },
  };
}

function runArkCheckJson(root: string) {
  const r = spawnSync(
    process.execPath,
    [CHECK, '--root', root, '--config', 'ark.config.json', '--json', '--no-cache'],
    { encoding: 'utf8' }
  );
  const out = JSON.parse(r.stdout || '{}') as {
    ok: boolean;
    violations: Array<{
      ruleId: string;
      file?: string;
      typeOnly?: boolean;
      target?: string;
    }>;
    diagnostics: Array<Record<string, unknown>>;
    schemaVersion: string;
    completeness: string;
  };
  return { status: r.status ?? 1, ...out };
}

describe('ESLint ↔ ark-check parity', () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const t of temps) {
      try {
        fs.rmSync(t, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    temps.length = 0;
  });

  function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-eslint-parity-'));
    temps.push(root);
    fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify(HEX_CONFIG, null, 2));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/application'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/user.ts'), 'export type User = { id: string };\n');
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = {};\n');
    fs.writeFileSync(
      path.join(root, 'src/application/use-case.ts'),
      "import type { User } from '../domain/user';\nexport function run(u: User) { return u; }\n"
    );
    return root;
  }

  it('forbidden domain→infra value import: ESLint and ark-check both fail', () => {
    const root = fixture();
    const domainFile = path.join(root, 'src/domain/bad.ts');
    fs.writeFileSync(domainFile, "import { db } from '../infra/db';\nexport const x = db;\n");

    const check = runArkCheckJson(root);
    expect(check.ok).toBe(false);
    expect(check.violations.some((v) => v.ruleId === 'LAYER_IMPORT_VIOLATION')).toBe(true);

    const { context, reports } = createContext(domainFile);
    const listener = noDomainInfraImports.create(context);
    listener.ImportDeclaration({
      source: { value: '../infra/db' },
      loc: { start: { line: 1 } },
    });
    expect(reports.length).toBeGreaterThanOrEqual(1);
    expect(reports[0].messageId).toBe('forbiddenImport');
    expect((reports[0].data as { fromLayer: string }).fromLayer).toBe('DomainModel');
    expect((reports[0].data as { toLayer: string }).toLayer).toBe('PersistenceAdapters');
    expect(check.schemaVersion).toBe('1.2');
    expect(check.completeness).toBe('complete');
    expect(reports[0].diagnostic).toEqual(
      check.diagnostics.find((item) => item.ruleId === 'LAYER_IMPORT_VIOLATION')
    );
  });

  it('forbidden domain→infra type-only import: both still flag (same pass/fail as CI)', () => {
    const root = fixture();
    const domainFile = path.join(root, 'src/domain/type-bad.ts');
    fs.writeFileSync(
      domainFile,
      "import type { db as Db } from '../infra/db';\nexport type X = typeof Db;\n"
    );

    const check = runArkCheckJson(root);
    expect(check.ok).toBe(false);
    const layerHits = check.violations.filter((v) => v.ruleId === 'LAYER_IMPORT_VIOLATION');
    expect(layerHits.length).toBeGreaterThan(0);

    const { context, reports } = createContext(domainFile);
    noDomainInfraImports.create(context).ImportDeclaration({
      source: { value: '../infra/db' },
      importKind: 'type',
    });
    expect(reports.length).toBeGreaterThanOrEqual(1);
  });

  it('allowed application→domain import: ESLint and ark-check both pass', () => {
    const root = fixture();
    // use-case.ts already imports domain type — allowed edge
    const check = runArkCheckJson(root);
    expect(check.ok).toBe(true);
    expect(check.violations.filter((v) => v.ruleId === 'LAYER_IMPORT_VIOLATION')).toHaveLength(0);

    const appFile = path.join(root, 'src/application/use-case.ts');
    const { context, reports } = createContext(appFile);
    noDomainInfraImports.create(context).ImportDeclaration({
      source: { value: '../domain/user' },
    });
    expect(reports).toHaveLength(0);
  });

  it('forbidden global in DomainModel: ESLint and ark-check both flag', () => {
    const root = fixture();
    const domainFile = path.join(root, 'src/domain/clock.ts');
    fs.writeFileSync(domainFile, 'export const now = () => Date.now();\n');

    const check = runArkCheckJson(root);
    expect(check.ok).toBe(false);
    expect(check.violations.some((v) => v.ruleId === 'FORBIDDEN_GLOBAL')).toBe(true);

    const { context, reports } = createContext(domainFile);
    const listener = noForbiddenGlobals.create(context);
    listener.MemberExpression({
      object: { type: 'Identifier', name: 'Date' },
      property: { name: 'now' },
      loc: { start: { line: 1 } },
    });
    expect(reports.length).toBeGreaterThanOrEqual(1);
    expect((reports[0].data as { name: string }).name).toBe('Date.now');
    expect(reports[0].diagnostic).toEqual(
      check.diagnostics.find((item) => item.ruleId === 'FORBIDDEN_GLOBAL')
    );
  });

  it('node:process is one FORBIDDEN_GLOBAL across ESLint and ark-check (Y08)', () => {
    const root = fixture();
    const configPath = path.join(root, 'ark.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.layers[0].capabilities = { deny: ['process'] };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    const domainFile = path.join(root, 'src/domain/process.ts');
    fs.writeFileSync(
      domainFile,
      "import process from 'node:process';\nexport const cwd = process.cwd();\n"
    );

    const check = runArkCheckJson(root);
    expect(check.ok).toBe(false);
    expect(check.violations).toEqual([
      expect.objectContaining({
        ruleId: 'FORBIDDEN_GLOBAL',
        target: 'node:process',
      }),
    ]);

    // A rule-local empty fallback must not replace the project contract and
    // create zero voices while the capability rule deduplicates.
    const forbidden = createContext(domainFile, [{ globals: [] }]);
    noForbiddenGlobals.create(forbidden.context).ImportDeclaration({
      source: { value: 'node:process' },
      specifiers: [{ type: 'ImportDefaultSpecifier' }],
      loc: { start: { line: 1 } },
    });
    const wall = createContext(domainFile);
    noDeniedCapabilities.create(wall.context).ImportDeclaration({
      source: { value: 'node:process' },
      specifiers: [{ type: 'ImportDefaultSpecifier' }],
      loc: { start: { line: 1 } },
    });

    expect(forbidden.reports).toHaveLength(1);
    expect(wall.reports).toHaveLength(0);
    expect(forbidden.reports[0].diagnostic).toEqual(
      check.diagnostics.find((item) => item.ruleId === 'FORBIDDEN_GLOBAL')
    );
  });

  it('keeps denied-capability CLI results aligned with every listener form (Y08)', () => {
    const root = fixture();
    const configPath = path.join(root, 'ark.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.layers[0].capabilities = { deny: ['filesystem', 'process'] };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    const domainFile = path.join(root, 'src/domain/capabilities.ts');
    fs.writeFileSync(
      domainFile,
      [
        "import fs from 'node:fs';",
        "import fsEq = require('node:fs');",
        "export { readFile } from 'node:fs';",
        "export * from 'node:fs/promises';",
        "export const lazy = import('node:fs');",
        "export const legacy = require('node:fs');",
        'export const marker = [fs, fsEq];',
      ].join('\n')
    );

    const check = runArkCheckJson(root);
    const cliHits = check.violations.filter(
      (violation) => violation.ruleId === 'CAPABILITY_VIOLATION'
    );
    expect(check.ok).toBe(false);
    expect(cliHits).toHaveLength(6);
    expect(cliHits.map((violation) => violation.target).sort()).toEqual(
      ['node:fs', 'node:fs', 'node:fs', 'node:fs', 'node:fs', 'node:fs/promises'].sort()
    );

    const { context, reports } = createContext(domainFile);
    const listener = noDeniedCapabilities.create(context);
    const expectReport = (visit: () => void) => {
      const before = reports.length;
      visit();
      expect(reports).toHaveLength(before + 1);
    };
    const expectNoReport = (visit: () => void) => {
      const before = reports.length;
      visit();
      expect(reports).toHaveLength(before);
    };

    expectReport(() =>
      listener.ImportDeclaration({
        source: { value: 'node:fs' },
        specifiers: [{ type: 'ImportDefaultSpecifier' }],
      })
    );
    expectNoReport(() =>
      listener.ImportDeclaration({
        source: { value: 'node:fs' },
        importKind: 'type',
        specifiers: [{ type: 'ImportDefaultSpecifier' }],
      })
    );
    expectNoReport(() =>
      listener.ImportDeclaration({
        source: { value: 'node:fs' },
        specifiers: [{ type: 'ImportSpecifier', importKind: 'type' }],
      })
    );
    expectNoReport(() =>
      listener.ImportDeclaration({
        source: { value: 'node:process' },
        specifiers: [{ type: 'ImportDefaultSpecifier' }],
      })
    );
    expectNoReport(() =>
      listener.ImportDeclaration({
        source: { value: 'not-a-capability' },
        specifiers: [{ type: 'ImportDefaultSpecifier' }],
      })
    );
    expectNoReport(() =>
      listener.ImportDeclaration({
        source: { value: 'pg' },
        specifiers: [{ type: 'ImportDefaultSpecifier' }],
      })
    );
    expectReport(() =>
      listener.ImportExpression({ source: { type: 'Literal', value: 'node:fs' } })
    );
    expectNoReport(() =>
      listener.ImportExpression({ source: { type: 'Identifier', value: 'node:fs' } })
    );
    expectReport(() =>
      listener.TSImportEqualsDeclaration({
        moduleReference: { expression: { value: 'node:fs' } },
      } as never)
    );
    expectNoReport(() =>
      listener.TSImportEqualsDeclaration({
        isTypeOnly: true,
        moduleReference: { expression: { value: 'node:fs' } },
      } as never)
    );
    expectReport(() =>
      listener.ExportNamedDeclaration({
        source: { value: 'node:fs' },
        specifiers: [{ exportKind: 'value' }],
      })
    );
    expectNoReport(() =>
      listener.ExportNamedDeclaration({ specifiers: [{ exportKind: 'value' }] })
    );
    expectNoReport(() =>
      listener.ExportNamedDeclaration({
        source: { value: 'node:fs' },
        exportKind: 'type',
        specifiers: [{ exportKind: 'value' }],
      })
    );
    expectReport(() =>
      listener.ExportAllDeclaration({ source: { value: 'node:fs' } })
    );
    expectNoReport(() =>
      listener.ExportAllDeclaration({ source: { value: 'node:fs' }, exportKind: 'type' })
    );
    expectReport(() =>
      listener.CallExpression({
        callee: { type: 'Identifier', name: 'require' },
        arguments: [{ type: 'Literal', value: 'node:fs' }],
      })
    );
    expectNoReport(() =>
      listener.CallExpression({
        callee: { type: 'Identifier', name: 'require' },
        arguments: [{ type: 'Identifier', name: 'moduleName' }],
      })
    );

    expect(reports).toHaveLength(6);
    expect(
      reports.every(
        (report) =>
          report.messageId === 'deniedCapability' &&
          (report.data as { specifier: string }).specifier === 'node:fs' &&
          (report.data as { capability: string }).capability === 'filesystem' &&
          (report.diagnostic as { ruleId: string }).ruleId === 'CAPABILITY_VIOLATION'
      )
    ).toBe(true);

    const local = createContext(domainFile);
    Object.assign(local.context, {
      sourceCode: {
        getScope: () => ({ set: new Map([['require', { defs: [{}] }]]) }),
      },
    });
    noDeniedCapabilities.create(local.context).CallExpression({
      callee: { type: 'Identifier', name: 'require' },
      arguments: [{ type: 'Literal', value: 'node:fs' }],
    });
    expect(local.reports).toHaveLength(0);
  });

  it('treats pure layers as denying every import capability (Y08)', () => {
    const root = fixture();
    const configPath = path.join(root, 'ark.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.layers[0].pure = true;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    const domainFile = path.join(root, 'src/domain/pure.ts');
    fs.writeFileSync(domainFile, 'export const marker = true;\n');

    const { context, reports } = createContext(domainFile);
    noDeniedCapabilities.create(context).ImportDeclaration({
      source: { value: 'node:fs' },
      specifiers: [{ type: 'ImportDefaultSpecifier' }],
    });

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      messageId: 'deniedCapability',
      data: {
        layer: 'DomainModel',
        capability: 'filesystem',
        specifier: 'node:fs',
      },
    });
  });

  it('shipped helpers agree with config for layer + edge checks', () => {
    const root = fixture();
    const cfgPath = findConfigPath(path.join(root, 'src/domain/user.ts'));
    expect(cfgPath).toBeTruthy();
    const cfg = loadArkConfig(cfgPath!);
    expect(cfg).toBeTruthy();
    expect(layerForRelativePath('src/domain/user.ts', cfg!.layers)).toBe('DomainModel');
    expect(layerForRelativePath('src/infra/db.ts', cfg!.layers)).toBe('PersistenceAdapters');
    expect(isEdgeDenied(cfg!.rules, 'DomainModel', 'PersistenceAdapters')).toBe(true);
    expect(isEdgeDenied(cfg!.rules, 'ApplicationOrchestration', 'DomainModel')).toBe(false);
    const resolved = resolveRelativeImport(
      path.join(root, 'src/domain/bad.ts'),
      '../infra/db'
    );
    expect(resolved && fs.existsSync(resolved)).toBe(true);
  });

  it('ESLint-10 shaped context (filename only, no getFilename) still loads ark.config.json', () => {
    // ESLint 10 removed context.getFilename(); only context.filename / physicalFilename remain.
    const root = fixture();
    const domainFile = path.join(root, 'src/domain/eslint10.ts');
    fs.writeFileSync(domainFile, "import { db } from '../infra/db';\nexport const x = db;\n");

    const check = runArkCheckJson(root);
    expect(check.ok).toBe(false);
    expect(check.violations.some((v) => v.ruleId === 'LAYER_IMPORT_VIOLATION')).toBe(true);

    const reports: Array<Record<string, unknown>> = [];
    const eslint10Context = {
      // No getFilename — must use .filename
      filename: domainFile,
      report: (descriptor: Record<string, unknown>) => reports.push(descriptor),
    };
    noDomainInfraImports.create(eslint10Context).ImportDeclaration({
      source: { value: '../infra/db' },
    });
    expect(reports.length).toBeGreaterThanOrEqual(1);
    expect(reports[0].messageId).toBe('forbiddenImport');
    expect((reports[0].data as { fromLayer: string }).fromLayer).toBe('DomainModel');
    expect((reports[0].data as { toLayer: string }).toLayer).toBe('PersistenceAdapters');

    const globalReports: Array<Record<string, unknown>> = [];
    const purityFile = path.join(root, 'src/domain/eslint10-globals.ts');
    fs.writeFileSync(purityFile, 'export const t = Date.now();\n');
    noForbiddenGlobals
      .create({
        filename: purityFile,
        report: (d: Record<string, unknown>) => globalReports.push(d),
      })
      .MemberExpression?.({
        object: { type: 'Identifier', name: 'Date' },
        property: { name: 'now' },
      });
    expect(globalReports.length).toBeGreaterThanOrEqual(1);
    expect((globalReports[0].data as { name: string }).name).toBe('Date.now');
  });

  it('physicalFilename is preferred when both physicalFilename and filename are set', () => {
    const root = fixture();
    const real = path.join(root, 'src/domain/phys.ts');
    fs.writeFileSync(real, "import { db } from '../infra/db';\nexport const x = db;\n");
    const reports: Array<Record<string, unknown>> = [];
    noDomainInfraImports
      .create({
        filename: '/virtual/does-not-exist.ts',
        physicalFilename: real,
        report: (d: Record<string, unknown>) => reports.push(d),
      })
      .ImportDeclaration({ source: { value: '../infra/db' } });
    expect(reports[0]?.messageId).toBe('forbiddenImport');
  });
});
