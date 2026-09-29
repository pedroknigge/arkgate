/**
 * Editor ↔ ark-check parity through an ESLint-shaped runner (configs.recommended severities,
 * real ESTree from acorn, ESLint message interpolation and 1-based columns).
 *
 * Regression suite for the ESLint adapter audit: per-edge severity (advisory → warn rule),
 * rendered messages (rule message + slice reason, ArkOrder text), ArkOrder Domain-role
 * detection, invalid contracts, ArkRules structure, publish-source scope, forbidden globals
 * (bracket + destructuring), and editor-buffer `new` facts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import plugin, { contractFingerprint } from '../../../src/eslint/index';
import { errorCount, lintText, type LintMessage } from './eslintHarness';

const CHECK = path.resolve('bin/ark-check.mjs');
const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function project(name: string, config: unknown, files: Record<string, string>): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `ark-eslint-${name}-`)));
  temps.push(root);
  if (config !== null) {
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      typeof config === 'string' ? config : JSON.stringify(config, null, 2)
    );
  }
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

type CliDiagnostic = {
  ruleId: string;
  severity: string;
  message: string;
  location: { file: string; line: number };
};

function arkCheck(root: string) {
  const result = spawnSync(
    process.execPath,
    [CHECK, '--root', root, '--config', 'ark.config.json', '--json', '--no-cache'],
    { encoding: 'utf8' }
  );
  let parsed: { ok?: boolean; diagnostics?: CliDiagnostic[] } = {};
  try {
    parsed = JSON.parse(result.stdout || '{}');
  } catch {
    parsed = {};
  }
  return {
    status: result.status ?? 1,
    ok: parsed.ok === true,
    diagnostics: parsed.diagnostics ?? [],
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

function lintFile(root: string, rel: string, text?: string): LintMessage[] {
  const abs = path.join(root, rel);
  return lintText(plugin, abs, text ?? fs.readFileSync(abs, 'utf8'));
}

function warnings(messages: LintMessage[]): LintMessage[] {
  return messages.filter((message) => message.severity === 1);
}

describe('ArkOrder rules render ark-check text at real positions', () => {
  const orderConfig = (mode: 'enforced' | 'advisory') => ({
    schemaVersion: '1.3',
    include: ['src'],
    layers: [
      { name: 'DomainModel', patterns: ['src/domain/**'] },
      { name: 'Core', patterns: ['src/core/**'], intentPrefixes: ['Domain.'] },
      { name: 'App', patterns: ['src/application/**', 'src/main.ts'] },
    ],
    rules: [{ from: 'App', to: 'DomainModel', allowed: true }],
    arkOrder: { mode, planeRoots: ['src/main.ts'], managedLayers: ['App'] },
  });
  const files = {
    'src/main.ts':
      "import { createOrderPlane } from 'arkgate/order';\nexport const plane = createOrderPlane({});\n",
    'src/domain/order.ts': "import { createOrderPlane } from 'arkgate/order';\nexport const x = createOrderPlane;\n",
    'src/core/billing.ts': "import { createOrderPlane } from 'arkgate/order';\nexport const y = createOrderPlane;\n",
    'src/application/billing.ts':
      "export function upgrade(plane) {\n    plane.update({ plan: 'pro' });\n}\n",
  };

  it('enforced: messages equal ark-check, columns are 1-based, Domain.* intentPrefixes count', () => {
    const root = project('order', orderConfig('enforced'), files);
    const cli = arkCheck(root);
    const cliOrder = cli.diagnostics.filter((d) =>
      ['ARKORDER_KERNEL_IN_DOMAIN', 'ARKORDER_GENERIC_UPDATE'].includes(d.ruleId)
    );
    expect(cliOrder.map((d) => d.location.file).sort()).toEqual([
      'src/application/billing.ts',
      'src/core/billing.ts',
      'src/domain/order.ts',
    ]);

    for (const diagnostic of cliOrder) {
      const messages = lintFile(root, diagnostic.location.file).filter((m) =>
        m.ruleId.startsWith('ark/no-arkorder-')
      );
      expect(messages).toHaveLength(1);
      const [message] = messages;
      expect(message!.message).toBe(diagnostic.message);
      expect(message!.message).not.toContain('{{');
      expect(message!.severity).toBe(2);
      expect(message!.line).toBe(diagnostic.location.line);
      expect(message!.column).toBeGreaterThanOrEqual(1);
    }
    const update = lintFile(root, 'src/application/billing.ts').find(
      (m) => m.ruleId === 'ark/no-arkorder-generic-update'
    );
    expect(update).toMatchObject({ line: 2, column: 5 });
  });

  it('advisory: ESLint exits clean where ark-check passes; findings surface as warnings', () => {
    const root = project('order-adv', orderConfig('advisory'), files);
    const cli = arkCheck(root);
    expect(cli.ok).toBe(true);
    for (const rel of ['src/domain/order.ts', 'src/core/billing.ts', 'src/application/billing.ts']) {
      const messages = lintFile(root, rel);
      expect(errorCount(messages)).toBe(0);
      const advisory = warnings(messages);
      expect(advisory).toHaveLength(1);
      expect(advisory[0]!.ruleId).toBe('ark/architecture-advisory');
      expect(advisory[0]!.message).not.toContain('{{');
      expect(advisory[0]!.message).toContain('ARKORDER_');
    }
  });
});

describe('layer edges: per-edge severity and the real denial text', () => {
  const slicesConfig = {
    include: ['src'],
    layers: [{ name: 'Features', patterns: ['src/lib/features/**'] }],
    rules: [
      {
        from: 'Features',
        to: 'Features',
        allowed: false,
        peerIsolation: true,
        sliceFolders: ['lib/features/*'],
        sliceIdentity: 'stars',
        message: 'Keep features apart.',
        childSlices: {
          sliceFolders: ['lib/features/*/*'],
          sliceIdentity: 'stars',
          siblings: 'advisory',
        },
      },
    ],
  };

  it('advisory sibling crossing is a warning; cross-parent is an error naming rule message + reason', () => {
    const root = project('slices', slicesConfig, {
      'src/lib/features/projects/rfi/z.ts': "import { x } from '../d2d/x';\nexport const z = x;\n",
      'src/lib/features/projects/d2d/x.ts': 'export const x = 1;\n',
      'src/lib/features/projects/rfi/w.ts':
        "import { y } from '../../billing/inv/y';\nexport const w = y;\n",
      'src/lib/features/billing/inv/y.ts': 'export const y = 1;\n',
    });
    const cli = arkCheck(root);
    const sibling = cli.diagnostics.find((d) => d.location.file.endsWith('rfi/z.ts'));
    const parent = cli.diagnostics.find((d) => d.location.file.endsWith('rfi/w.ts'));
    expect(sibling?.severity).toBe('warning');
    expect(parent?.severity).toBe('error');

    const siblingLint = lintFile(root, 'src/lib/features/projects/rfi/z.ts');
    expect(errorCount(siblingLint)).toBe(0);
    expect(warnings(siblingLint)).toHaveLength(1);
    expect(warnings(siblingLint)[0]!.message).toContain(sibling!.message);
    expect(warnings(siblingLint)[0]!.message).toContain('cross-sibling');

    const parentLint = lintFile(root, 'src/lib/features/projects/rfi/w.ts');
    expect(errorCount(parentLint)).toBe(1);
    const error = parentLint.find((m) => m.severity === 2)!;
    expect(error.ruleId).toBe('ark/no-domain-infra-imports');
    expect(error.message).toContain(parent!.message);
    expect(error.message).toContain('Keep features apart.');
    expect(error.message).toContain('cross-parent');

    fs.rmSync(path.join(root, 'src/lib/features/projects/rfi/w.ts'));
    expect(arkCheck(root).ok).toBe(true);
  });

  it('type-only placement debt warns (ark-check exits 0); value edge errors', () => {
    const root = project('typeonly', {
      include: ['src'],
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'] },
        { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
      ],
      rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
    }, {
      'src/infra/db.ts': 'export const db = {};\nexport type Row = { id: string };\n',
      'src/domain/a.ts': "import type { Row } from '../infra/db';\nexport type A = Row;\n",
    });
    expect(arkCheck(root).ok).toBe(true);
    // acorn cannot parse `import type`; drive the same listeners with the TS-ESTree shape.
    const reports: Array<{ severity: 1 | 2; messageId: string }> = [];
    const levels = plugin.configs.recommended.rules as Record<string, string>;
    for (const [qualified, level] of Object.entries(levels)) {
      const rule = plugin.rules[qualified.replace('ark/', '')]!;
      const listener = rule.create({
        filename: path.join(root, 'src/domain/a.ts'),
        report: (d: Record<string, unknown>) =>
          reports.push({ severity: level === 'error' ? 2 : 1, messageId: String(d.messageId) }),
      });
      listener.ImportDeclaration?.({
        type: 'ImportDeclaration',
        importKind: 'type',
        source: { value: '../infra/db' },
        loc: { start: { line: 1, column: 0 } },
      });
    }
    expect(reports).toEqual([{ severity: 1, messageId: 'advisory' }]);
  });
});

