/**
 * Deterministic contract smells (Phase W / W01) — meta-lint of ark.config.json itself.
 *
 * ArkGate validates code against the contract; these sensors validate the contract
 * against known contract anti-patterns: rule shapes that permit future degradation
 * even at 0 violations. Advisory only — they never change a pass/fail verdict, never
 * feed designWeak/patternBets, and never block a gate. Complements `soft-contract`
 * (missing rules) by detecting *permissive or unused* rules.
 *
 * Acknowledgments live in an optional sidecar (`.ark/contract-smell-acks.json`,
 * Q03 golden-pattern precedent) so the versioned config contract is untouched.
 * A malformed ack file (or a malformed edge inside it) never suppresses a smell.
 *
 * Known limit (documented, deliberate): layer roles are inferred from layer NAMES
 * via substring heuristics — a name like "Auditorium" reads as audit-ish. The
 * surface is advisory, so a miss costs a warning line, never a verdict.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Stable contract-smell ids (doctor JSON `contractHealth` + skills). */
export const CONTRACT_SMELL_IDS = Object.freeze([
  'contract-bidirectional-allow',
  'contract-peripheral-depends-core',
  'contract-lateral-adapter-allow',
  'contract-dead-rule',
]);

/** Plain-language outcome per id (Q02 pattern: outcome first, technical detail in message). */
export const CONTRACT_SMELL_OUTCOMES = Object.freeze({
  'contract-bidirectional-allow':
    'Two layers may depend on each other in both directions — nothing stops a dependency cycle from growing there. Keep one direction, or acknowledge the loop explicitly with the reason.',
  'contract-peripheral-depends-core':
    'An observability/audit-style layer is allowed to reach into orchestration or persistence — it can quietly become a second orchestrator. Keep periphery consuming events/ports, not core internals.',
  'contract-lateral-adapter-allow':
    'One adapter layer may import another adapter family directly — shared mappers/aliases will pile up in the wrong place. Move shared shapes into Domain (or a shared kernel) instead of adapter-to-adapter reach.',
  'contract-dead-rule':
    'A rule enforces nothing: it points at a layer that matches no files or does not exist, or both sides are the same layer. Fix the layer patterns or delete the rule.',
});

export const CONTRACT_SMELL_ACKS_PATH = '.ark/contract-smell-acks.json';

/** Hostile-input bounds (mirrors design-smells MAX_FILE_BYTES discipline). */
const MAX_ACK_BYTES = 64 * 1024;
const MAX_ACK_ENTRIES = 200;
const MAX_EVIDENCE = 12;
const MAX_MESSAGE_EDGES = 6;

const PERIPHERAL_LAYER_RE = /observab|audit|telemetry|monitor|logging|metric|tracing/i;
const CORE_TARGET_RE = /application|orchestr|persist|repositor/i;
const ADAPTER_LAYER_RE = /adapter|persist|integrat|infra|gateway/i;

/** Collision-safe internal key for a directed edge (layer names are arbitrary strings). */
function directedKey(from, to) {
  return JSON.stringify([from, to]);
}

/** Display + ack pair key. Only meaningful when neither name embeds the delimiter. */
function pairLabel(a, b) {
  return [a, b].sort().join('<->');
}

/** Names embedding the arrow delimiter cannot be matched safely from ack strings. */
function ackMatchable(...names) {
  return names.every((n) => typeof n === 'string' && !n.includes('->'));
}

/**
 * Load the optional acknowledgment sidecar. Bounded and fail-loud:
 * non-file, oversized, unparsable, or wrong-shaped content → `invalid: true`
 * with `acks: []` (a broken file never suppresses anything).
 *
 * @param {string} root
 * @returns {{ path: string, exists: boolean, invalid?: boolean, error?: string, acks: Array<{id: string, edge: string, reason?: string}> }}
 */
export function loadContractSmellAcks(root) {
  const relPath = CONTRACT_SMELL_ACKS_PATH;
  const abs = path.join(root, relPath);
  let stats;
  try {
    stats = fs.statSync(abs);
  } catch {
    return { path: relPath, exists: false, acks: [] };
  }
  const invalid = (error) => ({ path: relPath, exists: true, invalid: true, error, acks: [] });
  if (!stats.isFile()) return invalid('not a regular file');
  if (stats.size > MAX_ACK_BYTES) return invalid(`larger than ${MAX_ACK_BYTES} bytes`);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (error) {
    return invalid(error instanceof Error ? error.message : 'unreadable JSON');
  }
  const acks = Array.isArray(parsed?.acks) ? parsed.acks : null;
  if (!acks) return invalid('expected { acks: [{ id, edge, reason? }] }');
  if (acks.length > MAX_ACK_ENTRIES) return invalid(`more than ${MAX_ACK_ENTRIES} entries`);
  const wellFormed = acks.every(
    (a) =>
      a !== null &&
      typeof a === 'object' &&
      typeof a.id === 'string' &&
      typeof a.edge === 'string' &&
      a.edge.trim().length > 0
  );
  if (!wellFormed) return invalid('every ack needs string id and non-empty string edge');
  return { path: relPath, exists: true, acks };
}

