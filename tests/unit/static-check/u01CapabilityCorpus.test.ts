/**
 * U01 — capability fixture corpus (ADR 0009 exit obligation).
 *
 * Structural guard only: U03 implements detection; this test proves the corpus
 * exists, is complete per the ADR matrix, matches its own claims (content vs
 * manifest evidence), and is deterministic. Every future capability behavior
 * lands against these exact files.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CORPUS = path.join(REPO, 'tests/fixtures/capability-corpus');

/** ADR 0009 D1 — seven fixed IDs with declared evidence sources (filesystem is import-based only in the MVP). */
const CAPABILITIES: Record<string, string[]> = {
  network: ['ambient-global', 'import-based'],
  filesystem: ['import-based'],
  clock: ['ambient-global'],
  randomness: ['ambient-global'],
  environment: ['ambient-global'],
  process: ['ambient-global'],
  persistence: ['import-based'],
};
const KINDS = ['positive', 'negative', 'policy-allowed'];
const SOURCES = ['ambient-global', 'import-based'];

type Case = {
  id: string;
  capability: string;
  kind: string;
  evidenceSource: string;
  category?: string;
  file: string;
  evidence: { pattern?: string; importOf?: string; typeOnly?: boolean };
  notes?: string;
};

function manifest() {
  return JSON.parse(fs.readFileSync(path.join(CORPUS, 'manifest.v1.json'), 'utf8'));
}

function readCase(rel: string): string {
  return fs.readFileSync(path.join(CORPUS, rel), 'utf8');
}

function importsOf(fileName: string, body: string): Array<{ specifier: string; typeOnly: boolean }> {
  const source = ts.createSourceFile(fileName, body, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: Array<{ specifier: string; typeOnly: boolean }> = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      found.push({
        specifier: statement.moduleSpecifier.text,
        typeOnly: statement.importClause?.isTypeOnly === true,
      });
    }
  }
  return found;
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

  it('every case is runtime-valid: known kind, source, capability, and declared source for it', () => {
    const m = manifest();
    const cases: Case[] = m.cases;
    for (const c of cases) {
      expect(KINDS, `${c.id} kind`).toContain(c.kind);
      expect(SOURCES, `${c.id} evidenceSource`).toContain(c.evidenceSource);
      expect(Object.keys(CAPABILITIES), `${c.id} capability`).toContain(c.capability);
      expect(
        m.capabilities[c.capability].evidenceSources,
        `${c.id} source declared for ${c.capability}`
      ).toContain(c.evidenceSource);
      expect(
        Boolean(c.evidence?.pattern) || Boolean(c.evidence?.importOf),
        `${c.id} has evidence`
      ).toBe(true);
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
    expect(cases.some((c) => c.kind === 'negative' && c.category === 'type-only-global')).toBe(true);
    // Similar-name non-driver imports for every import-based capability (ADR: no substring matching).
    for (const id of ['persistence', 'network', 'filesystem']) {
      expect(
        cases.some((c) => c.capability === id && c.kind === 'negative' && c.category === 'similar-name'),
        `${id} similar-name negative`
      ).toBe(true);
    }
    expect(cases.some((c) => c.kind === 'policy-allowed' && c.capability === 'persistence')).toBe(
      true
    );
  });

  it('case files parse as TS, match their claimed evidence, and cannot silently drift', () => {
    const cases: Case[] = manifest().cases;
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
    const files = cases.map((c) => c.file);
    expect(new Set(files).size, 'no case shares a file').toBe(files.length);

    // Orphan guard: every on-disk case file must be declared in the manifest.
    const onDisk = fs.readdirSync(path.join(CORPUS, 'cases')).sort();
    expect(onDisk).toEqual(files.map((f) => path.basename(f)).sort());

    for (const c of cases) {
      const body = readCase(c.file);
      expect(body.length, c.file).toBeGreaterThan(10);
      // Public API for syntax diagnostics (no TS internals).
      const out = ts.transpileModule(body, {
        reportDiagnostics: true,
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      });
      expect(out.diagnostics?.length ?? 0, `${c.file} parse`).toBe(0);

      // Content-vs-claim: the corpus cannot be swapped for unrelated code and stay green.
      if (c.evidence.pattern) {
        expect(new RegExp(c.evidence.pattern).test(body), `${c.file} pattern`).toBe(true);
      }
      if (c.evidence.importOf) {
        const hit = importsOf(c.file, body).find((i) => i.specifier === c.evidence.importOf);
        expect(hit, `${c.file} imports ${c.evidence.importOf}`).toBeDefined();
        expect(hit!.typeOnly, `${c.file} typeOnly flag`).toBe(c.evidence.typeOnly === true);
      }
    }
  });

  it('carries the D7 adapter-policy artifact wiring the policy-allowed case', () => {
    const m = manifest();
    expect(m.policyLayer.executable).toBe(true);
    expect(m.policyLayer.activatedIn).toBe('U04');
    const policy = JSON.parse(readCase(m.policyLayer.file));
    const layers = policy.layers as Array<{ name: string; patterns: string[]; capabilities?: { deny: string[] } }>;
    const adapter = layers.find((l) => l.name === 'PersistenceAdapters');
    const domain = layers.find((l) => l.name === 'DomainModel');
    expect(adapter?.patterns).toContain('cases/persistence-adapter-allowed.ts');
    expect(adapter?.capabilities).toBeUndefined();
    expect(domain?.capabilities?.deny).toContain('persistence');
  });

  it('carries the D6 lowered-policy pair (neutral migration vs real weakening)', () => {
    const m = manifest();
    const pd = m.policyDelta;
    expect(pd.executable).toBe(true);
    expect(pd.activatedIn).toBe('U04');
    for (const [name, expected] of [
      ['candidate-neutral', 'neutral'],
      ['candidate-weakening', 'weakening'],
    ] as const) {
      expect(pd.pairs[name].expectedClassification).toBe(expected);
    }
    const readJson = (rel: string) => JSON.parse(readCase(rel));
    const base = readJson('policy-delta/base.config.json');
    const neutral = readJson('policy-delta/candidate-neutral.config.json');
    const weakening = readJson('policy-delta/candidate-weakening.config.json');
    for (const cfg of [base, neutral, weakening]) expect(Array.isArray(cfg.layers)).toBe(true);

    // Lowering map: string → capability[] (prefix-matched globals cover several).
    const lowered: Record<string, string[]> = m.lowering.map;
    expect(lowered['process'], 'bare process covers env reads today (prefix match)').toContain(
      'environment'
    );
    const baseCaps = (base.layers[0].forbiddenGlobals as string[])
      .flatMap((g) => lowered[g])
      .sort();
    const neutralCaps = (neutral.layers[0].capabilities.deny as string[]).slice().sort();
    const weakeningCaps = (weakening.layers[0].capabilities.deny as string[]).slice().sort();
    // Neutral must cover the full lowered base set…
    for (const cap of baseCaps) expect(neutralCaps, `neutral covers ${cap}`).toContain(cap);
    // …and the weakening candidate must actually LOSE at least one lowered capability.
    expect(
      baseCaps.some((cap) => !weakeningCaps.includes(cap)),
      'weakening drops a lowered capability'
    ).toBe(true);
  });
});
