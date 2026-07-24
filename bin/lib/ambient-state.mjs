/**
 * U05 — ambient mutable-state sensor (ADR 0009 D4 / A5).
 *
 * Advisory and OPT-IN: only layers declared `pure: true` are scanned; the MVP
 * shape is module-scope `let`/`var`. Legitimate registries/caches are
 * acknowledged in a bounded `.ark/` sidecar (W01 precedent) — a malformed file
 * suppresses nothing. Doctor-only: no strict default may be introduced from
 * this sensor until the fixed corpus proves blocker-grade precision (A5).
 *
 * Documented envelope: only top-level statements are walked — `let` inside a
 * `namespace` body (real runtime state on the namespace object) is out of the
 * MVP shape; `declare` ambients and `using` bindings never count (no state /
 * not reassignable).
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
  // Normalize separators so a Windows-authored ack file still matches.
  const normalized = acks.map((a) => ({ ...a, file: a.file.replace(/\\/g, '/') }));
  return { path: relPath, exists: true, acks: normalized };
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
  const acknowledgedPairs = new Set();
  let skippedFiles = 0;
  for (const file of files) {
    const layer = layerForFile(root, file, layers);
    if (!layer || !pureLayers.has(layer)) continue;
    const rel = path.relative(resolvedRoot, path.resolve(file)).split(path.sep).join('/');
    let source;
    try {
      const stats = fs.statSync(file);
      if (!stats.isFile() || stats.size === 0) continue;
      if (stats.size > MAX_FILE_BYTES) {
        skippedFiles += 1;
        continue;
      }
      source = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    for (const statement of sourceFile.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      // `declare` ambients allocate no runtime state.
      if (
        statement.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword
        )
      ) {
        continue;
      }
      const flags = statement.declarationList.flags;
      // const never reassigns; `using`/`await using` bindings are not reassignable.
      const immutableFlags =
        ts.NodeFlags.Const | (ts.NodeFlags.Using ?? 0) | (ts.NodeFlags.AwaitUsing ?? 0);
      if ((flags & immutableFlags) !== 0) continue;
      const kind = (flags & ts.NodeFlags.Let) !== 0 ? 'module-let' : 'module-var';
      for (const declaration of statement.declarationList.declarations) {
        const names = [];
        bindingIdentifiers(ts, declaration.name, names);
        for (const name of names) {
          if (isAcknowledged(ackState, rel, name)) {
            acknowledgedPairs.add(`${rel}\u0000${name}`);
            continue;
          }
          const line =
            sourceFile.getLineAndCharacterOfPosition(declaration.getStart(sourceFile)).line + 1;
          findings.push({ file: rel, line, name, kind });
        }
      }
    }
  }
  const acknowledgedCount = acknowledgedPairs.size;
  findings.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.name.localeCompare(right.name)
  );
  const truncated = Math.max(0, findings.length - MAX_FINDINGS);
  return {
    active: true,
    findings: findings.slice(0, MAX_FINDINGS),
    acknowledgedCount,
    truncated,
    skippedFiles,
  };
}

/**
 * Status vocabulary for ambient sensor honesty (Y07 strict stays parked).
 * @param {{ active?: boolean, findingCount?: number }} result
 */
export function ambientSensorStatus(result) {
  if (!result?.active) return 'idle';
  return (result.findingCount ?? 0) > 0 ? 'active-findings' : 'active-clean';
}

/** JSON summary for doctor. Advisory only — never a verdict input. */
export function summarizeAmbientState(result, ackState = { exists: false, acks: [] }) {
  const findingCount = result.findings.length;
  const status = ambientSensorStatus({ active: result.active, findingCount });
  return {
    available: true,
    active: result.active,
    status,
    advisory: true,
    // Strict (blocker-grade) ambient diagnostics remain parked (Y07) until a real pure corpus.
    blockerGrade: false,
    strictDiagnostics: 'parked-Y07',
    findingCount,
    acknowledged: ackState?.invalid ? 0 : result.acknowledgedCount,
    ...(result.truncated > 0 ? { truncated: result.truncated } : {}),
    ...(result.skippedFiles > 0 ? { skippedFiles: result.skippedFiles } : {}),
    note:
      status === 'idle'
        ? 'Idle: no pure: true layer opted in. Sensor stays advisory; blocker-grade ambient diagnostics are parked (Y07) until a real pure-layer field corpus exists. Opt in via layer pure: true when ready.'
        : status === 'active-findings'
          ? 'Module-scope mutable state in pure layers — advisory only (never a hard verdict). Acknowledge deliberate registries in the sidecar or move state behind a port. Strict diagnostics remain parked (Y07).'
          : 'Pure layers opted in; no module-scope let/var findings in the MVP envelope. Advisory sensor only — not a pass for blocker-grade ambient enforcement (Y07 parked).',
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
      status: 'unavailable',
      advisory: true,
      blockerGrade: false,
      strictDiagnostics: 'parked-Y07',
      findings: [],
      findingCount: 0,
      acknowledged: 0,
      note: 'TypeScript was not available to the doctor run; the ambient-state sensor did not execute. Advisory only; Y07 strict remains parked.',
    };
  }
  const ackState = loadAmbientStateAcks(root);
  const result = detectAmbientState(ts, root, config, files, ackState);
  return { ...summarizeAmbientState(result, ackState), findings: result.findings };
}

/**
 * Human doctor section (advisory).
 * Idle prints a single dim honesty line so silence is not misread as "ambient done."
 */
export function printAmbientStateSection(state, io) {
  if (!state) return;
  if (!state.available) {
    console.log('');
    console.log(io.color.bold('Ambient state (advisory)'));
    io.line(' ', io.color.dim(state.note || 'Ambient sensor unavailable.'));
    return;
  }
  if (state.status === 'idle' && !state.ackFile?.invalid) {
    console.log('');
    console.log(io.color.bold('Ambient state (advisory)'));
    io.line(
      ' ',
      io.color.dim(
        'Idle (no pure: true layer) — advisory sensor only; blocker-grade ambient diagnostics parked (Y07).'
      )
    );
    return;
  }
  if (state.status === 'active-clean' && !state.ackFile?.invalid && !state.findingCount) {
    console.log('');
    console.log(io.color.bold('Ambient state (advisory)'));
    io.line(
      ' ',
      io.color.dim(
        'Pure layers clean under MVP envelope — still advisory; not Y07 blocker-grade pass.'
      )
    );
    return;
  }
  if (!state.findingCount && !state.ackFile?.invalid) return;
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
  io.line(
    ' ',
    io.color.dim('advisory only — never blocks; move state behind a port or acknowledge it (Y07 strict parked)')
  );
}
