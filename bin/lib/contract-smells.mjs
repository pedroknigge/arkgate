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
 * A malformed ack file is reported invalid — it never silently suppresses smells.
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
    'A rule points at a layer that matches no files (or does not exist) — it enforces nothing and hides a wrong glob or a stale rename. Fix the layer patterns or delete the rule.',
});

export const CONTRACT_SMELL_ACKS_PATH = '.ark/contract-smell-acks.json';

const PERIPHERAL_LAYER_RE = /observab|audit|telemetry|monitor|logging|metric|tracing/i;
const CORE_TARGET_RE = /application|orchestr|persist|repositor/i;
const ADAPTER_LAYER_RE = /adapter|persist|integrat|infra|gateway/i;

/** Canonical unordered pair key for bidirectional edges. */
function pairKey(a, b) {
  return [a, b].sort().join('<->');
}

/**
 * Load the optional acknowledgment sidecar.
 * @param {string} root
 * @returns {{ path: string, exists: boolean, invalid?: boolean, error?: string, acks: Array<{id: string, edge: string, reason?: string}> }}
 */
export function loadContractSmellAcks(root) {
  const relPath = CONTRACT_SMELL_ACKS_PATH;
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) return { path: relPath, exists: false, acks: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const acks = Array.isArray(parsed?.acks) ? parsed.acks : null;
    if (!acks || acks.some((a) => typeof a?.id !== 'string' || typeof a?.edge !== 'string')) {
      return {
        path: relPath,
        exists: true,
        invalid: true,
        error: 'expected { acks: [{ id, edge, reason? }] }',
        acks: [],
      };
    }
    return { path: relPath, exists: true, acks };
  } catch (error) {
    return {
      path: relPath,
      exists: true,
      invalid: true,
      error: error instanceof Error ? error.message : 'unreadable JSON',
      acks: [],
    };
  }
}

/** Normalize an ack edge string so `A<->B` and `B<->A` are equivalent. */
function normalizeAckEdge(id, edge) {
  const raw = String(edge).trim();
  if (id === 'contract-bidirectional-allow' && raw.includes('<->')) {
    const [a, b] = raw.split('<->').map((s) => s.trim());
    return pairKey(a, b);
  }
  return raw;
}

function isAcknowledged(ackState, id, canonicalEdge) {
  if (!ackState || ackState.invalid || !Array.isArray(ackState.acks)) return false;
  return ackState.acks.some(
    (a) => a.id === id && normalizeAckEdge(id, a.edge) === canonicalEdge
  );
}

/**
 * Detect contract smells from the contract itself (plus optional coverage rows).
 * Pure over its inputs; filesystem is touched only by loadContractSmellAcks.
 *
 * @param {object} config ark.config (layers + rules)
 * @param {object|null} coverage computeCoverage result (layer file counts); optional
 * @param {object} [ackState] result of loadContractSmellAcks
 * @returns {Array<{id: string, severity: 'warn', message: string, outcome: string, evidence: string[], fix: string, acknowledgedEdges: number}>}
 */
export function detectContractSmells(config, coverage = null, ackState = { exists: false, acks: [] }) {
  const layers = Array.isArray(config?.layers) ? config.layers : [];
  const rules = Array.isArray(config?.rules) ? config.rules : [];
  const layerNames = new Set(layers.map((l) => l?.name).filter(Boolean));
  const filesPerLayer = new Map(
    (coverage?.layers ?? []).map((row) => [row.name, row.files ?? 0])
  );

  const explicitAllows = rules.filter(
    (r) => r?.allowed === true && layerNames.size >= 0 && r.from !== r.to
  );

  /** Collect per-id { edge, detail } findings, then aggregate + apply acks. */
  const findings = { };
  const add = (id, edge, detail) => {
    (findings[id] ??= []).push({ edge, detail });
  };

  // 1) Explicitly bidirectional allowed edges (permits future cycles by declaration).
  const allowKeys = new Set(explicitAllows.map((r) => `${r.from}->${r.to}`));
  const seenPairs = new Set();
  for (const r of explicitAllows) {
    if (!allowKeys.has(`${r.to}->${r.from}`)) continue;
    const key = pairKey(r.from, r.to);
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    add('contract-bidirectional-allow', key, `edge:${key}`);
  }

  // 2) Peripheral layers explicitly allowed into orchestration/persistence cores.
  for (const r of explicitAllows) {
    if (PERIPHERAL_LAYER_RE.test(r.from) && CORE_TARGET_RE.test(r.to)) {
      add('contract-peripheral-depends-core', `${r.from}->${r.to}`, `edge:${r.from}->${r.to}`);
    }
  }

  // 3) Lateral adapter-to-adapter explicit allows (peripheral case already covered above).
  for (const r of explicitAllows) {
    if (PERIPHERAL_LAYER_RE.test(r.from)) continue;
    if (ADAPTER_LAYER_RE.test(r.from) && ADAPTER_LAYER_RE.test(r.to)) {
      add('contract-lateral-adapter-allow', `${r.from}->${r.to}`, `edge:${r.from}->${r.to}`);
    }
  }

  // 4) Dead rules: a side references an unknown layer, or (when coverage is known) an empty one.
  for (const r of rules) {
    const edge = `${r.from}->${r.to}`;
    for (const side of [r.from, r.to]) {
      if (typeof side !== 'string' || side.length === 0) continue;
      if (!layerNames.has(side)) {
        add('contract-dead-rule', edge, `rule:${edge} (unknown layer: ${side})`);
      } else if (filesPerLayer.has(side) && filesPerLayer.get(side) === 0) {
        add('contract-dead-rule', edge, `rule:${edge} (empty layer: ${side})`);
      }
    }
  }

  const smells = [];
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
    // Fully acknowledged ids emit no smell; the summary reports the ack count from the sidecar.
    if (kept.length === 0) continue;
    smells.push({
      id,
      severity: 'warn',
      message: messageFor(id, kept),
      outcome: CONTRACT_SMELL_OUTCOMES[id],
      evidence: kept.map((e) => e.detail).slice(0, 12),
      fix: fixFor(id),
      acknowledgedEdges,
    });
  }
  return smells;
}

