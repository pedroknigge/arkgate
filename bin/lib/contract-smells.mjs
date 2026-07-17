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
 * X02 — acks have a lifecycle: an optional `reviewBy` (YYYY-MM-DD) marks when a
 * deliberate exception must be re-reviewed. Past that date the ack stops
 * applying and the smell returns annotated — migration acks cannot fossilize.
 * Undated acks keep applying (backward compatible) but are counted and
 * reported so they can be given a date.
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
const FAMILY_INFRA_RE = /^(infra(structure)?|base|core|shared|common|kernel|platform|foundation)$/i;

/** Split a layer name into words: camelCase boundaries, digits, delimiters. */
function nameTokens(name) {
  return String(name).match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+/g) ?? [];
}

/**
 * X03/X06 — an adapter reaching its OWN family's infrastructure base is not a
 * lateral peer: the target reads as `<Family><InfraWords…>` and the source
 * carries the family token ANYWHERE in its name (X06, field corpus names
 * domain-scoped adapters `HoursPersistenceAdapters` over
 * `PersistenceInfrastructure` — the family sits mid-name). EVERY remaining
 * target token must be an infra word (Infra/Base/Core/Shared/…) —
 * `PaymentsCoreAdapters` is still a sibling, not a base. The reverse
 * direction (base → member) never matches: the target must BE the base.
 * Name heuristic like the role regexes above — a miss costs a warning line.
 */
function isFamilyInfrastructureEdge(from, to) {
  const fromTokens = nameTokens(from);
  const toTokens = nameTokens(to);
  if (fromTokens.length === 0 || toTokens.length < 2) return false;
  const family = toTokens[0].toLowerCase();
  // A generic role word is not a family: `AdaptersCore` must not read as the
  // "Adapters family" base for every *Adapters layer — that would silently
  // quiet genuine cross-family edges. (`Persistence` stays a valid family.)
  if (/^(adapters?|gateways?)$/.test(family)) return false;
  if (family.length < 2 || !fromTokens.some((t) => t.toLowerCase() === family)) return false;
  return toTokens.slice(1).every((t) => FAMILY_INFRA_RE.test(t));
}

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
      a.edge.trim().length > 0 &&
      (a.reviewBy === undefined || typeof a.reviewBy === 'string')
  );
  if (!wellFormed) {
    return invalid('every ack needs string id, non-empty string edge, and string reviewBy when present');
  }
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

/**
 * X02 — lifecycle status of one ack entry. `undated` and `current` apply
 * (suppress); `expired` and `malformed` do not — fail-loud like a sloppy edge.
 * Strict round-trip date check: `2026-02-30` must not pass as valid.
 */
