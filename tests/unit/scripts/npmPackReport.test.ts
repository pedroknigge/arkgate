import { describe, expect, it } from 'vitest';
import { parseNpmPackReport, parseNpmPackReports } from '../../../scripts/npm-pack-report.mjs';

const PACK_ROW = { id: 'arkgate', name: 'arkgate', filename: 'arkgate-4.6.7.tgz' };

describe('parseNpmPackReports', () => {
  it('parses ANSI-prefixed npm pack --json array output', () => {
    const raw = `\u001b[34mCLI extra\u001b[0m\n${JSON.stringify([PACK_ROW])}\n`;
    expect(parseNpmPackReports(raw)).toEqual([PACK_ROW]);
    expect(parseNpmPackReport(raw).filename).toBe('arkgate-4.6.7.tgz');
  });

  it('parses ANSI on the same line as the JSON payload', () => {
    const raw = `\u001b[34mCLI extra\u001b[0m ${JSON.stringify({ arkgate: PACK_ROW })}`;
    expect(parseNpmPackReport(raw).filename).toBe('arkgate-4.6.7.tgz');
  });

  it('still reads a bare JSON array', () => {
    expect(parseNpmPackReports(JSON.stringify([PACK_ROW]))).toEqual([PACK_ROW]);
  });

  it('ignores a leading [34m ANSI crumb that is not JSON', () => {
    const raw = `[34mCLI extra\n${JSON.stringify([PACK_ROW])}\n`;
    expect(parseNpmPackReport(raw).filename).toBe('arkgate-4.6.7.tgz');
  });

  it('returns [] for empty JSON array/object and throws the filename error from parseNpmPackReport', () => {
    expect(parseNpmPackReports('[]')).toEqual([]);
    expect(parseNpmPackReports('{}')).toEqual([]);
    expect(() => parseNpmPackReport('[]')).toThrow(/did not include a filename/);
    expect(() => parseNpmPackReport('{}')).toThrow(/did not include a filename/);
  });
});
