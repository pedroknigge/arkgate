import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';
import {
  collectForbiddenCapabilityUses,
  extractSemanticDependencies,
} from '../../../src/index';
import {
  collectForbiddenCapabilityUses as collectFromBundle,
  extractSemanticDependencies as extractFromBundle,
} from '../../../bin/lib/analysis-engine.mjs';

function source(text: string, kind = ts.ScriptKind.TS) {
  return ts.createSourceFile('fixture.ts', text, ts.ScriptTarget.Latest, true, kind);
}

function dependencyShape(dependencies: ReturnType<typeof extractSemanticDependencies>) {
  return dependencies.map(({ specifier, kind, line, typeOnly, unresolved }) => ({
    specifier,
    kind,
    line,
    typeOnly,
    unresolved,
  }));
}

describe('canonical semantic analysis', () => {
  it('extracts TS/ESM/CJS dependency forms and ignores a shadowed require', () => {
    const input = source(
      [
        'import type { A } from "./a";',
        'export { type B } from "./b";',
        'import legacy = require("./legacy");',
        'const lazy = import("./lazy");',
        'const cjs = require("./cjs");',
        'const unknown = import(target);',
        'function local(require: (value: string) => unknown) { return require("./local"); }',
      ].join('\n')
    );

    expect(dependencyShape(extractSemanticDependencies(ts, input))).toEqual([
      { specifier: './a', kind: 'import', line: 1, typeOnly: true, unresolved: false },
      { specifier: './b', kind: 'export', line: 2, typeOnly: true, unresolved: false },
      { specifier: './legacy', kind: 'require', line: 3, typeOnly: false, unresolved: false },
      { specifier: './lazy', kind: 'dynamic-import', line: 4, typeOnly: false, unresolved: false },
      { specifier: './cjs', kind: 'require', line: 5, typeOnly: false, unresolved: false },
      { specifier: undefined, kind: 'dynamic-import', line: 6, typeOnly: false, unresolved: true },
    ]);
  });

  it('classifies every supported import/export type-only shape conservatively', () => {
    const input = source(
      [
        'import "./side-effect";',
        'import value from "./default";',
        'import * as ns from "./namespace";',
        'import { type A, B } from "./mixed";',
        'import { type C, type D } from "./named-types";',
        'import {} from "./empty-import";',
        'export * from "./star";',
        'export { value } from "./value";',
        'export { type E, value as other } from "./mixed-export";',
        'export type { F } from "./export-types";',
        'export {} from "./empty-export";',
        'const localValue = 1; export { localValue };',
        'const ignored = loader("./custom");',
      ].join('\n')
    );

    expect(dependencyShape(extractSemanticDependencies(ts, input))).toEqual([
      { specifier: './side-effect', kind: 'import', line: 1, typeOnly: false, unresolved: false },
      { specifier: './default', kind: 'import', line: 2, typeOnly: false, unresolved: false },
      { specifier: './namespace', kind: 'import', line: 3, typeOnly: false, unresolved: false },
      { specifier: './mixed', kind: 'import', line: 4, typeOnly: false, unresolved: false },
      { specifier: './named-types', kind: 'import', line: 5, typeOnly: true, unresolved: false },
      { specifier: './empty-import', kind: 'import', line: 6, typeOnly: false, unresolved: false },
      { specifier: './star', kind: 'export', line: 7, typeOnly: false, unresolved: false },
      { specifier: './value', kind: 'export', line: 8, typeOnly: false, unresolved: false },
      { specifier: './mixed-export', kind: 'export', line: 9, typeOnly: false, unresolved: false },
      { specifier: './export-types', kind: 'export', line: 10, typeOnly: true, unresolved: false },
      { specifier: './empty-export', kind: 'export', line: 11, typeOnly: false, unresolved: false },
    ]);
  });

  it('resolves ambient aliases, globalThis static keys, and destructuring without local false positives', () => {
    const input = source(
      [
        'const Clock = Date;',
        'export const now = Clock.now();',
        'export const other = globalThis["Date"]["now"]();',
        'const { log } = globalThis.console;',
        'log("x");',
        'export function local(fetch: () => void) { fetch(); }',
      ].join('\n')
    );
    const uses = collectForbiddenCapabilityUses(ts, input, ['Date.now', 'console', 'fetch']);

    expect(uses.map(({ name }) => name).sort()).toEqual(['Date.now', 'Date.now', 'console']);
  });

  it('handles shorthand, longest-match, alias chains, and unsupported computed paths', () => {
    const input = source(
      [
        'const Platform = globalThis;',
        'const Clock = Platform.Date;',
        'Clock.now();',
        'globalThis.console.log("x");',
        'const ambient = { fetch };',
        'const localFetch = () => 1;',
        'const local = { fetch: localFetch };',
        'globalThis[key].console;',
        'factory().console.log("ignored");',
      ].join('\n')
    );

    expect(
      collectForbiddenCapabilityUses(ts, input, ['Date.now', 'console', 'console.log', 'fetch'])
        .map(({ name }) => name)
        .sort()
    ).toEqual(['Date.now', 'console.log', 'fetch']);
    expect(collectForbiddenCapabilityUses(ts, source('console.log("x")'), ['console'])).toHaveLength(1);
    expect(
      collectForbiddenCapabilityUses(ts, source('const { info } = console; info("x")'), [
        'console.log',
      ])
    ).toEqual([]);
  });

  it('returns no capability uses for an empty policy and top-level declarations', () => {
    const input = source(
      [
        'function fetch() {}',
        'class console { static log() {} }',
        'enum Date { now }',
        'fetch(); console.log(); Date.now;',
      ].join('\n')
    );

    expect(collectForbiddenCapabilityUses(ts, input, [])).toEqual([]);
    expect(collectForbiddenCapabilityUses(ts, input, ['fetch', 'console', 'Date.now'])).toEqual([]);
  });

  it('keeps the generated CLI bundle byte-for-byte equivalent at the semantic boundary', () => {
    const text = 'const Clock = Date; Clock.now(); import(target); require("./db");';
    const kernelSource = source(text, ts.ScriptKind.JS);
    const bundleSource = source(text, ts.ScriptKind.JS);

    expect(dependencyShape(extractFromBundle(ts, bundleSource))).toEqual(
      dependencyShape(extractSemanticDependencies(ts, kernelSource))
    );
    expect(
      collectFromBundle(ts, bundleSource, ['Date.now']).map(({ name, line }) => ({ name, line }))
    ).toEqual(
      collectForbiddenCapabilityUses(ts, kernelSource, ['Date.now']).map(({ name, line }) => ({
        name,
        line,
      }))
    );
  });

  it('meets the labeled adversarial corpus false-negative and false-positive gates', () => {
    const corpus = [
      { source: 'fetch("/x")', expected: ['fetch'] },
      { source: 'const request = fetch; request("/x")', expected: ['fetch'] },
      { source: 'Date.now()', expected: ['Date.now'] },
      { source: 'const Clock = Date; Clock.now()', expected: ['Date.now'] },
      { source: 'globalThis.Date.now()', expected: ['Date.now'] },
      { source: 'globalThis["Date"]["now"]()', expected: ['Date.now'] },
      { source: 'const { now } = Date; now()', expected: ['Date.now'] },
      { source: 'const { log } = globalThis.console; log("x")', expected: ['console'] },
      { source: 'console.log("x")', expected: ['console'] },
      { source: 'const c = globalThis["console"]; c.log("x")', expected: ['console'] },
      { source: 'function f(fetch: () => void) { fetch(); }', expected: [] },
      { source: 'const Date = { now: () => 1 }; Date.now()', expected: [] },
      { source: 'const console = { log() {} }; console.log()', expected: [] },
      { source: 'import { fetch } from "./port"; fetch()', expected: [] },
      { source: 'type T = typeof fetch;', expected: [] },
      { source: 'const obj = { fetch: 1 }; obj.fetch', expected: [] },
      { source: 'function f(Date: { now(): number }) { Date.now(); }', expected: [] },
      { source: 'class console { static log() {} } console.log()', expected: [] },
      { source: 'const globalThis = { Date: { now: () => 1 } }; globalThis.Date.now()', expected: [] },
      { source: 'const fetcher = { fetch() {} }; fetcher.fetch()', expected: [] },
    ];
    let falseNegatives = 0;
    let falsePositives = 0;
    let expectedNegatives = 0;

    for (const entry of corpus) {
      const actual = collectForbiddenCapabilityUses(
        ts,
        source(entry.source),
        ['fetch', 'Date.now', 'console']
      ).map(({ name }) => name);
      expect([...new Set(actual)].sort(), entry.source).toEqual([...entry.expected].sort());
      for (const expected of entry.expected) {
        if (!actual.includes(expected)) falseNegatives += 1;
      }
      if (entry.expected.length === 0) {
        expectedNegatives += 1;
        if (actual.length > 0) falsePositives += 1;
      }
    }

    expect(falseNegatives).toBe(0);
    expect(falsePositives / expectedNegatives).toBeLessThan(0.005);
  });
});
