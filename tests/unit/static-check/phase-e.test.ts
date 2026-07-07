import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ADOPTION_PLAN_FILENAME,
  buildAdoptionPlanDocument,
  buildArchitectureRecommendation,
  listPolicyPackIds,
  loadPolicyPackMeta,
} from '../../../bin/ark-shared.mjs';

const REPO = path.resolve(import.meta.dirname, '../../..');
const ARK_CHECK = path.join(REPO, 'bin/ark-check.mjs');

const POLICY_PACK_IDS = [
  'enthusiast-hexagonal',
  'enthusiast-layered',
  'enthusiast-feature-sliced',
  'enthusiast-monorepo',
] as const;

function mkTemp(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runArkCheck(root: string, extraArgs: string[] = []) {
  return execFileSync('node', [ARK_CHECK, '--root', root, ...extraArgs], {
    encoding: 'utf8',
  });
}

describe('Phase E — ark-adoption-plan.json', () => {
  it('buildAdoptionPlanDocument includes archetype, preset, and phase1', () => {
    const root = mkTemp('ark-phasee-plan-');
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x' }));

    const rec = buildArchitectureRecommendation(root);
    const doc = buildAdoptionPlanDocument(rec);

    expect(doc.archetype).toBeTruthy();
    expect(doc.preset).toBeTruthy();
    expect(doc.adoptInOrder.phase1.length).toBeGreaterThan(0);
    expect(doc.version).toBe('1');
    expect(doc.policyPack).toMatch(/^enthusiast-/);
  });

  it('--recommend --write-plan writes valid ark-adoption-plan.json', () => {
    const root = mkTemp('ark-phasee-write-');
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'greenfield' }));

    runArkCheck(root, ['--recommend', '--write-plan', '--json']);
    const planPath = path.join(root, ADOPTION_PLAN_FILENAME);
    expect(fs.existsSync(planPath)).toBe(true);

    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8')) as {
      archetype: string;
      preset: string;
      adoptInOrder: { phase1: string[] };
    };
    expect(plan.archetype).toBeTruthy();
    expect(plan.preset).toBeTruthy();
    expect(plan.adoptInOrder.phase1.length).toBeGreaterThan(0);
  });
});

describe('Phase E — enthusiast policy packs', () => {
  it('lists four enthusiast packs in templates/policy-packs', () => {
    const ids = listPolicyPackIds();
    for (const id of POLICY_PACK_IDS) {
      expect(ids).toContain(id);
      const pack = loadPolicyPackMeta(id);
      expect(pack.variant).toBe('enthusiast');
      expect(pack.phases?.['1']?.length).toBeGreaterThan(0);
    }
  });

  for (const packId of POLICY_PACK_IDS) {
    it(`${packId} applies and passes strict-config on greenfield`, () => {
      const root = mkTemp(`ark-phasee-pack-${packId}-`);
      if (packId === 'enthusiast-monorepo') {
        fs.writeFileSync(
          path.join(root, 'package.json'),
          JSON.stringify({ name: 'mono', workspaces: ['apps/*', 'packages/*'] })
        );
        fs.mkdirSync(path.join(root, 'apps/web'), { recursive: true });
        fs.mkdirSync(path.join(root, 'packages/domain'), { recursive: true });
      } else {
        fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      }

      runArkCheck(root, ['--apply-policy-pack', packId, '--json']);
      expect(fs.existsSync(path.join(root, 'ark.config.json'))).toBe(true);

      const checkOut = runArkCheck(root, [
        '--config',
        'ark.config.json',
        '--strict-config',
        '--json',
      ]);
      const result = JSON.parse(checkOut) as { ok: boolean; violations: unknown[] };
      expect(result.ok).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  }
});

describe('Phase E — skills and docs cross-references', () => {
  const SKILLS_DIR = path.join(REPO, 'templates/skills');

  it('every installable skill references architect onboarding surfaces', () => {
    const skills = fs.readdirSync(SKILLS_DIR).filter((name) => name.endsWith('.md'));
    expect(skills.length).toBe(9);
    for (const file of skills) {
      const text = fs.readFileSync(path.join(SKILLS_DIR, file), 'utf8');
      const hasOnboarding =
        text.includes('/ark-architect') ||
        text.includes('ark-check --recommend') ||
        text.includes('ark_recommend');
      expect(hasOnboarding, `${file} should mention onboarding`).toBe(true);
    }
  });
});