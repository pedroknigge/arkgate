/**
 * Q03 — optional golden pattern artifact for new-code guidance.
 *
 * Honesty: absent is OK; present is advisory only; never clears design-weak.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GOLDEN_PATTERN_REL,
  loadGoldenPattern,
  formatGoldenPatternNote,
  summarizeGoldenPattern,
  attachGoldenToPlacement,
} from '../../../bin/lib/golden-pattern.mjs';
import { composePrepareWrite } from '../../../bin/lib/prepare-write.mjs';
import { collectGovernedFiles } from '../../../bin/lib/scan-files.mjs';
import { runDoctor } from '../../../bin/lib/doctor-plan.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = path.join(REPO, 'tests/fixtures/design-weak-enforce');

describe('loadGoldenPattern (Q03)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-golden-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('absent file → present:false, ok:true (not an error)', () => {
    const r = loadGoldenPattern(tmp);
    expect(r.ok).toBe(true);
    expect(r.present).toBe(false);
    expect(r.path).toBe(GOLDEN_PATTERN_REL);
    expect(r.golden).toBeUndefined();
    expect(formatGoldenPatternNote(r)).toBeNull();
    expect(summarizeGoldenPattern(r)).toEqual({
      present: false,
      path: GOLDEN_PATTERN_REL,
    });
  });

  it('valid artifact → present with name, norm, optional homes', () => {
    fs.mkdirSync(path.join(tmp, '.ark'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, '.ark', 'golden-pattern.json'),
      JSON.stringify({
        schemaVersion: '1',
        name: 'vertical-slice features',
        norm: 'New features live under src/features/<slice>/; shared only in src/shared/.',
        newCodeHome: 'src/features/',
        examplePath: 'src/features/billing/createInvoice.ts',
      }),
      'utf8'
    );
    const r = loadGoldenPattern(tmp);
    expect(r.ok).toBe(true);
    expect(r.present).toBe(true);
    expect(r.golden?.name).toBe('vertical-slice features');
    expect(r.golden?.norm).toMatch(/src\/features/);
    expect(r.golden?.newCodeHome).toBe('src/features/');
    expect(r.golden?.examplePath).toBe('src/features/billing/createInvoice.ts');

    const note = formatGoldenPatternNote(r);
    expect(note).toMatch(/Golden pattern \(advisory for NEW code only\)/);
    expect(note).toMatch(/Does not clear design-weak/);
    expect(note).toMatch(/src\/features\//);

    const sum = summarizeGoldenPattern(r);
    expect(sum.present).toBe(true);
    expect(sum.advisoryOnly).toBe(true);
    expect(sum.doesNotClearDesignWeak).toBe(true);
    expect(sum.name).toBe('vertical-slice features');
  });

  it('malformed JSON → invalid, not present (fail-closed guidance)', () => {
    fs.mkdirSync(path.join(tmp, '.ark'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.ark', 'golden-pattern.json'), '{ not json', 'utf8');
    const r = loadGoldenPattern(tmp);
    expect(r.ok).toBe(false);
    expect(r.present).toBe(false);
    expect(r.invalid).toBe(true);
    expect(r.error).toBe('invalid-json');
    expect(formatGoldenPatternNote(r)).toBeNull();
    const sum = summarizeGoldenPattern(r);
    expect(sum.present).toBe(false);
    expect(sum.invalid).toBe(true);
  });

  it('missing name or norm → invalid', () => {
    fs.mkdirSync(path.join(tmp, '.ark'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, '.ark', 'golden-pattern.json'),
      JSON.stringify({ name: 'only-name' }),
      'utf8'
    );
    const r = loadGoldenPattern(tmp);
    expect(r.ok).toBe(false);
    expect(r.present).toBe(false);
    expect(r.invalid).toBe(true);
    expect(r.error).toBe('missing-name-or-norm');
  });
});

describe('attachGoldenToPlacement + composePrepareWrite', () => {
  it('attaches goldenPattern summary and note without dropping placement fields', () => {
    const golden = {
      ok: true as const,
      present: true as const,
      path: GOLDEN_PATTERN_REL,
      golden: {
        schemaVersion: '1',
        name: 'hex ports',
        norm: 'Adapters under src/adapters; domain pure under src/domain.',
        newCodeHome: 'src/domain/',
      },
    };
    const placement = attachGoldenToPlacement(
      {
        filePath: 'src/domain/order.ts',
        layer: 'DomainModel',
        governed: true,
        mayImport: [],
        mustNotImport: ['PersistenceAdapters'],
        forbiddenGlobals: ['fetch'],
        note: 'mayImport = layers with no explicit deny.',
      },
      golden
    );
    expect(placement.filePath).toBe('src/domain/order.ts');
    expect(placement.goldenPattern.present).toBe(true);
    expect(placement.goldenPattern.name).toBe('hex ports');
    expect(placement.note).toMatch(/mayImport = layers/);
    expect(placement.note).toMatch(/Golden pattern \(advisory/);
    expect(placement.goldenPattern.doesNotClearDesignWeak).toBe(true);

    const out = composePrepareWrite({
      source: 'export type OrderId = string;\n',
      placement,
      root: '/tmp',
      ts: {},
      validate: () => ({ valid: true, violations: [] }),
    });
    expect(out.ok).toBe(true);
    expect(out.valid).toBe(true);
    expect(out.goldenPattern?.present).toBe(true);
    expect(out.goldenPattern?.name).toBe('hex ports');
    expect(out.placementNote).toMatch(/Golden pattern/);
  });

  it('error placements are not decorated', () => {
    const placement = attachGoldenToPlacement(
      { error: 'Needs filePath' },
      {
        ok: true,
        present: true,
        path: GOLDEN_PATTERN_REL,
        golden: { name: 'x', norm: 'y' },
      }
    );
    expect(placement.error).toBe('Needs filePath');
    expect(placement.goldenPattern).toBeUndefined();
  });

  it('absent golden still attaches present:false summary on success placement', () => {
    const placement = attachGoldenToPlacement(
      { filePath: 'src/a.ts', layer: 'DomainModel', governed: true },
      { ok: true, present: false, path: GOLDEN_PATTERN_REL }
    );
    expect(placement.goldenPattern).toEqual({
      present: false,
      path: GOLDEN_PATTERN_REL,
    });
    expect(placement.note).toBeUndefined();
  });
});

describe('doctor surfaces goldenPattern without clearing design-weak (Q03 honesty)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-golden-doc-'));
    // Copy design-weak fixture so smells stay design-weak with golden present.
    fs.cpSync(FIXTURE, tmp, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('absent golden → present:false; design-weak still true', () => {
    const config = JSON.parse(fs.readFileSync(path.join(tmp, 'ark.config.json'), 'utf8'));
    const files = collectGovernedFiles(tmp, config);
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => {
      logs.push(a.map(String).join(' '));
    };
    try {
      runDoctor(tmp, config, files, config.rules, [], true, {});
    } finally {
      console.log = orig;
    }
    const payload = JSON.parse(logs.join('\n'));
    expect(payload.doctor.designFitness.designWeak).toBe(true);
    expect(payload.doctor.postGreenPath?.id).toBe('clarify-for-ai');
    expect(payload.doctor.goldenPattern.present).toBe(false);
    // Golden absence must not invent ENFORCE-clean design.
    expect(payload.doctor.designFitness.designWeak).toBe(true);
  });

  it('present golden → advisory fields; still design-weak; never ENFORCE claim', () => {
    fs.mkdirSync(path.join(tmp, '.ark'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, '.ark', 'golden-pattern.json'),
      JSON.stringify({
        name: 'pilot-hex',
        norm: 'New handlers go through application services, not routes→ORM.',
        newCodeHome: 'src/application/',
      }),
      'utf8'
    );
    const config = JSON.parse(fs.readFileSync(path.join(tmp, 'ark.config.json'), 'utf8'));
    const files = collectGovernedFiles(tmp, config);
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => {
      logs.push(a.map(String).join(' '));
    };
    try {
      runDoctor(tmp, config, files, config.rules, [], true, {});
    } finally {
      console.log = orig;
    }
    const payload = JSON.parse(logs.join('\n'));
    expect(payload.doctor.designFitness.designWeak).toBe(true);
    expect(payload.doctor.postGreenPath?.id).toBe('clarify-for-ai');
    expect(payload.doctor.goldenPattern.present).toBe(true);
    expect(payload.doctor.goldenPattern.name).toBe('pilot-hex');
    expect(payload.doctor.goldenPattern.advisoryOnly).toBe(true);
    expect(payload.doctor.goldenPattern.doesNotClearDesignWeak).toBe(true);
    // Honest: golden text does not flip designWeak or remove smells.
    expect(payload.doctor.designSmells.length).toBeGreaterThan(0);
  });

  it('human doctor prints golden section when present', () => {
    fs.mkdirSync(path.join(tmp, '.ark'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, '.ark', 'golden-pattern.json'),
      JSON.stringify({
        name: 'pilot-hex',
        norm: 'New code uses ports; migrate legacy on touch.',
      }),
      'utf8'
    );
    const config = JSON.parse(fs.readFileSync(path.join(tmp, 'ark.config.json'), 'utf8'));
    const files = collectGovernedFiles(tmp, config);
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => {
      logs.push(a.map(String).join(' '));
    };
    try {
      runDoctor(tmp, config, files, config.rules, [], false, {});
    } finally {
      console.log = orig;
    }
    const text = logs.join('\n');
    expect(text).toMatch(/Golden pattern \(new code\)/i);
    expect(text).toMatch(/pilot-hex/);
    expect(text).toMatch(/does not clear design-weak/i);
  });
});
