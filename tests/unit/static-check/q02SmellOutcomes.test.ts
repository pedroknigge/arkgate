/**
 * Q02 — outcome-oriented human language for each design smell id.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DESIGN_SMELL_IDS,
  DESIGN_SMELL_OUTCOMES,
  outcomeForSmellId,
  makeDesignSmell,
  detectDesignSmells,
} from '../../../bin/lib/design-smells.mjs';
import { collectGovernedFiles } from '../../../bin/lib/scan-files.mjs';
import { runDoctor } from '../../../bin/lib/doctor-plan.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = path.join(REPO, 'tests/fixtures/design-weak-enforce');

describe('DESIGN_SMELL_OUTCOMES (Q02)', () => {
  it('defines a non-empty outcome for every stable smell id', () => {
    for (const id of DESIGN_SMELL_IDS) {
      expect(DESIGN_SMELL_OUTCOMES[id], id).toBeTruthy();
      expect(String(DESIGN_SMELL_OUTCOMES[id]).length).toBeGreaterThan(40);
      // Outcome should sound actionable / AI-oriented, not only an id echo
      expect(outcomeForSmellId(id)).toBe(DESIGN_SMELL_OUTCOMES[id]);
      expect(outcomeForSmellId(id).toLowerCase()).not.toBe(id);
    }
  });

  it('makeDesignSmell attaches outcome while preserving id and message', () => {
    const s = makeDesignSmell({
      id: 'facade-sql-in-routes',
      message: 'technical: ORM in routes',
      evidence: ['src/routes/x.ts'],
      fix: 'move query',
    });
    expect(s.id).toBe('facade-sql-in-routes');
    expect(s.message).toBe('technical: ORM in routes');
    expect(s.outcome).toMatch(/Routes\/controllers import the ORM|repository\/adapter/i);
    expect(s.evidence).toEqual(['src/routes/x.ts']);
  });
});

describe('detectDesignSmells attaches outcome on fixture', () => {
  it('fixture smells include outcome matching the id map', () => {
    const config = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'ark.config.json'), 'utf8'));
    const files = collectGovernedFiles(FIXTURE, config);
    const smells = detectDesignSmells(FIXTURE, config, files, {
      layersWithoutRules: [],
      emptyLayers: [],
      layers: [],
    });
    expect(smells.length).toBeGreaterThan(0);
    for (const smell of smells) {
      expect(smell.outcome, smell.id).toBeTruthy();
      expect(smell.outcome).toBe(outcomeForSmellId(smell.id));
      expect(smell.id).toBeTruthy();
      expect(smell.message).toBeTruthy();
    }
    const facade = smells.find((s) => s.id === 'facade-sql-in-routes');
    expect(facade?.outcome).toMatch(/Routes\/controllers|ORM|repository/i);
  });
});

describe('doctor surfaces outcome (Q02) and keeps Q01 door', () => {
  it('JSON smells have outcome; primaryNextAction still clarify-for-ai when design-weak', () => {
    const config = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'ark.config.json'), 'utf8'));
    const files = collectGovernedFiles(FIXTURE, config);
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => {
      logs.push(a.map(String).join(' '));
    };
    try {
      runDoctor(FIXTURE, config, files, config.rules, [], true, { completeness: 'complete' });
    } finally {
      console.log = orig;
    }
    const payload = JSON.parse(logs.join('\n'));
    expect(payload.doctor.designFitness.designWeak).toBe(true);
    expect(payload.doctor.postGreenPath?.id).toBe('clarify-for-ai');
    expect(payload.doctor.designSmells.length).toBeGreaterThan(0);
    for (const smell of payload.doctor.designSmells) {
      expect(smell.outcome, smell.id).toBeTruthy();
      expect(smell.outcome).toBe(outcomeForSmellId(smell.id));
    }
  });

  it('human doctor prints outcome wording for detected smells', () => {
    const config = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'ark.config.json'), 'utf8'));
    const files = collectGovernedFiles(FIXTURE, config);
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => {
      logs.push(a.map(String).join(' '));
    };
    try {
      runDoctor(FIXTURE, config, files, config.rules, [], false, { completeness: 'complete' });
    } finally {
      console.log = orig;
    }
    const text = logs.join('\n');
    // Outcome phrasing (not only technical "import ORM" count line as the only line)
    expect(text).toMatch(/facade-sql-in-routes/);
    expect(text).toMatch(/Routes\/controllers import the ORM|repository\/adapter/i);
    expect(text).toMatch(/Clarify for AI \(Shape\): \/ark-explore shape-focus/);
    expect(text).not.toMatch(/✔ Healthy — nothing to do/);
  });
});

describe('docs parity (Q02)', () => {
  it('agent-guide lists outcomes for fixture-relevant smell ids', () => {
    const guide = fs.readFileSync(path.join(REPO, 'docs/agent-guide.md'), 'utf8');
    expect(guide).toMatch(/outcome/i);
    expect(guide).toMatch(/facade-sql-in-routes/);
    expect(guide).toMatch(/repository\/adapter|ORM/);
    expect(guide).toMatch(/domain-logic-in-ui/);
    expect(guide).toMatch(/god-module|soft-contract/);
  });

  it('package-surface documents the outcome field', () => {
    const surf = fs.readFileSync(path.join(REPO, 'docs/package-surface.md'), 'utf8');
    expect(surf).toMatch(/outcome/);
    expect(surf).toMatch(/designSmells/);
  });
});
