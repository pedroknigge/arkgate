/**
 * Invariant probe evidence reader — Tooling (ADR 0039).
 *
 * Reads the committed `.ark/invariant-probe.json` (at most 1 MiB, 500 rows),
 * hashes the inputs each row was bound to as they stand now, and attaches a
 * `probe` summary to coverage rows. Read-only: this module never runs a test
 * and never imports the runner or the workspace, so the gate entry points that
 * load it (--promote, the policy delta, status, rules inventory) can never
 * spawn anything. A malformed or stale artifact changes nothing.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  INVARIANT_PROBE_ARTIFACT_PATH,
  INVARIANT_PROBE_MAX_BYTES,
  invariantProbeIdentity,
  probeRowLine,
  probeRowStaleness,
  probeStatusLabel,
  readInvariantProbeArtifact,
  summarizeProbeForCoverage,
  verdictRefusesPromotion,
} from './invariant-probe.mjs';

export function sha256Text(text) {
  return `sha256:${crypto.createHash('sha256').update(text).digest('hex')}`;
}

/** Content hash of a project file, or null when it is gone or outside the root. */
export function hashProjectFile(root, rel) {
  if (typeof rel !== 'string' || rel.length === 0) return null;
  const rootResolved = path.resolve(root);
  const absolute = path.resolve(rootResolved, rel);
  if (absolute !== rootResolved && !absolute.startsWith(`${rootResolved}${path.sep}`)) return null;
  try {
    return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')}`;
  } catch {
    return null;
  }
}

export function invariantIdentityHash(invariant) {
  return sha256Text(invariantProbeIdentity(invariant));
}

/**
 * @returns {{ present: false }
 *          | { present: true, ok: false, note: string }
 *          | { present: true, ok: true, artifact: object, note?: string }}
 */
function loadInvariantProbeArtifact(root) {
  const absolute = path.join(root, INVARIANT_PROBE_ARTIFACT_PATH);
  let stat;
  try {
    stat = fs.lstatSync(absolute);
  } catch {
    return { present: false };
  }
  const ignored = (why) => ({
    present: true,
    ok: false,
    note: `${INVARIANT_PROBE_ARTIFACT_PATH} was ignored (${why}), so it changes no promotion.`,
  });
  if (!stat.isFile()) return ignored('not a regular file');
  if (stat.size > INVARIANT_PROBE_MAX_BYTES) return ignored('larger than 1 MiB');
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch {
    return ignored('not valid JSON');
  }
  const read = readInvariantProbeArtifact(parsed);
  if (!read.ok) return ignored(read.reason);
  const skipped = read.droppedRows + read.truncatedRows;
  return {
    present: true,
    ok: true,
    artifact: read.artifact,
    ...(skipped > 0
      ? { note: `${skipped} row(s) in ${INVARIANT_PROBE_ARTIFACT_PATH} were malformed or past the 500-row cap and were ignored.` }
      : {}),
  };
}

/**
 * Probe summary per catalogued invariant id, each judged fresh or stale
 * against the tree as it stands now. Rows for ids no longer declared are ignored.
 */
function probeSummariesFor(root, catalogInvariants, loaded = loadInvariantProbeArtifact(root)) {
  const byId = new Map();
  if (!loaded.present || !loaded.ok) return byId;
  const catalog = new Map((catalogInvariants ?? []).map((inv) => [inv.id, inv]));
  const fileHashes = new Map();
  const hashOf = (rel) => {
    if (!fileHashes.has(rel)) fileHashes.set(rel, hashProjectFile(root, rel));
    return fileHashes.get(rel);
  };
  for (const row of loaded.artifact.invariants) {
    const inv = catalog.get(row.invariantId);
    if (!inv || byId.has(row.invariantId)) continue;
    const current = {
      invariantHash: invariantIdentityHash(inv),
      symbolFileHash: row.symbolFile ? hashOf(row.symbolFile) : null,
      testHashes: Object.fromEntries(row.tests.map((test) => [test.path, hashOf(test.path)])),
    };
    const stale = probeRowStaleness(row, current, loaded.artifact.operatorSet);
    byId.set(row.invariantId, { summary: summarizeProbeForCoverage(row, stale, loaded.artifact.probedOn), row });
  }
  return byId;
}

/** Coverage rows with `probe` attached where the artifact has a row. Absent artifact: rows unchanged. */
export function attachProbeEvidence(root, coverageRows, catalogInvariants) {
  const loaded = loadInvariantProbeArtifact(root);
  if (!loaded.present) return { rows: coverageRows, loaded };
  const summaries = probeSummariesFor(root, catalogInvariants, loaded);
  const rows = (coverageRows ?? []).map((row) => {
    const hit = summaries.get(row.invariantId);
    return hit ? { ...row, probe: hit.summary } : row;
  });
  return { rows, loaded };
}

/**
 * Status / inventory projection. Null when there is no artifact: absence is
 * silent, so a project that never ran the probe sees nothing new.
 */
export function probeStatusSection(root, catalogInvariants) {
  const loaded = loadInvariantProbeArtifact(root);
  if (!loaded.present) return null;
  if (!loaded.ok) return { notAScore: true, artifact: INVARIANT_PROBE_ARTIFACT_PATH, note: loaded.note, rows: [] };
  const summaries = probeSummariesFor(root, catalogInvariants, loaded);
  const rows = (catalogInvariants ?? []).map((inv) => {
    const hit = summaries.get(inv.id);
    const status = probeStatusLabel(hit?.summary);
    const refuses = Boolean(hit?.summary.fresh && verdictRefusesPromotion(hit.summary.verdict));
    return {
      id: inv.id,
      status,
      ...(refuses ? { ruleId: 'INVARIANT_PROBE_SURVIVED', line: probeRowLine(hit.row) } : {}),
      ...(hit?.summary.staleBecause ? { staleBecause: hit.summary.staleBecause } : {}),
    };
  });
  return {
    notAScore: true,
    artifact: INVARIANT_PROBE_ARTIFACT_PATH,
    probedOn: loaded.artifact.probedOn,
    rows,
    ...(loaded.note ? { note: loaded.note } : {}),
  };
}

/** One status line per probed invariant, plus the artifact note. Empty without an artifact. */
export function formatProbeStatusLines(section) {
  if (!section) return [];
  const lines = [];
  if (section.note) lines.push(`ArkRules: ${section.note}`);
  for (const row of section.rows ?? []) {
    if (row.status === 'not run') continue;
    if (row.ruleId) lines.push(`ArkRules: ${row.line} (${row.ruleId}, advisory; promotion refuses)`);
    else lines.push(`ArkRules: ${row.id} probe: ${row.status}${row.staleBecause ? ` (${row.staleBecause[0]})` : ''}`);
  }
  return lines;
}
