/**
 * Copies across a wall — Tooling (ADR 0038).
 *
 * Builds an AST-kind token stream per governed file from the TypeScript module
 * doctor already loaded (`ts.createSourceFile`, one parse per file, a pre-order
 * node walk that is JSX-safe), fingerprints it with the pure core in
 * `clone-detection.mjs` (generated from src/domain/cloneDetection.ts), and
 * classifies each candidate file pair with the gate's own classifier
 * (`findDeniedEdgeDecision`, both directions) before any verification.
 *
 * Two phases, bounded memory. Phase 1 streams: read, parse, fingerprint, append
 * to typed arrays, release the text and the tree. Phase 2 re-parses only the
 * files of crossing pairs (a cache of eight) to extend matches and compare
 * names. Every cap makes the section `partial` with counts.
 *
 * Runs only in status details (`--doctor --all`) and `--report`. Never in facts,
 * `factsHash`, the verdict, the write hook, MCP, ESLint, compact status,
 * `--changed` or `--strict-merge`. Always `notAScore`.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_GENERATED_FILE_GLOBS,
  findDeniedEdgeDecision,
  globToRegExp,
  isEdgeDenied,
  layerForRelativePath,
  pathUnderSharedRoot,
} from '../ark-layer-match.mjs';
import {
  CLONE_MIN_LINES,
  DUPLICATION_COMMAND,
  TOKEN_IDENT,
  TOKEN_KIND_OFFSET,
  TOKEN_LITERAL,
  buildDuplicationAdvisory,
  candidatePairs,
  classifyCrossing,
  emptyDuplicationTotals,
  extendMatch,
  fingerprint,
  groupFamilies,
  isGeneratedHeader,
  isListedCrossing,
  namesAgree,
  notRunDuplication,
  primaryPair,
  sameNames,
  unavailableDuplication,
} from './clone-detection.mjs';
import { graphScanLimit } from './graph-blind.mjs';

const MAX_FILE_BYTES = 256 * 1024;
const MAX_FINGERPRINTS = 1_000_000;
/** Calibrated (ADR 0038): the mother repo has 459 crossing file pairs; all compare in ~0.3 s. */
const MAX_VERIFY_PAIRS = 1000;
const VERIFY_CACHE = 8;
const PRINT_CAP = 8;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const TEST_FILE = /\.(?:test|spec)(?:-d)?\.[cm]?[jt]sx?$|(?:^|\/)(?:tests?|__tests__|__mocks__|e2e)\//i;
const GENERATED_GLOBS = DEFAULT_GENERATED_FILE_GLOBS.map((glob) => globToRegExp(glob));
/** Order a crossing pair is verified in when the verify cap bites. */
const VERIFY_ORDER = ['cross-slice', 'cross-parent', 'cross-sibling', 'cross-layer-walled', 'cross-layer'];

