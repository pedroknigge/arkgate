/**
 * Y03 — parse honesty over the ASTs already created by architecture-scan.
 * Advisory only: counts are transported, never raw TypeScript diagnostics.
 */

export const PARSE_HEALTH_FILE_CAP = 12;

function unavailableParseHealth(scannedFiles = 0) {
  return {
    advisory: true,
    available: false,
    status: 'unavailable',
    scannedFiles,
    affectedFiles: 0,
    diagnosticCount: 0,
    files: [],
    truncated: 0,
    overflow: false,
  };
}

/** Aggregate cached/per-file parse counts into a deterministic doctor surface. */
export function summarizeParseHealth(scanned) {
  if (!Array.isArray(scanned)) return unavailableParseHealth();
  const rows = scanned
    .map(({ relFile, entry }) => ({
      file: relFile,
      diagnosticCount: entry?.parseDiagnosticCount,
    }));
  if (rows.some(({ file, diagnosticCount }) =>
    typeof file !== 'string' || file.length === 0 ||
    !Number.isSafeInteger(diagnosticCount) || diagnosticCount < 0
  )) return unavailableParseHealth(rows.length);
  const affected = rows
    .filter(({ diagnosticCount }) => diagnosticCount > 0)
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  let diagnosticCount = 0;
  for (const row of affected) {
    if (!Number.isSafeInteger(diagnosticCount + row.diagnosticCount)) {
      return unavailableParseHealth(rows.length);
    }
    diagnosticCount += row.diagnosticCount;
  }
  const truncated = Math.max(0, affected.length - PARSE_HEALTH_FILE_CAP);
  return {
    advisory: true,
    available: true,
    status: affected.length > 0 ? 'parse-diagnostics' : 'ok',
    scannedFiles: rows.length,
    affectedFiles: affected.length,
    diagnosticCount,
    files: affected.slice(0, PARSE_HEALTH_FILE_CAP),
    truncated,
    overflow: truncated > 0,
  };
}

/** Human doctor section; clean parse health stays quiet. */
export function printParseHealthSection(health, io) {
  if (!health || health.affectedFiles === 0) return;
  console.log('');
  console.log(io.color.bold('Parse health (advisory)'));
  io.line(
    io.warn,
    `${health.affectedFiles} governed file(s) carry ${health.diagnosticCount} parse diagnostic(s) across ${health.scannedFiles} scanned file(s).`
  );
  for (const finding of health.files ?? []) {
    io.line(io.warn, `${finding.file} — ${finding.diagnosticCount} parse diagnostic(s)`);
  }
  if (health.truncated > 0) {
    io.line(' ', io.color.dim(`…(+${health.truncated} more affected file(s); list capped)`));
  }
  io.line(' ', io.color.dim('advisory only — the gate verdict, design fitness, and pattern bets are unchanged'));
}
