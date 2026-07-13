/**
 * Q04 — productized pilot loop: extraction card → one pilot → re-doctor.
 * Drives real detectDesignSmells / buildRemediationPlan / runDoctor / pilot-loop helpers.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectGovernedFiles } from '../../../bin/lib/scan-files.mjs';
import {
  detectDesignSmells,
  buildPatternBetsFromSmells,
  assertPatternBetsNeverMechanicalSafe,
  assertNotHealthyFinishedIgnoringDesign,
} from '../../../bin/lib/design-smells.mjs';
import {
  selectNextPilot,
  summarizePilotLoop,
  formatExtractionCard,
  comparePilotResidual,
  extractionCardFromBet,
  PILOT_LOOP_ID,
} from '../../../bin/lib/pilot-loop.mjs';
import {
  buildRemediationPlan,
  computeCoverage,
  runDoctor,
  runPlan,
} from '../../../bin/lib/doctor-plan.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = path.join(REPO, 'tests/fixtures/design-weak-enforce');

function loadConfig(root = FIXTURE) {
  return JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
}

function doctorJson(root: string, config: object, files: string[]) {
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  };
  try {
    runDoctor(root, config, files, (config as { rules: unknown[] }).rules, [], true, {});
  } finally {
    console.log = orig;
  }
  return JSON.parse(logs.join('\n'));
}

describe('selectNextPilot / extraction card (Q04)', () => {
  it('selects one pilot from real design-weak fixture patternBets', () => {
    const config = loadConfig();
    const files = collectGovernedFiles(FIXTURE, config);
    const cov = computeCoverage(FIXTURE, config, files, config.rules);
    const smells = detectDesignSmells(FIXTURE, config, files, cov);
    const bets = buildPatternBetsFromSmells(smells);
    expect(bets.length).toBeGreaterThan(0);

    const next = selectNextPilot(bets);
    expect(next).not.toBeNull();
    expect(next!.id).toBe(PILOT_LOOP_ID);
    expect(next!.smellId).toBeTruthy();
    expect(next!.pilot || next!.pilotTarget).toBeTruthy();
    expect(next!.successSignal.length).toBeGreaterThan(10);
    expect(next!.killSwitch.length).toBeGreaterThan(10);
    expect(next!.neverMechanicalSafe).toBe(true);
    expect(next!.class).toBe('judgment');
    expect(next!.loopStep).toBe('one-pilot');
    expect(next!.reDoctor).toMatch(/doctor/);

    // Prefer concrete route facade pilot when present on this fixture.
    const facade = smells.find((s) => s.id === 'facade-sql-in-routes');
    if (facade) {
      expect(next!.smellId).toBe('facade-sql-in-routes');
      expect(next!.evidence.some((e) => e.includes('routes'))).toBe(true);
    }

    const card = formatExtractionCard(next);
    expect(card).toMatch(/### Extraction card/);
    expect(card).toMatch(/Pilot:/);
    expect(card).toMatch(/Smell:/);
    expect(card).toMatch(/Kill-switch:/);
    expect(card).toMatch(/one pilot at a time/i);
  });

  it('summarizePilotLoop inactive when not design-weak', () => {
    const s = summarizePilotLoop({ designWeak: false, patternBets: [] });
    expect(s.active).toBe(false);
    expect(s.reason).toBe('not-design-weak');
    expect(s.neverMechanicalSafe).toBe(true);
    expect(s.oneAtATime).toBe(true);
  });

  it('extractionCardFromBet preserves neverMechanicalSafe', () => {
    const card = extractionCardFromBet({
      id: 'pattern-b:facade-sql-in-routes',
      smellId: 'facade-sql-in-routes',
      pilot: 'src/routes/**',
      evidence: ['src/routes/orders.ts'],
      successSignal: '0 routes import ORM',
      killSwitch: 'stop if worse',
      fix: 'move query to adapter',
      neverMechanicalSafe: true,
      class: 'judgment',
    });
    expect(card!.pilotTarget).toBe('src/routes/orders.ts');
    expect(card!.neverMechanicalSafe).toBe(true);
    expect(card!.doNot.some((d) => /mechanical-safe/i.test(d))).toBe(true);
  });
});

describe('plan + doctor wire pilotLoop (Q04)', () => {
  it('buildRemediationPlan exposes pilotLoop.nextPilot on design-weak fixture', () => {
    const config = loadConfig();
    const files = collectGovernedFiles(FIXTURE, config);
    const cov = computeCoverage(FIXTURE, config, files, config.rules);
    const plan = buildRemediationPlan(FIXTURE, [], cov.governed.percent, files.length, {
      config,
      files,
      coverage: cov,
    });
    expect(plan.goal.designWeak).toBe(true);
    expect(plan.goal.met).toBe(true);
    expect(plan.pilotLoop.active).toBe(true);
    expect(plan.pilotLoop.oneAtATime).toBe(true);
    expect(plan.pilotLoop.neverMechanicalSafe).toBe(true);
    expect(plan.pilotLoop.nextPilot.smellId).toBeTruthy();
    expect(plan.pilotLoop.nextPilot.successSignal).toBeTruthy();
    expect(plan.pilotLoop.nextPilot.killSwitch).toBeTruthy();
    expect(plan.pilotLoop.cardText).toMatch(/Extraction card/);
    // Honesty: all patternBets remain never mechanical-safe
    expect(assertPatternBetsNeverMechanicalSafe(plan.patternBets).ok).toBe(true);
    expect(assertNotHealthyFinishedIgnoringDesign(plan).ok).toBe(false);
  });

  it('runDoctor JSON includes pilotLoop with nextPilot extraction fields', () => {
    const config = loadConfig();
    const files = collectGovernedFiles(FIXTURE, config);
    const payload = doctorJson(FIXTURE, config, files);
    expect(payload.doctor.designFitness.designWeak).toBe(true);
    expect(payload.doctor.postGreenPath?.id).toBe('clarify-for-ai');
    expect(payload.doctor.pilotLoop.active).toBe(true);
    expect(payload.doctor.pilotLoop.id).toBe(PILOT_LOOP_ID);
    expect(payload.doctor.pilotLoop.nextPilot.smellId).toBeTruthy();
    expect(payload.doctor.pilotLoop.nextPilot.neverMechanicalSafe).toBe(true);
    expect(payload.doctor.pilotLoop.instruction).toMatch(/ONE pilot/i);
  });

  it('runPlan human output mentions next pilot when design-weak', () => {
    const config = loadConfig();
    const files = collectGovernedFiles(FIXTURE, config);
    const cov = computeCoverage(FIXTURE, config, files, config.rules);
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => {
      logs.push(a.map(String).join(' '));
    };
    try {
      runPlan(FIXTURE, [], false, cov.governed.percent, files.length, {
        config,
        files,
        coverage: cov,
      });
    } finally {
      console.log = orig;
    }
    const text = logs.join('\n');
    expect(text).toMatch(/Next pilot \(one at a time/i);
    expect(text).toMatch(/re-doctor/i);
  });
});

describe('before → one pilot → re-doctor residual (Q04 fixture proof)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-q04-pilot-'));
    fs.cpSync(FIXTURE, tmp, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('single pilot on facade-sql routes reduces residual on pilot path; gate stays strict', () => {
    const config = loadConfig(tmp);
    const filesBefore = collectGovernedFiles(tmp, config);
    const covBefore = computeCoverage(tmp, config, filesBefore, config.rules);
    const smellsBefore = detectDesignSmells(tmp, config, filesBefore, covBefore);
    const betsBefore = buildPatternBetsFromSmells(smellsBefore);
    const next = selectNextPilot(betsBefore, { designSmells: smellsBefore });
    expect(next).not.toBeNull();

    // Prefer the facade pilot for this proof when present.
    const facadeBet = betsBefore.find((b) => b.smellId === 'facade-sql-in-routes');
    const pilot = facadeBet
      ? extractionCardFromBet(facadeBet, filePaths(facadeBet.evidence))
      : next!;
    expect(pilot!.smellId).toBe('facade-sql-in-routes');
    expect(pilot!.evidence).toContain('src/routes/orders.ts');

    const planBefore = buildRemediationPlan(tmp, [], covBefore.governed.percent, filesBefore.length, {
      config,
      files: filesBefore,
      coverage: covBefore,
    });
    expect(planBefore.goal.met).toBe(true);
    expect(planBefore.goal.designWeak).toBe(true);
    expect(planBefore.pilotLoop.active).toBe(true);

    // === ONE pilot change: remove ORM import from the pilot route (judgment apply) ===
    const routePath = path.join(tmp, 'src/routes/orders.ts');
    expect(fs.existsSync(routePath)).toBe(true);
    fs.writeFileSync(
      routePath,
      `/**
 * Pilot fix: route no longer imports ORM — calls application/port instead.
 * Schema untouched; query bytes would live in an adapter (not expanded here).
 */
