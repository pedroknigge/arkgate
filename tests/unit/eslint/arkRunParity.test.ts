/**
 * RN06: ESLint import/`new` envelope vs ark-check for the same ArkRun sensors.
 * Missing-root and undeclared-* stay out of this adapter.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  noArkRunDirectNew,
  noArkRunKernelInDomain,
  noArkRunTransportBypass,
} from '../../../src/eslint/index';

const CHECK = path.resolve('bin/ark-check.mjs');
const FIXTURES = path.resolve('tests/fixtures/arkrun-sensors');

function createContext(filename: string) {
  const reports: Array<Record<string, unknown>> = [];
  return {
    reports,
    context: {
      getFilename: () => filename,
      report: (descriptor: Record<string, unknown>) => reports.push(descriptor),
    },
  };
}

function runArkCheckJson(root: string) {
  const result = spawnSync(
    process.execPath,
    [CHECK, '--root', root, '--config', 'ark.config.json', '--json', '--no-cache'],
    { encoding: 'utf8' }
  );
  const out = JSON.parse(result.stdout || '{}') as {
    ok: boolean;
    violations: Array<{ ruleId: string; file?: string; target?: string; failsStrict?: boolean }>;
    diagnostics: Array<Record<string, unknown>>;
    schemaVersion: string;
  };
  return { status: result.status ?? 1, ...out };
}

function copyCase(name: string): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `ark-eslint-rn06-${name}-`)));
  fs.cpSync(path.join(FIXTURES, name), root, { recursive: true });
  return root;
}

function patchMode(root: string, mode: 'advisory' | 'enforced') {
  const configPath = path.join(root, 'ark.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
    arkRun?: { mode?: string };
  };
  if (!config.arkRun) throw new Error('fixture missing arkRun');
  config.arkRun.mode = mode;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

function arkRunDiagnostics(items: ReadonlyArray<Record<string, unknown>>): Record<string, unknown>[] {
  return items.filter((item) => String(item.ruleId ?? '').startsWith('ARKRUN_'));
}

function envelopeVoice(diagnostic: Record<string, unknown>) {
  const location = diagnostic.location as { file?: string; line?: number } | undefined;
  const evidence = diagnostic.evidence as { fromLayer?: string; target?: string } | undefined;
  const targetKey =
    typeof diagnostic.targetKey === 'string'
      ? diagnostic.targetKey.replace(/#\d+$/, '')
      : diagnostic.targetKey;
  return {
    ruleId: diagnostic.ruleId,
    severity: diagnostic.severity,
    message: diagnostic.message,
    file: location?.file,
    line: location?.line,
    fromLayer: evidence?.fromLayer,
    target: evidence?.target,
    nextAction: diagnostic.nextAction,
    targetKey,
    docsCodePath: diagnostic.docsCodePath,
  };
}

describe('RN06 ESLint ↔ ark-check ArkRun envelope', () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const root of temps.splice(0)) {
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  function fixture(name: string): string {
    const root = copyCase(name);
    temps.push(root);
    return root;
  }

  it('absence of arkRun is silent even on skip-like sources', () => {
    const root = fixture('absent');
    const domainFile = path.join(root, 'src/domain/order-service.ts');
    const { context, reports } = createContext(domainFile);
    noArkRunKernelInDomain.create(context).ImportDeclaration?.({
      source: { value: '@arkgate/runtime' },
      specifiers: [{ type: 'ImportDefaultSpecifier' }],
      loc: { start: { line: 1 } },
    });
    expect(reports).toEqual([]);
    expect(arkRunDiagnostics(runArkCheckJson(root).diagnostics)).toEqual([]);
  });

  it('green enforced fixture stays quiet on import and new listeners', () => {
    const root = fixture('green');
    const domainFile = path.join(root, 'src/domain/order.ts');
    const mainFile = path.join(root, 'src/main.ts');
    const domain = createContext(domainFile);
    noArkRunKernelInDomain.create(domain.context).ImportDeclaration?.({
      source: { value: './peer' },
      specifiers: [{ type: 'ImportSpecifier' }],
    });
    const main = createContext(mainFile);
    noArkRunDirectNew.create(main.context).NewExpression?.({
      callee: { type: 'Identifier', name: 'OrderService' },
      loc: { start: { line: 2 } },
    });
    noArkRunKernelInDomain.create(main.context).ImportDeclaration?.({
      source: { value: '@arkgate/runtime' },
      specifiers: [{ type: 'ImportSpecifier' }],
    });
    noArkRunTransportBypass.create(main.context).ImportDeclaration?.({
      source: { value: '@arkgate/runtime' },
      specifiers: [{ type: 'ImportSpecifier' }],
    });
    expect(domain.reports).toEqual([]);
    expect(main.reports).toEqual([]);
    expect(arkRunDiagnostics(runArkCheckJson(root).diagnostics)).toEqual([]);
  });

  it('kernel-in-domain: ESLint and ark-check share ARKRUN_KERNEL_IN_DOMAIN', () => {
    const root = fixture('kernel-in-domain');
    const domainFile = path.join(root, 'src/domain/order.ts');
    const check = runArkCheckJson(root);
    expect(check.ok).toBe(false);
    const cli = check.diagnostics.find((item) => item.ruleId === 'ARKRUN_KERNEL_IN_DOMAIN');
    expect(cli).toBeTruthy();

    const { context, reports } = createContext(domainFile);
    noArkRunKernelInDomain.create(context).ImportDeclaration({
      source: { value: '@arkgate/runtime' },
      specifiers: [{ type: 'ImportSpecifier' }],
      loc: { start: { line: 1 } },
    });
    expect(reports).toHaveLength(1);
    expect(reports[0].messageId).toBe('kernelInDomain');
    expect(envelopeVoice(reports[0].diagnostic as Record<string, unknown>)).toEqual(
      envelopeVoice(cli as Record<string, unknown>)
    );
  });

  it('kernel-in-domain type-only import still flags; arkgate gate package does not', () => {
    const root = fixture('kernel-in-domain');
    const domainFile = path.join(root, 'src/domain/order.ts');
    const typeOnly = createContext(domainFile);
    noArkRunKernelInDomain.create(typeOnly.context).ImportDeclaration({
      source: { value: '@arkgate/runtime' },
      importKind: 'type',
      specifiers: [{ type: 'ImportSpecifier', importKind: 'type' }],
      loc: { start: { line: 1 } },
    });
    expect(typeOnly.reports).toHaveLength(1);

    const gatePkg = createContext(domainFile);
    noArkRunKernelInDomain.create(gatePkg.context).ImportDeclaration({
      source: { value: 'arkgate' },
      specifiers: [{ type: 'ImportSpecifier' }],
    });
    expect(gatePkg.reports).toEqual([]);
  });

  it('advisory kernel-in-domain reports warning without flipping CLI valid', () => {
    const root = fixture('kernel-in-domain');
    patchMode(root, 'advisory');
    const check = runArkCheckJson(root);
    expect(check.ok).toBe(true);
    const cli = check.diagnostics.find((item) => item.ruleId === 'ARKRUN_KERNEL_IN_DOMAIN');
    expect(cli).toMatchObject({ severity: 'warning' });

    const domainFile = path.join(root, 'src/domain/order.ts');
    const { context, reports } = createContext(domainFile);
    noArkRunKernelInDomain.create(context).ImportDeclaration({
      source: { value: '@arkgate/runtime' },
      specifiers: [{ type: 'ImportSpecifier' }],
      loc: { start: { line: 1 } },
    });
    expect(reports).toHaveLength(1);
    expect(reports[0].diagnostic).toMatchObject({
      ruleId: 'ARKRUN_KERNEL_IN_DOMAIN',
      severity: 'warning',
    });
  });

  it('transport-bypass: ESLint and ark-check share ARKRUN_TRANSPORT_BYPASS', () => {
    const root = fixture('transport-bypass');
    const busFile = path.join(root, 'src/application/bus.ts');
    const check = runArkCheckJson(root);
    expect(check.ok).toBe(false);
    const cli = check.diagnostics.find((item) => item.ruleId === 'ARKRUN_TRANSPORT_BYPASS');
    expect(cli).toBeTruthy();

    const { context, reports } = createContext(busFile);
    const listener = noArkRunTransportBypass.create(context);
    listener.ImportDeclaration({
      source: { value: 'events' },
      specifiers: [{ type: 'ImportSpecifier' }],
      loc: { start: { line: 1 } },
    });
    expect(reports).toHaveLength(1);
    expect(reports[0].messageId).toBe('transportBypass');
    expect(envelopeVoice(reports[0].diagnostic as Record<string, unknown>)).toEqual(
      envelopeVoice(cli as Record<string, unknown>)
    );

    listener.ImportDeclaration({
      source: { value: 'events' },
      importKind: 'type',
      specifiers: [{ type: 'ImportSpecifier', importKind: 'type' }],
    });
    expect(reports).toHaveLength(1);

    listener.CallExpression({
      callee: { type: 'Identifier', name: 'require' },
      arguments: [{ type: 'Literal', value: 'events' }],
      loc: { start: { line: 1 } },
    });
    expect(reports).toHaveLength(2);
    expect(reports[1].messageId).toBe('transportBypass');
  });

  it('direct-new: ESLint and ark-check share ARKRUN_DIRECT_NEW for on-disk admitted constructors', () => {
    const root = fixture('direct-new');
    const billingFile = path.join(root, 'src/application/billing.ts');
    const check = runArkCheckJson(root);
    expect(check.ok).toBe(false);
    const cli = check.diagnostics.find((item) => item.ruleId === 'ARKRUN_DIRECT_NEW');
    expect(cli).toBeTruthy();

    const { context, reports } = createContext(billingFile);
    noArkRunDirectNew.create(context).NewExpression({
      callee: { type: 'Identifier', name: 'OrderService' },
      loc: { start: { line: 2 } },
    });
    expect(reports).toHaveLength(1);
    expect(reports[0].messageId).toBe('directNew');
    expect(envelopeVoice(reports[0].diagnostic as Record<string, unknown>)).toEqual(
      envelopeVoice(cli as Record<string, unknown>)
    );
  });

  it('direct-new skips Domain files, builtins, and composition-root factories', () => {
    const root = fixture('direct-new');
    const domainFile = path.join(root, 'src/domain/order-service.ts');
    const mainFile = path.join(root, 'src/main.ts');
    const billingFile = path.join(root, 'src/application/billing.ts');

    const domain = createContext(domainFile);
    noArkRunDirectNew.create(domain.context).NewExpression({
      callee: { type: 'Identifier', name: 'OrderService' },
      loc: { start: { line: 1 } },
    });
    expect(domain.reports).toEqual([]);

    const main = createContext(mainFile);
    noArkRunDirectNew.create(main.context).NewExpression({
      callee: { type: 'Identifier', name: 'OrderService' },
      loc: { start: { line: 3 } },
    });
    expect(main.reports).toEqual([]);

    const billing = createContext(billingFile);
    noArkRunDirectNew.create(billing.context).NewExpression({
      callee: { type: 'Identifier', name: 'Date' },
      loc: { start: { line: 2 } },
    });
    expect(billing.reports).toEqual([]);
  });

  it('does not emit missing-root from the editor envelope', () => {
    const root = fixture('missing-root');
    const mainFile = path.join(root, 'src/main.ts');
    const check = runArkCheckJson(root);
    expect(check.diagnostics.some((item) => item.ruleId === 'ARKRUN_MISSING_ROOT')).toBe(true);

    const { context, reports } = createContext(mainFile);
    noArkRunKernelInDomain.create(context).ImportDeclaration?.({
      source: { value: './domain/order' },
    });
    noArkRunDirectNew.create(context).NewExpression?.({
      callee: { type: 'Identifier', name: 'OrderService' },
    });
    noArkRunTransportBypass.create(context).ImportDeclaration?.({
      source: { value: './domain/order' },
    });
    expect(reports.some((item) => (item.diagnostic as { ruleId?: string })?.ruleId === 'ARKRUN_MISSING_ROOT')).toBe(
      false
    );
  });

  it('does not invent ArkRun policy without ark.config.json', () => {
    const { context, reports } = createContext('/tmp/no-config-repo/src/domain/order.ts');
    noArkRunKernelInDomain.create(context).ImportDeclaration?.({
      source: { value: '@arkgate/runtime' },
    });
    noArkRunTransportBypass.create(context).ImportDeclaration?.({
      source: { value: 'events' },
    });
    expect(reports).toEqual([]);
  });
});