/**
 * Normalize an ack edge string; returns null (never matches) for malformed grammar,
 * e.g. `A<->B<->C` — a sloppy edge must not suppress a real smell.
 */
function normalizeAckEdge(id, edge) {
  const raw = String(edge).trim();
  if (id === 'contract-bidirectional-allow') {
    if (!raw.includes('<->')) return null;
    const parts = raw.split('<->').map((s) => s.trim());
    if (parts.length !== 2 || parts.some((p) => p.length === 0)) return null;
    return pairLabel(parts[0], parts[1]);
  }
  return raw;
}

function isAcknowledged(ackState, id, canonicalEdge) {
  if (!ackState || ackState.invalid || !Array.isArray(ackState.acks)) return false;
  if (canonicalEdge == null) return false;
  return ackState.acks.some((a) => a.id === id && normalizeAckEdge(id, a.edge) === canonicalEdge);
}

/**
 * Core analysis: smells plus the count of ack entries that actually matched a
 * detected edge (stale/typo acks match nothing and count nothing).
 *
 * @param {object} config ark.config (layers; rules unless overridden)
 * @param {object|null} coverage computeCoverage result (layer file counts); optional
 * @param {object} [ackState] result of loadContractSmellAcks
 * @param {object[]|null} [effectiveRules] rules actually in force (e.g. manifest rules); defaults to config.rules
 */
export function analyzeContractSmells(
  config,
  coverage = null,
  ackState = { exists: false, acks: [] },
  effectiveRules = null
) {
  const layers = Array.isArray(config?.layers) ? config.layers : [];
  const rules = (Array.isArray(effectiveRules) ? effectiveRules : config?.rules) ?? [];
  const layerByName = new Map();
  for (const l of layers) {
    if (l && typeof l.name === 'string') layerByName.set(l.name, l);
  }
  const filesPerLayer = new Map();
  for (const row of coverage?.layers ?? []) {
    if (row && typeof row.name === 'string') filesPerLayer.set(row.name, row.files ?? 0);
  }

  const isRule = (r) =>
    r !== null && typeof r === 'object' && typeof r.from === 'string' && typeof r.to === 'string';
  const explicitAllows = rules.filter((r) => isRule(r) && r.allowed === true && r.from !== r.to);

  /** Per-id findings: { edge (canonical, for acks; null = unmatchable), detail (display) }. */
  const findings = {};
  const add = (id, edge, detail) => {
    (findings[id] ??= []).push({ edge, detail });
  };

  // 1) Explicitly bidirectional allowed edges (permits future cycles by declaration).
  const allowKeys = new Set(explicitAllows.map((r) => directedKey(r.from, r.to)));
  const seenPairs = new Set();
  for (const r of explicitAllows) {
    if (!allowKeys.has(directedKey(r.to, r.from))) continue;
    const key = directedKey(...[r.from, r.to].sort());
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    const label = pairLabel(r.from, r.to);
    add(
      'contract-bidirectional-allow',
      ackMatchable(r.from, r.to) ? label : null,
      `edge:${label}`
    );
  }

  // 2) Peripheral layers explicitly allowed into orchestration/persistence cores.
  for (const r of explicitAllows) {
    if (PERIPHERAL_LAYER_RE.test(r.from) && CORE_TARGET_RE.test(r.to)) {
      add(
        'contract-peripheral-depends-core',
        ackMatchable(r.from, r.to) ? `${r.from}->${r.to}` : null,
        `edge:${r.from}->${r.to}`
      );
    }
  }

  // 3) Lateral adapter-to-adapter explicit allows. Skip only edges the peripheral
  //    sensor already flagged (peripheral source AND core-ish target).
  for (const r of explicitAllows) {
    if (PERIPHERAL_LAYER_RE.test(r.from) && CORE_TARGET_RE.test(r.to)) continue;
    if (ADAPTER_LAYER_RE.test(r.from) && ADAPTER_LAYER_RE.test(r.to)) {
      add(
        'contract-lateral-adapter-allow',
        ackMatchable(r.from, r.to) ? `${r.from}->${r.to}` : null,
        `edge:${r.from}->${r.to}`
      );
    }
  }

  // 4) Dead rules: self edges (the gate ignores same-layer rules), unknown layers,
  //    or — when coverage is known — layers matching zero files (optional layers exempt).
  for (const r of rules) {
    if (!isRule(r)) continue;
    const edge = `${r.from}->${r.to}`;
    const ackEdge = ackMatchable(r.from, r.to) ? edge : null;
    if (r.from === r.to) {
      add('contract-dead-rule', ackEdge, `rule:${edge} (self edge has no effect)`);
      continue;
    }
    for (const side of [r.from, r.to]) {
      if (side.length === 0) continue;
      const layer = layerByName.get(side);
      if (!layer) {
        add('contract-dead-rule', ackEdge, `rule:${edge} (unknown layer: ${side})`);
      } else if (filesPerLayer.get(side) === 0 && layer.optional !== true) {
        add('contract-dead-rule', ackEdge, `rule:${edge} (empty layer: ${side})`);
      }
    }
  }

  const smells = [];
  let matchedAcks = 0;
  for (const id of CONTRACT_SMELL_IDS) {
    const entries = findings[id];
    if (!entries || entries.length === 0) continue;
    const kept = [];
    let acknowledgedEdges = 0;
    const seenDetail = new Set();
    for (const entry of entries) {
      if (seenDetail.has(entry.detail)) continue;
      seenDetail.add(entry.detail);
      if (isAcknowledged(ackState, id, entry.edge)) {
        acknowledgedEdges += 1;
        continue;
      }
      kept.push(entry);
    }
    matchedAcks += acknowledgedEdges;
    // Fully acknowledged ids emit no smell; the summary reports applied acks.
    if (kept.length === 0) continue;
    // Deterministic output independent of rule declaration order.
    kept.sort((a, b) => (a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0));
    const evidence = kept.slice(0, MAX_EVIDENCE).map((e) => e.detail);
    if (kept.length > MAX_EVIDENCE) evidence.push(`…(+${kept.length - MAX_EVIDENCE} more)`);
    smells.push({
      id,
      severity: 'warn',
      message: messageFor(id, kept),
      outcome: CONTRACT_SMELL_OUTCOMES[id],
      evidence,
      fix: fixFor(id),
      acknowledgedEdges,
    });
  }
  return { smells, matchedAcks };
}