export async function GET() {
  return [];
}
`,
      'utf8'
    );

    const filesAfter = collectGovernedFiles(tmp, config);
    const covAfter = computeCoverage(tmp, config, filesAfter, config.rules);
    const smellsAfter = detectDesignSmells(tmp, config, filesAfter, covAfter);
    const delta = comparePilotResidual({
      beforeSmells: smellsBefore,
      afterSmells: smellsAfter,
      nextPilot: pilot!,
    });

    expect(delta.beforeSmellPresent).toBe(true);
    expect(delta.reduced).toBe(true);
    expect(delta.afterEvidenceCount).toBeLessThan(delta.beforeEvidenceCount);
    // Pilot path cleared from facade-sql evidence
    expect(delta.afterEvidence).not.toContain('src/routes/orders.ts');

    const planAfter = buildRemediationPlan(tmp, [], covAfter.governed.percent, filesAfter.length, {
      config,
      files: filesAfter,
      coverage: covAfter,
    });
    // Gate still strict / edges met — no weaken
    expect(planAfter.goal.met).toBe(true);
    expect(assertPatternBetsNeverMechanicalSafe(planAfter.patternBets).ok).toBe(true);

    // Residual outside pilot may remain — must not claim healthy finished solely from pilot
    if (planAfter.goal.designWeak) {
      expect(assertNotHealthyFinishedIgnoringDesign(planAfter).ok).toBe(false);
      expect(planAfter.pilotLoop.neverMechanicalSafe).toBe(true);
    }

    // Doctor after pilot: Q01 door coherent if residual remains
    const docAfter = doctorJson(tmp, config, filesAfter);
    expect(docAfter.doctor.operatingMode).toBe('enforce');
    if (docAfter.doctor.designFitness.designWeak) {
      expect(docAfter.doctor.postGreenPath?.id).toBe('clarify-for-ai');
      expect(docAfter.doctor.healthyFinishedForbidden).toBe(true);
    }
  });
});

describe('honesty (Q04)', () => {
  it('patternBets never become mechanical-safe after pilot loop selection', () => {
    const config = loadConfig();
    const files = collectGovernedFiles(FIXTURE, config);
    const cov = computeCoverage(FIXTURE, config, files, config.rules);
    const plan = buildRemediationPlan(FIXTURE, [], cov.governed.percent, files.length, {
      config,
      files,
      coverage: cov,
    });
    for (const bet of plan.patternBets) {
      expect(bet.neverMechanicalSafe).toBe(true);
      expect(bet.class).not.toBe('mechanical-safe');
    }
    expect(plan.pilotLoop.nextPilot.neverMechanicalSafe).toBe(true);
    expect(plan.pilotLoop.nextPilot.class).toBe('judgment');
  });

  it('golden advisory (Q03) coexists; pilot loop does not clear design-weak alone', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-q04-hon-'));
    try {
      fs.cpSync(FIXTURE, tmp, { recursive: true });
      fs.mkdirSync(path.join(tmp, '.ark'), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, '.ark/golden-pattern.json'),
        JSON.stringify({
          name: 'hex-ports',
          norm: 'New code via ports; migrate legacy on touch.',
        }),
        'utf8'
      );
      const config = loadConfig(tmp);
      const files = collectGovernedFiles(tmp, config);
      const payload = doctorJson(tmp, config, files);
      expect(payload.doctor.designFitness.designWeak).toBe(true);
      expect(payload.doctor.goldenPattern.present).toBe(true);
      expect(payload.doctor.goldenPattern.doesNotClearDesignWeak).toBe(true);
      expect(payload.doctor.pilotLoop.active).toBe(true);
      expect(payload.doctor.postGreenPath?.id).toBe('clarify-for-ai');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

function filePaths(evidence: string[] = []) {
  return evidence.filter(
    (e) => typeof e === 'string' && !e.startsWith('layout:') && !e.startsWith('layer:')
  );
}
