/**
 * UP01 — blocked apply JSON honesty + public content-identity fields.
 * `--apply --json` must not be dumber than the human path; afterHash stays raw bytes.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyManagedUpgrade,
  managedContentIdentity,
  managedUpgradeJson,
  planManagedUpgrade,
} from '../../../bin/lib/managed-upgrade.mjs';
import { buildUpgradeNextCommand } from '../../../bin/lib/upgrade-command.mjs';

const ARK = path.resolve('bin/ark.mjs');
const ARK_CHECK = path.resolve('bin/ark-check.mjs');
const LEGACY_UPGRADE_SKILL = fs.readFileSync(
  path.resolve('tests/fixtures/managed-upgrade/ark-upgrade-3.7.0.md'),
  'utf8'
);

const temps: string[] = [];

type PublicAsset = {
  path: string;
  state: string;
  willApply: boolean;
  blocked?: boolean;
  beforeHash: string | null;
  afterHash: string | null;
  beforeIdentity?: string | null;
  afterIdentity?: string | null;
};

function run(file: string, args: string[]) {
  return spawnSync(process.execPath, [file, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function write(root: string, relativePath: string, content: string) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function sha256(content: string | Buffer) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-up01-json-'));
  temps.push(root);
  write(root, 'package.json', '{"name":"up01-consumer","private":true}\n');
  write(root, 'package-lock.json', '{}\n');
  write(root, 'tsconfig.json', '{"compilerOptions":{"strict":true}}\n');
  write(root, 'src/domain/value.ts', 'export const value = 1;\n');
  write(
    root,
    'ark.config.json',
    `${JSON.stringify({
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    })}\n`
  );
  const installed = run(ARK_CHECK, [
    '--root',
    root,
    '--install-agent-gates',
    '--tools',
    'claude',
  ]);
  expect(installed.status, installed.stderr || installed.stdout).toBe(0);
  return root;
}

function adopt(root: string) {
  const plan = planManagedUpgrade(root, { tools: 'claude' });
  const applied = applyManagedUpgrade(root, plan, plan.planDigest);
  expect(applied.applied).toBe(true);
  return applied;
}

function recordSkillAsStale(root: string, relativePath: string, content: string) {
  const file = path.join(root, relativePath);
  fs.writeFileSync(file, content);
  const manifestFile = path.join(root, 'ark.managed.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as {
    assets: Array<{ path: string; baseHash: string; contentIdentity: string }>;
  };
  const entry = manifest.assets.find((asset) => asset.path === relativePath);
  expect(entry).toBeTruthy();
  entry!.baseHash = sha256(content);
  entry!.contentIdentity = managedContentIdentity(content, 'skill');
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
}

afterEach(() => {
  for (const root of temps.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('UP-001 blocked apply JSON', () => {
  it('emits reasonCode and digest-bound nextCommand with --accept-conflicts; keeps atomic apply', () => {
    const root = fixture();
    adopt(root);

    const skillPath = '.agents/skills/ark-upgrade/SKILL.md';
    const skill = path.join(root, skillPath);
    const skillBefore = fs.readFileSync(skill, 'utf8');
    recordSkillAsStale(root, skillPath, LEGACY_UPGRADE_SKILL);
    const deleted = path.join(root, '.github/workflows/ark-check.yml');
    const deletedBefore = fs.readFileSync(deleted);
    fs.rmSync(deleted);

    const preview = run(ARK, [
      'upgrade',
      '--root',
      root,
      '--tools',
      'claude',
      '--no-install',
      '--no-strict',
      '--json',
    ]);
    expect(preview.status, preview.stderr || preview.stdout).toBe(0);
    const previewReport = JSON.parse(preview.stdout) as {
      planDigest: string;
      nextCommand?: string;
      summary: { blocked: number; wouldWrite: number };
      assets: PublicAsset[];
    };
    expect(previewReport.summary.blocked).toBeGreaterThan(0);
    expect(previewReport.summary.wouldWrite).toBeGreaterThan(0);
    expect(previewReport.assets).toContainEqual(
      expect.objectContaining({
        path: '.github/workflows/ark-check.yml',
        state: 'missing',
        blocked: true,
        willApply: false,
      })
    );
    expect(previewReport.assets).toContainEqual(
      expect.objectContaining({
        path: '.agents/skills/ark-upgrade/SKILL.md',
        state: 'stale',
        willApply: true,
      })
    );

    const applied = run(ARK, [
      'upgrade',
      '--root',
      root,
      '--tools',
      'claude',
      '--no-install',
      '--no-strict',
      '--apply',
      '--plan-digest',
      previewReport.planDigest,
      '--json',
    ]);
    expect(applied.status).toBe(1);
    const report = JSON.parse(applied.stdout) as {
      blocked: boolean;
      applied: boolean;
      reasonCode?: string;
      nextCommand?: string;
      planDigest: string;
      assets: PublicAsset[];
    };
    expect(report.blocked).toBe(true);
    expect(report.applied).toBe(false);
    expect(report.reasonCode).toBe('managed-consent-required');
    expect(report.nextCommand).toEqual(
      buildUpgradeNextCommand(
        {
          root,
          install: false,
          tools: 'claude',
          acceptConflicts: true,
          strict: false,
          json: true,
        },
        report.planDigest
      )
    );
    expect(report.nextCommand).toMatch(/--accept-conflicts/);
    expect(report.nextCommand).toContain(`--plan-digest ${report.planDigest}`);
    expect(report.nextCommand).toMatch(/--apply/);

    expect(fs.existsSync(deleted)).toBe(false);
    expect(fs.readFileSync(skill, 'utf8')).toBe(LEGACY_UPGRADE_SKILL);
    expect(fs.readFileSync(skill, 'utf8')).not.toBe(skillBefore);
    expect(deletedBefore.byteLength).toBeGreaterThan(0);
  });

  it('programmatic blocked apply sets reasonCode and writes nothing', () => {
    const root = fixture();
    adopt(root);
    const skillPath = '.agents/skills/ark-upgrade/SKILL.md';
    recordSkillAsStale(root, skillPath, LEGACY_UPGRADE_SKILL);
    fs.rmSync(path.join(root, '.github/workflows/ark-check.yml'));
    const skill = path.join(root, skillPath);
    const beforeSkill = fs.readFileSync(skill, 'utf8');

    const plan = planManagedUpgrade(root, { tools: 'claude' });
    expect(plan.summary.blocked).toBeGreaterThan(0);
    const applied = applyManagedUpgrade(root, plan, plan.planDigest);
    expect(applied.blocked).toBe(true);
    expect(applied.applied).toBe(false);
    expect(applied.reasonCode).toBe('managed-consent-required');
    expect(fs.existsSync(path.join(root, '.github/workflows/ark-check.yml'))).toBe(false);
    expect(fs.readFileSync(skill, 'utf8')).toBe(beforeSkill);
  });
});

describe('UP-002 public content identity', () => {
  it('exposes before/after identities; stamp-only arkVersion is current with matching identities', () => {
    const root = fixture();
    const skillPath = '.agents/skills/ark-upgrade/SKILL.md';
    const skillFile = path.join(root, skillPath);
    const original = fs.readFileSync(skillFile, 'utf8');
    const stamped = original.replace(/^arkVersion:.*$/m, 'arkVersion: 0.0.0-old');
    expect(stamped).not.toBe(original);
    fs.writeFileSync(skillFile, stamped);

    const preview = run(ARK, [
      'upgrade',
      '--root',
      root,
      '--tools',
      'claude',
      '--no-install',
      '--no-strict',
      '--json',
    ]);
    expect(preview.status, preview.stderr || preview.stdout).toBe(0);
    const report = JSON.parse(preview.stdout) as {
      assets: PublicAsset[];
      summary: { wouldWrite: number };
    };
    const skill = report.assets.find((asset) => asset.path === skillPath);
    expect(skill).toBeTruthy();
    expect(skill).toMatchObject({
      state: 'current',
      willApply: false,
    });
    expect(skill!.beforeIdentity).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(skill!.afterIdentity).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(skill!.beforeIdentity).toBe(skill!.afterIdentity);
    expect(skill!.beforeHash).toBe(sha256(stamped));
    expect(skill!.afterHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(skill!.beforeHash).not.toBe(skill!.afterHash);
    expect(skill!.beforeHash).not.toBe(skill!.beforeIdentity);
    expect(skill!.beforeIdentity).toBe(managedContentIdentity(stamped, 'skill'));
    expect(report.summary.wouldWrite).toBe(0);
  });

  it('managedUpgradeJson surfaces identities without changing current semantics', () => {
    const root = fixture();
    const skillPath = '.agents/skills/ark-upgrade/SKILL.md';
    const skillFile = path.join(root, skillPath);
    const stamped = fs
      .readFileSync(skillFile, 'utf8')
      .replace(/^arkVersion:.*$/m, 'arkVersion: 0.0.0-old');
    fs.writeFileSync(skillFile, stamped);

    const plan = planManagedUpgrade(root, { tools: 'claude' });
    const publicJson = JSON.parse(managedUpgradeJson(plan)) as { assets: PublicAsset[] };
    const skill = publicJson.assets.find((asset) => asset.path === skillPath);
    expect(skill?.state).toBe('current');
    expect(skill?.willApply).toBe(false);
    expect(skill?.beforeIdentity).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(skill?.afterIdentity).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(skill?.beforeIdentity).toBe(skill?.afterIdentity);
    expect(skill?.beforeHash).not.toBe(skill?.afterHash);
    expect(skill).not.toHaveProperty('containerBeforeHash');
  });
});
