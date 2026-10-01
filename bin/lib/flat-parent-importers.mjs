/**
 * Importer graph for the flat-parent doctor suggestion.
 *
 * Prefers the importer index the scan projected from resolved facts (ADR 0037),
 * then raw resolved dependency facts (tsconfig paths included). Without either it scans the text and resolves relative
 * specifiers plus tsconfig path aliases, so an `@/…` importer is never
 * invisible. Advisory input only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { importerGraphFromIndex } from './import-graph-projection.mjs';
import { readTsconfigAliases, resolveSpecifierToRel } from './import-resolve.mjs';

const SPEC_MARKS = [' from "', " from '", ' from `', 'require("', "require('", 'import("', "import('"];
const EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];

function withoutComments(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (c === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2;
      while (i + 1 < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i = Math.min(text.length, i + 2);
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Every string module specifier in `text` (relative and bare). */
function moduleSpecifiers(text) {
  const specs = [];
  const source = withoutComments(String(text));
  let i = 0;
  while (i < source.length) {
    let at = -1;
    let mark = '';
    for (const candidate of SPEC_MARKS) {
      const found = source.indexOf(candidate, i);
      if (found !== -1 && (at === -1 || found < at)) {
        at = found;
        mark = candidate;
      }
    }
    if (at === -1) break;
    const quote = mark[mark.length - 1];
    const start = at + mark.length;
    const end = source.indexOf(quote, start);
    if (end === -1) break;
    const spec = source.slice(start, end);
    if (spec.length > 0) specs.push(spec);
    i = end + 1;
  }
  return specs;
}

function resolveRelative(fromFile, spec) {
  const base = fromFile.split('/');
  base.pop();
  for (const part of spec.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (base.length === 0) return null;
      base.pop();
      continue;
    }
    base.push(part);
  }
  return base.join('/');
}

function probe(joined, fileSet) {
  if (!joined) return null;
  const names = [joined];
  for (const ext of EXT) names.push(`${joined}${ext}`, `${joined}/index${ext}`);
  const stem = joined.replace(/\.(?:m|c)?js$/, '');
  if (stem !== joined) for (const ext of EXT) names.push(`${stem}${ext}`);
  for (const name of names) {
    if (fileSet.has(name)) return name;
  }
  return null;
}

function readText(root, rel) {
  try {
    return fs.readFileSync(path.join(root, rel), 'utf8');
  } catch {
    return '';
  }
}

function addEdge(graph, target, importer) {
  let set = graph.get(target);
  if (!set) {
    set = new Set();
    graph.set(target, set);
  }
  set.add(importer);
}

/**
 * target file → every file that imports it (value and type-only edges; a
 * peerIsolation wall judges both).
 * @param {{ root: string, files: string[], facts?: object, ts?: object }} input
 */
export function flatParentImporterGraph({ root, files, facts, ts }) {
  if (facts?.importGraph) return importerGraphFromIndex(facts.importGraph);
  const graph = new Map();
  const fileSet = new Set(files);
  const dependencies = Array.isArray(facts?.dependencies) ? facts.dependencies : null;
  if (dependencies && dependencies.length > 0) {
    for (const dep of dependencies) {
      if (dep?.resolution !== 'resolved-project' || typeof dep.target !== 'string') continue;
      if (typeof dep.from !== 'string' || dep.from === dep.target) continue;
      addEdge(graph, dep.target, dep.from);
    }
    return graph;
  }
  const aliases = readTsconfigAliases(ts, root);
  for (const file of files) {
    for (const spec of moduleSpecifiers(readText(root, file))) {
      const joined = spec.startsWith('.')
        ? resolveRelative(file, spec)
        : resolveSpecifierToRel(spec, file, root, aliases);
      const target = probe(joined, fileSet);
      if (target && target !== file) addEdge(graph, target, file);
    }
  }
  return graph;
}
