/**
 * U05 — ambient mutable-state sensor (ADR 0009 D4 / A5).
 *
 * Advisory and OPT-IN: only layers declared `pure: true` are scanned; the MVP
 * shape is module-scope `let`/`var`. Legitimate registries/caches are
 * acknowledged in a bounded `.ark/` sidecar (W01 precedent) — a malformed file
 * suppresses nothing. Doctor-only: no strict default may be introduced from
 * this sensor until the fixed corpus proves blocker-grade precision (A5).
 */
import fs from 'node:fs';
import path from 'node:path';
import { layerForFile } from '../ark-shared.mjs';

export const AMBIENT_STATE_ACKS_PATH = '.ark/ambient-state-acks.json';

const MAX_ACK_BYTES = 64 * 1024;
const MAX_ACK_ENTRIES = 200;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_FINDINGS = 50;

/** Bounded, fail-loud sidecar loader (same discipline as contract-smell acks). */
export function loadAmbientStateAcks(root) {
  const relPath = AMBIENT_STATE_ACKS_PATH;
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
  if (!acks) return invalid('expected { acks: [{ file, name, reason? }] }');
  if (acks.length > MAX_ACK_ENTRIES) return invalid(`more than ${MAX_ACK_ENTRIES} entries`);
  const wellFormed = acks.every(
    (a) =>
      a !== null &&
      typeof a === 'object' &&
      typeof a.file === 'string' &&
      a.file.length > 0 &&
      typeof a.name === 'string' &&
      a.name.length > 0
  );
  if (!wellFormed) return invalid('every ack needs string file and name');
  return { path: relPath, exists: true, acks };
}

function isAcknowledged(ackState, file, name) {
  if (!ackState || ackState.invalid || !Array.isArray(ackState.acks)) return false;
  return ackState.acks.some((a) => a.file === file && a.name === name);
}

function bindingIdentifiers(ts, name, out) {
  if (ts.isIdentifier(name)) {
    out.push(name.text);
    return;
  }
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (element && !ts.isOmittedExpression(element) && element.name) {
        bindingIdentifiers(ts, element.name, out);
      }
    }
  }
}

/**
 * Detect module-scope mutable state in `pure: true` layers.
 *
 * @returns {{ active: boolean, findings: Array<{file: string, line: number, name: string, kind: 'module-let'|'module-var'}>, acknowledgedCount: number, truncated: number }}
 */
export function detectAmbientState(ts, root, config, files, ackState = { exists: false, acks: [] }) {
  const layers = Array.isArray(config?.layers) ? config.layers : [];
  const pureLayers = new Set(
    layers.filter((layer) => layer?.pure === true).map((layer) => layer.name)
  );
  if (pureLayers.size === 0) return { active: false, findings: [], acknowledgedCount: 0, truncated: 0 };

  const resolvedRoot = path.resolve(root);
  const findings = [];
  let acknowledgedCount = 0;
  for (const file of files) {
    const layer = layerForFile(root, file, layers);
    if (!layer || !pureLayers.has(layer)) continue;
    const rel = path.relative(resolvedRoot, path.resolve(file)).split(path.sep).join('/');
    let source;
    try {
      const stats = fs.statSync(file);
      if (!stats.isFile() || stats.size === 0 || stats.size > MAX_FILE_BYTES) continue;
      source = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    for (const statement of sourceFile.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      const flags = statement.declarationList.flags;
      if ((flags & ts.NodeFlags.Const) !== 0) continue;
      const kind = (flags & ts.NodeFlags.Let) !== 0 ? 'module-let' : 'module-var';
      for (const declaration of statement.declarationList.declarations) {
        const names = [];
        bindingIdentifiers(ts, declaration.name, names);
        for (const name of names) {
          if (isAcknowledged(ackState, rel, name)) {
            acknowledgedCount += 1;
            continue;
          }
          const line =
            sourceFile.getLineAndCharacterOfPosition(declaration.getStart(sourceFile)).line + 1;
          findings.push({ file: rel, line, name, kind });
        }
      }
    }
  }
  findings.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.name.localeCompare(right.name)
  );
  const truncated = Math.max(0, findings.length - MAX_FINDINGS);
  return { active: true, findings: findings.slice(0, MAX_FINDINGS), acknowledgedCount, truncated };
}

/** JSON summary for doctor. Advisory only — never a verdict input. */
export function summarizeAmbientState(result, ackState = { exists: false, acks: [] }) {
  return {
    available: true,
    active: result.active,
    advisory: true,
    findingCount: result.findings.length,
    acknowledged: ackState?.invalid ? 0 : result.acknowledgedCount,
    ...(result.truncated > 0 ? { truncated: result.truncated } : {}),
    note: result.active
      ? 'Module-scope mutable state in pure layers — advisory only; acknowledge deliberate registries in the sidecar or move the state behind a port.'
      : 'No pure: true layer opted in; the sensor is idle.',
    ackFile: {
      path: ackState?.path ?? AMBIENT_STATE_ACKS_PATH,
      present: ackState?.exists === true,
      invalid: ackState?.invalid === true,
      ...(ackState?.invalid ? { error: ackState.error ?? 'invalid' } : {}),
    },
  };
}

/** One-call compute for doctor; `ts` may be absent (report unavailable honestly). */
export function computeAmbientState(ts, root, config, files) {
  if (!ts) {
    return {
      available: false,
      active: false,
      advisory: true,
      findings: [],
      findingCount: 0,
      acknowledged: 0,
      note: 'TypeScript was not available to the doctor run; the ambient-state sensor did not execute.',
    };
  }
  const ackState = loadAmbientStateAcks(root);
  const result = detectAmbientState(ts, root, config, files, ackState);
  return { ...summarizeAmbientState(result, ackState), findings: result.findings };
}

/** Human doctor section (advisory); silent when idle and healthy. */
export function printAmbientStateSection(state, io) {
  if (!state.available || (!state.findingCount && !state.ackFile?.invalid)) return;
  console.log('');
  console.log(io.color.bold('Ambient state (advisory)'));
  if (state.ackFile?.invalid) {
    io.line(io.warn, `${state.ackFile.path} is present but invalid — acknowledgments are ignored.`);
  }
  for (const finding of state.findings.slice(0, 5)) {
    io.line(io.warn, `[${finding.kind}] ${finding.file}:${finding.line} — \`${finding.name}\``);
  }
  if (state.findingCount > 5) {
    io.line(' ', io.color.dim(`…(+${state.findingCount - 5} more in doctor JSON)`));
  }
  if (state.acknowledged > 0) {
    io.line(' ', io.color.dim(`acknowledged module state: ${state.acknowledged}`));
  }
  io.line(' ', io.color.dim('advisory only — never blocks; move state behind a port or acknowledge it'));
}
