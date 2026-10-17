/**
 * One next line: missing contract, a known apply refusal, a plan just written.
 * A lead that names the command that just finished is replaced.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADOPTED_NOT, NOT_ADOPTED_NEXT_ACTION } from '../../../bin/lib/adoption-stance.mjs';
import {
  collectDoctorNextActions,
  preferredDoctorPrimaryNextAction,
} from '../../../bin/lib/doctor-next-actions.mjs';
import {
  ABSENT_CONFIG_FIRST_STEP as cliAbsent,
  PLAN_WRITTEN_FIRST_STEP as cliPlanWritten,
  nextStepPointsAtItself as cliPointsAtItself,
  resolveFirstStep as cliResolve,
  textHasArkOrderCandidate as cliCandidate,
} from '../../../bin/lib/first-step.mjs';
import { treeHasArkOrderCandidate } from '../../../bin/ark-shared.mjs';
import {
  ABSENT_CONFIG_FIRST_STEP,
  APPLY_WILL_REFUSE_FIRST_STEP,
  PLAN_WRITTEN_FIRST_STEP,
  nextStepPointsAtItself,
  resolveFirstStep,
  textHasArkOrderCandidate,
} from '../../../src/domain/firstStep';

describe('resolveFirstStep', () => {
  it('names arkgate start when the contract is missing', () => {
    expect(resolveFirstStep({ configPresent: false })).toBe(ABSENT_CONFIG_FIRST_STEP);
    expect(cliResolve({ configPresent: false })).toBe(cliAbsent);
    expect(ABSENT_CONFIG_FIRST_STEP).toContain('arkgate start');
  });

  it('leads with the unlock path when apply will refuse', () => {
    const lead = resolveFirstStep({
      configPresent: true,
      applyWillRefuse: true,
      justRan: 'arkgate start --apply',
    });
    expect(lead).toBe(APPLY_WILL_REFUSE_FIRST_STEP);
    expect(lead).not.toContain('arkgate start --apply');
    expect(nextStepPointsAtItself(lead, 'arkgate start --apply')).toBe(false);
  });

  it('names /ark-adopt after the plan file is written', () => {
    const justRan = 'ark-check --recommend --write-plan';
    const lead = resolveFirstStep({
      configPresent: true,
      planJustWritten: true,
      justRan,
    });
    expect(lead).toBe(PLAN_WRITTEN_FIRST_STEP);
    expect(lead).toBe(cliPlanWritten);
    expect(nextStepPointsAtItself(lead, justRan)).toBe(false);
    expect(cliPointsAtItself(lead, justRan)).toBe(false);
  });

  it('replaces a lead that names the command that just finished', () => {
    const justRan = 'arkgate start --apply';
    const lead = resolveFirstStep({ configPresent: false, justRan });
    expect(lead).toBe(APPLY_WILL_REFUSE_FIRST_STEP);
    expect(nextStepPointsAtItself(ABSENT_CONFIG_FIRST_STEP, justRan)).toBe(true);
    expect(nextStepPointsAtItself('next', 'ark')).toBe(false);
  });

  it('returns null when the caller keeps its own step', () => {
    expect(resolveFirstStep({ configPresent: true })).toBeNull();
    expect(resolveFirstStep()).toBeNull();
  });

  it('detects a billing candidate and ignores a bare plan word', () => {
    expect(textHasArkOrderCandidate('the billing plan')).toBe(true);
    expect(textHasArkOrderCandidate('Pricing page')).toBe(true);
    expect(textHasArkOrderCandidate('subscription')).toBe(true);
    expect(textHasArkOrderCandidate('BillingPlan')).toBe(false);
    expect(textHasArkOrderCandidate('the plan')).toBe(false);
    expect(textHasArkOrderCandidate('')).toBe(false);
    expect(cliCandidate('billing.ts')).toBe(true);
  });

  it('doctor #1 is arkgate start only when the contract file is missing', () => {
    expect(preferredDoctorPrimaryNextAction({ adopted: ADOPTED_NOT, configMissing: true })).toBe(
      ABSENT_CONFIG_FIRST_STEP
    );
    expect(preferredDoctorPrimaryNextAction({ adopted: ADOPTED_NOT })).toBe(NOT_ADOPTED_NEXT_ACTION);
    const actions = collectDoctorNextActions({
      operatingMode: 'enforce',
      adopted: ADOPTED_NOT,
      configMissing: true,
      activeCount: 0,
      analysisComplete: true,
      postGreenPath: null,
      designFitness: {},
      cov: { suggestions: [] },
      designSmells: [],
      coverageHonesty: { greenIsNotEnforcement: false, worseThanNoGate: false },
      adoption: { gaps: [] },
      skillGaps: [],
      agentHomeGaps: [],
      staleRunners: [],
      gatesMissing: [],
      root: '/tmp',
    });
    expect(actions[0]).toBe(ABSENT_CONFIG_FIRST_STEP);
  });
});

describe('treeHasArkOrderCandidate', () => {
  it('is silent on a one-file tree and true when a path or body names billing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-first-step-'));
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n');
    expect(treeHasArkOrderCandidate(root)).toBe(false);
    fs.writeFileSync(path.join(root, 'src', 'notes.ts'), 'export const seat = 1;\n');
    expect(treeHasArkOrderCandidate(root)).toBe(false);
    fs.mkdirSync(path.join(root, 'src', 'billing'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'billing', 'index.ts'), 'export const n = 1;\n');
    expect(treeHasArkOrderCandidate(root)).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });

    const priced = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-first-step-price-'));
    fs.mkdirSync(path.join(priced, 'src'), { recursive: true });
    fs.writeFileSync(path.join(priced, 'src', 'offer.ts'), 'export const pricing = 1;\n');
    expect(treeHasArkOrderCandidate(priced)).toBe(true);
    expect(treeHasArkOrderCandidate('')).toBe(false);
    fs.rmSync(priced, { recursive: true, force: true });
  });

  it('skips dependencies, dot dirs, non-source, and oversized files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-first-step-skip-'));
    fs.mkdirSync(path.join(root, 'node_modules', 'billing'), { recursive: true });
    fs.writeFileSync(path.join(root, 'node_modules', 'billing', 'index.ts'), 'export const billing = 1;\n');
    fs.mkdirSync(path.join(root, '.git', 'billing'), { recursive: true });
    fs.writeFileSync(path.join(root, '.git', 'billing', 'note.ts'), 'billing\n');
    fs.writeFileSync(path.join(root, 'readme.md'), 'billing\n');
    fs.writeFileSync(path.join(root, 'blob.ts'), `${'x'.repeat(70 * 1024)}\n`);
    fs.writeFileSync(path.join(root, 'seat.ts'), 'export const seat = 1;\n');
    expect(treeHasArkOrderCandidate(root)).toBe(false);
    expect(treeHasArkOrderCandidate(path.join(root, 'seat.ts'))).toBe(false);
    fs.writeFileSync(path.join(root, 'subscription.ts'), 'export const name = "plan";\n');
    expect(treeHasArkOrderCandidate(root)).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
