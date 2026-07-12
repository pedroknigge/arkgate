import { describe, expect, it } from 'vitest';
import arkEslint, {
  noDomainInfraImports,
  noForbiddenGlobals,
  noRawEventPublish,
  requirePublishSource,
} from '../../../src/eslint/index';

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

describe('Ark ESLint plugin', () => {
  it('exports recommended rules', () => {
    expect(Object.keys(arkEslint.rules)).toEqual([
      'no-domain-infra-imports',
      'no-raw-event-publish',
      'require-publish-source',
      'no-forbidden-globals',
    ]);
    expect(arkEslint.configs?.recommended).toBeDefined();
  });

  it('does not invent architecture policy without ark.config.json', () => {
    const { context, reports } = createContext('/tmp/no-config-repo/src/domain/order.ts');
    const listener = noDomainInfraImports.create(context);

    listener.ImportDeclaration({
      source: { value: '../adapters/persistence/orderRepo' },
    });

    expect(reports).toHaveLength(0);
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
    const { context, reports } = createContext('/tmp/no-config/src/domain/order.ts');
    (context as { options?: unknown[] }).options = [
      { globals: ['Date.now', 'fetch', 'process', 'Math.random'] },
    ];
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
