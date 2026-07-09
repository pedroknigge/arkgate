/**
 * R5: labeled eval corpus under eval/cases/ — static gates (no live agent).
 *
 * Drives real ark-check on every harness-eligible fixture and validates case.json
 * labels against the domain fixClass / remediation vocabulary.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  KNOWN_FIX_CLASSES as FIX_CLASS_LIST,
  REMEDIATION_CLASSES,
} from '../../../src/domain/remediation';

const REPO = path.resolve(import.meta.dirname, '../../..');
const CASES_DIR = path.join(REPO, 'eval/cases');
const ARK_CHECK = path.join(REPO, 'bin/ark-check.mjs');
const VALIDATE = path.join(REPO, 'eval/validate-corpus.mjs');

const MIN_CASES = 15;

const REQUIRED_THEMES = [
  'type-only-move',
  'nest-overlay',
  'next-core-bag',
  'monorepo-frontend',
  'wrong-layer',
  'domain-forbidden-global',
  'baseline-ratchet',
  'pure-type-relocate',
] as const;

const KNOWN_FIX_CLASSES = new Set<string>(FIX_CLASS_LIST);
const KNOWN_REMEDIATION_CLASSES = new Set<string>(REMEDIATION_CLASSES);

type CaseDef = {
  description?: string;
  expectedFix?: string;
  mustKeep?: string[];
  skipHarness?: boolean;
  theme?: string;
  expectedFixClass?: string;
  expectedRemediationClass?: string;
  expectedRemediationKind?: string;
  expectedRuleId?: string;
};

function listCases(): string[] {
  return fs
    .readdirSync(CASES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function loadCase(name: string): CaseDef {
  return JSON.parse(fs.readFileSync(path.join(CASES_DIR, name, 'case.json'), 'utf8')) as CaseDef;
}

function runArkCheck(root: string, extra: string[] = []) {
  const res = spawnSync(
    process.execPath,
    [ARK_CHECK, '--root', root, '--config', 'ark.config.json', ...extra],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
  );
  return { code: res.status ?? 1, output: `${res.stdout || ''}${res.stderr || ''}` };
}

describe('R5 eval corpus (eval/cases)', () => {
  const names = listCases();

  it(`has at least ${MIN_CASES} case directories`, () => {
    expect(names.length).toBeGreaterThanOrEqual(MIN_CASES);
  });

  it('covers every required R5 theme with at least one case', () => {
    const themes = new Set(names.map((n) => loadCase(n).theme).filter(Boolean));
    for (const theme of REQUIRED_THEMES) {
      expect(themes.has(theme), `missing theme: ${theme}`).toBe(true);
    }
  });

  it('every case.json has expected labels aligned with domain fixClass vocabulary', () => {
    for (const name of names) {
      const def = loadCase(name);
      expect(def.description, name).toBeTruthy();
      expect(def.expectedFix, name).toBeTruthy();
      expect(def.theme, name).toBeTruthy();
      expect(def.expectedFixClass, name).toBeTruthy();
      expect(KNOWN_FIX_CLASSES.has(def.expectedFixClass!), `${name} fixClass`).toBe(true);
      expect(def.expectedRemediationClass, name).toBeTruthy();
      expect(KNOWN_REMEDIATION_CLASSES.has(def.expectedRemediationClass!), name).toBe(true);
    }
  });

  it('every harness-eligible fixture actually violates under real ark-check', () => {
    const harness = names.filter((n) => !loadCase(n).skipHarness);
    expect(harness.length).toBeGreaterThanOrEqual(MIN_CASES - 2);

    for (const name of harness) {
      const root = path.join(CASES_DIR, name);
      expect(fs.existsSync(path.join(root, 'ark.config.json')), name).toBe(true);
      const { code, output } = runArkCheck(root);
      expect(code, `${name} exit (want 1)\n${output.slice(-300)}`).toBe(1);
      expect(output.toLowerCase(), name).toMatch(/violation/);
    }
  });

  it('mechanical-safe cases expose matching remediationKind via ark-check --plan', () => {
    const labeled = names.filter((n) => {
      const d = loadCase(n);
      return !d.skipHarness && d.expectedRemediationKind;
    });
    expect(labeled.length).toBeGreaterThanOrEqual(3);

    for (const name of labeled) {
      const def = loadCase(name);
      const root = path.join(CASES_DIR, name);
      const { code, output } = runArkCheck(root, ['--plan', '--json']);
      // --plan is report-only (exit 0) even when violations exist
      expect([0, 1], name).toContain(code);
      const plan = JSON.parse(output) as {
        plan: { steps: Array<{ class: string; remediationKind?: string; ruleId?: string }> };
      };
      const step =
        plan.plan.steps.find((s) => s.ruleId === def.expectedRuleId) ?? plan.plan.steps[0];
      expect(step, name).toBeTruthy();
      expect(step.class, name).toBe(def.expectedRemediationClass);
      expect(step.remediationKind, name).toBe(def.expectedRemediationKind);
    }
  });

  it('eval/validate-corpus.mjs exits 0 (CI entry for static corpus)', () => {
    const res = spawnSync(process.execPath, [VALIDATE], {
      encoding: 'utf8',
      cwd: REPO,
      maxBuffer: 8 * 1024 * 1024,
    });
    expect(res.status, res.stdout + res.stderr).toBe(0);
    expect(res.stdout).toMatch(/OK/);
  });
});
