/**
 * P04 — permanent ENFORCE + design-weak fixture and honesty guard.
 * Drives real collectGovernedFiles + buildRemediationPlan + doctor sensors.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectGovernedFiles } from '../../../bin/lib/scan-files.mjs';
import {
  buildRemediationPlan,
  computeCoverage,
  runDoctor,
} from '../../../bin/lib/doctor-plan.mjs';
import {
  assertNotHealthyFinishedIgnoringDesign,
  detectDesignSmells,
} from '../../../bin/lib/design-smells.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = path.join(REPO, 'tests/fixtures/design-weak-enforce');

function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE, 'ark.config.json'), 'utf8'));
}

describe('P04 design-weak-enforce fixture', () => {
  it('is present on disk with ark.config + smelly sources', () => {
    expect(fs.existsSync(path.join(FIXTURE, 'ark.config.json'))).toBe(true);
    expect(fs.existsSync(path.join(FIXTURE, 'src/routes/orders.ts'))).toBe(true);
    expect(fs.existsSync(path.join(FIXTURE, 'src/features/orders/ui/canBuy.ts'))).toBe(true);
    expect(fs.existsSync(path.join(FIXTURE, 'src/services/billing.ts'))).toBe(true);
  });

  it('plan A empty (goal.met) while designSmells and patternBets are non-empty', () => {
    const config = loadConfig();
    const files = collectGovernedFiles(FIXTURE, config);
    expect(files.length).toBeGreaterThanOrEqual(4);

    const cov = computeCoverage(FIXTURE, config, files, config.rules);
    expect(cov.governed.percent).toBe(100);

    // No cross-layer import violations in this isolated fixture (each file is self-contained).
    const activeViolations: unknown[] = [];
    const plan = buildRemediationPlan(FIXTURE, activeViolations, cov.governed.percent, files.length, {
      completeness: 'complete',
      config,
      files,
      coverage: cov,
    });

    expect(plan.goal.met).toBe(true);
    expect(plan.steps).toEqual([]);
    expect(plan.goal.designWeak).toBe(true);
    expect(plan.designSmells.length).toBeGreaterThan(0);
    expect(plan.patternBets.length).toBeGreaterThan(0);
    expect(plan.patternBets.every((b: { neverMechanicalSafe: boolean }) => b.neverMechanicalSafe)).toBe(
      true
    );

    const ids = new Set(plan.designSmells.map((s: { id: string }) => s.id));
    expect(ids.has('facade-sql-in-routes') || ids.has('domain-logic-in-ui')).toBe(true);
  });

  it('honesty guard refuses healthy-finished when residual is ignored', () => {
    const config = loadConfig();
    const files = collectGovernedFiles(FIXTURE, config);
    const cov = computeCoverage(FIXTURE, config, files, config.rules);
    const plan = buildRemediationPlan(FIXTURE, [], cov.governed.percent, files.length, {
      completeness: 'complete',
      config,
      files,
      coverage: cov,
    });

    // Naive agent claim: edges green ⇒ architecture healthy
    const naiveClaim = assertNotHealthyFinishedIgnoringDesign({
      goal: { met: true, designWeak: false },
      patternBets: [],
      designSmells: [],
    });
    // That claim shape is "ok" only if residual truly empty — here we simulate the *wrong* claim
    // by stripping residual while real plan has residual:
    expect(plan.goal.designWeak).toBe(true);
    const againstRealPlan = assertNotHealthyFinishedIgnoringDesign(plan);
    expect(againstRealPlan.ok).toBe(false);
    expect(againstRealPlan.error).toMatch(/design-weak|patternBets|healthy finished/i);

    // Correct path: acknowledge residual
    expect(naiveClaim.ok).toBe(true); // empty residual claim is internally consistent
    expect(plan.goal.designWeakLabel || plan.goal.statement).toMatch(/design-weak|Shape residual/i);
  });

  it('detectDesignSmells on fixture returns evidence under src/', () => {
    const config = loadConfig();
    const files = collectGovernedFiles(FIXTURE, config);
    const cov = computeCoverage(FIXTURE, config, files, config.rules);
    const smells = detectDesignSmells(FIXTURE, config, files, cov);
    expect(smells.length).toBeGreaterThan(0);
    const withPath = smells.some((s) =>
      (s.evidence || []).some((e) => typeof e === 'string' && e.startsWith('src/'))
    );
    expect(withPath).toBe(true);
  });

  it('runDoctor JSON marks designFitness.designWeak on the fixture', () => {
    const config = loadConfig();
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
    expect(payload.doctor.designSmells.length).toBeGreaterThan(0);
    expect(payload.doctor.operatingMode).toBe('enforce');
  });
});