describe('tsconfig aliases resolve like the CLI', () => {
  const hexConfig = {
    include: ['src', 'apps'],
    layers: [
      { name: 'DomainModel', patterns: ['src/domain/**', 'apps/web/src/domain/**'] },
      { name: 'PersistenceAdapters', patterns: ['src/infra/**', 'apps/web/src/infra/**'] },
    ],
    rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
  };
  const aliasFiles = {
    'src/domain/a.ts': "import { db } from '@/infra/db';\nexport const a = db;\n",
    'src/infra/db.ts': 'export const db = {};\n',
  };

  const cases: Array<[string, string]> = [
    [
      'Next.js default include globs',
      '{\n  "compilerOptions": { "strict": true, "paths": { "@/*": ["./src/*"] } },\n  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"]\n}\n',
    ],
    ['trailing commas', '{"compilerOptions":{"paths":{"@/*":["./src/*"],},},}'],
    [
      'comments, and comment tokens inside strings',
      '// top\n{ /* c */ "compilerOptions": { "baseUrl": "./", // base\n "paths": { "@/*": ["src/*"] } }, "exclude": ["a//b", "x/*y*/z"] }\n',
    ],
  ];

  for (const [label, tsconfig] of cases) {
    it(`${label}: ESLint and ark-check both deny the aliased edge`, () => {
      const root = project('alias', hexConfig, { ...aliasFiles, 'tsconfig.json': tsconfig });
      const cli = arkCheck(root);
      expect(cli.diagnostics.some((d) => d.ruleId === 'LAYER_IMPORT_VIOLATION')).toBe(true);
      const messages = lintFile(root, 'src/domain/a.ts');
      expect(messages.filter((m) => m.ruleId === 'ark/no-domain-infra-imports')).toHaveLength(1);
    });
  }

  it('nested apps/web/tsconfig.json nearest to the file is used (single root config)', () => {
    const root = project('nested', hexConfig, {
      'apps/web/tsconfig.json': '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}',
      'apps/web/src/domain/a.ts': "import { db } from '@/infra/db';\nexport const a = db;\n",
      'apps/web/src/infra/db.ts': 'export const db = {};\n',
    });
    const cli = arkCheck(root);
    expect(cli.diagnostics.some((d) => d.ruleId === 'LAYER_IMPORT_VIOLATION')).toBe(true);
    const messages = lintFile(root, 'apps/web/src/domain/a.ts');
    expect(messages.filter((m) => m.ruleId === 'ark/no-domain-infra-imports')).toHaveLength(1);
  });
});