/**
 * Detect contract smells (compat wrapper over analyzeContractSmells).
 * @returns {Array<{id: string, severity: 'warn', message: string, outcome: string, evidence: string[], fix: string, acknowledgedEdges: number}>}
 */
export function detectContractSmells(
  config,
  coverage = null,
  ackState = { exists: false, acks: [] },
  effectiveRules = null
) {
  return analyzeContractSmells(config, coverage, ackState, effectiveRules).smells;
}

function messageFor(id, entries) {
  const shown = entries.slice(0, MAX_MESSAGE_EDGES).map((e) => e.detail.replace(/^(edge|rule):/, ''));
  const more = entries.length > shown.length ? `, …(+${entries.length - shown.length} more)` : '';
  const list = `${shown.join(', ')}${more}`;
  switch (id) {
    case 'contract-bidirectional-allow':
      return `Both directions are explicitly allowed between ${entries.length} pair(s): ${list}. No cycle exists yet, but the contract permits one by declaration.`;
    case 'contract-peripheral-depends-core':
      return `Peripheral (audit/observability) layers are explicitly allowed into core layers (${entries.length} edge(s)): ${list}. Observability stops being fully peripheral.`;
    case 'contract-lateral-adapter-allow':
      return `Adapter layers are explicitly allowed to import sibling adapter layers (${entries.length} edge(s)): ${list}. Shared mappers/aliases tend to accumulate on this edge.`;
    case 'contract-dead-rule':
      return `${entries.length} rule(s) enforce nothing: ${list}.`;
    default:
      return `Contract smell on: ${list}.`;
  }
}

function fixFor(id) {
  switch (id) {
    case 'contract-bidirectional-allow':
      return `Keep one direction (edit via /ark-contract), or record the deliberate loop in ${CONTRACT_SMELL_ACKS_PATH} with a reason.`;
    case 'contract-peripheral-depends-core':
      return `Invert the edge: core emits events/ports the peripheral layer consumes (/ark-contract), or acknowledge with a reason in ${CONTRACT_SMELL_ACKS_PATH}.`;
    case 'contract-lateral-adapter-allow':
      return `Move shared shapes into Domain/shared kernel and drop the lateral allow (/ark-contract), or acknowledge with a reason in ${CONTRACT_SMELL_ACKS_PATH}.`;
    case 'contract-dead-rule':
      return 'Fix the layer patterns so the layer matches real files, or delete the stale/self rule via /ark-contract.';
    default:
      return 'Review the contract edge via /ark-contract; never weaken the gate to silence a smell.';
  }
}

