/**
 * X01 — the HTML report is a RENDERING of doctor truth (standing rule).
 *
 * This guard enumerates the advisory surfaces `computeDoctorAdvisories`
 * actually emits and fails when any of them has no `data-advisory` section in
 * the rendered report. Adding a doctor advisory without its report section
 * breaks this test by construction — the report can never silently fall
 * behind the product again.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
// eslint-disable-next-line -- runtime .mjs modules under test
import { computeDoctorAdvisories } from '../../../bin/lib/doctor-advisories.mjs';
import { renderHtmlReport } from '../../../bin/lib/html-report.mjs';
import {
  capabilityBadgesFor,
  renderAdvisorySections,
} from '../../../bin/lib/html-report-advisories.mjs';

const temps: string[] = [];

function mk(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-report-parity-'));
  temps.push(root);
  return root;
}

afterEach(() => {
  for (const root of temps.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const CONFIG = {
  include: ['src'],
  layers: [
    { name: 'DomainModel', patterns: ['src/domain/**'], pure: true },
    { name: 'PersistenceAdapters', patterns: ['src/adapters/**'], capabilities: { deny: ['network'] } },
  ],
  rules: [
    { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
    // Deliberate bidirectional pair so contractHealth has a real smell to render.
    { from: 'PersistenceAdapters', to: 'DomainModel', allowed: true },
    { from: 'DomainModel', to: 'PersistenceAdapters', allowed: true },
  ],
  rules_note: undefined,
};

function project(root: string) {
  fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify({ ...CONFIG, rules_note: undefined }));
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/adapters'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/domain/state.ts'), 'let counter = 0;\nexport const f = () => counter;\n');
  fs.writeFileSync(path.join(root, 'src/adapters/repo.ts'), 'export const r = 1;\n');
}

function renderFor(root: string) {
  const files = [path.join(root, 'src/domain/state.ts'), path.join(root, 'src/adapters/repo.ts')];
  const coverage = { governed: { classifiedFiles: 2, totalFiles: 2, percent: 100 }, layers: [] };
  const advisories = computeDoctorAdvisories(root, CONFIG, coverage, CONFIG.rules, files, ts);
  const html = renderHtmlReport({
    root,
    config: CONFIG,
    exampleByLayer: new Map(),
    fileCountByLayer: new Map(),
    coverage,
    violations: [],
    ok: true,
    suppressed: 0,
    version: 'test',
    configPath: 'ark.config.json',
    generatedAt: '2026-07-16',
    advisories,
  });
  return { advisories, html };
}

describe('X01 report parity — the standing rule', () => {
  it('every advisory key the doctor emits has a data-advisory section in the report', () => {
    const root = mk();
    project(root);
    const { advisories, html } = renderFor(root);
    const keys = Object.keys(advisories);
    expect(keys.length).toBeGreaterThanOrEqual(2);
    for (const key of keys) {
      expect(html, `report section for doctor advisory "${key}"`).toContain(
        `data-advisory="${key}"`
      );
    }
    // Nested surface with its own consumers keeps its own marker.
    expect(html).toContain('data-advisory="governanceWeight"');
  });

  it('renders the real content: smells, acknowledgments honesty, ambient findings', () => {
    const root = mk();
    project(root);
    const { html } = renderFor(root);
    expect(html).toContain('contract-bidirectional-allow');
    expect(html).toMatch(/never changes the verdict/i);
    expect(html).toContain('module-let');
    expect(html).toMatch(/blocker-grade Y07 parked|parked \(Y07\)/i);
  });

  it('layer badges show walls: pure and capability deny lists', () => {
    expect(capabilityBadgesFor({ pure: true })).toContain('pure');
    expect(capabilityBadgesFor({ capabilities: { deny: ['network', 'clock'] } })).toContain(
      'walls: clock, network'
    );
    expect(capabilityBadgesFor({})).toBe('');
    const root = mk();
    project(root);
    const { html } = renderFor(root);
    expect(html).toContain('>pure</span>');
    expect(html).toContain('walls: network');
  });

  it('renders every degraded shape honestly (no advisory is silently dropped)', () => {
    const esc = (v: unknown) => String(v);
    // Absent payloads render nothing rather than throwing.
    expect(renderAdvisorySections(null, esc)).toBe('');
    expect(renderAdvisorySections({ contractHealth: null, ambientState: null }, esc)).toBe('');
    // Invalid ack sidecar is surfaced, never silently applied.
    const invalidAcks = renderAdvisorySections(
      {
        contractHealth: {
          smells: [],
          acknowledged: 0,
          ackFile: { path: '.ark/contract-smell-acks.json', invalid: true },
          governanceWeight: { weight: 'unknown' },
        },
      },
      esc
    );
    expect(invalidAcks).toContain('invalid');
    expect(invalidAcks).toContain('Governance weight: unknown');
    expect(invalidAcks).toContain('No contract smells detected');
    // Unavailable ambient sensor states its own note.
    expect(
      renderAdvisorySections({ ambientState: { available: false, note: 'no TS host' } }, esc)
    ).toContain('no TS host');
    // Idle (no pure layer) vs active-and-clean vs overflow beyond the top 10.
    expect(renderAdvisorySections({ ambientState: { active: false } }, esc)).toContain('Idle');
    expect(
      renderAdvisorySections({ ambientState: { active: true, findings: [] } }, esc)
    ).toContain('clean');
    const many = Array.from({ length: 12 }, (_, i) => ({
      file: `src/a${i}.ts`,
      line: i + 1,
      name: `s${i}`,
      kind: 'module-let',
    }));
    const overflow = renderAdvisorySections(
      { ambientState: { active: true, findings: many, findingCount: 12, acknowledged: 2 } },
      esc
    );
    expect(overflow).toContain('+2 more in doctor JSON');
    expect(overflow).toContain('acknowledged module state: 2');
    // Atypical governance weight keeps the warn tag and per-layer densities.
    const gw = renderAdvisorySections(
      {
        contractHealth: {
          smells: [{ id: 'contract-dead-rule', message: 'm', outcome: 'o', evidence: [], fix: 'f' }],
          acknowledged: 3,
          ackFile: { path: '.ark/contract-smell-acks.json' },
          governanceWeight: {
            weight: 'heavy',
            declaredLayers: 12,
            rules: 40,
            governedFiles: 2996,
            filesPerLayer: 249.7,
            rulesPerLayer: 3.3,
            note: 'n',
          },
        },
      },
      esc
    );
    expect(gw).toContain('heavy');
    expect(gw).toContain('249.7 files/layer');
    expect(gw).toContain('Acknowledged edges applied: <b>3</b>');
    // Graph-blind shapes: unavailable, clean zero, template-interpolation edges + verdict note.
    expect(
      renderAdvisorySections(
        { graphBlindSpots: { available: false, note: 'no TS for graph-blind', count: 0, edges: [] } },
        esc
      )
    ).toContain('no TS for graph-blind');
    expect(
      renderAdvisorySections(
        {
          graphBlindSpots: {
            available: true,
            count: 0,
            templateInterpolationCount: 0,
            edges: [],
          },
        },
        esc
      )
    ).toMatch(/No unresolvable dynamic/i);
    const blindEdges = renderAdvisorySections(
      {
        graphBlindSpots: {
          available: true,
          count: 2,
          templateInterpolationCount: 1,
          truncated: 1,
          edges: [
            { file: 'src/a.ts', line: 3, kind: 'import', reason: 'template-interpolation' },
            { file: 'src/b.ts', line: 1, kind: 'require', reason: 'non-literal' },
          ],
        },
      },
      esc
    );
    expect(blindEdges).toContain('data-advisory="graphBlindSpots"');
    expect(blindEdges).toContain('template-interpolation');
    expect(blindEdges).toMatch(/never a hard verdict|does not change the architecture verdict/i);
    expect(blindEdges).toContain('+1 more in doctor JSON');
  });

  it('X07 — a finding with more than six evidence items announces the cut', () => {
    const esc = (v: unknown) => String(v);
    const evidence = Array.from({ length: 12 }, (_, i) => `edge:A${i}->B${i}`);
    const html = renderAdvisorySections(
      {
        contractHealth: {
          smells: [
            {
              id: 'contract-lateral-adapter-allow',
              message: 'm',
              outcome: 'o',
              evidence,
              fix: 'f',
            },
          ],
          acknowledged: 0,
          ackFile: { path: '.ark/contract-smell-acks.json' },
          governanceWeight: { weight: 'unknown' },
        },
      },
      esc
    );
    expect(html).toContain('edge:A5->B5');
    expect(html).not.toContain('edge:A6->B6');
    expect(html).toContain('…(+6 more in doctor JSON)');
    // At or under the cap, no marker appears.
    const short = renderAdvisorySections(
      {
        contractHealth: {
          smells: [
            { id: 'contract-dead-rule', message: 'm', outcome: 'o', evidence: evidence.slice(0, 6), fix: 'f' },
          ],
          acknowledged: 0,
          ackFile: { path: '.ark/contract-smell-acks.json' },
          governanceWeight: { weight: 'unknown' },
        },
      },
      esc
    );
    expect(short).not.toContain('more in doctor JSON');
  });

  it('the full CLI --report path emits the sections end to end', () => {
    const root = mk();
    project(root);
    try {
      execFileSync(
        'node',
        [path.resolve('bin/ark-check.mjs'), '--root', root, '--report', 'out.html', '--no-cache'],
        { encoding: 'utf8', stdio: 'pipe' }
      );
    } catch {
      // exit code may be non-zero on advisory-free trees; the report still writes
    }
    const html = fs.readFileSync(path.join(root, 'out.html'), 'utf8');
    expect(html).toContain('data-advisory="contractHealth"');
    expect(html).toContain('data-advisory="ambientState"');
    expect(html).toContain('data-advisory="governanceWeight"');
  });
});