describe('require-publish-source matches ark-check candidates and scope', () => {
  it('flags only Ark publish candidates without source, inside include', () => {
    const body = [
      "pubsub.publish('USER_CREATED', { id: 1 });",
      "client.publish({ topic: 't', data: 'x' });",
      "bus.publish(OrderPlaced, { source: 'Application.checkout' });",
      'bus.publish(OrderPlaced, {});',
      "bus.publish('Domain.Order.Placed', {});",
      "bus.publish(Events.OrderPlaced, {}, { source: 'Application.x' });",
      '',
    ].join('\n');
    const root = project('publish', {
      include: ['src'],
      layers: [{ name: 'Infra', patterns: ['src/infra/**'] }],
      rules: [],
    }, { 'src/infra/sub.ts': body, 'scripts/sub.ts': body });
    const cli = arkCheck(root);
    const cliLines = cli.diagnostics
      .filter((d) => d.ruleId === 'PUBLISH_MISSING_SOURCE')
      .map((d) => d.location.line)
      .sort();
    const lintLines = lintFile(root, 'src/infra/sub.ts')
      .filter((m) => m.ruleId === 'ark/require-publish-source')
      .map((m) => m.line)
      .sort();
    expect(lintLines).toEqual([4, 5]);
    expect(lintLines).toEqual(cliLines);
    expect(
      lintFile(root, 'scripts/sub.ts').filter((m) => m.ruleId === 'ark/require-publish-source')
    ).toHaveLength(0);

    const noConfig = project('publish-noconf', null, { 'src/sub.ts': body });
    expect(
      lintFile(noConfig, 'src/sub.ts').filter((m) => m.ruleId === 'ark/require-publish-source')
    ).toHaveLength(0);
  });
});

