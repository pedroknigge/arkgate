import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';
import { createAICodeGate } from '../../../src/index';

const architectureProfile = {
  name: 'scanner-corpus',
  layers: [
    { name: 'DomainModel', prefixes: ['Domain.'] },
    { name: 'PersistenceAdapters', prefixes: ['Adapter.Persistence.'] },
  ],
  rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
};

function dependencyGate() {
  return createAICodeGate({
    typescript: ts,
    architectureProfile: architectureProfile as never,
    resolveImportTarget: (specifier: string) =>
      specifier.includes('infra')
        ? { layer: 'PersistenceAdapters', filePath: 'packages/infra/src/index.ts' }
        : undefined,
  });
}

describe('AI Code Gate confirmed scanner bypass corpus', () => {
  const globalsGate = createAICodeGate({
    typescript: ts,
    forbiddenGlobals: { DomainModel: ['fetch', 'Date.now', 'console'] },
  });

  it('does not treat locally bound fetch or Date names as ambient globals', () => {
    const result = globalsGate.validate(
      [
        'export function load(fetch: (url: string) => string) { return fetch("/orders"); }',
        'const Date = { now: () => 123 };',
        'export const now = Date.now();',
      ].join('\n'),
      { layer: 'DomainModel', filePath: 'src/domain/order.ts' }
    );

    expect(result.violations.filter((v) => v.ruleId === 'FORBIDDEN_GLOBAL')).toEqual([]);
  });

  it('still catches ambient aliases and explicit globalThis access', () => {
    const result = globalsGate.validate(
      [
        'const request = fetch;',
        'export const load = () => request("/orders");',
        'export const now = globalThis.Date.now();',
        'globalThis.console.log(now);',
      ].join('\n'),
      { layer: 'DomainModel', filePath: 'src/domain/order.ts' }
    );

    expect(
      result.violations
        .filter((v) => v.ruleId === 'FORBIDDEN_GLOBAL')
        .map((v) => v.target)
        .sort()
    ).toEqual(['Date.now', 'console', 'fetch']);
  });

  it('treats TypeScript import-equals require syntax as a dependency edge', () => {
    const result = dependencyGate().validate(
      'import db = require("../infra/db");\nexport const connection = db;\n',
      { layer: 'DomainModel', filePath: 'src/domain/order.ts' }
    );

    expect(result.violations.some((v) => v.ruleId === 'LAYER_IMPORT_VIOLATION')).toBe(true);
  });

  it('rejects non-literal require dependencies unless the file is allowlisted', () => {
    const source = 'const target = "../infra/db";\nexport const db = require(target);\n';
    const blocked = dependencyGate().validate(source, {
      layer: 'DomainModel',
      filePath: 'src/domain/order.ts',
    });
    const allowed = createAICodeGate({
      typescript: ts,
      allowNonLiteralDynamicImport: (filePath) => filePath === 'src/domain/order.ts',
    }).validate(source, { layer: 'DomainModel', filePath: 'src/domain/order.ts' });

    expect(blocked.violations.some((v) => v.ruleId === 'DYNAMIC_REQUIRE_NOT_ALLOWLISTED')).toBe(
      true
    );
    expect(allowed.violations.some((v) => v.ruleId === 'DYNAMIC_REQUIRE_NOT_ALLOWLISTED')).toBe(
      false
    );
  });

  it('continues to enforce resolved workspace package imports', () => {
    const result = dependencyGate().validate(
      'import { db } from "@acme/infra";\nexport const orderDb = db;\n',
      { layer: 'DomainModel', filePath: 'packages/domain/src/order.ts' }
    );

    expect(result.violations.some((v) => v.ruleId === 'LAYER_IMPORT_VIOLATION')).toBe(true);
  });
});