function messageFor(id, entries) {
  const list = entries
    .map((e) => e.edge)
    .slice(0, 6)
    .join(', ');
  switch (id) {
    case 'contract-bidirectional-allow':
      return `Both directions are explicitly allowed between: ${list}. No cycle exists yet, but the contract permits one by declaration.`;
    case 'contract-peripheral-depends-core':
      return `Peripheral (audit/observability) layers are explicitly allowed into core layers: ${list}. Observability stops being fully peripheral.`;
    case 'contract-lateral-adapter-allow':
      return `Adapter layers are explicitly allowed to import sibling adapter layers: ${list}. Shared mappers/aliases tend to accumulate on this edge.`;
    case 'contract-dead-rule':
      return `Rules reference layers that match no files or do not exist: ${list}. These rules enforce nothing.`;
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
      return 'Fix the layer patterns so the layer matches real files, or delete the stale rule via /ark-contract.';
    default:
      return 'Review the contract edge via /ark-contract; never weaken the gate to silence a smell.';
  }
}

/**
 * One-call compute for doctor: acks + smells + JSON-ready summary.
 * @param {string} root
 * @param {object} config
 * @param {object|null} coverage
 */
export function computeContractHealth(root, config, coverage) {
  const ackState = loadContractSmellAcks(root);
  const smells = detectContractSmells(config, coverage, ackState);
  return { smells, health: { ...summarizeContractHealth(smells, ackState), smells } };
}

/**
 * Print the human doctor section (advisory). No output when there is nothing to say.
 * @param {ReturnType<typeof detectContractSmells>} smells
 * @param {ReturnType<typeof summarizeContractHealth>} health
 * @param {{ line: (mark: string, text: string) => void, warn: string, color: { bold: (s: string) => string, dim: (s: string) => string } }} io
 */
export function printContractHealthSection(smells, health, io) {
  const rows = formatContractHealthLines(smells, health);
  if (rows.length === 0) return;
  console.log('');
  console.log(io.color.bold('Contract health (advisory)'));
  for (const row of rows) {
    io.line(row.mark === 'warn' ? io.warn : ' ', row.mark === 'dim' ? io.color.dim(row.text) : row.text);
  }
}

/**
 * Human doctor lines for the contract-health section (advisory).
 * Returns `{ mark, text }` rows: mark 'warn' | 'dim' | 'blank'; doctor prints them.
 * Empty array when there is nothing to say (no smells, valid/absent ack file).
 *
 * @param {ReturnType<typeof detectContractSmells>} smells
 * @param {ReturnType<typeof summarizeContractHealth>} health
 */
export function formatContractHealthLines(smells, health) {
  const rows = [];
  if ((smells?.length ?? 0) === 0 && !health?.ackFile?.invalid) return rows;
  if (health?.ackFile?.invalid) {
    rows.push({
      mark: 'warn',
      text: `${health.ackFile.path} is present but invalid — acknowledgments are ignored, not silently applied.`,
    });
  }
  for (const smell of (smells ?? []).slice(0, 5)) {
    rows.push({ mark: 'warn', text: `[${smell.id}] ${smell.outcome}` });
    rows.push({ mark: 'dim', text: `detail: ${smell.message}` });
    if (smell.evidence?.length) {
      rows.push({ mark: 'dim', text: `evidence: ${smell.evidence.slice(0, 4).join(', ')}` });
    }
    rows.push({ mark: 'dim', text: `fix: ${smell.fix}` });
  }
  if ((health?.acknowledged ?? 0) > 0) {
    rows.push({ mark: 'dim', text: `acknowledged edges on file: ${health.acknowledged}` });
  }
  rows.push({
    mark: 'dim',
    text: 'advisory only — the gate verdict and design fitness are unchanged',
  });
  return rows;
}

/**
 * Contract-health summary for doctor JSON / human output. Advisory only.
 * @param {ReturnType<typeof detectContractSmells>} smells
 * @param {ReturnType<typeof loadContractSmellAcks>} ackState
 */
export function summarizeContractHealth(smells, ackState = { exists: false, acks: [] }) {
  const list = Array.isArray(smells) ? smells : [];
  // Acknowledgments recorded on file (a broken sidecar contributes zero — never silent success).
  const acknowledged = ackState?.invalid ? 0 : (ackState?.acks ?? []).length;
  return {
    status: list.length > 0 ? 'contract-smells' : 'ok',
    smellCount: list.length,
    ids: list.map((s) => s.id),
    acknowledged,
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
