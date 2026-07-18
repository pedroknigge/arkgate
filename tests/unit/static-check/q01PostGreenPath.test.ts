/**
 * Q01 — single post-green “clarify for AI / Shape” path.
 * Drives real doctor + routing surfaces (no reimplementation).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectGovernedFiles } from '../../../bin/lib/scan-files.mjs';
import { runDoctor } from '../../../bin/lib/doctor-plan.mjs';
import { agentInstructions } from '../../../bin/lib/ci-and-commands.mjs';
import {
  buildPostGreenNextAction,
  mergePostGreenTopActions,
  isDoctorHealthyNothingToDo,
  POST_GREEN_PATH_ID,
  POST_GREEN_PRIMARY_ACTION,
  POST_GREEN_PRIMARY_SKILL,
} from '../../../bin/lib/post-green-path.mjs';
import { assertNotHealthyFinishedIgnoringDesign } from '../../../bin/lib/design-smells.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = path.join(REPO, 'tests/fixtures/design-weak-enforce');

function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE, 'ark.config.json'), 'utf8'));
}

describe('buildPostGreenNextAction (shipped helper)', () => {
  it('returns null when not design-weak', () => {
    expect(buildPostGreenNextAction({ designWeak: false })).toBeNull();
    expect(buildPostGreenNextAction(null)).toBeNull();
  });

  it('returns one primary clarify-for-ai path when design-weak', () => {
    const action = buildPostGreenNextAction({ designWeak: true });
    expect(action).toBeTruthy();
    expect(action!.id).toBe(POST_GREEN_PATH_ID);
    expect(action!.primary).toBe(true);
    expect(action!.skill).toBe(POST_GREEN_PRIMARY_SKILL);
    expect(action!.action).toBe(POST_GREEN_PRIMARY_ACTION);
    expect(action!.action).toMatch(/\/ark-explore/);
    expect(action!.action).toMatch(/\/ark-autopilot/);
    expect(action!.action).toMatch(/Clarify for AI|Shape/i);
    expect(action!.neverMechanicalSafe).toBe(true);
    expect(action!.healthyFinishedForbidden).toBe(true);
  });

  it('mergePostGreenTopActions ranks the single door first and drops competing Shape strings', () => {
    const post = buildPostGreenNextAction({ designWeak: true })!;
    const merged = mergePostGreenTopActions(
      [
        'install gates (npx ark-check --install-agent-gates)',
        'shape residual: /ark-explore or /ark-autopilot dual-plan B',
        'classify the ungoverned directories (/ark-contract)',
      ],
      post
    );
    expect(merged[0]).toBe(POST_GREEN_PRIMARY_ACTION);
    expect(merged.filter((a) => /shape residual: \/ark-explore or/i.test(a))).toHaveLength(0);
    expect(merged.some((a) => a.includes('install gates'))).toBe(true);
  });

  it('isDoctorHealthyNothingToDo is false when design-weak', () => {
    expect(isDoctorHealthyNothingToDo({ designWeak: true }, [])).toBe(false);
    expect(isDoctorHealthyNothingToDo({ designWeak: false }, [])).toBe(true);
    expect(isDoctorHealthyNothingToDo({ designWeak: false }, ['do something'])).toBe(false);
  });
});

describe('doctor JSON postGreenPath on design-weak fixture', () => {
  it('emits postGreenPath as primaryNextAction and forbids healthy finished', () => {
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
    expect(payload.doctor.violations.active).toBe(0);
    expect(payload.doctor.postGreenPath).toBeTruthy();
    expect(payload.doctor.postGreenPath.id).toBe(POST_GREEN_PATH_ID);
    expect(payload.doctor.primaryNextAction).toBe(POST_GREEN_PRIMARY_ACTION);
    expect(payload.doctor.healthyFinishedForbidden).toBe(true);
    expect(payload.doctor.primaryNextAction).toMatch(/\/ark-explore/);
    // Single door: primary action is not a pure choice menu of three skills
    expect(payload.doctor.primaryNextAction).not.toMatch(/\/ark-coverage/);
    expect(payload.doctor.primaryNextAction).not.toMatch(/\/ark-think/);

    const honesty = assertNotHealthyFinishedIgnoringDesign(payload.doctor);
    expect(honesty.ok).toBe(false);
  });

  it('human doctor top action #1 is the single post-green path (not healthy-nothing)', () => {
    const config = loadConfig();
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
    expect(text).not.toMatch(/✔ Healthy — nothing to do/);
    expect(text).toMatch(/Top actions/);
    expect(text).toMatch(/Clarify for AI \(Shape\): \/ark-explore shape-focus/);
    // First numbered action should be the post-green door
    const topBlock = text.split('Top actions')[1] || '';
    const firstLine = topBlock
      .split('\n')
      .map((l) => l.trim())
      .find((l) => /^1\./.test(l));
    expect(firstLine).toBeTruthy();
    expect(firstLine).toMatch(/\/ark-explore shape-focus/);
    expect(firstLine).toMatch(/\/ark-autopilot/);
  });
});

describe('skill routing surface (Q01)', () => {
  it('agentInstructions maps messy/design-weak to the single path', () => {
    const text = agentInstructions(REPO);
    expect(text).toMatch(/Messy \/ spaghetti \/ design-weak after green \/ clarify for AI/i);
    expect(text).toMatch(/Single path:/i);
    expect(text).toMatch(/\/ark-explore.*shape-focus/i);
    expect(text).toMatch(/\/ark-autopilot/);
    expect(text).toMatch(/postGreenPath|primaryNextAction|Post-green door \(Q01\)/i);
    // Competing defaults for the same residual are not co-equal first rows
    expect(text).toMatch(/Not this/);
    expect(text).toMatch(/skill-shopping|coverage, think/i);
  });

  it('explore skill documents Q01 primary post-green door', () => {
    const body = fs.readFileSync(
      path.join(REPO, 'templates/skills/ark-explore.md'),
      'utf8'
    );
    expect(body).toMatch(/Primary post-green door \(Q01\)/);
    expect(body).toMatch(/shape-focus/);
  });
});
