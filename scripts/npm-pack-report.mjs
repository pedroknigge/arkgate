/**
 * npm pack --json is an array on npm 10 and a name-keyed object on npm 11+.
 * npm may prefix ANSI progress on the same stdout as the JSON payload.
 */
const ANSI_ESCAPE = /\u001b\[[0-9;]*[A-Za-z]/g;

function stripAnsi(raw) {
  return String(raw ?? '').replace(ANSI_ESCAPE, '');
}

function jsonLineCandidates(raw) {
  const stripped = stripAnsi(raw).trim();
  const jsonLines = stripped
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{') || line.startsWith('['));
  const candidates = [...jsonLines];
  if (jsonLines.length > 1) candidates.push(jsonLines.join('\n'));
  candidates.push(stripped);
  return candidates;
}

function rowsFromParsed(parsed) {
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? Object.values(parsed)
      : [];
  return rows.filter(
    (row) => row && typeof row === 'object' && typeof row.filename === 'string'
  );
}

export function parseNpmPackReports(raw) {
  let lastError;
  let parsedEmpty = false;
  for (const candidate of jsonLineCandidates(raw)) {
    const start = candidate.search(/[\[{]/);
    const payload = start === -1 ? candidate : candidate.slice(start);
    try {
      const rows = rowsFromParsed(JSON.parse(payload));
      if (rows.length > 0) return rows;
      parsedEmpty = true;
    } catch (error) {
      lastError = error;
    }
  }
  if (parsedEmpty) return [];
  throw lastError ?? new SyntaxError('npm pack --json did not include JSON');
}

export function parseNpmPackReport(raw) {
  const reports = parseNpmPackReports(raw);
  if (reports.length === 0) {
    throw new Error('npm pack --json did not include a filename');
  }
  return reports[0];
}
