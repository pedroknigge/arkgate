/**
 * U01 — capability fixture corpus (ADR 0009 exit obligation).
 *
 * Structural guard only: U03 implements detection; this test proves the corpus
 * exists, is complete per the ADR matrix, and is deterministic. Every future
 * capability behavior lands against these exact files.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CORPUS = path.join(REPO, 'tests/fixtures/capability-corpus');

/** ADR 0009 D1 — seven fixed IDs with declared evidence sources. */
const CAPABILITIES: Record<string, string[]> = {
  network: ['ambient-global', 'import-based'],
  filesystem: ['import-based'],
  clock: ['ambient-global'],
  randomness: ['ambient-global'],
  environment: ['ambient-global'],
  process: ['ambient-global'],
  persistence: ['import-based'],
};

type Case = {
  id: string;
  capability: string;
  kind: 'positive' | 'negative' | 'policy-allowed';
  evidenceSource: 'ambient-global' | 'import-based';
  category?: string;
  file: string;
  notes?: string;
};

function manifest() {
  return JSON.parse(fs.readFileSync(path.join(CORPUS, 'manifest.v1.json'), 'utf8'));
}

describe('U01 capability corpus — completeness per ADR 0009', () => {
  it('declares exactly the seven ADR capability ids with their evidence sources', () => {
    const m = manifest();
    expect(m.version).toBe(1);
    expect(m.adr).toBe('docs/adr/0009-effect-capability-boundary.md');
    expect(Object.keys(m.capabilities).sort()).toEqual(Object.keys(CAPABILITIES).sort());
    for (const [id, sources] of Object.entries(CAPABILITIES)) {
      expect(m.capabilities[id].evidenceSources.slice().sort(), id).toEqual(sources.slice().sort());
    }
  });

  it('has at least one positive fixture per capability per declared evidence source', () => {
    const cases: Case[] = manifest().cases;
    for (const [id, sources] of Object.entries(CAPABILITIES)) {
      for (const source of sources) {
        const hits = cases.filter(
          (c) => c.capability === id && c.kind === 'positive' && c.evidenceSource === source
        );
        expect(hits.length, `${id}/${source} positive`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('covers adversarial globalThis aliasing as a positive for at least one ambient capability', () => {
    const cases: Case[] = manifest().cases;
    const aliased = cases.filter((c) => c.kind === 'positive' && c.category === 'globalthis-alias');
    expect(aliased.length).toBeGreaterThanOrEqual(1);
  });

  it('covers the required negative matrix per evidence source', () => {
    const cases: Case[] = manifest().cases;
    // Ambient-global capabilities: local shadowing and type-only value absence must NOT detect.
    for (const [id, sources] of Object.entries(CAPABILITIES)) {
      if (sources.includes('ambient-global')) {
        expect(
          cases.some((c) => c.capability === id && c.kind === 'negative' && c.category === 'shadowing'),
          `${id} shadowing negative`
        ).toBe(true);
      }
      if (sources.includes('import-based')) {
        expect(
          cases.some(
            (c) => c.capability === id && c.kind === 'negative' && c.category === 'type-only-import'
          ),
          `${id} type-only import negative`
        ).toBe(true);
      }
    }
    // Type-only *value* use for at least one ambient capability (Date as a type).
    expect(cases.some((c) => c.kind === 'negative' && c.category === 'type-only-global')).toBe(true);
    // Similar-name non-driver imports for persistence and network.
    for (const id of ['persistence', 'network']) {
      expect(
        cases.some((c) => c.capability === id && c.kind === 'negative' && c.category === 'similar-name'),
        `${id} similar-name negative`
      ).toBe(true);
    }
    // Legitimate adapter-layer use: detected but allowed by layer policy (kind policy-allowed).
    expect(cases.some((c) => c.kind === 'policy-allowed' && c.capability === 'persistence')).toBe(
      true
    );
  });

  it('every case file exists, is non-empty, parses as TypeScript, and ids are unique + sorted', () => {
    const cases: Case[] = manifest().cases;
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
    for (const c of cases) {
      const abs = path.join(CORPUS, c.file);
      const body = fs.readFileSync(abs, 'utf8');
      expect(body.length, c.file).toBeGreaterThan(10);
      const source = ts.createSourceFile(c.file, body, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
      // parseDiagnostics is internal but stable across the supported TS matrix.
      const diags = (source as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics;
      expect(diags.length, `${c.file} parse`).toBe(0);
    }
  });

  it('carries the D6 lowered-policy pair (neutral migration vs real weakening)', () => {
    const m = manifest();
    const pd = m.policyDelta;
    expect(pd.executable).toBe(false);
    expect(pd.activatesIn).toBe('U04');
    for (const [name, expected] of [
      ['candidate-neutral', 'neutral'],
      ['candidate-weakening', 'weakening'],
    ] as const) {
      expect(pd.pairs[name].expectedClassification).toBe(expected);
    }
    for (const rel of [
      'policy-delta/base.config.json',
      'policy-delta/candidate-neutral.config.json',
      'policy-delta/candidate-weakening.config.json',
    ]) {
      const body = JSON.parse(fs.readFileSync(path.join(CORPUS, rel), 'utf8'));
      expect(Array.isArray(body.layers), rel).toBe(true);
    }
    // The neutral candidate must cover every lowered capability of the base's forbiddenGlobals.
    const base = JSON.parse(
      fs.readFileSync(path.join(CORPUS, 'policy-delta/base.config.json'), 'utf8')
    );
    const neutral = JSON.parse(
      fs.readFileSync(path.join(CORPUS, 'policy-delta/candidate-neutral.config.json'), 'utf8')
    );
    const lowered: Record<string, string> = m.lowering;
    const baseCaps = (base.layers[0].forbiddenGlobals as string[]).map((g) => lowered[g]).sort();
    const neutralCaps = (neutral.layers[0].capabilities.deny as string[]).slice().sort();
    for (const cap of baseCaps) expect(neutralCaps, `neutral covers ${cap}`).toContain(cap);
  });
});