describe('no-forbidden-globals: bracket and destructuring forms', () => {
  it('reports the same lines as ark-check', () => {
    const text = [
      'export const a = Date.now();',
      'export const { now } = Date;',
      "export const b = Date['now']();",
      'export const c = Math["random"]();',
      'export const { random } = Math;',
      "export const f = globalThis['fetch'];",
      'export const { now: n } = globalThis.Date;',
      'export const t = Date[`now`]();',
      "const k = 'x';",
      'export const d = Date[k];',
      '',
    ].join('\n');
    const root = project('globals', {
      include: ['src'],
      layers: [
        {
          name: 'DomainModel',
          patterns: ['src/domain/**'],
          forbiddenGlobals: ['fetch', 'process', 'Date.now', 'Math.random'],
        },
      ],
      rules: [],
    }, { 'src/domain/g.ts': text });
    const cliLines = arkCheck(root)
      .diagnostics.filter((d) => d.ruleId === 'FORBIDDEN_GLOBAL')
      .map((d) => d.location.line);
    const lintLines = lintFile(root, 'src/domain/g.ts')
      .filter((m) => m.ruleId === 'ark/no-forbidden-globals')
      .map((m) => m.line);
    expect(lintLines).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...new Set(lintLines)]).toEqual([...new Set(cliLines)].sort((x, y) => x - y));
  });
});

describe('invalid contracts fail closed without crashing ESLint', () => {
  const valid = {
    include: ['src'],
    layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
    rules: [],
  };

  for (const [label, config] of [
    ['unknown field', JSON.stringify({ ...valid, bogus: 1 })],
    ['truncated JSON', '{ "include": ["src"], "layers": ['],
  ] as const) {
    it(`${label}: one configInvalid error per file, no throw`, () => {
      const root = project('invalid', config, {
        'src/domain/a.ts': 'export const a = 1;\n',
        'other/b.ts': 'export const b = 2;\n',
      });
      for (const rel of ['src/domain/a.ts', 'other/b.ts']) {
        const messages = lintFile(root, rel);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({ severity: 2, messageId: 'configInvalid' });
        expect(messages[0]!.message).not.toContain('{{');
      }
    });
  }

  it('missing ArkRules reference is ARKRULES_LOAD_FAILED in ark-check and configInvalid in ESLint', () => {
    const root = project('arkrules-missing', {
      ...valid,
      schemaVersion: '1.1',
      arkRules: { DomainModel: 'arkrules/DomainModel.json' },
    }, { 'src/domain/a.ts': 'export const a = 1;\n' });
    expect(arkCheck(root).status).not.toBe(0);
    const messages = lintFile(root, 'src/domain/a.ts');
    expect(messages).toHaveLength(1);
    expect(messages[0]!.messageId).toBe('configInvalid');
    expect(messages[0]!.message).toContain('is missing');
  });
});

