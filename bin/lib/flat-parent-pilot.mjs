/**
 * Doctor suggestion: a universe-level flat file that one child slice imports.
 * Advisory only. Not a finding, not a verdict, not a config field.
 */
import {
  findDeniedEdgeDecision,
  layerForRelativePath,
  resolveGovernedSlice,
  sliceAliasDestination,
  sliceIdForPath,
} from '../ark-layer-match.mjs';
import { destinationKeepsLayerAndSlice } from './physical-cohesion.mjs';
import { flatParentImporterGraph } from './flat-parent-importers.mjs';

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

/**
 * Importers of each flat file, split by child. A file any non-child imports
 * (universe common, a shared root, another universe, another layer) is marked:
 * moving it into one child would turn that edge into a wall deny.
 */
function childImporters(flatFiles, graph, rule) {
  const out = new Map();
  for (const target of flatFiles) {
    const universe = resolveGovernedSlice(target, rule).universeId ?? '';
    const ids = new Set();
    let nonChild = false;
    for (const importer of graph.get(target) ?? []) {
      const place = resolveGovernedSlice(importer, rule);
      if (!place.childId || (place.universeId ?? '') !== universe) nonChild = true;
      else ids.add(place.childId);
    }
    out.set(target, { ids, nonChild, importers: [...(graph.get(target) ?? [])] });
  }
  return out;
}

/** Would any recorded importer be denied by the rules after the move? */
function moveBreaksWall(importers, destFile, rules, layers) {
  const toLayer = layerForRelativePath(destFile, layers);
  for (const importer of importers) {
    const fromLayer = layerForRelativePath(importer, layers);
    if (!fromLayer || !toLayer) return true;
    const denied = findDeniedEdgeDecision(rules, fromLayer, toLayer, {
      fromPath: importer,
      toPath: destFile,
      layers,
    });
    if (denied) return true;
  }
  return false;
}

function basename(rel) {
  const parts = rel.split('/');
  return parts[parts.length - 1] ?? rel;
}

/**
 * @param {{ root: string, files: string[], rules: object[] | undefined, layers: object[] | undefined, facts?: object, ts?: object }} input
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
  let graph = null;
  for (const rule of rules) {
    const flat = files.filter((file) => isFlatParent(file, rule));
    if (flat.length === 0) continue;
    graph ??= flatParentImporterGraph({ root: input.root, files, facts: input.facts, ts: input.ts });
    const importers = childImporters(flat, graph, rule);
    for (const file of flat) {
      if (seen.has(file)) continue;
      const entry = importers.get(file);
      // Exactly one child and nobody else: two children, or any non-child importer, keeps it in place.
      if (!entry || entry.nonChild || entry.ids.size !== 1) continue;
      const importer = [...entry.ids][0];
      const destination = sliceAliasDestination(file, importer, rule.childSlices);
      if (!destination) continue;
      const destFile = `${destination}/${basename(file)}`;
      const layer = layerForRelativePath(file, layers);
      if (!layer || layer !== layerForRelativePath(destFile, layers)) continue;
      const toPlace = resolveGovernedSlice(destFile, rule);
      if ((toPlace.childId ?? '') !== importer) continue;
      if (moveBreaksWall(entry.importers, destFile, input.rules, layers)) continue;
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