function scriptKindFor(ts, rel) {
  const lower = rel.toLowerCase();
  if (lower.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (lower.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/.test(lower)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function literalKinds(ts) {
  const K = ts.SyntaxKind;
  return new Set(
    [
      K.StringLiteral,
      K.NumericLiteral,
      K.BigIntLiteral,
      K.NoSubstitutionTemplateLiteral,
      K.RegularExpressionLiteral,
      K.TemplateHead,
      K.TemplateMiddle,
      K.TemplateTail,
      K.JsxText,
    ].filter((kind) => typeof kind === 'number')
  );
}

/**
 * Pre-order node walk → token kinds. Identifiers → 0, literals and JSX text → 1,
 * every other node kind → `2 + kind`; unary operators (not child nodes) are
 * emitted after their expression node. Imports, `import x = require()` and
 * `export … from` are skipped; comments are trivia and never tokens.
 * `detail` also keeps, per token, the node, the end of its subtree in tokens
 * (for line ranges) and the identifier text.
 */
export function tokenStream(ts, rel, text, detail = false) {
  const sourceFile = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, false, scriptKindFor(ts, rel));
  const K = ts.SyntaxKind;
  const literals = literalKinds(ts);
  const kinds = [];
  const nodes = detail ? [] : null;
  const names = detail ? [] : null;
  const subtreeEnd = detail ? [] : null;
  const emit = (value, node) => {
    kinds.push(value);
    if (detail) {
      nodes.push(node);
      names.push(value === TOKEN_IDENT ? String(node.text ?? '') : '');
      subtreeEnd.push(kinds.length);
    }
  };
  const visit = (node) => {
    const kind = node.kind;
    if (kind === K.ImportDeclaration || kind === K.ImportEqualsDeclaration || kind === K.EndOfFileToken) return;
    if (kind === K.ExportDeclaration && node.moduleSpecifier) return;
    if (kind === K.Identifier || kind === K.PrivateIdentifier) {
      emit(TOKEN_IDENT, node);
      return;
    }
    if (literals.has(kind)) {
      if (kind === K.JsxText && node.containsOnlyTriviaWhiteSpaces) return;
      emit(TOKEN_LITERAL, node);
      return;
    }
    const at = kinds.length;
    emit(TOKEN_KIND_OFFSET + kind, node);
    if (kind === K.PrefixUnaryExpression || kind === K.PostfixUnaryExpression) {
      emit(TOKEN_KIND_OFFSET + node.operator, node);
    }
    ts.forEachChild(node, visit);
    if (detail) subtreeEnd[at] = kinds.length;
  };
  ts.forEachChild(sourceFile, visit);
  return { kinds: Uint16Array.from(kinds), nodes, names, subtreeEnd, sourceFile };
}

function isGeneratedPath(rel) {
  return GENERATED_GLOBS.some((re) => re.test(rel));
}

/** Layers named by any deny rule: a copy there is most likely to cross a wall. */
function walledLayers(rules) {
  const out = new Set();
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (rule?.allowed !== false) continue;
    if (typeof rule.from === 'string') out.add(rule.from);
    if (typeof rule.to === 'string') out.add(rule.to);
  }
  return out;
}

function eligibleFiles(relFiles, config, rules) {
  const skipped = { test: 0, declaration: 0, generated: 0, oversize: 0, unreadable: 0, parseError: 0, cap: 0 };
  const walled = walledLayers(rules);
  const first = [];
  const rest = [];
  for (const rel of [...new Set(relFiles)].sort()) {
    if (!SOURCE_FILE.test(rel)) continue;
    if (DECLARATION_FILE.test(rel)) skipped.declaration += 1;
    else if (TEST_FILE.test(rel)) skipped.test += 1;
    else if (isGeneratedPath(rel)) skipped.generated += 1;
    else (walled.has(layerForRelativePath(rel, config?.layers)) ? first : rest).push(rel);
  }
  const ordered = [...first, ...rest];
  const limit = graphScanLimit(ordered.length);
  skipped.cap = Math.max(0, ordered.length - limit);
  return { files: ordered.slice(0, limit), eligible: ordered.length, skipped };
}

function readEligible(root, rel, skipped) {
  try {
    const absolute = path.join(root, rel);
    const stat = fs.statSync(absolute);
    if (!stat.isFile()) {
      skipped.unreadable += 1;
      return null;
    }
    if (stat.size > MAX_FILE_BYTES) {
      skipped.oversize += 1;
      return null;
    }
    const text = fs.readFileSync(absolute, 'utf8');
    if (isGeneratedHeader(text)) {
      skipped.generated += 1;
      return null;
    }
    return text;
  } catch {
    skipped.unreadable += 1;
    return null;
  }
}

/** Growable typed-array table of `(hash, file, offset)` rows. */
function createTable() {
  let capacity = 4096;
  let hashes = new Uint32Array(capacity);
  let files = new Uint32Array(capacity);
  let offsets = new Uint32Array(capacity);
  let count = 0;
  return {
    get count() {
      return count;
    },
    append(fileIndex, print) {
      const need = count + print.hashes.length;
      if (need > capacity) {
        capacity = Math.max(need, capacity * 2);
        const grow = (old) => {
          const next = new Uint32Array(capacity);
          next.set(old.subarray(0, count));
          return next;
        };
        hashes = grow(hashes);
        files = grow(files);
        offsets = grow(offsets);
      }
      hashes.set(print.hashes, count);
      offsets.set(print.offsets, count);
      files.fill(fileIndex, count, need);
      count = need;
    },
    view() {
      return { hashes, files, offsets, count };
    },
  };
}

/** Phase 1: stream every eligible file once; keep only fingerprints. */
function fingerprintFiles(root, ts, files, skipped) {
  const table = createTable();
  const fingerprinted = new Array(files.length).fill(false);
  let capped = 0;
  for (let index = 0; index < files.length; index += 1) {
    const rel = files[index];
    const text = readEligible(root, rel, skipped);
    if (text === null) continue;
    let print;
    try {
      print = fingerprint(tokenStream(ts, rel, text).kinds);
    } catch {
      skipped.parseError += 1;
      continue;
    }
    if (table.count + print.hashes.length > MAX_FINGERPRINTS) {
      capped = files.length - index;
      break;
    }
    table.append(index, print);
    fingerprinted[index] = true;
  }
  return { table: table.view(), fingerprinted, capped };
}

function wallDecision(decision) {
  if (!decision) return undefined;
  return {
    ...(decision.sliceVerdict?.crossing ? { crossing: decision.sliceVerdict.crossing } : {}),
    childSlices: Boolean(decision.rule?.childSlices),
  };
}

function decisionsFor(relA, relB, config, rules) {
  const layers = config?.layers;
  const layerA = layerForRelativePath(relA, layers);
  const layerB = layerForRelativePath(relB, layers);
  if (!layerA || !layerB) return { layerA, layerB };
  return {
    layerA,
    layerB,
    forward: findDeniedEdgeDecision(rules, layerA, layerB, { fromPath: relA, toPath: relB, layers }),
    backward: findDeniedEdgeDecision(rules, layerB, layerA, { fromPath: relB, toPath: relA, layers }),
  };
}

/** Classify every candidate file pair before any expensive verification. */
function classifyPairs(pairs, files, config, rules, totals) {
  const crossing = [];
  for (const pair of pairs) {
    const relA = files[pair.a];
    const relB = files[pair.b];
    const placed = decisionsFor(relA, relB, config, rules);
    const outcome = classifyCrossing({
      layerA: placed.layerA,
      layerB: placed.layerB,
      forward: wallDecision(placed.forward),
      backward: wallDecision(placed.backward),
    });
    if (outcome === 'same-slice') totals.pairsSameSliceUnexamined += 1;
    else if (outcome === 'fail-closed') totals.pairsUnclassifiable += 1;
    else if (outcome === 'unplaced') totals.pairsUnplaced += 1;
    else if (isListedCrossing(outcome)) crossing.push({ pair, relA, relB, crossing: outcome, ...placed });
  }
  totals.pairsCrossBoundary = crossing.length;
  crossing.sort(
    (left, right) =>
      VERIFY_ORDER.indexOf(left.crossing) - VERIFY_ORDER.indexOf(right.crossing) ||
      right.pair.shared - left.pair.shared ||
      left.pair.a - right.pair.a ||
      left.pair.b - right.pair.b
  );
  return crossing;
}

/** Phase 2 cache: at most `VERIFY_CACHE` parsed files at once. */
function createDetailCache(root, ts) {
  const cache = new Map();
  return (rel) => {
    if (cache.has(rel)) {
      const hit = cache.get(rel);
      cache.delete(rel);
      cache.set(rel, hit);
      return hit;
    }
    let entry = null;
    try {
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      entry = tokenStream(ts, rel, text, true);
    } catch {
      entry = null;
    }
    cache.set(rel, entry);
    if (cache.size > VERIFY_CACHE) cache.delete(cache.keys().next().value);
    return entry;
  };
}

function lineOf(stream, position) {
  return stream.sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

/** First line of a region: where its first token starts. */
function startLineOf(stream, start) {
  return lineOf(stream, stream.nodes[start].getStart(stream.sourceFile));
}

/** Last line of a region: the end of the last node whose whole subtree is inside it. */
function endLineOf(stream, start, end) {
  let last = stream.nodes[end - 1].end;
  for (let i = start; i < end; i += 1) {
    if (stream.subtreeEnd[i] <= end && stream.nodes[i].end > last) last = stream.nodes[i].end;
  }
  return lineOf(stream, Math.max(0, last - 1));
}

function namesIn(stream, start, end) {
  const out = [];
  for (let i = start; i < end; i += 1) if (stream.kinds[i] === TOKEN_IDENT) out.push(stream.names[i]);
  return out;
}

function verifyPair(row, load) {
  const a = load(row.relA);
  const b = load(row.relB);
  if (!a || !b) return [];
  const found = [];
  const seeds = row.pair.seeds;
  for (let i = 0; i < seeds.length; i += 2) {
    const seedA = seeds[i];
    const seedB = seeds[i + 1];
    const inside = found.some(
      (m) => seedA >= m.aStart && seedA < m.aEnd && seedB >= m.bStart && seedB < m.bEnd
    );
    if (inside) continue;
    const match = extendMatch(a.kinds, b.kinds, seedA, seedB);
    if (match) found.push(match);
  }
  const verified = [];
  for (const match of found) {
    const span = (stream, rel, layer, start, end) => ({
      path: rel,
      start,
      end,
      startLine: startLineOf(stream, start),
      endLine: endLineOf(stream, start, end),
      ...(layer ? { layer } : {}),
    });
    const left = span(a, row.relA, row.layerA, match.aStart, match.aEnd);
    const right = span(b, row.relB, row.layerB, match.bStart, match.bEnd);
    if (left.endLine - left.startLine + 1 < CLONE_MIN_LINES) continue;
    if (right.endLine - right.startLine + 1 < CLONE_MIN_LINES) continue;
    const names = sameNames(namesIn(a, match.aStart, match.aEnd), namesIn(b, match.bStart, match.bEnd));
    if (!namesAgree(names)) continue;
    verified.push({ a: left, b: right, crossing: row.crossing, names });
  }
  return verified;
}

function segmentsOf(rel) {
  return rel.split('/').filter(Boolean);
}

function dirSegments(rel) {
  return segmentsOf(rel).slice(0, -1);
}

/**
 * A declared shared root as a folder next to the member, anchored the way the
 * wall anchors it (the repo root, or one conventional source folder in).
 */
function sharedRootPath(sharedRoots, relA) {
  const head = segmentsOf(relA)[0];
  for (const raw of Array.isArray(sharedRoots) ? sharedRoots : []) {
    if (typeof raw !== 'string' || raw.includes('*')) continue;
    const root = segmentsOf(raw.replace(/\\/g, '/').replace(/^\.\//, '')).join('/');
    if (!root) continue;
    for (const candidate of [head ? `${head}/${root}` : '', root]) {
      if (candidate && pathUnderSharedRoot(`${candidate}/x.ts`, [raw])) return `${candidate}/`;
    }
  }
  return null;
}

function commonDir(relA, relB) {
  const left = dirSegments(relA);
  const right = dirSegments(relB);
  const out = [];
  for (let i = 0; i < Math.min(left.length, right.length) && left[i] === right[i]; i += 1) out.push(left[i]);
  return out.join('/');
}

function sharedLayer(config, rules, members) {
  const own = new Set(members.map((member) => member.layer));
  for (const layer of Array.isArray(config?.layers) ? config.layers : []) {
    const name = layer?.name;
    if (typeof name !== 'string' || own.has(name)) continue;
    const reachable = members.every(
      (member) => !isEdgeDenied(rules, member.layer, name, { fromPath: member.path, layers: config.layers })
    );
    if (reachable) return name;
  }
  return null;
}

/** Plain destination hint for a family (never applied). */
function destinationFor(family, config, rules) {
  const pair = primaryPair(family);
  const a = family.members[pair?.a ?? 0];
  const b = family.members[pair?.b ?? 1];
  if (!pair || !a || !b) return { kind: 'ask-place' };
  const placed = decisionsFor(a.path, b.path, config, rules);
  const wall = placed.forward?.rule?.peerIsolation ? placed.forward.rule : placed.backward?.rule;
  switch (pair.crossing) {
    case 'cross-slice':
    case 'cross-parent': {
      const shared = sharedRootPath(wall?.sharedRoots, a.path);
      return shared ? { kind: 'shared-root', path: shared } : { kind: 'ask-place' };
    }
    case 'cross-sibling': {
      const common = commonDir(a.path, b.path);
      const folder = wall?.childSlices?.commonFolders?.find((name) => typeof name === 'string' && name.length > 0);
      if (!common) return { kind: 'ask-place' };
      return { kind: 'universe-common', path: `${common}/${folder ? `${folder}/` : ''}` };
    }
    case 'cross-layer':
      if (placed.forward && !placed.backward) return { kind: 'lower-layer', layer: a.layer };
      if (placed.backward && !placed.forward) return { kind: 'lower-layer', layer: b.layer };
      return { kind: 'either-layer', layers: [a.layer, b.layer].sort() };
    default: {
      const layer = sharedLayer(config, rules, [a, b]);
      return layer ? { kind: 'shared-layer', layer } : { kind: 'ask-place' };
    }
  }
}

function partialReasonsFor(totals, capped, seedTruncated, unverified) {
  const reasons = [];
  if (totals.filesSkipped.cap > 0) {
    reasons.push(`${totals.filesSkipped.cap} file(s) were not checked: the file cap was reached.`);
  }
  if (capped > 0) reasons.push(`${capped} file(s) were not checked: the fingerprint cap was reached.`);
  if (totals.filesSkipped.parseError > 0) {
    reasons.push(`${totals.filesSkipped.parseError} file(s) could not be parsed.`);
  }
  if (seedTruncated) reasons.push('Some shared fingerprints were not paired: the pair cap was reached.');
  if (unverified > 0) reasons.push(`${unverified} crossing file pair(s) were not compared: the compare cap was reached.`);
  return reasons;
}

/**
 * @param {{ root: string, config: object, rules?: object[], ts?: object, files: string[], details?: boolean, changed?: boolean }} input
 */
export function computeCrossWallDuplication(input) {
  if (input.changed === true) {
    return notRunDuplication('Status ran on changed files only. Copies across a wall need the whole tree.');
  }
  if (input.details !== true) return notRunDuplication();
  const ts = input.ts;
  if (typeof ts?.createSourceFile !== 'function' || typeof ts?.forEachChild !== 'function') {
    return unavailableDuplication('No TypeScript parser was loaded, so no token stream could be built.');
  }
  const config = input.config ?? {};
  const rules = input.rules ?? config.rules;
  const { files, eligible, skipped } = eligibleFiles(input.files ?? [], config, rules);
  const totals = { ...emptyDuplicationTotals(), filesEligible: eligible, filesSkipped: skipped };
  const phase1 = fingerprintFiles(input.root, ts, files, skipped);
  totals.filesFingerprinted = phase1.fingerprinted.filter(Boolean).length;
  totals.fingerprints = phase1.table.count;
  const candidates = candidatePairs(phase1.table);
  totals.seedPairs = candidates.seedPairs;
  totals.bucketsSkipped = candidates.bucketsSkipped;
  totals.candidateFilePairs = candidates.pairs.length;
  const crossing = classifyPairs(candidates.pairs, files, config, rules, totals);
  const load = createDetailCache(input.root, ts);
  const verified = [];
  // Priority picks which pairs fit the cap; file order keeps the parse cache warm.
  const toVerify = crossing.slice(0, MAX_VERIFY_PAIRS);
  const byFile = [...toVerify].sort((left, right) => left.pair.a - right.pair.a || left.pair.b - right.pair.b);
  for (const row of byFile) verified.push(...verifyPair(row, load));
  totals.pairsVerified = toVerify.length;
  totals.clonePairs = verified.length;
  const families = groupFamilies(verified).map((family) => ({
    ...family,
    destination: destinationFor(family, config, rules),
  }));
  return buildDuplicationAdvisory({
    families,
    totals,
    partialReasons: partialReasonsFor(totals, phase1.capped, candidates.truncated, crossing.length - toVerify.length),
  });
}

function memberLine(member) {
  return `${member.path} lines ${member.startLine}–${member.endLine}`;
}

/** Details view. Silent when nothing crosses and nothing was cut. */
export function printCrossWallDuplicationSection(section, io) {
  if (!section || section.notAScore !== true || section.status === 'not-run') return;
  const families = Array.isArray(section.families) ? section.families : [];
  if (section.status === 'complete' && families.length === 0) return;
  console.log('');
  console.log(io.color.bold('Copies across a wall (not a score)'));
  if (section.status === 'unavailable') {
    io.line(' ', io.color.dim(section.honesty?.[0] ?? section.headline));
    return;
  }
  io.line(families.length > 0 ? io.warn : ' ', section.headline);
  for (const family of families.slice(0, PRINT_CAP)) {
    io.line(io.warn, family.line);
    for (const member of family.members) io.line(' ', io.color.dim(memberLine(member)));
  }
  if (section.truncated > 0) io.line(' ', io.color.dim(`…(+${section.truncated} more in doctor JSON)`));
  for (const text of section.honesty ?? []) io.line(' ', io.color.dim(text));
  io.line(' ', io.color.dim('advisory only — a copy is not an import; the check verdict is unchanged'));
}

/** HTML report section (report parity: `data-advisory="crossWallDuplication"`). */
export function crossWallDuplicationHtml(section, esc = (value) => String(value)) {
  if (!section || section.notAScore !== true) return '';
  const families = Array.isArray(section.families) ? section.families : [];
  let body;
  if (section.status === 'not-run') {
    body = `<p class="muted">Not run here. It runs in <code>${esc(section.next ?? DUPLICATION_COMMAND)}</code> and in the report.</p>`;
  } else {
    const items = families
      .map(
        (family) =>
          `<li><span class="tag warn">${esc(family.crossing)}</span> ${esc(family.line)}<ul>${family.members
            .map((member) => `<li><code>${esc(member.path)}</code> lines ${member.startLine}–${member.endLine}</li>`)
            .join('')}</ul></li>`
      )
      .join('');
    const more = section.truncated > 0 ? `<p class="muted">…(+${section.truncated} more in doctor JSON)</p>` : '';
    const honesty = (section.honesty ?? []).map((text) => `<p class="muted">${esc(text)}</p>`).join('');
    body = `<p>${esc(section.headline ?? '')}</p>${items ? `<ul>${items}</ul>` : ''}${more}${honesty}`;
  }
  return `<section class="section card" data-advisory="crossWallDuplication"><h2>Copies across a wall <span class="muted">(advisory — not a score; the verdict is unchanged)</span></h2>${body}</section>`;
}