describe('ArkRules structure sensors run in the editor', () => {
  it('reports the same ARKRULE_STRUCTURE findings as ark-check for the linted file', () => {
    const fixture = path.resolve('tests/fixtures/arkrules-poc-enforcement');
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-eslint-arkrules-')));
    temps.push(root);
    fs.cpSync(fixture, root, { recursive: true });
    const cli = arkCheck(root);
    const cliFindings = cli.diagnostics.filter(
      (d) => d.ruleId === 'ARKRULE_STRUCTURE' && d.location.file === 'src/domain/Order.bad.ts'
    );
    expect(cliFindings.length).toBeGreaterThan(0);
    const bad = path.join(root, 'src/domain/Order.bad.ts');
    const ts = fs.readFileSync(bad, 'utf8');
    // The harness parses JS; ArkRules sensors read the buffer text, so drive Program directly.
    const reports: Array<Record<string, any>> = [];
    const listener = plugin.rules['arkrules-structure']!.create({
      filename: bad,
      sourceCode: { getText: () => ts, text: ts },
      report: (d: Record<string, unknown>) => reports.push(d),
    });
    listener.Program?.({ type: 'Program', loc: { start: { line: 1, column: 0 } } });
    const strict = cliFindings.filter((d) => d.severity === 'error');
    expect(reports.map((r) => r.diagnostic.message).sort()).toEqual(
      strict.map((d) => d.message).sort()
    );
    expect(reports.every((r) => r.messageId === 'structure')).toBe(true);
    const good = path.join(root, 'src/domain/Order.good.ts');
    const goodText = fs.readFileSync(good, 'utf8');
    const goodReports: unknown[] = [];
    plugin.rules['arkrules-structure']!
      .create({
        filename: good,
        sourceCode: { getText: () => goodText, text: goodText },
        report: (d: unknown) => goodReports.push(d),
      })
      .Program?.({ type: 'Program', loc: { start: { line: 1, column: 0 } } });
    expect(goodReports).toHaveLength(0);
  });
});

describe('no-arkrun-direct-new lints the editor buffer', () => {
  it('flags an unsaved file and ignores a disk-only `new`', () => {
    const fixture = path.resolve('tests/fixtures/arkrun-sensors/direct-new');
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-eslint-directnew-')));
    temps.push(root);
    fs.cpSync(fixture, root, { recursive: true });
    const code =
      "import { OrderService } from '../domain/order-service';\nexport const b2 = new OrderService();\n";
    const unsaved = lintFile(root, 'src/application/billing2.ts', code).filter(
      (m) => m.ruleId === 'ark/no-arkrun-direct-new'
    );
    expect(unsaved).toHaveLength(1);
    expect(unsaved[0]!.line).toBe(2);

    const onDisk = fs.readFileSync(path.join(root, 'src/application/billing.ts'), 'utf8');
    expect(onDisk).toContain('new OrderService');
    const edited = lintFile(
      root,
      'src/application/billing.ts',
      onDisk.replace(/new OrderService\(\)/g, 'null')
    ).filter((m) => m.ruleId === 'ark/no-arkrun-direct-new');
    expect(edited).toHaveLength(0);
  });
});

describe('plugin identity for eslint --cache', () => {
  it('carries meta and a contract fingerprint that changes with ark.config.json', () => {
    expect(plugin.meta.name).toBe('arkgate');
    const root = project('cache', {
      include: ['src'],
      layers: [{ name: 'A', patterns: ['src/a/**'] }],
      rules: [],
    }, {});
    const before = contractFingerprint(root);
    expect(before).toMatch(/^[0-9a-f]{64}$/);
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({ include: ['src'], layers: [{ name: 'B', patterns: ['src/b/**'] }], rules: [] })
    );
    expect(contractFingerprint(root)).not.toBe(before);
    const recommended = plugin.configs.recommended as {
      settings?: { ark?: { contractHash?: string } };
      plugins: { ark: unknown };
    };
    // The repository root has an ark.config.json, so the lazy preset fingerprints it.
    expect(recommended.settings?.ark?.contractHash).toBe(contractFingerprint(process.cwd()));
    expect(recommended.plugins.ark).toBe(plugin);
  });
});
