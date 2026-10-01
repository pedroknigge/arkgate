/**
 * Files nothing imports — Tooling (ADR 0037).
 *
 * Reads the importer index the scan projected from resolved facts, the entry
 * evidence, and the importers that live outside the governed graph: test
 * files, non-governed project source, path literals that name a file, and
 * lexical dynamic reach (`import(\`./x/${…}\`)`, `import.meta.glob`,
 * `new URL(…, import.meta.url)`, `require.context`). The pure decision lives
 * in `orphan-modules.mjs` (generated from src/domain/orphanModules.ts).
 *
 * Bounded: the outside pass reads at most 5000 files of 256 KB each and runs
 * only while a file without an importer remains. Advisory only — never a gate
 * input, never in the write hook, MCP write tools, ESLint or --strict-merge.
 */
import path from 'node:path';
import { globToRegExp, layerForRelativePath } from '../ark-layer-match.mjs';
import { ambientEntries, collectEntryPoints, entriesBySource } from './entry-points-io.mjs';
import { graphScanLimit } from './graph-blind.mjs';
import {
  ORPHAN_MODULE_NEXT,
  deferredUnusedExports,
  findOrphanModules,
  findUnusedExports,
  moduleStem,
  orphanModuleLine,
  unavailableOrphanModules,
  unusedExportLine,
} from './orphan-modules.mjs';
import {
  MAX_EXTERNAL_IMPORTER_FILES,
  createResolver,
  dirOf,
  fileImports,
  readSource,
  stripExt,
  testPathMatcher,
  walkExternalSources,
} from './outside-importers.mjs';

