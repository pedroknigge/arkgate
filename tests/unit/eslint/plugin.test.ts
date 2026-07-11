import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import arkEslint, {
  findConfigPath,
  noDomainInfraImports,
  noForbiddenGlobals,
  noRawEventPublish,
  requirePublishSource,
} from '../../../src/eslint/index';

describe('Structrail ESLint config discovery', () => {
  it('prefers the canonical filename, accepts legacy, and fails on ambiguity', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'structrail-eslint-config-'));
    const source = path.join(root, 'src', 'domain', 'order.ts');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, 'export const order = 1;\n');

    const canonical = path.join(root, 'structrail.config.json');
    const legacy = path.join(root, 'ark.config.json');
    fs.writeFileSync(canonical, '{}\n');
    expect(findConfigPath(source)).toBe(canonical);

    fs.rmSync(canonical);
    fs.writeFileSync(legacy, '{}\n');
    expect(findConfigPath(source)).toBe(legacy);

    fs.writeFileSync(canonical, '{}\n');
    expect(() => findConfigPath(source)).toThrow(
      /both structrail\.config\.json and ark\.config\.json/i
    );

    fs.rmSync(root, { recursive: true, force: true });
  });
});

function createContext(filename = '/repo/src/domain/order.ts') {
  const reports: Array<Record<string, unknown>> = [];
  return {
    reports,
    context: {
      getFilename: () => filename,
      report: (descriptor: Record<string, unknown>) => reports.push(descriptor),
    },
  };
}

describe('Structrail ESLint plugin', () => {
  it('exports recommended rules', () => {
    expect(Object.keys(arkEslint.rules)).toEqual([
      'no-domain-infra-imports',
      'no-raw-event-publish',
      'require-publish-source',
      'no-forbidden-globals',
    ]);
    expect(arkEslint.configs?.recommended).toBeDefined();
    expect(arkEslint.configs?.recommended).toMatchObject({
      plugins: { structrail: arkEslint },
      rules: {
        'structrail/no-domain-infra-imports': 'error',
        'structrail/no-raw-event-publish': 'error',
        'structrail/require-publish-source': 'error',
        'structrail/no-forbidden-globals': 'error',
      },
    });
    const recommended = arkEslint.configs?.recommended as {
      plugins: Record<string, unknown>;
      rules: Record<string, unknown>;
    };
    expect(Object.keys(recommended.plugins)).toEqual(['structrail']);
    expect(Object.keys(recommended.rules).some((name) => name.startsWith('ark/'))).toBe(false);
    expect(JSON.stringify(arkEslint.rules)).not.toMatch(
      /\bArkGate\b|\bArk\b|ark\.config\.json|\barkgate-check\b|\bark-check\b/
    );
  });

  it('flags infrastructure imports from domain files (heuristic without ark.config.json)', () => {
    // Path is not under a real project with ark.config.json → legacy heuristic path.
    const { context, reports } = createContext('/tmp/no-config-repo/src/domain/order.ts');
    const listener = noDomainInfraImports.create(context);

    listener.ImportDeclaration({
      source: { value: '../adapters/persistence/orderRepo' },
    });

    expect(reports).toHaveLength(1);
    expect(reports[0].messageId).toBe('forbiddenImportHeuristic');
  });

  it('flags raw event publish calls', () => {
    const { context, reports } = createContext('/repo/src/application/placeOrder.ts');
    const listener = noRawEventPublish.create(context);

    listener.CallExpression({
      callee: { property: { name: 'publish' } },
      arguments: [
        {
          properties: [{ key: { name: 'intent' }, value: { value: 'Domain.Order.Placed' } }],
        },
      ],
    });

    expect(reports).toHaveLength(1);
    expect(reports[0].messageId).toBe('rawPublish');
  });

  it('requires publish metadata source', () => {
    const { context, reports } = createContext('/repo/src/application/placeOrder.ts');
    const listener = requirePublishSource.create(context);

    listener.CallExpression({
      callee: { property: { name: 'publish' } },
      arguments: [{ name: 'OrderPlaced' }, { properties: [] }],
    });
    listener.CallExpression({
      callee: { property: { name: 'publish' } },
      arguments: [
        { name: 'OrderPlaced' },
        { properties: [] },
        { properties: [{ key: { name: 'source' }, value: { value: 'Application.PlaceOrder' } }] },
      ],
    });

    expect(reports).toHaveLength(1);
    expect(reports[0].messageId).toBe('missingSource');
  });
});

describe('ark/no-forbidden-globals', () => {
  function run(options?: unknown[]) {
    const { context, reports } = createContext('/repo/src/domain/order.ts');
    (context as { options?: unknown[] }).options = options;
    return { listener: noForbiddenGlobals.create(context), reports };
  }

  it('flags dotted globals, bare-global member access, calls, and constructions', () => {
    // Filename without walk-up config → domain heuristic + default globals.
    const { context, reports } = createContext('/tmp/no-config/src/domain/order.ts');
    const listener = noForbiddenGlobals.create(context);
    listener.MemberExpression({
      object: { type: 'Identifier', name: 'Date' },
      property: { name: 'now' },
    });
    listener.CallExpression({ callee: { type: 'Identifier', name: 'fetch' } });
    listener.NewExpression({ callee: { type: 'Identifier', name: 'WebSocket' } });
    expect(reports.map((r) => (r.data as { name: string }).name)).toEqual(['Date.now', 'fetch']);
  });

  it('honors a custom globals option and ignores non-matching access', () => {
    const { listener, reports } = run([{ globals: ['WebSocket', 'localStorage'] }]);
    listener.NewExpression({ callee: { type: 'Identifier', name: 'WebSocket' } });
    listener.MemberExpression({
      object: { type: 'Identifier', name: 'localStorage' },
      property: { name: 'getItem' },
    });
    listener.CallExpression({ callee: { type: 'Identifier', name: 'fetch' } });
    expect(reports.map((r) => (r.data as { name: string }).name)).toEqual([
      'WebSocket',
      'localStorage',
    ]);
  });
});
