import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { collectForbiddenGlobalUses } from '../../../bin/ark-shared.mjs';
import {
  isTypeOnlyModuleReference,
  moduleSpecifierFromCall,
  namedModuleBindings,
  textOfModuleSpecifier,
} from '../../../bin/lib/ast-scan.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript') as typeof import('typescript');

function source(code: string): import('typescript').SourceFile {
  return ts.createSourceFile('fixture.ts', code, ts.ScriptTarget.Latest, true);
}

describe('mutation-critical scanner contracts', () => {
  it('detects only configured dotted, property, call, and constructor globals', () => {
    const file = source(`
Date.now();
console.log('message');
fetch('/orders');
new WebSocket('ws://localhost');
Math.random();
unconfigured.value;
(fetch);
const local = fetch;
`);

    expect(collectForbiddenGlobalUses(ts, file, undefined)).toEqual([]);
    expect(
      collectForbiddenGlobalUses(ts, file, [
        'Date.now',
        'console',
        'fetch',
        'WebSocket',
        'Math',
      ]).map((use) => use.name)
    ).toEqual(['Date.now', 'console', 'fetch', 'WebSocket', 'Math']);
  });

  it('classifies import and export references conservatively', () => {
    const file = source(`
import type DefaultType from './type-default';
import { type A, type B } from './types';
import { type C, value } from './mixed';
import DefaultValue from './default-value';
import * as Namespace from './namespace';
import {} from './empty';
import './side-effect';
export type { A } from './types';
export { type B } from './types';
export { type C, value } from './mixed';
export * from './star';
export * as ExportNamespace from './namespace';
export {} from './empty';
const runtime = 1;
`);
    const [
      typeDefault,
      typeNamed,
      mixed,
      defaultValue,
      namespace,
      emptyImport,
      sideEffect,
      typeExport,
      namedTypeExport,
      mixedExport,
      starExport,
      namespaceExport,
      emptyExport,
      runtime,
    ] = file.statements;

    expect(isTypeOnlyModuleReference(ts, typeDefault)).toBe(true);
    expect(isTypeOnlyModuleReference(ts, typeNamed)).toBe(true);
    expect(isTypeOnlyModuleReference(ts, mixed)).toBe(false);
    expect(isTypeOnlyModuleReference(ts, defaultValue)).toBe(false);
    expect(isTypeOnlyModuleReference(ts, namespace)).toBe(false);
    expect(isTypeOnlyModuleReference(ts, emptyImport)).toBe(false);
    expect(isTypeOnlyModuleReference(ts, sideEffect)).toBe(false);
    expect(isTypeOnlyModuleReference(ts, typeExport)).toBe(true);
    expect(isTypeOnlyModuleReference(ts, namedTypeExport)).toBe(true);
    expect(isTypeOnlyModuleReference(ts, mixedExport)).toBe(false);
    expect(isTypeOnlyModuleReference(ts, starExport)).toBe(false);
    expect(isTypeOnlyModuleReference(ts, namespaceExport)).toBe(false);
    expect(isTypeOnlyModuleReference(ts, emptyExport)).toBe(false);
    expect(isTypeOnlyModuleReference(ts, runtime)).toBe(false);
    expect(textOfModuleSpecifier(typeNamed)).toBe('./types');
    expect(textOfModuleSpecifier(runtime)).toBeUndefined();
  });

  it('extracts only pure named bindings and preserves imported names across aliases', () => {
    const file = source(`
import { External as Local, Plain } from './named';
import Default, { Named } from './default';
import * as Namespace from './namespace';
import './side-effect';
import {} from './empty';
export { Local as Public, Plain } from './named';
export {} from './empty';
export * from './star';
const runtime = 1;
`);
    const [
      namedImport,
      defaultImport,
      namespaceImport,
      sideEffect,
      emptyImport,
      namedExport,
      emptyExport,
      starExport,
      runtime,
    ] = file.statements;

    expect(namedModuleBindings(ts, namedImport)).toEqual(['External', 'Plain']);
    expect(namedModuleBindings(ts, defaultImport)).toBeNull();
    expect(namedModuleBindings(ts, namespaceImport)).toBeNull();
    expect(namedModuleBindings(ts, sideEffect)).toBeNull();
    expect(namedModuleBindings(ts, emptyImport)).toBeNull();
    expect(namedModuleBindings(ts, namedExport)).toEqual(['Local', 'Plain']);
    expect(namedModuleBindings(ts, emptyExport)).toBeNull();
    expect(namedModuleBindings(ts, starExport)).toBeNull();
    expect(namedModuleBindings(ts, runtime)).toBeNull();
  });

  it('extracts only literal dynamic imports and require calls', () => {
    const file = source(`
import('./dynamic');
import(dynamicName);
require('./required');
require(requiredName);
load('./ignored');
`);
    const calls: import('typescript').CallExpression[] = [];
    const visit = (node: import('typescript').Node) => {
      if (ts.isCallExpression(node)) calls.push(node);
      ts.forEachChild(node, visit);
    };
    visit(file);

    expect(calls.map((call) => moduleSpecifierFromCall(ts, call))).toEqual([
      { value: './dynamic', kind: 'dynamic-import' },
      undefined,
      { value: './required', kind: 'require' },
      undefined,
      undefined,
    ]);
    expect(moduleSpecifierFromCall(ts, source('const runtime = 1;').statements[0])).toBeUndefined();
  });
});
