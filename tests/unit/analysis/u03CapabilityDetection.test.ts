/**
 * U03 — typed effect capabilities in the canonical analysis (ADR 0009 D1/D3).
 *
 * Makes the U01 corpus EXECUTABLE: every manifest case runs through the
 * symbol-aware collector, and the import-based subset also runs through the
 * pure IR engine. Direct evidence detects; shadowing/type-only/similar-name
 * never do; determinism is byte-stable.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  AMBIENT_CAPABILITY_ENTRIES,
  CAPABILITY_IDS,
  capabilityForAmbientName,
  capabilityForModuleSpecifier,
  forbiddenGlobalForModuleSpecifier,
  lowerForbiddenGlobal,
  loweredLayerCoverage,
} from '../../../src/domain/capabilities';
import {
  analyzeProject,
  collectCapabilityUses,
  loadContract,
} from '../../../src/kernel/analysis';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CORPUS = path.join(REPO, 'tests/fixtures/capability-corpus');

type Case = {
  id: string;
  capability: string;
  kind: 'positive' | 'negative' | 'policy-allowed';
  evidenceSource: 'ambient-global' | 'import-based';
  category?: string;
  file: string;
};

const manifest = JSON.parse(fs.readFileSync(path.join(CORPUS, 'manifest.v1.json'), 'utf8'));
const cases: Case[] = manifest.cases;

function sourceFor(c: Case) {
  const body = fs.readFileSync(path.join(CORPUS, c.file), 'utf8');
  return ts.createSourceFile(c.file, body, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
}

function usesFor(c: Case) {
  return collectCapabilityUses(ts, sourceFor(c));
}

describe('U03 vocabulary (ADR 0009 D1)', () => {
  it('exposes the seven closed capability ids in ADR order', () => {
    expect(CAPABILITY_IDS).toEqual([
      'network',
      'filesystem',
      'clock',
      'randomness',
      'environment',
      'process',
      'persistence',
    ]);
    expect(Object.isFrozen(CAPABILITY_IDS)).toBe(true);
  });

  it('classifies module specifiers exactly — never by substring', () => {
    expect(capabilityForModuleSpecifier('pg')).toBe('persistence');
    expect(capabilityForModuleSpecifier('pg/lib/client')).toBe('persistence');
    expect(capabilityForModuleSpecifier('pgn-parser')).toBeNull();
    expect(capabilityForModuleSpecifier('node:fs/promises')).toBe('filesystem');
    expect(capabilityForModuleSpecifier('fsm-machine')).toBeNull();
    expect(capabilityForModuleSpecifier('axios')).toBe('network');
    expect(capabilityForModuleSpecifier('refetch-hints')).toBeNull();
    expect(capabilityForModuleSpecifier('./local')).toBeNull();
  });

  it('maps ambient names by longest known prefix', () => {
    expect(capabilityForAmbientName('Date')).toBe('clock');
    expect(capabilityForAmbientName('Date.now')).toBe('clock');
    expect(capabilityForAmbientName('Math.random')).toBe('randomness');
    expect(capabilityForAmbientName('process.env')).toBe('environment');
    expect(capabilityForAmbientName('process')).toBe('process');
    expect(capabilityForAmbientName('Math')).toBeNull();
    expect(AMBIENT_CAPABILITY_ENTRIES).toContain('process.env');
  });

  it('lowers forbiddenGlobals coverage-faithfully (ADR 0009 D6)', () => {
    expect(lowerForbiddenGlobal('fetch')).toEqual(['network']);
    expect(lowerForbiddenGlobal('Date.now')).toEqual(['clock']);
    expect(lowerForbiddenGlobal('Date')).toEqual(['clock']);
    expect(lowerForbiddenGlobal('Math.random')).toEqual(['randomness']);
    expect(lowerForbiddenGlobal('process.env')).toEqual(['environment']);
    // Bare process prefix-matches process.env today, so it lowers to BOTH.
    expect(lowerForbiddenGlobal('process')).toEqual(['environment', 'process']);
    expect(lowerForbiddenGlobal('somethingElse')).toEqual([]);
  });
});

describe('U03 corpus is executable (ADR 0009 D3 — direct evidence only)', () => {
  for (const c of cases) {
    if (c.kind === 'positive' || c.kind === 'policy-allowed') {
      it(`${c.id}: detects ${c.capability} (${c.evidenceSource})`, () => {
        const hits = usesFor(c).filter((use) => use.capability === c.capability);
        expect(hits.length, c.id).toBeGreaterThanOrEqual(1);
        for (const hit of hits) {
          expect(hit.line).toBeGreaterThanOrEqual(1);
          expect(typeof hit.symbol).toBe('string');
        }
      });
    } else {
      it(`${c.id}: does NOT detect ${c.capability} (${c.category})`, () => {
        const hits = usesFor(c).filter((use) => use.capability === c.capability);
        expect(hits, c.id).toEqual([]);
      });
    }
  }

  it('is deterministic and ordered for identical input', () => {
    const target = cases.find((c) => c.id === 'persistence-prisma')!;
    const first = usesFor(target);
    const second = usesFor(target);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    const sorted = [...first].sort(
      (a, b) =>
        a.line - b.line ||
        a.capability.localeCompare(b.capability) ||
        a.symbol.localeCompare(b.symbol)
    );
    expect(first).toEqual(sorted);
  });
});

describe('U03 pure IR engine carries import-based capability evidence', () => {
  const contract = loadContract({
    include: ['cases'],
    layers: [{ name: 'DomainModel', patterns: ['cases/**'] }],
    rules: [],
  });

  function irFor(caseIds: string[]) {
    const files = caseIds.map((id) => {
      const c = cases.find((entry) => entry.id === id)!;
      return { path: c.file, content: fs.readFileSync(path.join(CORPUS, c.file), 'utf8') };
    });
    return analyzeProject({ contract, files }).ir;
  }

  it('reports import-based positives with import evidence and stable hashes', () => {
    const ir = irFor(['persistence-prisma', 'persistence-pg', 'network-client-import', 'filesystem-node-fs']);
    const byCapability = new Map<string, number>();
    for (const use of ir.capabilityUses) {
      byCapability.set(use.capability, (byCapability.get(use.capability) ?? 0) + 1);
      expect(use.evidence.kind).toBe('import');
      expect(use.evidence.excerpt.length).toBeGreaterThan(0);
    }
    expect(byCapability.get('persistence')).toBe(2);
    expect(byCapability.get('network')).toBe(1);
    expect(byCapability.get('filesystem')).toBe(1);
    // Determinism: same input → identical serialized IR.
    const again = irFor(['persistence-prisma', 'persistence-pg', 'network-client-import', 'filesystem-node-fs']);
    expect(JSON.stringify(again.capabilityUses)).toBe(JSON.stringify(ir.capabilityUses));
  });

  it('never reports type-only imports or similar-name non-drivers', () => {
    const ir = irFor([
      'persistence-type-only',
      'network-type-only-import',
      'filesystem-type-only',
      'persistence-similar-name',
      'network-similar-name',
      'filesystem-similar-name',
    ]);
    expect(ir.capabilityUses).toEqual([]);
  });

  it('ambient globals are the symbol-aware collector’s job, not the pure engine’s', () => {
    const ir = irFor(['clock-now', 'network-fetch-global']);
    // Pure engine stays compiler-free (C02): no ambient claims without symbols.
    expect(ir.capabilityUses).toEqual([]);
  });

  function irForContent(content: string) {
    return analyzeProject({ contract, files: [{ path: 'cases/inline.ts', content }] }).ir;
  }

  it('erases export-type re-exports and honors tricky import-type syntaxes (/review F1)', () => {
    // Runtime-erased forms must produce no capability evidence in the pure engine.
    expect(irForContent("export type { Pool } from 'pg';\n").capabilityUses).toEqual([]);
    expect(irForContent("export type * from 'pg';\n").capabilityUses).toEqual([]);
    expect(irForContent("import type Foo from 'pg';\nexport const x = 1;\n").capabilityUses).toEqual([]);
    expect(
      irForContent("import type ProcessType = require('node:process');\n").capabilityUses
    ).toEqual([]);
    // Value forms keep counting: default binding literally named `type`, and
    // identifiers merely starting with 'type'.
    expect(irForContent("import type from 'pg';\n").capabilityUses).toHaveLength(1);
    expect(irForContent("import typeFoo from 'pg';\n").capabilityUses).toHaveLength(1);
    expect(irForContent("export { Pool } from 'pg';\n").capabilityUses).toHaveLength(1);
    // Documented envelope: braced named-binding lists stay value imports here.
    expect(irForContent("import { type Pool } from 'pg';\n").capabilityUses).toHaveLength(1);
    // A value import-equals is one dependency, never a duplicate nested require.
    expect(irForContent("import process = require('node:process');\n").capabilityUses).toHaveLength(1);
  });

  it('classifies bare and node:-prefixed core network modules consistently (/review F2)', () => {
    for (const spec of ['net', 'node:net', 'tls', 'dns', 'http2', 'dgram']) {
      expect(capabilityForModuleSpecifier(spec), spec).toBe('network');
    }
  });

  it('classifies the process/child_process module duals (/review I1, documented limit)', () => {
    expect(capabilityForModuleSpecifier('node:process')).toBe('process');
    expect(capabilityForModuleSpecifier('process')).toBe('process');
    expect(capabilityForModuleSpecifier('child_process')).toBe('process');
    // node:crypto is deliberately absent: hashing dominates, randomness FPs.
    expect(capabilityForModuleSpecifier('node:crypto')).toBeNull();
  });

  it('matches only the exact forbidden-global process module duals (Y08)', () => {
    expect(forbiddenGlobalForModuleSpecifier('node:process', ['process'])).toBe('process');
    expect(forbiddenGlobalForModuleSpecifier('process', ['process'])).toBe('process');
    expect(forbiddenGlobalForModuleSpecifier('node:process/subpath', ['process'])).toBeNull();
    expect(forbiddenGlobalForModuleSpecifier('child_process', ['process'])).toBeNull();
    expect(forbiddenGlobalForModuleSpecifier('node:child_process', ['process'])).toBeNull();
    expect(forbiddenGlobalForModuleSpecifier('node:process', ['fetch'])).toBeNull();
  });

  it('records narrow process-dual atoms without overstating a full process wall (Y08)', () => {
    const forbidden = loweredLayerCoverage({ forbiddenGlobals: ['process'] }).atoms;
    expect(forbidden).toEqual(
      expect.arrayContaining(['import-exact:process', 'import-exact:node:process'])
    );
    expect(forbidden).not.toContain('import:process');

    const wall = loweredLayerCoverage({ capabilities: { deny: ['process'] } }).atoms;
    expect(wall).toEqual(
      expect.arrayContaining([
        'import:process',
        'import-exact:process',
        'import-exact:node:process',
      ])
    );
  });
});
