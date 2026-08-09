/**
 * ACS07 — placement A/B dry harness (CI-safe, no live LLM).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve('.');
const RUNNER = path.join(REPO, 'eval/placement-ab-run.mjs');
const TASKS = path.join(REPO, 'eval/placement-ab/tasks.json');
const TEMPLATE = path.join(REPO, 'eval/placement-ab/results/RESULTS.template.json');
const DEFAULT_REPORT = path.join(REPO, 'eval/placement-ab-report.json');

function runHarness(args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [RUNNER, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', ...env },
  });
}

describe('ACS07 placement A/B eval', () => {
  it('ships tasks bank, results template, and four fixture pairs', () => {
    expect(fs.existsSync(TASKS), 'tasks.json').toBe(true);
    expect(fs.existsSync(TEMPLATE), 'RESULTS.template.json').toBe(true);
    const bank = JSON.parse(fs.readFileSync(TASKS, 'utf8')) as {
      id: string;
      notAProductScore: boolean;
      skillsExpectedOnWithGates: string[];
      tasks: Array<{ id: string; fixture: string }>;
    };
    expect(bank.id).toBe('acs07-placement-ab');
    expect(bank.notAProductScore).toBe(true);
    expect(bank.skillsExpectedOnWithGates).toEqual(
      expect.arrayContaining(['ark-place', 'ark-architect'])
    );
    expect(bank.tasks.length).toBeGreaterThanOrEqual(4);

    for (const task of bank.tasks) {
      const base = path.join(REPO, 'eval/placement-ab/fixtures', task.fixture);
      expect(fs.existsSync(path.join(base, 'without-gates', 'ark.config.json'))).toBe(true);
      expect(fs.existsSync(path.join(base, 'with-gates', 'ark.config.json'))).toBe(true);
      expect(
        fs.existsSync(path.join(base, 'with-gates', '.agents/skills/ark-place/SKILL.md'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(base, 'with-gates', '.agents/skills/ark-architect/SKILL.md'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(base, 'without-gates', '.agents/skills/ark-place/SKILL.md'))
      ).toBe(false);
    }

    const template = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8')) as {
      id: string;
      notAProductScore: boolean;
      resultsPath: { dryReport: string; template: string };
    };
    expect(template.id).toBe('acs07-placement-ab');
    expect(template.notAProductScore).toBe(true);
    expect(template.resultsPath.dryReport).toBe('eval/placement-ab-report.json');
    expect(template.resultsPath.template).toBe(
      'eval/placement-ab/results/RESULTS.template.json'
    );
  });

  it('dry mode exits 0, writes report, and proves placementImproved', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-placement-ab-'));
    const out = path.join(outDir, 'report.json');
    try {
      const run = runHarness(['--dry'], { ARK_PLACEMENT_AB_OUT: out });
      expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
      expect(run.stdout).toMatch(/placementImproved:\s+true/);
      expect(run.stdout).toMatch(/notAProductScore/);

      const report = JSON.parse(fs.readFileSync(out, 'utf8')) as {
        id: string;
        mode: string;
        liveLlmRequired: boolean;
        notAProductScore: boolean;
        summary: {
          taskCount: number;
          dryVerified: number;
          dryFailed: number;
          placementImproved: boolean;
          withoutGates: { avgLayerViolations: number; skillsPresentCount: number };
          withGates: { avgLayerViolations: number; skillsPresentCount: number };
        };
        tasks: Array<{
          id: string;
          dryVerified: boolean;
          source: string;
          withoutGates: { layerViolations: number; skillsPresent: boolean };
          withGates: { layerViolations: number; skillsPresent: boolean };
        }>;
      };

      expect(report.id).toBe('acs07-placement-ab');
      expect(report.mode).toBe('dry');
      expect(report.liveLlmRequired).toBe(false);
      expect(report.notAProductScore).toBe(true);
      expect(report.summary.taskCount).toBeGreaterThanOrEqual(4);
      expect(report.summary.dryVerified).toBe(report.summary.taskCount);
      expect(report.summary.dryFailed).toBe(0);
      expect(report.summary.placementImproved).toBe(true);
      expect(report.summary.withoutGates.avgLayerViolations).toBeGreaterThan(0);
      expect(report.summary.withGates.avgLayerViolations).toBe(0);
      expect(report.summary.withoutGates.skillsPresentCount).toBe(0);
      expect(report.summary.withGates.skillsPresentCount).toBe(report.summary.taskCount);

      for (const task of report.tasks) {
        expect(task.dryVerified).toBe(true);
        expect(task.source).toBe('fixture-measured');
        expect(task.withoutGates.layerViolations).toBeGreaterThanOrEqual(1);
        expect(task.withoutGates.skillsPresent).toBe(false);
        expect(task.withGates.layerViolations).toBe(0);
        expect(task.withGates.skillsPresent).toBe(true);
      }
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('live mode without agent exits 0 (not a release blocker)', () => {
    const run = runHarness(['--mode', 'live'], {
      ARK_EVAL_AGENT_CMD: '',
      ARK_PLACEMENT_AB_AGENT_CMD: '',
    });
    // Clear agent env that may leak from host
    const run2 = spawnSync(process.execPath, [RUNNER, '--live'], {
      cwd: REPO,
      encoding: 'utf8',
      env: {
        ...process.env,
        NO_COLOR: '1',
        ARK_EVAL_AGENT_CMD: '',
        ARK_PLACEMENT_AB_AGENT_CMD: '',
      },
    });
    expect(run2.status, `${run2.stdout}\n${run2.stderr}`).toBe(0);
    expect(run2.stdout).toMatch(/skipped-no-agent|Live mode/);
    void run;
  });

  it('eval README documents placement A/B results path', () => {
    const readme = fs.readFileSync(path.join(REPO, 'eval/README.md'), 'utf8');
    expect(readme).toMatch(/placement A\/B|placement-ab|ACS07/i);
    expect(readme).toMatch(/eval\/placement-ab-report\.json|placement-ab-report/);
    expect(readme).toMatch(/dry/i);
    void DEFAULT_REPORT;
  });
});
