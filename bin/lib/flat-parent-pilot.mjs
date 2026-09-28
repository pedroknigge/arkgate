/**
 * Doctor suggestion: a universe-level flat file that one child slice imports.
 * Advisory only. Not a finding, not a verdict, not a config field.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  layerForRelativePath,
  resolveGovernedSlice,
  sliceAliasDestination,
  sliceIdForPath,
} from '../ark-layer-match.mjs';
import { destinationKeepsLayerAndSlice } from './physical-cohesion.mjs';

const SPEC_MARKS = [' from "', " from '", ' from `', 'require("', "require('", 'import("', "import('"];
const EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];

function ruleKey(rule) {
  const child = rule?.childSlices;
  if (!child?.sliceFolders?.length) return '';
  return [
    (rule.sliceFolders ?? []).join('\0'),
    rule.sliceIdentity ?? '',
    child.sliceFolders.join('\0'),
    child.sliceIdentity ?? '',
    (child.commonFolders ?? []).join('\0'),
  ].join('\n');
}

function distinctChildRules(rules) {
  const out = [];
  const seen = new Set();
  for (const rule of Array.isArray(rules) ? rules : []) {
    const key = ruleKey(rule);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(rule);
  }
  return out;
}

function isFlatParent(rel, rule) {
  const universe = sliceIdForPath(rel, rule.sliceFolders, rule.sliceIdentity);
  const raw = sliceIdForPath(rel, rule.childSlices.sliceFolders, rule.childSlices.sliceIdentity);
  return Boolean(universe && raw && raw.toLowerCase() === universe.toLowerCase());
}

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

function relativeSpecifiers(text) {
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
    if (spec.startsWith('.')) specs.push(spec);
    i = end + 1;
  }
  return specs;
}

function resolveRelative(fromFile, spec, fileSet) {
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
  const joined = base.join('/');
  const names = [joined];
  for (const ext of EXT) names.push(`${joined}${ext}`, `${joined}/index${ext}`);
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

function childImporters(flatFiles, files, rule, root) {
  const flat = new Set(flatFiles);
  const known = new Set(files);
  const importers = new Map();
  for (const file of files) {
    const place = resolveGovernedSlice(file, rule);
    if (!place.childId) continue;
    for (const spec of relativeSpecifiers(readText(root, file))) {
      const target = resolveRelative(file, spec, known);
      if (!target || !flat.has(target) || target === file) continue;
      let ids = importers.get(target);
      if (!ids) {
        ids = new Set();
        importers.set(target, ids);
      }
      ids.add(place.childId);
    }
  }
  return importers;
}

function basename(rel) {
  const parts = rel.split('/');
  return parts[parts.length - 1] ?? rel;
}

/**
 * @param {{ root: string, files: string[], rules: object[] | undefined, layers: object[] | undefined }} input
 * @returns {object | null}
 */
export function collectFlatParentPilot(input) {
  const rules = distinctChildRules(input?.rules);
  if (rules.length === 0) return null;
  const files = (Array.isArray(input.files) ? input.files : [])
    .map((file) => String(file).replace(/\\/g, '/'))
    .filter((file) => file.length > 0);
  const layers = input.layers;
  const moves = [];
  const seen = new Set();
  for (const rule of rules) {
    const flat = files.filter((file) => isFlatParent(file, rule));
    if (flat.length === 0) continue;
    const importers = childImporters(flat, files, rule, input.root);
    for (const file of flat) {
      if (seen.has(file)) continue;
      const ids = importers.get(file);
      if (!ids || ids.size !== 1) continue;
      const importer = [...ids][0];
      const destination = sliceAliasDestination(file, importer, rule.childSlices);
      if (!destination) continue;
      const destFile = `${destination}/${basename(file)}`;
      const layer = layerForRelativePath(file, layers);
      if (!layer || layer !== layerForRelativePath(destFile, layers)) continue;
      const toPlace = resolveGovernedSlice(destFile, rule);
      if ((toPlace.childId ?? '') !== importer) continue;
      const fromPlace = resolveGovernedSlice(file, rule);
      const keepsSlice = destinationKeepsLayerAndSlice(file, destFile, layers, [rule]);
      const wallSame =
        (fromPlace.universeId ?? '') === (toPlace.universeId ?? '') &&
        (fromPlace.childId ?? '') === (toPlace.childId ?? '');
      seen.add(file);
      moves.push({
        file,
        importer,
        destination,
        layer,
        keepsLayer: true,
        keepsSlice,
        destinationChild: toPlace.childId,
        agreesWithWall: keepsSlice === wallSame,
        evidence: `One child imports ${file} (${importer}). Move it into ${destination}. The ${layer} layer stays. This is a suggestion with that importer as its evidence.`,
      });
    }
  }
  if (moves.length === 0) return null;
  moves.sort((left, right) => (left.file < right.file ? -1 : left.file > right.file ? 1 : 0));
  return {
    advisory: true,
    notAScore: true,
    proposed: true,
    applied: false,
    neverMechanicalSafe: true,
    moves,
  };
}

/** One pilot candidate per move. Appended after pattern bets and the reshape card. */
export function flatParentCandidates(section) {
  if (!section || !Array.isArray(section.moves)) return [];
  return section.moves
    .filter((move) => move && typeof move.file === 'string' && move.file.length > 0)
    .map((move) => ({
      source: 'flat-parent',
      target: move.file,
      move: typeof move.evidence === 'string' ? move.evidence : `Move ${move.file} into its one importing child. This is a suggestion.`,
      moveSample: [{ from: move.file, to: `${move.destination}/${basename(move.file)}` }],
      successSignal: 're-run doctor: this file is no longer a single-importer flat parent',
      killSwitch: 'leave the file where it is',
      doNot: [
        'a suggestion with one importer as its evidence',
        'leave a file in place when two children import it',
        'one pilot at a time; re-doctor before the next card',
        'never weaken the contract to make a move pass',
      ],
    }));
}

export function printFlatParentPilot(section, io) {
  const moves = Array.isArray(section?.moves) ? section.moves : [];
  if (moves.length === 0) return;
  console.log('');
  console.log(io.color.bold('Flat parent files (suggestion)'));
  for (const move of moves.slice(0, 5)) io.line(io.warn, move.evidence);
  if (moves.length > 5) io.line(' ', io.color.dim(`…(+${moves.length - 5} more in doctor JSON)`));
  io.line(' ', io.color.dim('suggestion only — one importer is the evidence; the gate verdict is unchanged'));
}

export function flatParentPilotHtml(section, escape) {
  const moves = Array.isArray(section?.moves) ? section.moves : [];
  if (moves.length === 0) return '';
  const esc = typeof escape === 'function' ? escape : (value) => String(value);
  const items = moves
    .slice(0, 5)
    .map((move) => `<li>${esc(move.evidence ?? '')}</li>`)
    .join('');
  const more = moves.length > 5 ? `<p class="muted">…(+${moves.length - 5} more in doctor JSON)</p>` : '';
  return `<section class="section card" data-advisory="flatParentPilot"><h2>Flat parent files <span class="muted">(suggestion — one importer is the evidence; not a score; the verdict is unchanged)</span></h2><ul>${items}</ul>${more}</section>`;
}
