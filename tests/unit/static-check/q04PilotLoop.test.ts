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
  collectPilotCandidates,
  selectNextPilot,
  summarizePilotLoop,
  formatExtractionCard,
  comparePilotResidual,
  extractionCardFromBet,
  fileEvidencePaths,
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
    runDoctor(root, config, files, (config as { rules: unknown[] }).rules, [], true, {
      completeness: 'complete',
    });
  } finally {
    console.log = orig;
  }
  return JSON.parse(logs.join('\n'));
}

describe('pilot-loop edge branches (Q04 coverage)', () => {
  it('fileEvidencePaths drops non-file tokens', () => {
    expect(
      fileEvidencePaths(['layout:features/*', 'layer:X', 'rule:r', 'src/a.ts', '', null as unknown as string])
    ).toEqual(['src/a.ts']);
    expect(fileEvidencePaths(undefined)).toEqual([]);
  });

  it('extractionCardFromBet defaults and null guard', () => {
    expect(extractionCardFromBet(null as unknown as object)).toBeNull();
    expect(extractionCardFromBet(undefined as unknown as object)).toBeNull();
    const sparse = extractionCardFromBet({
      smellId: 'god-module',
      evidence: ['layout:features/*'],
    });
    expect(sparse!.patternBetId).toBe('pattern-b:god-module');
    expect(sparse!.pilotTarget).toBe('src/**');
    expect(sparse!.move).toMatch(/bounded extraction/i);
    expect(sparse!.successSignal).toMatch(/Smell evidence/i);
    expect(sparse!.killSwitch).toMatch(/ark-explore/i);
  });

  it('selectNextPilot builds from designSmells; skips mechanical-safe and neverMechanicalSafe:false', () => {
    expect(selectNextPilot(null)).toBeNull();
    expect(selectNextPilot([])).toBeNull();
    const fromSmells = selectNextPilot([], {
      designSmells: [
        {
          id: 'facade-sql-in-routes',
          message: 'm',
          evidence: ['src/routes/x.ts'],
          fix: 'move',
        },
      ],
    });
    expect(fromSmells?.smellId).toBe('facade-sql-in-routes');

    const onlyBad = selectNextPilot([
      {
        id: 'b1',
        smellId: 'god-module',
        class: 'mechanical-safe',
        neverMechanicalSafe: true,
        evidence: ['src/a.ts'],
      },
      {
        id: 'b2',
        smellId: 'soft-contract',
        neverMechanicalSafe: false,
        evidence: ['src/b.ts'],
      },
      null,
    ]);
    expect(onlyBad).toBeNull();
  });

  it('summarizePilotLoop inactive without bets; formatExtractionCard null', () => {
    expect(formatExtractionCard(null)).toBeNull();
    const empty = summarizePilotLoop(
      collectPilotCandidates({ designWeak: true, patternBets: [] })
    );
    expect(empty.active).toBe(false);
    expect(empty.reason).toBe('no-pilot-candidates');
    expect(summarizePilotLoop([]).reason).toBe('no-pilot-candidates');
  });

  it('comparePilotResidual handles missing pilot files and target glob', () => {
    const delta = comparePilotResidual({
      beforeSmells: [{ id: 'x', evidence: ['src/a.ts'] }],
      afterSmells: [{ id: 'x', evidence: ['src/a.ts'] }],
      nextPilot: { smellId: 'x', evidence: [], pilotTarget: 'src/**' },
    });
    expect(delta.beforeEvidenceCount).toBeGreaterThanOrEqual(0);
    expect(delta.reduced).toBe(false);

    const withTarget = comparePilotResidual({
      beforeSmells: [{ id: 'y', evidence: ['src/y.ts'] }],
      afterSmells: [],
      nextPilot: { smellId: 'y', evidence: [], pilotTarget: 'src/y.ts' },
    });
    expect(withTarget.pilotFiles).toContain('src/y.ts');
    expect(withTarget.pilotSmellCleared).toBe(true);
    expect(withTarget.reduced).toBe(true);
  });
});

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

  it('never chooses non-production god-module evidence, including Windows paths', () => {
    const excluded = {
      id: 'pattern-b:god-module-seed',
      smellId: 'god-module',
      pilot: 'src\\seeds\\**',
      evidence: ['src\\seeds\\catalog.ts'],
      neverMechanicalSafe: true,
      class: 'judgment',
    };
    const production = {
      id: 'pattern-b:god-module-production',
      smellId: 'god-module',
      pilot: 'src/application/**',
      evidence: ['src/application/orders.ts'],
      neverMechanicalSafe: true,
      class: 'judgment',
    };
    expect(selectNextPilot([excluded])).toBeNull();
    expect(selectNextPilot([excluded, production])?.pilotTarget).toBe(
      'src/application/orders.ts'
    );
  });

  it('keeps domain-logic-in-ui extraction behind the Application boundary', () => {
    const [bet] = buildPatternBetsFromSmells([
      {
        id: 'domain-logic-in-ui',
        severity: 'warn',
        message: 'business decision in UI',
        evidence: ['src/components/OrderEditor.tsx'],
        fix: 'Move the rule into Domain, expose it through Application, and have UI import Application (never Presentation → Domain directly).',
      },
    ]);
    const card = selectNextPilot([bet]);
    expect(card?.move).toMatch(/Domain.*Application.*UI/i);
    expect(card?.move).toMatch(/never Presentation.*Domain/i);
  });

  it('summarizePilotLoop inactive when no candidates exist', () => {
    const s = summarizePilotLoop(
      collectPilotCandidates({ designWeak: false, patternBets: [] })
    );
    expect(s.active).toBe(false);
    expect(s.reason).toBe('no-pilot-candidates');
    expect(s.neverMechanicalSafe).toBe(true);
    expect(s.oneAtATime).toBe(true);
  });

  it('activates exactly one candidate when several are proposed (#309)', () => {
    const pattern = {
      source: 'pattern-bet' as const,
      target: 'src/routes/orders.ts',
      move: 'move query to adapter',
      moveSample: ['src/routes/orders.ts'],
      successSignal: '0 routes import ORM',
      killSwitch: 'stop if worse',
      files: ['src/routes/orders.ts'],
      bet: {
        id: 'pattern-b:facade-sql-in-routes',
        smellId: 'facade-sql-in-routes',
        pilot: 'src/routes/**',
        evidence: ['src/routes/orders.ts'],
        successSignal: '0 routes import ORM',
        killSwitch: 'stop if worse',
        fix: 'move query to adapter',
        neverMechanicalSafe: true,
        class: 'judgment',
      },
    };
    const reshape = {
      source: 'reshape' as const,
      target: 'timesheet @ src/lib/repositories (25 file(s))',
      move: 'Consolidate the timesheet cluster — one anchor only',
      moveSample: [
        {
          from: 'src/lib/repositories/timesheet-a.ts',
          to: 'src/lib/repositories/timesheet/timesheet-a.ts',
        },
      ],
      successSignal: 'cluster count drops',
      killSwitch: 'revert this move set',
    };
    const loop = summarizePilotLoop([pattern, reshape]);
    expect(loop.active).toBe(true);
    expect(loop.oneAtATime).toBe(true);
    expect(loop.multiPilotBatchForbidden).toBe(true);
    expect(loop.queuedBets).toBe(1);
    expect(loop.queueNote).toMatch(/queued/i);
    expect(Array.isArray(loop.nextPilot)).toBe(false);
    expect(loop.nextPilot.pilotTarget).toBe('src/routes/orders.ts');
    expect(loop.nextPilot.smellId).toBe('facade-sql-in-routes');
    expect(loop.extractionCard).toEqual(loop.nextPilot);
    expect(JSON.stringify(loop.nextPilot)).not.toContain('timesheet');
    expect(JSON.stringify(loop.extractionCard)).not.toContain('timesheet');
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
      completeness: 'complete',
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
        completeness: 'complete',
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
      completeness: 'complete',
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
      completeness: 'complete',
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

describe('pilot candidates (#309)', () => {
  it('keeps the pattern-bet card and queues a reshape behind that one pilot', () => {
    const bets = [
      {
        id: 'pattern-b:facade-sql-in-routes',
        smellId: 'facade-sql-in-routes',
        pilot: 'src/routes/**',
        evidence: ['src/routes/orders.ts'],
        successSignal: '0 routes import ORM',
        killSwitch: 'stop if worse',
        fix: 'move query to adapter',
        neverMechanicalSafe: true,
        class: 'judgment',
      },
      {
        id: 'pattern-b:soft-contract',
        smellId: 'soft-contract',
        pilot: 'src/**',
        evidence: ['layer:App'],
        successSignal: 'every layer has a rule',
        killSwitch: 'stop',
        fix: 'add a deny rule',
        neverMechanicalSafe: true,
        class: 'judgment',
      },
    ];
    const advisories = {
      physicalCohesion: {
        reshapePilot: {
          proposed: true,
          nextPilot: {
            pilotTarget: 'timesheet @ src/lib/repositories (40 file(s))',
            move: 'Consolidate the timesheet cluster — one anchor only',
            moveSample: [],
            successSignal: 'cluster count drops',
            killSwitch: 'revert this move set',
          },
        },
      },
    };
    const historical = selectNextPilot(bets);
    const onlyBets = collectPilotCandidates({ designWeak: true, patternBets: bets });
    const withReshape = collectPilotCandidates({ designWeak: true, patternBets: bets }, advisories);
    expect(withReshape[0].source).toBe('pattern-bet');
    expect(withReshape.at(-1)?.source).toBe('reshape');
    const loop = summarizePilotLoop(withReshape);
    expect(loop.active).toBe(true);
    expect(loop.source).toBe('pattern-bet');
    expect(loop.queuedBets).toBe(withReshape.length - 1);
    expect(loop.nextPilot.smellId).toBe(historical!.smellId);
    expect(loop.nextPilot.pilotTarget).toBe(historical!.pilotTarget);
    expect(loop.nextPilot.move).toBe(historical!.move);
    expect(summarizePilotLoop(onlyBets).nextPilot).toEqual(historical);
    expect(collectPilotCandidates({ designWeak: false, patternBets: bets })).toEqual([]);
    expect(
      collectPilotCandidates(
        { designWeak: false, patternBets: bets },
        { physicalCohesion: { reshapePilot: { proposed: true, nextPilot: null } } }
      )
    ).toEqual([]);
  });

  it('reshape-only repo gives an active loop with one candidate (#309)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-q04-reshape-'));
    try {
      const rels: string[] = [];
      for (let i = 0; i < 40; i++) rels.push(`src/lib/repositories/timesheet-item-${i}.ts`);
      for (const rel of rels) {
        const abs = path.join(tmp, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, 'export const x = 1;\n');
      }
      const config = {
        include: ['src'],
        layers: [
          { name: 'PersistenceAdapters', patterns: ['src/lib/repositories/**'] },
          { name: 'DomainModel', patterns: ['src/domain/**'] },
        ],
        rules: [{ from: 'PersistenceAdapters', to: 'DomainModel', allowed: false }],
      };
      const payload = doctorJson(
        tmp,
        config,
        rels.map((rel) => path.join(tmp, rel))
      );
      expect(payload.doctor.designFitness.designWeak).toBe(false);
      expect(payload.doctor.designFitness.smellCount).toBe(0);
      expect(payload.doctor.physicalCohesion.reshapePilot.proposed).toBe(true);
      expect(payload.doctor.physicalCohesion.reshapePilot.nextPilot).toBeTruthy();
      expect(payload.doctor.pilotLoop.active).toBe(true);
      expect(payload.doctor.pilotLoop.reason).toBeUndefined();
      expect(payload.doctor.pilotLoop.source).toBe('reshape');
      expect(payload.doctor.pilotLoop.oneAtATime).toBe(true);
      expect(payload.doctor.pilotLoop.queuedBets).toBe(0);
      expect(Array.isArray(payload.doctor.pilotLoop.nextPilot)).toBe(false);
      expect(payload.doctor.pilotLoop.nextPilot.smellId).toBe('physical-cohesion');
      expect(payload.doctor.pilotLoop.extractionCard).toEqual(payload.doctor.pilotLoop.nextPilot);
      expect(payload.doctor.pilotLoop.extractionCard.move).toMatch(/timesheet/);
      expect(payload.doctor.pilotLoop.extractionCard.successSignal.length).toBeGreaterThan(10);
      expect(payload.doctor.pilotLoop.extractionCard.killSwitch.length).toBeGreaterThan(5);
      expect(payload.doctor.productHonesty.finished).toBe(false);
      expect(JSON.stringify(payload.doctor.designFitness).toLowerCase()).not.toContain('cohesion');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('honesty (Q04)', () => {
  it('patternBets never become mechanical-safe after pilot loop selection', () => {
    const config = loadConfig();
    const files = collectGovernedFiles(FIXTURE, config);
    const cov = computeCoverage(FIXTURE, config, files, config.rules);
    const plan = buildRemediationPlan(FIXTURE, [], cov.governed.percent, files.length, {
      completeness: 'complete',
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