const MAX_EXPORT_PARSE_FILES = 3000;
const PRINT_CAP = 10;
const QUOTED = /(['"`])([^'"`\n]{1,300})\1/g;
const TEMPLATE_HEAD = /\b(?:import|require)\s*\(\s*(?:`([^`$]*)\$\{|(['"])([^'"\n]+)\2\s*\+)/g;
const META_GLOB = /import\.meta\.glob(?:Eager)?\s*(?:<[^>]*>)?\s*\(\s*(\[[^\]]*\]|(['"`])[^'"`\n]+\2)/g;
const NEW_URL = /new\s+URL\s*\(\s*(['"`])([^'"`\n]+)\1\s*,\s*import\.meta\.url/g;
const REQUIRE_CONTEXT = /require\.context\s*\(\s*(['"`])([^'"`\n]+)\1/g;
const REACH_GATE = /import\s*\(|require\s*\(|import\.meta\.glob|new\s+URL|require\.context/;
const GENERATED_MARK = /GENERATED FILE|@generated|DO NOT EDIT|\bgenerated (?:from|by)\b/i;
const GENERATED_HEADER_CHARS = 1200;
const PATH_IN_HEADER = /[\w@.-][\w@./-]*\.[cm]?[jt]sx?(?![\w/])/g;

/** `from`'s directory joined with a relative literal; null for bare / escaping. */
function relativeTo(fromRel, literal) {
  if (typeof literal !== 'string') return null;
  const raw = literal.startsWith('/') ? literal.slice(1) : literal;
  const base = literal.startsWith('/') ? '' : dirOf(fromRel);
  if (!literal.startsWith('.') && !literal.startsWith('/')) return null;
  const joined = path.posix.normalize(base ? `${base}/${raw}` : raw);
  if (joined === '..' || joined.startsWith('../')) return null;
  return joined.replace(/^\.\//, '');
}

/** A generated copy names the file it was generated from in its header. */
function generatedSources(rel, text, governed) {
  const header = text.slice(0, GENERATED_HEADER_CHARS);
  if (!GENERATED_MARK.test(header)) return null;
  const dir = dirOf(rel);
  const sources = [];
  for (const token of header.match(PATH_IN_HEADER) ?? []) {
    const hit = governed.has(token) ? token : dir && governed.has(`${dir}/${token}`) ? `${dir}/${token}` : null;
    if (hit) sources.push(hit);
  }
  return sources;
}

/** Heuristic: a match on a line that is (or has turned into) a comment is prose, not code. */
function inComment(text, index) {
  const prefix = text.slice(text.lastIndexOf('\n', index - 1) + 1, index);
  return /^\s*(?:\*|\/\*|\/\/)/.test(prefix) || /(?:^|[^:'"`])\/\//.test(prefix);
}

/** Exported names, or null when not knowable (`export *`, `export =`, destructuring). */
function exportedNames(ts, sourceFile) {
  const names = [];
  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (!clause) return null;
      if (ts.isNamespaceExport?.(clause)) names.push(clause.name.text);
      else for (const element of clause.elements) names.push(element.name.text);
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      if (statement.isExportEquals) return null;
      names.push('default');
      continue;
    }
    const modifiers = statement.modifiers ?? [];
    if (!modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
      names.push('default');
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) return null;
        names.push(declaration.name.text);
      }
    } else if (statement.name && ts.isIdentifier(statement.name)) {
      names.push(statement.name.text);
    } else {
      return null;
    }
  }
  return names;
}

/**
 * Where a file may be loaded without a static import. Returns one sentence per
 * reached candidate, from lexical evidence in `rel`'s text.
 */
function reachFrom(rel, text, candidates, byBase) {
  const hits = new Map();
  const mark = (file, why) => {
    if (!hits.has(file)) hits.set(file, why);
  };
  for (const match of text.matchAll(QUOTED)) {
    if (inComment(text, match.index)) continue;
    const literal = match[2];
    const base = literal.slice(literal.lastIndexOf('/') + 1);
    for (const file of byBase.get(base) ?? []) {
      const exact = literal === file || literal.endsWith(`/${file}`) || relativeTo(rel, literal) === file;
      const bare = literal === base && !base.startsWith('index.');
      if (exact || bare) mark(file, `${rel} names it by path`);
    }
  }
  if (!REACH_GATE.test(text)) return hits;
  for (const match of text.matchAll(TEMPLATE_HEAD)) {
    if (inComment(text, match.index)) continue;
    const prefix = relativeTo(rel, match[1] ?? match[3]);
    if (!prefix) continue;
    for (const file of candidates) {
      if (file.startsWith(prefix)) mark(file, `a dynamic import in ${rel} can load files under ${prefix}`);
    }
  }
  for (const match of text.matchAll(META_GLOB)) {
    if (inComment(text, match.index)) continue;
    const literals = [...match[1].matchAll(/(['"`])([^'"`\n]+)\1/g)].map((item) => item[2]);
    for (const literal of literals) {
      if (literal.startsWith('!')) continue;
      const pattern = relativeTo(rel, literal);
      if (!pattern) continue;
      const re = globToRegExp(pattern);
      for (const file of candidates) if (re.test(file)) mark(file, `import.meta.glob in ${rel} matches it`);
    }
  }
  for (const match of text.matchAll(NEW_URL)) {
    if (inComment(text, match.index)) continue;
    const target = relativeTo(rel, match[2]);
    if (!target) continue;
    for (const file of candidates) {
      if (file === target || stripExt(file) === stripExt(target)) mark(file, `new URL(…, import.meta.url) in ${rel} points at it`);
    }
  }
  for (const match of text.matchAll(REQUIRE_CONTEXT)) {
    if (inComment(text, match.index)) continue;
    const prefix = relativeTo(rel, match[2]);
    if (!prefix) continue;
    for (const file of candidates) {
      if (file.startsWith(`${prefix.replace(/\/$/, '')}/`)) mark(file, `require.context in ${rel} can load it`);
    }
  }
  return hits;
}

function addUse(namedUse, file, names) {
  const previous = namedUse.get(file);
  if (previous === '*') return;
  if (names === '*') {
    namedUse.set(file, '*');
    return;
  }
  const set = previous ?? new Set();
  for (const name of names) set.add(name);
  namedUse.set(file, set);
}

/**
 * Importers outside the governed graph plus lexical reach.
 * Compact runs resolve only specifiers whose stem matches a candidate.
 */
function scanOutside({ root, ts, config, governed, candidates, details, governedScan }) {
  const isTest = testPathMatcher(config);
  const candidateSet = new Set(candidates);
  const stems = new Set();
  const byBase = new Map();
  for (const file of candidates) {
    stems.add(moduleStem(file));
    const segments = file.split('/');
    if (moduleStem(file) === 'index' && segments.length > 1) stems.add(segments[segments.length - 2]);
    const base = segments[segments.length - 1];
    byBase.set(base, [...(byBase.get(base) ?? []), file]);
  }
  const resolve = createResolver(ts, root, governed);
  const testImporters = new Map();
  const outsideImporters = new Map();
  const dynamicReach = new Map();
  const namedUse = new Map();
  let oversize = 0;
  const bump = (map, file) => map.set(file, (map.get(file) ?? 0) + 1);
  const { files, capped } = walkExternalSources(root, governed);
  for (const rel of files) {
    const read = readSource(path.join(root, rel));
    if (read.oversize) oversize += 1;
    if (read.text == null) continue;
    const test = isTest(rel);
    for (const { specifier, names } of fileImports(ts, rel, read.text, details)) {
      const stem = moduleStem(specifier);
      const last = specifier.split('/').pop() ?? '';
      if (!details && !stems.has(stem) && !stems.has(last)) continue;
      const target = resolve(specifier, rel);
      if (!target) continue;
      if (candidateSet.has(target)) bump(test ? testImporters : outsideImporters, target);
      if (details) addUse(namedUse, target, names);
    }
    for (const [file, why] of reachFrom(rel, read.text, candidates, byBase)) {
      if (test) bump(testImporters, file);
      else if (!dynamicReach.has(file)) dynamicReach.set(file, why);
    }
  }
  // Governed files: lexical reach, plus generated copies (the header names the source).
  const generated = new Set();
  const generatedFrom = new Map();
  for (const rel of governedScan ?? []) {
    const read = readSource(path.join(root, rel));
    if (read.text == null) continue;
    const sources = generatedSources(rel, read.text, governed);
    if (sources) {
      generated.add(rel);
      for (const source of sources) if (source !== rel && !generatedFrom.has(source)) generatedFrom.set(source, rel);
    }
    if (candidates.length === 0) continue;
    for (const [file, why] of reachFrom(rel, read.text, candidates, byBase)) {
      if (file !== rel && !dynamicReach.has(file)) dynamicReach.set(file, why);
    }
  }
  for (const source of generatedFrom.keys()) if (candidateSet.has(source)) bump(outsideImporters, source);
  return { testImporters, outsideImporters, dynamicReach, namedUse, generated, generatedFrom, capped, oversize };
}

function partialReasonsFor(importGraph, outside, reachDeferred, unmapped) {
  const reasons = [];
  if (importGraph.completeness !== 'complete') {
    reasons.push('The import analysis was incomplete, so some importers may be missing.');
  }
  if (importGraph.invalidFiles > 0) {
    reasons.push(`${importGraph.invalidFiles} governed file(s) did not parse, so their imports are missing.`);
  }
  const followed = [];
  if (importGraph.dynamicSites > 0) followed.push(`${importGraph.dynamicSites} dynamic`);
  if (importGraph.unresolvedTotal > 0) followed.push(`${importGraph.unresolvedTotal} unresolved`);
  if (followed.length > 0) {
    reasons.push(`Some imports could not be followed (${followed.join(', ')}). These files may still be used.`);
  }
  if (unmapped.length > 0) {
    const sample = unmapped.slice(0, 3).map((row) => row.declared).join(', ');
    reasons.push(`${unmapped.length} package.json entry path(s) map to no governed source file (${sample}).`);
  }
  if (outside && outside.capped > 0) {
    reasons.push(`The outside-importer pass stopped at ${MAX_EXTERNAL_IMPORTER_FILES} files; ${outside.capped} were not read.`);
  }
  if (outside && outside.oversize > 0) {
    reasons.push(`${outside.oversize} file(s) over 256 KB were not read for imports.`);
  }
  if (reachDeferred) {
    reasons.push(`Dynamic loading was not scanned at this size (${importGraph.files.length} governed files).`);
  }
  return reasons;
}

function unusedExportsFor({ root, ts, importGraph, entries, outside, partialReasons, skip }) {
  const namedUse = new Map();
  importGraph.namedUse.forEach((names, index) => addUse(namedUse, importGraph.files[index], names));
  outside.namedUse.forEach((names, file) => addUse(namedUse, file, names));
  // A generated copy's importers use the source it was generated from.
  for (const [source, copy] of outside.generatedFrom) {
    const use = namedUse.get(copy);
    if (use !== undefined) addUse(namedUse, source, use);
  }
  const exportsByFile = new Map();
  let parsed = 0;
  let unparsed = 0;
  for (const [file, use] of [...namedUse].sort(([left], [right]) => (left < right ? -1 : 1))) {
    if (use === '*' || entries.has(file) || skip.has(file) || outside.generated.has(file)) continue;
    if (parsed >= MAX_EXPORT_PARSE_FILES) {
      unparsed += 1;
      continue;
    }
    const read = readSource(path.join(root, file));
    if (read.text == null) {
      exportsByFile.set(file, null);
      continue;
    }
    parsed += 1;
    exportsByFile.set(file, exportedNames(ts, ts.createSourceFile(file, read.text, ts.ScriptTarget.Latest, false)));
  }
  const reasons = [...partialReasons];
  if (unparsed > 0) reasons.push(`${unparsed} file(s) past the ${MAX_EXPORT_PARSE_FILES}-file parse cap were not checked.`);
  return findUnusedExports({ exportsByFile, namedUse, entries: new Set(entries.keys()), partialReasons: reasons });
}

/**
 * @param {{ root: string, config?: object, ts?: object, importGraph?: ReturnType<import('./import-graph-projection.mjs').projectImporterIndex>, details?: boolean, today?: string }} input
 */
export function computeOrphanModules(input) {
  const { root, config, ts, importGraph } = input;
  const details = input.details === true;
  if (!importGraph || !ts || typeof ts.preProcessFile !== 'function') {
    return {
      ...unavailableOrphanModules(
        !importGraph
          ? 'This run had no import facts. Run arkgate-check --doctor to list files nothing imports.'
          : 'TypeScript was not available, so files nothing imports were not checked.'
      ),
      unusedExports: deferredUnusedExports(),
    };
  }
  const governed = new Set(importGraph.files);
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const evidence = collectEntryPoints(root, { governed: importGraph.files, config, ts, today });
  const zero = importGraph.files.filter(
    (file, index) => importGraph.importerCount[index] === 0 && !evidence.entries.has(file)
  );
  for (const file of ambientEntries(root, zero)) evidence.entries.set(file, 'ambient');
  const candidates = zero.filter((file) => !evidence.entries.has(file));
  const reachLimit = graphScanLimit(importGraph.files.length);
  const reachDeferred = candidates.length > 0 && importGraph.files.length > reachLimit;
  const outside =
    candidates.length > 0 || details
      ? scanOutside({
          root,
          ts,
          config,
          governed,
          candidates,
          details,
          governedScan: importGraph.files.length > reachLimit ? null : importGraph.files,
        })
      : null;
  const partialReasons = partialReasonsFor(importGraph, outside, reachDeferred, evidence.unmapped);
  const unresolvedStems = new Set(importGraph.unresolved.map((row) => moduleStem(row.specifier)));
  const result = findOrphanModules({
    files: importGraph.files,
    importerCount: importGraph.importerCount,
    entries: evidence.entries,
    testImporters: outside?.testImporters ?? new Map(),
    outsideImporters: outside?.outsideImporters ?? new Map(),
    dynamicReach: outside?.dynamicReach ?? new Map(),
    unresolvedStems,
    annotations: evidence.expiredByPath,
    frameworks: evidence.frameworks,
    entryEvidence: { bySource: entriesBySource(evidence.entries), unmapped: evidence.unmapped.length },
    partialReasons,
    notes: evidence.sidecar.note ? [evidence.sidecar.note] : [],
  });
  for (const item of result.orphans) {
    const layer = layerForRelativePath(item.path, config?.layers);
    if (layer) item.layer = layer;
  }
  result.unusedExports = details
    ? unusedExportsFor({
        root,
        ts,
        importGraph,
        entries: evidence.entries,
        outside,
        partialReasons: [
          ...partialReasons.filter((reason) => !reason.startsWith('Dynamic loading')),
          ...(importGraph.files.length > reachLimit
            ? [`Generated copies were not detected at this size (${importGraph.files.length} governed files).`]
            : []),
        ],
        // Listed files are tier 1. Files only tests or outside code import stay in tier 2.
        skip: new Set(
          candidates.filter((file) => !outside?.testImporters.has(file) && !outside?.outsideImporters.has(file))
        ),
      })
    : deferredUnusedExports();
  return result;
}

/** Compact view: one dim count line, or silence. */
export function printOrphanModulesCompactLine(section, io) {
  const listed = Number(section?.totals?.listed) || 0;
  if (section?.notAScore !== true || listed === 0) return;
  console.log('');
  // Tier 2 ran only under --all / --report; then the Details section follows, so no pointer.
  const detailsRan = section?.unusedExports?.status !== undefined && section.unusedExports.status !== 'deferred';
  const hint = detailsRan ? '' : ' Details: arkgate-check --doctor --all';
  io.line(' ', io.color.dim(`${listed} file${listed === 1 ? '' : 's'} nothing imports.${hint}`));
}

/** Details view. */
export function printOrphanModulesSection(section, io) {
  if (!section || section.notAScore !== true) return;
  const listed = Number(section.totals?.listed) || 0;
  const testOnly = Number(section.testOnly?.count) || 0;
  const unused = section.unusedExports;
  const unusedRows = Array.isArray(unused?.files) ? unused.files : [];
  if (section.status === 'complete' && listed === 0 && testOnly === 0 && unusedRows.length === 0) return;
  console.log('');
  console.log(io.color.bold('Files nothing imports (not a score)'));
  if (section.status === 'unavailable') {
    io.line(' ', io.color.dim(section.honesty?.[0] ?? section.headline));
    return;
  }
  io.line(listed > 0 ? io.warn : ' ', section.headline);
  for (const item of section.orphans.slice(0, PRINT_CAP)) io.line(io.warn, orphanModuleLine(item));
  const more = listed - Math.min(listed, PRINT_CAP, section.orphans.length);
  if (more > 0) io.line(' ', io.color.dim(`…(+${more} more in doctor JSON)`));
  if (listed > 0) io.line(' ', `Next: ${ORPHAN_MODULE_NEXT}`);
  if (testOnly > 0) {
    io.line(' ', io.color.dim(`${testOnly} file(s) only tests import (for example ${section.testOnly.sample[0]}). Not listed.`));
  }
  for (const text of section.honesty ?? []) io.line(' ', io.color.dim(text));
  if (unusedRows.length > 0) {
    io.line(' ', 'Exports nothing imports by name:');
    for (const row of unusedRows.slice(0, PRINT_CAP)) io.line(io.warn, unusedExportLine(row));
    const extra = unusedRows.length + (unused.truncated ?? 0) - Math.min(unusedRows.length, PRINT_CAP);
    if (extra > 0) io.line(' ', io.color.dim(`…(+${extra} more in doctor JSON)`));
  }
  io.line(' ', io.color.dim('advisory only — nothing imports these files; the check verdict is unchanged'));
}

/** HTML report section (report parity: `data-advisory="orphanModules"`). */
export function orphanModulesHtml(section, esc = (value) => String(value)) {
  if (!section || section.notAScore !== true) return '';
  const orphans = Array.isArray(section.orphans) ? section.orphans : [];
  const items = orphans
    .map((item) => `<li><span class="tag warn">${esc(item.certainty)}</span> ${esc(orphanModuleLine(item))}</li>`)
    .join('');
  const more = section.truncated > 0 ? `<p class="muted">…(+${section.truncated} more in doctor JSON)</p>` : '';
  const next = orphans.length > 0 ? `<p>Next: ${esc(ORPHAN_MODULE_NEXT)}</p>` : '';
  const testOnly =
    section.testOnly?.count > 0
      ? `<p class="muted">${section.testOnly.count} file(s) only tests import. Not listed.</p>`
      : '';
  const honesty = (section.honesty ?? []).map((text) => `<p class="muted">${esc(text)}</p>`).join('');
  const unused = section.unusedExports;
  const unusedRows = Array.isArray(unused?.files) ? unused.files : [];
  const unusedHtml =
    unusedRows.length > 0
      ? `<h3>Exports nothing imports by name</h3><ul>${unusedRows
          .map((row) => `<li><code>${esc(row.path)}</code>: ${esc(row.exports.join(', '))}</li>`)
          .join('')}</ul>`
      : unused?.status === 'deferred'
        ? `<p class="muted">Unused exports: run <code>${esc(unused.next ?? '')}</code>.</p>`
        : '';
  return `<section class="section card" data-advisory="orphanModules"><h2>Files nothing imports <span class="muted">(advisory — not a score; the verdict is unchanged)</span></h2><p>${esc(section.headline ?? '')}</p><ul>${items}</ul>${more}${next}${testOnly}${honesty}${unusedHtml}</section>`;
}