function ackLifecycleStatus(ack, today) {
  const rb = ack.reviewBy;
  if (rb === undefined || rb === null) return 'undated';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rb)) return 'malformed';
  const parsed = new Date(`${rb}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== rb) {
    return 'malformed';
  }
  return typeof today === 'string' && rb < today ? 'expired' : 'current';
}

/**
 * Match a detected edge against the ack sidecar with lifecycle applied.
 * Returns how the edge resolves: `none` (no matching ack), an applying status
 * (`current` | `undated`), or a non-applying one (`expired` | `malformed`,
 * with the reviewBy that failed). Once ANY dated ack exists for the edge, the
 * dated entries govern — a leftover undated duplicate cannot resurrect an
 * expired exception. Among dated entries a fresh re-ack wins over a dead one.
 */
function resolveAck(ackState, id, canonicalEdge, today) {
  if (!ackState || ackState.invalid || !Array.isArray(ackState.acks)) return { status: 'none' };
  if (canonicalEdge == null) return { status: 'none' };
  let dead = null;
  let undated = false;
  for (const a of ackState.acks) {
    if (a.id !== id || normalizeAckEdge(id, a.edge) !== canonicalEdge) continue;
    const status = ackLifecycleStatus(a, today);
    if (status === 'current') return { status };
    if (status === 'undated') undated = true;
    else dead ??= { status, reviewBy: a.reviewBy };
  }
  if (dead) return dead;
  return undated ? { status: 'undated' } : { status: 'none' };
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
  effectiveRules = null,
  today = null
) {
  const layers = Array.isArray(config?.layers) ? config.layers : [];
  const rules = wellFormedRules(config, effectiveRules);
  const layerByName = new Map();
  for (const l of layers) {
    if (l && typeof l.name === 'string') layerByName.set(l.name, l);
  }
  const filesPerLayer = new Map();
  for (const row of coverage?.layers ?? []) {
    if (row && typeof row.name === 'string') filesPerLayer.set(row.name, row.files ?? 0);
  }

  const explicitAllows = rules.filter((r) => r.allowed === true && r.from !== r.to);

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

  // 3) Lateral adapter-to-adapter explicit allows. Skip edges the peripheral
  //    sensor already flagged (peripheral source AND core-ish target), and
  //    X03: an adapter reaching its own family's infra base is not a peer.
  for (const r of explicitAllows) {
    if (PERIPHERAL_LAYER_RE.test(r.from) && CORE_TARGET_RE.test(r.to)) continue;
    if (isFamilyInfrastructureEdge(r.from, r.to)) continue;
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

  // X05 — an ack that matches no detected edge is stale: orphaned by a fixed
  // contract, a quieted heuristic, or a typo. Detected BEFORE ack filtering.
  const detectedEdges = new Map();
  for (const [id, entries] of Object.entries(findings)) {
    detectedEdges.set(id, new Set(entries.map((e) => e.edge).filter((e) => e != null)));
  }
  const staleEdges = [];
  if (ackState && !ackState.invalid && Array.isArray(ackState.acks)) {
    for (const a of ackState.acks) {
      const canonical = normalizeAckEdge(a.id, a.edge);
      if (canonical != null && detectedEdges.get(a.id)?.has(canonical)) continue;
      staleEdges.push({ id: a.id, edge: a.edge });
    }
    // Stable under sidecar reordering, like every other output here.
    staleEdges.sort((a, b) =>
      a.id === b.id ? (a.edge < b.edge ? -1 : a.edge > b.edge ? 1 : 0) : a.id < b.id ? -1 : 1
    );
  }

  const smells = [];
  let matchedAcks = 0;
  const ackLifecycle = { undated: 0, malformed: 0, expired: [], stale: staleEdges };
  for (const id of CONTRACT_SMELL_IDS) {
    const entries = findings[id];
    if (!entries || entries.length === 0) continue;
    const kept = [];
    let acknowledgedEdges = 0;
    const seenDetail = new Set();
    for (const entry of entries) {
      if (seenDetail.has(entry.detail)) continue;
      seenDetail.add(entry.detail);
      const ack = resolveAck(ackState, id, entry.edge, today);
      if (ack.status === 'current' || ack.status === 'undated') {
        acknowledgedEdges += 1;
        if (ack.status === 'undated') ackLifecycle.undated += 1;
        continue;
      }
      if (ack.status === 'expired') {
        ackLifecycle.expired.push({ id, edge: entry.edge, reviewBy: ack.reviewBy });
        kept.push({ ...entry, detail: `${entry.detail} (ack expired ${ack.reviewBy})` });
        continue;
      }
      if (ack.status === 'malformed') {
        ackLifecycle.malformed += 1;
        kept.push({ ...entry, detail: `${entry.detail} (ack review-by malformed)` });
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
  return { smells, matchedAcks, ackLifecycle };
}

/**
 * Detect contract smells (compat wrapper over analyzeContractSmells).
 * Defaults `today` to the real clock so expired acks stop applying on every
 * public path, not only through the doctor; pass `null` to disable expiry.
 * @returns {Array<{id: string, severity: 'warn', message: string, outcome: string, evidence: string[], fix: string, acknowledgedEdges: number}>}
 */
export function detectContractSmells(
  config,
  coverage = null,
  ackState = { exists: false, acks: [] },
  effectiveRules = null,
  today = todayUtc()
) {
  return analyzeContractSmells(config, coverage, ackState, effectiveRules, today).smells;
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
 * W02 — fixed comparative wording per band. Facts + a note; explicitly never a
 * score, ranking, or gate input. Heavy wording must never suggest deleting layers.
 */
export const GOVERNANCE_WEIGHT_NOTES = Object.freeze({
  heavy:
    'Heavier than typical for the governed tree size. Not a defect and not a score — but before adding another layer or rule, ask for demonstrated pressure (repeated violations or acknowledgments on one edge). Do not delete working layers to change this number.',
  light:
    'Lighter than typical for the governed tree size — a large tree with few boundaries. Consider whether a new boundary is justified where violations or churn concentrate.',
  typical: 'Within the typical band for the governed tree size.',
  unknown: 'Not enough governed files (or declared layers) to describe governance weight.',
});

/**
 * Fixed banding thresholds (stated in docs/package-surface.md; deterministic, not tunables).
 * heavy: fewer than 25 governed files per layer AND (6+ layers OR 4+ rules per layer) —
 * both signals are size-relative, so a large tree with a dense but proportionate rule
 * matrix never reads heavy. light: at most 2 layers over 150+ governed files.
 */
const HEAVY_FILES_PER_LAYER_BELOW = 25;
const HEAVY_MIN_LAYERS = 6;
const HEAVY_RULES_PER_LAYER = 4;
const LIGHT_MAX_LAYERS = 2;
const LIGHT_MIN_FILES = 150;

/** Rules in force, filtered to well-formed entries (string from/to, boolean allowed). */
function wellFormedRules(config, effectiveRules) {
  const rules = (Array.isArray(effectiveRules) ? effectiveRules : config?.rules) ?? [];
  return rules.filter(
    (r) =>
      r !== null &&
      typeof r === 'object' &&
      typeof r.from === 'string' &&
      typeof r.to === 'string' &&
      typeof r.allowed === 'boolean'
  );
}

/**
 * W02 — descriptive governance-weight facts for a contract over a governed tree.
 * Raw counts and ratios with a fixed comparative note. Advisory only.
 *
 * @param {object} config ark.config (layers; rules unless overridden)
 * @param {object|null} coverage computeCoverage result
 * @param {object[]|null} [effectiveRules]
 */
export function computeGovernanceWeight(config, coverage = null, effectiveRules = null) {
  const layers = Array.isArray(config?.layers) ? config.layers : [];
  const rules = wellFormedRules(config, effectiveRules);
  const declaredLayers = layers.filter((l) => l && typeof l.name === 'string').length;
  const governedFiles = coverage?.governed?.classifiedFiles ?? 0;
  const populatedLayers = (coverage?.layers ?? []).filter((r) => r && (r.files ?? 0) > 0).length;
  const deniedEdges = rules.filter((r) => r.allowed === false).length;
  const allowedEdges = rules.filter((r) => r.allowed === true).length;
  const round1 = (n) => Math.round(n * 10) / 10;
  const base = {
    declaredLayers,
    populatedLayers,
    governedFiles,
    rules: rules.length,
    deniedEdges,
    allowedEdges,
    notAScore: true,
  };
  if (declaredLayers === 0 || !(Number.isFinite(governedFiles) && governedFiles > 0)) {
    return {
      ...base,
      governedFiles: Number.isFinite(governedFiles) ? governedFiles : 0,
      filesPerLayer: null,
      rulesPerLayer: null,
      weight: 'unknown',
      note: GOVERNANCE_WEIGHT_NOTES.unknown,
    };
  }
  // Band on the raw ratios; the rounded values are for display only.
  const rawFilesPerLayer = governedFiles / declaredLayers;
  const rawRulesPerLayer = rules.length / declaredLayers;
  let weight = 'typical';
  if (
    rawFilesPerLayer < HEAVY_FILES_PER_LAYER_BELOW &&
    (declaredLayers >= HEAVY_MIN_LAYERS || rawRulesPerLayer >= HEAVY_RULES_PER_LAYER)
  ) {
    weight = 'heavy';
  } else if (declaredLayers <= LIGHT_MAX_LAYERS && governedFiles >= LIGHT_MIN_FILES) {
    weight = 'light';
  }
  return {
    ...base,
    filesPerLayer: round1(rawFilesPerLayer),
    rulesPerLayer: round1(rawRulesPerLayer),
    weight,
    note: GOVERNANCE_WEIGHT_NOTES[weight],
  };
}

/** Today as UTC YYYY-MM-DD — the only clock read; tests inject `today` instead. */
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * One-call compute for doctor: acks + smells + governance weight + JSON-ready summary.
 * `rules` should be the rules actually in force (manifest-aware callers pass them).
 *
 * @param {string} root
 * @param {object} config
 * @param {object|null} coverage
 * @param {object[]|null} [rules]
 * @param {string} [today] UTC YYYY-MM-DD for ack lifecycle; defaults to the real clock
 */
export function computeContractHealth(root, config, coverage, rules = null, today = todayUtc()) {
  const ackState = loadContractSmellAcks(root);
  const { smells, matchedAcks, ackLifecycle } = analyzeContractSmells(
    config,
    coverage,
    ackState,
    rules,
    today
  );
  return {
    ...summarizeContractHealth(smells, ackState, matchedAcks, ackLifecycle),
    governanceWeight: computeGovernanceWeight(config, coverage, rules),
    smells,
  };
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
 * Empty array when there is nothing to say: no smells, a valid/absent ack file,
 * and a non-noteworthy governance weight (only `heavy`/`light` print).
 *
 * @param {ReturnType<typeof detectContractSmells>} smells
 * @param {ReturnType<typeof computeContractHealth>} health also read: `health.governanceWeight`
 */
export function formatContractHealthLines(smells, health) {
  const rows = [];
  const list = smells ?? [];
  const gw = health?.governanceWeight;
  const weightNoteworthy = gw?.weight === 'heavy' || gw?.weight === 'light';
  const lc = health?.ackLifecycle;
  // Undated and stale acks must surface even when every smell is suppressed —
  // fossilization (X02) and orphaned entries (X05) hide exactly there.
  const lifecycleNoteworthy = (lc?.undated ?? 0) > 0 || (lc?.staleCount ?? 0) > 0;
  if (list.length === 0 && !health?.ackFile?.invalid && !weightNoteworthy && !lifecycleNoteworthy) {
    return rows;
  }
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
  if ((lc?.expiredCount ?? 0) > 0) {
    rows.push({
      mark: 'warn',
      text: `${lc.expiredCount} acknowledgment(s) past review-by — the smell is active again; re-review the edge and re-ack with a new date, or fix the contract.`,
    });
  }
  if ((lc?.malformed ?? 0) > 0) {
    rows.push({
      mark: 'warn',
      text: `${lc.malformed} acknowledgment(s) have a malformed review-by (expected YYYY-MM-DD) — they are ignored, not silently applied.`,
    });
  }
  if ((lc?.undated ?? 0) > 0) {
    rows.push({
      mark: 'dim',
      text: `${lc.undated} applied acknowledgment(s) have no review-by date — add one so migration acks cannot fossilize.`,
    });
  }
  if ((lc?.staleCount ?? 0) > 0) {
    const shown = (lc.stale ?? []).slice(0, 4).map((s) => s.edge);
    const more = lc.staleCount > shown.length ? ` …(+${lc.staleCount - shown.length} more)` : '';
    rows.push({
      mark: 'dim',
      text: `${lc.staleCount} acknowledgment(s) match no detected edge — stale; fix the edge string or delete the entry: ${shown.join(', ')}${more}`,
    });
  }
  if (weightNoteworthy) {
    rows.push({
      mark: 'warn',
      text: `governance weight: ${gw.weight} — ${gw.declaredLayers} layer(s), ${gw.rules} rule(s), ${gw.governedFiles} governed file(s) (${gw.filesPerLayer} files/layer)`,
    });
    rows.push({ mark: 'dim', text: gw.note });
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
 * X02 — `ackLifecycle` reports how applied acks age: `undated` applied without
 * a review-by, `expired` past it (no longer applied), `malformed` bad dates.
 * X05 — `stale` counts ack entries matching NO detected edge (orphaned or
 * typo'd); they suppress nothing and should be fixed or deleted.
 *
 * @param {ReturnType<typeof detectContractSmells>} smells
 * @param {ReturnType<typeof loadContractSmellAcks>} ackState
 * @param {number} [matchedAcks]
 * @param {{ undated: number, malformed: number, expired: Array<{id: string, edge: string, reviewBy: string}>, stale: Array<{id: string, edge: string}> }} [ackLifecycle]
 */
export function summarizeContractHealth(
  smells,
  ackState = { exists: false, acks: [] },
  matchedAcks = 0,
  ackLifecycle = { undated: 0, malformed: 0, expired: [], stale: [] }
) {
  const list = Array.isArray(smells) ? smells : [];
  const expired = Array.isArray(ackLifecycle?.expired) ? ackLifecycle.expired : [];
  const stale = Array.isArray(ackLifecycle?.stale) ? ackLifecycle.stale : [];
  return {
    status: list.length > 0 ? 'contract-smells' : 'ok',
    smellCount: list.length,
    ids: list.map((s) => s.id),
    acknowledged: ackState?.invalid ? 0 : matchedAcks,
    ackLifecycle: {
      undated: ackLifecycle?.undated ?? 0,
      malformed: ackLifecycle?.malformed ?? 0,
      expiredCount: expired.length,
      expired: expired.slice(0, MAX_EVIDENCE),
      staleCount: stale.length,
      stale: stale.slice(0, MAX_EVIDENCE),
    },
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