/**
 * One-call compute for doctor: acks + smells + JSON-ready summary.
 * `rules` should be the rules actually in force (manifest-aware callers pass them).
 *
 * @param {string} root
 * @param {object} config
 * @param {object|null} coverage
 * @param {object[]|null} [rules]
 */
export function computeContractHealth(root, config, coverage, rules = null) {
  const ackState = loadContractSmellAcks(root);
  const { smells, matchedAcks } = analyzeContractSmells(config, coverage, ackState, rules);
  return { ...summarizeContractHealth(smells, ackState, matchedAcks), smells };
}

/**
 * Print the human doctor section (advisory). No output when there is nothing to say.
 * @param {ReturnType<typeof computeContractHealth>} health
 * @param {{ line: (mark: string, text: string) => void, warn: string, color: { bold: (s: string) => string, dim: (s: string) => string } }} io
 */
export function printContractHealthSection(health, io) {
  const rows = formatContractHealthLines(health?.smells ?? [], health);
  if (rows.length === 0) return;
  console.log('');
  console.log(io.color.bold('Contract health (advisory)'));
  for (const row of rows) {
    io.line(row.mark === 'warn' ? io.warn : ' ', row.mark === 'dim' ? io.color.dim(row.text) : row.text);
  }
}

/**
 * Human doctor lines for the contract-health section (advisory).
 * Returns `{ mark, text }` rows with mark `'warn' | 'dim'`; doctor prints them.
 * Empty array when there is nothing to say (no smells, valid/absent ack file).
 *
 * @param {ReturnType<typeof detectContractSmells>} smells
 * @param {ReturnType<typeof summarizeContractHealth>} health
 */
export function formatContractHealthLines(smells, health) {
  const rows = [];
  const list = smells ?? [];
  if (list.length === 0 && !health?.ackFile?.invalid) return rows;
  if (health?.ackFile?.invalid) {
    rows.push({
      mark: 'warn',
      text: `${health.ackFile.path} is present but invalid — acknowledgments are ignored, not silently applied.`,
    });
  }
  for (const smell of list.slice(0, 5)) {
    rows.push({ mark: 'warn', text: `[${smell.id}] ${smell.outcome}` });
    rows.push({ mark: 'dim', text: `detail: ${smell.message}` });
    if (smell.evidence?.length) {
      const shown = smell.evidence.slice(0, 4);
      const more = smell.evidence.length > 4 ? ` …(+${smell.evidence.length - 4} more)` : '';
      rows.push({ mark: 'dim', text: `evidence: ${shown.join(', ')}${more}` });
    }
    rows.push({ mark: 'dim', text: `fix: ${smell.fix}` });
  }
  if (list.length > 5) {
    rows.push({ mark: 'dim', text: `…(+${list.length - 5} more contract smell(s) in doctor JSON)` });
  }
  if ((health?.acknowledged ?? 0) > 0) {
    rows.push({ mark: 'dim', text: `acknowledged edges applied: ${health.acknowledged}` });
  }
  rows.push({
    mark: 'dim',
    text: 'advisory only — the gate verdict and design fitness are unchanged',
  });
  return rows;
}

/**
 * Contract-health summary for doctor JSON / human output. Advisory only.
 * `acknowledged` counts ack entries that MATCHED a detected edge (stale acks count 0).
 *
 * @param {ReturnType<typeof detectContractSmells>} smells
 * @param {ReturnType<typeof loadContractSmellAcks>} ackState
 * @param {number} [matchedAcks]
 */
export function summarizeContractHealth(smells, ackState = { exists: false, acks: [] }, matchedAcks = 0) {
  const list = Array.isArray(smells) ? smells : [];
  return {
    status: list.length > 0 ? 'contract-smells' : 'ok',
    smellCount: list.length,
    ids: list.map((s) => s.id),
    acknowledged: ackState?.invalid ? 0 : matchedAcks,
    advisory: true,
    label:
      list.length > 0
        ? `Contract health: ${list.length} contract smell(s) — advisory; the gate verdict is unchanged`
        : 'Contract health: no contract smells detected',
    ackFile: {
      path: ackState?.path ?? CONTRACT_SMELL_ACKS_PATH,
      present: ackState?.exists === true,
      invalid: ackState?.invalid === true,
      ...(ackState?.invalid ? { error: ackState.error ?? 'invalid' } : {}),
    },
  };
}
