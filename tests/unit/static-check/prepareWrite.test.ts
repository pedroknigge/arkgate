/**
 * W2 — ark_prepare_write composition (place + validate + autoPatch + judgment + hash).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import {
  buildJudgmentBrief,
  composePrepareWrite,
  contentIdentity,
} from '../../../bin/lib/prepare-write.mjs';

const require = createRequire(import.meta.url);

describe('prepare-write (W2)', () => {
  let ts: typeof import('typescript');
  let root: string;

  beforeAll(() => {
    ts = require('typescript');
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-prepare-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src/infra/types-only.ts'),
      'export type Row = { id: string };\n'
    );
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('contentIdentity is stable sha256', () => {
    const a = contentIdentity('export const x = 1;\n');
    const b = contentIdentity('export const x = 1;\n');
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.contentHash.startsWith('sha256:')).toBe(true);
    expect(a.byteLength).toBe(Buffer.byteLength('export const x = 1;\n', 'utf8'));
  });

  it('buildJudgmentBrief surfaces fixClass + one decision for value imports', () => {
    const brief = buildJudgmentBrief([
      {
        ruleId: 'LAYER_IMPORT_VIOLATION',
        fromLayer: 'DomainModel',
        toLayer: 'PersistenceAdapters',
        target: '../infra/db',
      },
    ]);
    expect(brief).not.toBeNull();
    expect(brief!.fixClass).toBe('port-inversion');
    expect(brief!.decision.length).toBeGreaterThan(20);
    expect(brief!.remediationClass).toBe('judgment');
  });

  it('composePrepareWrite returns placement + valid for clean source', () => {
    const out = composePrepareWrite({
      source: 'export type Id = string;\n',
      placement: {
        filePath: 'src/domain/id.ts',
        layer: 'DomainModel',
        governed: true,
        mayImport: [],
        mustNotImport: ['PersistenceAdapters'],
        forbiddenGlobals: ['fetch'],
      },
      root,
      ts,
      validate: () => ({ valid: true, violations: [] }),
    });
    expect(out.ok).toBe(true);
    expect(out.valid).toBe(true);
    expect(out.layer).toBe('DomainModel');
    expect(out.mustNotImport).toContain('PersistenceAdapters');
    expect(out.contentHash).toMatch(/^sha256:/);
    expect(out.autoPatch).toBeUndefined();
    expect(out.judgmentBrief).toBeUndefined();
  });

  it('composePrepareWrite attaches autoPatch when import-type rewrite revalidates', () => {
    const source = `import { Row } from '../infra/types-only';\nexport function id(r: Row): string { return r.id; }\n`;
    const filePath = path.join(root, 'src/domain/use.ts');
    const out = composePrepareWrite({
      source,
      placement: {
        filePath,
        layer: 'DomainModel',
        governed: true,
        mayImport: [],
        mustNotImport: ['PersistenceAdapters'],
        forbiddenGlobals: [],
      },
      root,
      ts,
      validate: (src: string) => {
        const ok = /import\s+type\b/.test(src);
        return {
          valid: ok,
          violations: ok
            ? []
            : [{ ruleId: 'LAYER_IMPORT_VIOLATION', message: 'deny', fromLayer: 'DomainModel', toLayer: 'PersistenceAdapters' }],
        };
      },
    });
    expect(out.ok).toBe(true);
    expect(out.valid).toBe(false);
    expect(out.autoPatch).toBeTruthy();
    expect(out.autoPatch!.source).toMatch(/import\s+type/);
    expect(out.autoPatchContentHash).toMatch(/^sha256:/);
    expect(out.judgmentBrief).toBeUndefined();
  });

  it('composePrepareWrite attaches judgmentBrief when invalid without autoPatch', () => {
    const out = composePrepareWrite({
      source: `import { db } from '../infra/db';\nexport const x = db;\n`,
      placement: {
        filePath: 'src/domain/x.ts',
        layer: 'DomainModel',
        governed: true,
        mayImport: [],
        mustNotImport: ['PersistenceAdapters'],
        forbiddenGlobals: [],
      },
      root,
      ts,
      validate: () => ({
        valid: false,
        violations: [
          {
            ruleId: 'LAYER_IMPORT_VIOLATION',
            fromLayer: 'DomainModel',
            toLayer: 'PersistenceAdapters',
            target: '../infra/db',
          },
        ],
      }),
    });
    expect(out.valid).toBe(false);
    expect(out.autoPatch).toBeUndefined();
    expect(out.judgmentBrief?.fixClass).toBe('port-inversion');
  });

  it('composePrepareWrite rejects non-string source and handles valid empty gate', () => {
    expect(composePrepareWrite({ source: null as unknown as string, placement: {}, root, ts, validate: () => ({ valid: true }) }).ok).toBe(
      false
    );
    const ok = composePrepareWrite({
      source: 'export const x = 1;\n',
      placement: {
        filePath: 'src/domain/x.ts',
        layer: 'DomainModel',
        governed: true,
        mayImport: ['DomainModel'],
        mustNotImport: [],
        forbiddenGlobals: ['fetch'],
        mayImportInfrastructure: true,
        suggestedLayers: ['DomainModel'],
        message: 'placed',
        note: 'note',
        description: 'desc',
      },
      root,
      ts,
      validate: () => ({ valid: true, violations: [] }),
    });
    expect(ok.valid).toBe(true);
    expect(ok.mayImportInfrastructure).toBe(true);
    expect(ok.placementMessage).toBe('placed');
    expect(buildJudgmentBrief([])).toBeNull();
    expect(
      buildJudgmentBrief([
        {
          ruleId: 'LAYER_IMPORT_VIOLATION',
          typeOnly: true,
          sourcePureTypeModule: true,
          fromLayer: 'DomainModel',
          toLayer: 'PersistenceAdapters',
        },
      ])?.remediationClass
    ).toMatch(/mechanical-safe|judgment|deferred/);
  });
});
