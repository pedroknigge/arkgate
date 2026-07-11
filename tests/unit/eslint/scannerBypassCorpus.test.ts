import { describe, expect, it } from 'vitest';
import { noForbiddenGlobals } from '../../../src/eslint/index';

type ScopeVariable = { defs: unknown[] };
type Scope = { set: Map<string, ScopeVariable>; upper: Scope | null };

function listenerWithScope(scope: Scope) {
  const reports: Array<Record<string, unknown>> = [];
  const listener = noForbiddenGlobals.create({
    filename: '/tmp/no-config/src/domain/order.ts',
    options: [{ globals: ['fetch', 'Date.now', 'console'] }],
    sourceCode: { getScope: () => scope },
    report: (descriptor: Record<string, unknown>) => reports.push(descriptor),
  } as never);
  return { listener, reports };
}

describe('ESLint confirmed forbidden-global bypass corpus', () => {
  it('does not report locally bound fetch or Date names', () => {
    const scope: Scope = {
      set: new Map([
        ['fetch', { defs: [{}] }],
        ['Date', { defs: [{}] }],
      ]),
      upper: null,
    };
    const { listener, reports } = listenerWithScope(scope);

    listener.CallExpression({ callee: { type: 'Identifier', name: 'fetch' } });
    listener.MemberExpression({
      object: { type: 'Identifier', name: 'Date' },
      property: { type: 'Identifier', name: 'now' },
    });

    expect(reports).toEqual([]);
  });

  it('reports ambient aliases and explicit globalThis access', () => {
    const scope: Scope = { set: new Map(), upper: null };
    const { listener, reports } = listenerWithScope(scope);
    const ambientFetch = { type: 'Identifier', name: 'fetch' } as Record<string, unknown>;
    ambientFetch.parent = { type: 'VariableDeclarator', init: ambientFetch };

    listener.Identifier?.(ambientFetch);
    listener.MemberExpression({
      type: 'MemberExpression',
      object: {
        type: 'MemberExpression',
        object: { type: 'Identifier', name: 'globalThis' },
        property: { type: 'Identifier', name: 'Date' },
      },
      property: { type: 'Identifier', name: 'now' },
    });
    listener.MemberExpression({
      type: 'MemberExpression',
      object: {
        type: 'MemberExpression',
        object: { type: 'Identifier', name: 'globalThis' },
        property: { type: 'Identifier', name: 'console' },
      },
      property: { type: 'Identifier', name: 'log' },
    });

    expect(reports.map((report) => (report.data as { name: string }).name).sort()).toEqual([
      'Date.now',
      'console',
      'fetch',
    ]);
  });
});
