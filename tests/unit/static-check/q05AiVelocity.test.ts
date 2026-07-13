/**
 * Q05 — AI-velocity evidence: same feature scenario on design-weak vs golden-path.
 * Drives real eval/ai-velocity-run.mjs + bin/lib/ai-velocity.mjs (no re-implementation).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FEATURE_SCENARIO,
  DESIGN_WEAK_PLACEMENT_CANDIDATES,
  placementAttemptsForArm,
  measureArmVelocity,
  compareVelocityArms,
  materializeGoldenPathArm,
  runAiVelocityComparison,
  isCorrectLanding,
} from '../../../bin/lib/ai-velocity.mjs';
import { loadGoldenPattern } from '../../../bin/lib/golden-pattern.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HARNESS = path.join(REPO, 'eval/ai-velocity-run.mjs');
const REPORT = path.join(REPO, 'eval/ai-velocity-report.json');
const BASELINE = path.join(REPO, 'eval/ai-velocity-baseline.json');
const FIXTURE = path.join(REPO, 'tests/fixtures/design-weak-enforce');

function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE, 'ark.config.json'), 'utf8'));
}

describe('Q05 FEATURE_SCENARIO + placement ladder', () => {
  it('defines a fixed pure-domain feature prompt and confused candidates', () => {
    expect(FEATURE_SCENARIO.id).toBeTruthy();
    expect(FEATURE_SCENARIO.prompt.length).toBeGreaterThan(40);
    expect(FEATURE_SCENARIO.source).toMatch(/canRefund/);
    expect(FEATURE_SCENARIO.correctLayer).toBe('DomainModel');
    expect(DESIGN_WEAK_PLACEMENT_CANDIDATES.length).toBeGreaterThanOrEqual(3);
    expect(DESIGN_WEAK_PLACEMENT_CANDIDATES.at(-1)).toBe(FEATURE_SCENARIO.correctPath);
  });

  it('placementAttemptsForArm: absent golden → full ladder; present → newCodeHome first', () => {
    const noG = placementAttemptsForArm({ present: false, path: '.ark/golden-pattern.json' });
    expect(noG.guidedByGolden).toBe(false);
    expect(noG.attempts).toEqual(DESIGN_WEAK_PLACEMENT_CANDIDATES);

    const withG = placementAttemptsForArm({
      present: true,
      newCodeHome: 'src/domain/',
      name: 'x',
      norm: 'y',
    });
    expect(withG.guidedByGolden).toBe(true);
    expect(withG.attempts).toEqual(['src/domain/canRefund.ts']);

    // Nested loadGoldenPattern shape
    const nested = placementAttemptsForArm({
      present: true,
      golden: { name: 'n', norm: 'm', newCodeHome: 'src/domain' },
    });
    expect(nested.guidedByGolden).toBe(true);
    expect(nested.attempts[0]).toMatch(/src\/domain\/canRefund\.ts/);

    // Present without newCodeHome → full ladder
    const noHome = placementAttemptsForArm({ present: true, name: 'n', norm: 'm' });
    expect(noHome.guidedByGolden).toBe(false);
    expect(placementAttemptsForArm(null).guidedByGolden).toBe(false);
  });
});

describe('Q05 measureArmVelocity on real fixture', () => {
  it('design-weak arm needs more turns than golden-path arm', () => {
    const config = loadConfig();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-q05-'));
    try {
      const dw = path.join(tmp, 'dw');
      const gp = path.join(tmp, 'gp');
      fs.cpSync(FIXTURE, dw, { recursive: true });
      materializeGoldenPathArm(FIXTURE, gp);

      expect(loadGoldenPattern(dw).present).toBe(false);
      expect(loadGoldenPattern(gp).present).toBe(true);

      const armDw = measureArmVelocity({ root: dw, config, armId: 'design-weak' });
      const armGp = measureArmVelocity({ root: gp, config, armId: 'golden-path' });

      expect(armDw.landed).toBe(true);
      expect(armGp.landed).toBe(true);
      expect(armDw.placementTurns).toBeGreaterThan(armGp.placementTurns);
      expect(armGp.placementTurns).toBe(1);
      expect(armGp.guidedByGolden).toBe(true);
      expect(armDw.guidedByGolden).toBe(false);

      // Honesty: residual remains on design-weak tree (golden does not clear it)
      expect(armDw.designFitness.designWeak).toBe(true);
      expect(armDw.patternBetsNeverMechanicalSafe).toBe(true);
      expect(armGp.patternBetsNeverMechanicalSafe).toBe(true);

      const cmp = compareVelocityArms(armDw, armGp);
      expect(cmp.goldenStrictlyBetter).toBe(true);
      expect(cmp.deltaTurns).toBeGreaterThan(0);
      expect(cmp.method).toMatch(/No live LLM/i);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('correct landing is DomainModel only', () => {
    const config = loadConfig();
    expect(isCorrectLanding(FIXTURE, config, 'src/domain/canRefund.ts')).toBe(true);
    expect(isCorrectLanding(FIXTURE, config, 'src/routes/canRefund.ts')).toBe(false);
    expect(isCorrectLanding(FIXTURE, config, 'src/features/orders/ui/canRefund.ts')).toBe(false);
  });
});

describe('Q05 runAiVelocityComparison + shipped harness', () => {
  it('runAiVelocityComparison produces ok report with method next to metric', () => {
    const config = loadConfig();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-q05-cmp-'));
    try {
      const dw = path.join(tmp, 'dw');
      const gp = path.join(tmp, 'gp');
      fs.cpSync(FIXTURE, dw, { recursive: true });
      materializeGoldenPathArm(FIXTURE, gp);
      const report = runAiVelocityComparison({
        designWeakRoot: dw,
        goldenPathRoot: gp,
        config,
      });
      expect(report.ok).toBe(true);
      expect(report.mode).toBe('fixture-measured');
      expect(report.comparison.goldenStrictlyBetter).toBe(true);
      expect(report.comparison.goldenPathTurns).toBeLessThan(report.comparison.designWeakTurns);
      expect(report.honesty.designWeakArmStillDesignWeak).toBe(true);
      expect(report.honesty.liveLlmRequired).toBe(false);
      expect(report.honesty.gateNotWeakened).toBe(true);
      expect(report.scenario.prompt).toBe(FEATURE_SCENARIO.prompt);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('eval/ai-velocity-run.mjs exits 0 and writes report with golden better', () => {
    expect(fs.existsSync(HARNESS)).toBe(true);
    const res = spawnSync(process.execPath, [HARNESS], {
      cwd: REPO,
      encoding: 'utf8',
    });
    expect(res.status, res.stderr || res.stdout).toBe(0);
    expect(res.stdout).toMatch(/PASS/);
    expect(res.stdout).toMatch(/placementTurns/);
    expect(fs.existsSync(REPORT)).toBe(true);
    expect(fs.existsSync(BASELINE)).toBe(true);

    const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
    expect(report.id).toBe('q05-ai-velocity');
    expect(report.ok).toBe(true);
    expect(report.comparison.goldenStrictlyBetter).toBe(true);
    expect(report.comparison.goldenPathTurns).toBeLessThan(report.comparison.designWeakTurns);
    expect(report.honesty.designWeakArmStillDesignWeak).toBe(true);
    expect(report.honesty.patternBetsNeverMechanicalSafe).toBe(true);
    expect(report.comparison.method).toMatch(/golden-pattern\.json/);

    const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    expect(baseline.summary.goldenStrictlyBetter).toBe(true);
    expect(baseline.method).toBeTruthy();
  });
});
