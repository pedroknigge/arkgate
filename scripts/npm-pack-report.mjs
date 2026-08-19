/**
 * npm pack --json is an array on npm 10 and a name-keyed object on npm 11+.
 */
export function parseNpmPackReports(raw) {
  const text = String(raw ?? '').trim();
  const start = text.search(/[\[{]/);
  const parsed = JSON.parse(start === -1 ? text : text.slice(start));
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? Object.values(parsed)
      : [];
  return rows.filter(
    (row) => row && typeof row === 'object' && typeof row.filename === 'string'
  );
}

export function parseNpmPackReport(raw) {
  const reports = parseNpmPackReports(raw);
  if (reports.length === 0) {
    throw new Error('npm pack --json did not include a filename');
  }
  return reports[0];
}
