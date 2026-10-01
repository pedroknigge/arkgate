/**
 * Importers that live outside the governed graph — Tooling.
 *
 * Shared by files nothing imports (ADR 0037), which counts test and outside
 * importers, and the invariant mutation probe (ADR 0039), which needs the
 * test files that import a symbol file to pick covering tests. One walk, one
 * test classifier, one lexical resolver, so the two never disagree on which
 * test imports what.
 *
 * Bounded: at most 5000 non-governed files of 256 KB each, depth 8.
 */
import fs from 'node:fs';
import path from 'node:path';
import { namedModuleBindings } from './ast-scan.mjs';
import { probeGoverned } from './entry-points-io.mjs';
import { readTsconfigAliases, resolveSpecifierToRel } from './import-resolve.mjs';
import { coverageOptionsFromConfig, matchSimpleGlob } from './invariant-coverage-io.mjs';

export const MAX_EXTERNAL_IMPORTER_FILES = 5000;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_WALK_DEPTH = 8;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const TEST_FILE = /\.(?:test|spec)(?:-d)?\.[cm]?[jt]sx?$|(?:^|\/)(?:tests?|__tests__|__mocks__|e2e)\//i;
/** Data trees and build output: never importers of product source. */
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  'fixture',
  'fixtures',
  '__fixtures__',
  'testdata',
  'docs',
  'documentation',
]);

export function readSource(absolute) {
  try {
    const stat = fs.statSync(absolute);
    if (!stat.isFile()) return { skip: true };
    if (stat.size > MAX_FILE_BYTES) return { oversize: true };
    return { text: fs.readFileSync(absolute, 'utf8') };
  } catch {
    return { skip: true };
  }
}

export function dirOf(rel) {
  const at = rel.lastIndexOf('/');
  return at === -1 ? '' : rel.slice(0, at);
}

export function stripExt(rel) {
  return rel.replace(DECLARATION_FILE, '').replace(SOURCE_FILE, '');
}

/** The default test-path heuristic plus the project's `coverage.testGlobs`. */
export function testPathMatcher(config) {
  const testGlobs = coverageOptionsFromConfig(config).testGlobs ?? [];
  return (rel) => TEST_FILE.test(rel) || testGlobs.some((glob) => matchSimpleGlob(glob, rel));
}

/** Non-governed project files (tests and other source), sorted, bounded. */
export function walkExternalSources(root, governed) {
  const files = [];
  let capped = 0;
  const visit = (dirRel, depth) => {
    if (depth > MAX_WALK_DEPTH) return;
    let entries;
    try {
      entries = fs.readdirSync(dirRel ? path.join(root, dirRel) : root, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const rel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(rel, depth + 1);
        continue;
      }
      if (!entry.isFile() || !SOURCE_FILE.test(entry.name) || DECLARATION_FILE.test(entry.name)) continue;
      if (governed.has(rel)) continue;
      if (files.length >= MAX_EXTERNAL_IMPORTER_FILES) capped += 1;
      else files.push(rel);
    }
  };
  visit('', 0);
  return { files, capped };
}

/** Module specifiers of a file. With bindings, named imports keep their names. */
export function fileImports(ts, rel, text, withBindings) {
  const imports = [];
  // Static declarations per specifier. preProcessFile also lists dynamic
  // import() / require() sites: any occurrence past the static ones uses the
  // whole module, so it counts as '*'.
  const statics = new Map();
  if (withBindings) {
    const sourceFile = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, false);
    for (const statement of sourceFile.statements) {
      const specifier = statement.moduleSpecifier;
      if (!specifier || !ts.isStringLiteralLike(specifier)) continue;
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      imports.push({ specifier: specifier.text, names: namedModuleBindings(ts, statement) ?? '*' });
      statics.set(specifier.text, (statics.get(specifier.text) ?? 0) + 1);
    }
  }
  const pre = ts.preProcessFile(text, true, true);
  for (const item of [...pre.importedFiles, ...pre.referencedFiles]) {
    const left = statics.get(item.fileName) ?? 0;
    if (left > 0) statics.set(item.fileName, left - 1);
    else imports.push({ specifier: item.fileName, names: '*' });
  }
  return imports;
}

/**
 * Relative and tsconfig-alias specifiers → a governed file (same lexical
 * resolver as the flat-parent graph and the write hook). Bare packages are
 * never project files.
 */
export function createResolver(ts, root, governed) {
  const aliases = readTsconfigAliases(ts, root);
  const memo = new Map();
  return (specifier, fromRel) => {
    const key = `${dirOf(fromRel)}\0${specifier}`;
    if (memo.has(key)) return memo.get(key);
    let hit = null;
    try {
      const rel = resolveSpecifierToRel(specifier, fromRel, root, aliases);
      hit = rel ? (governed.has(rel) ? rel : probeGoverned(stripExt(rel), governed)) : null;
    } catch {
      hit = null;
    }
    memo.set(key, hit);
    return hit;
  };
}

/** Governed files a barrel re-exports from (`export … from`), resolved. */
function reExportTargets(ts, root, rel, resolve) {
  const read = readSource(path.join(root, rel));
  if (read.text == null) return [];
  const sourceFile = ts.createSourceFile(rel, read.text, ts.ScriptTarget.Latest, false);
  const out = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (!specifier || !ts.isStringLiteralLike(specifier)) continue;
    const target = resolve(specifier.text, rel);
    if (target) out.push(target);
  }
  return out;
}

/**
 * Test files that import each target directly, or through one re-exporting
 * barrel. Same walk, test classifier and resolver as the files-nothing-imports
 * pass. Returns target → sorted test paths (targets nothing imports map to []).
 *
 * @param {{ root: string, ts: object, config?: object, governed: Set<string>, targets: string[] }} input
 * @returns {{ byTarget: Map<string, string[]>, capped: number }}
 */
export function testImportersOf({ root, ts, config, governed, targets }) {
  const byTarget = new Map(targets.map((target) => [target, new Set()]));
  if (!ts || typeof ts.preProcessFile !== 'function' || targets.length === 0) {
    return { byTarget: new Map(targets.map((target) => [target, []])), capped: 0 };
  }
  const isTest = testPathMatcher(config);
  const resolve = createResolver(ts, root, governed);
  const barrels = new Map();
  const { files, capped } = walkExternalSources(root, governed);
  for (const rel of files) {
    if (!isTest(rel)) continue;
    const read = readSource(path.join(root, rel));
    if (read.text == null) continue;
    for (const { specifier } of fileImports(ts, rel, read.text, false)) {
      const hit = resolve(specifier, rel);
      if (!hit) continue;
      if (byTarget.has(hit)) {
        byTarget.get(hit).add(rel);
        continue;
      }
      if (!barrels.has(hit)) barrels.set(hit, reExportTargets(ts, root, hit, resolve));
      for (const target of barrels.get(hit)) byTarget.get(target)?.add(rel);
    }
  }
  return {
    byTarget: new Map([...byTarget].map(([target, tests]) => [target, [...tests].sort()])),
    capped,
  };
}
