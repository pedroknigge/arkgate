/**
 * D2 — one UpgradeOutcome for `upgrade --apply` (#311, #312).
 * absent-local recreates a gitignored managed file; a real deletion still
 * needs consent; applied-but-red exits 3 and names the failing rules.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { behaviorChangeLines, UPGRADE_BEHAVIOR_CHANGES } from '../../../bin/lib/upgrade-behavior-changes.mjs';
import { classifyManagedAsset } from '../../../bin/lib/managed-upgrade.mjs';
import {
  aggregateFailingRules,
  exitCodeFor,
  formatPostUpgradeHuman,
  runPostUpgradeVerification,
  upgradeOutcome,
} from '../../../bin/lib/upgrade-outcome.mjs';

const ARK = path.resolve('bin/ark.mjs');
const ARK_CHECK = path.resolve('bin/ark-check.mjs');
const CHANGELOG = path.resolve('CHANGELOG.md');

const temps: string[] = [];

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

function git(root: string, args: string[]) {
  return spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'ark', GIT_AUTHOR_EMAIL: 'ark@example.com' },
  });
}

function fixture(name: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ark-outcome-${name}-`));
  temps.push(root);
  write(root, 'package.json', `{"name":"${name}","private":true}\n`);
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
  const installed = run(ARK_CHECK, ['--root', root, '--install-agent-gates', '--tools', 'claude']);
  expect(installed.status, installed.stderr || installed.stdout).toBe(0);
  return root;
}

function adopt(root: string) {
  const preview = run(ARK, [
    'upgrade', '--root', root, '--tools', 'claude', '--no-install', '--no-strict', '--json',
  ]);
  expect(preview.status, preview.stderr || preview.stdout).toBe(0);
  const { planDigest } = JSON.parse(preview.stdout) as { planDigest: string };
  const applied = run(ARK, [
    'upgrade', '--root', root, '--tools', 'claude', '--no-install', '--no-strict',
    '--apply', '--plan-digest', planDigest, '--json',
  ]);
  expect(applied.status, applied.stderr || applied.stdout).toBe(0);
  return applied;
}

afterEach(() => {
  for (const root of temps.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('upgrade outcome value', () => {
  it('maps exit codes and aggregates failing rules from check JSON', () => {
    expect(exitCodeFor(upgradeOutcome({ applied: true, postUpgrade: { verdict: 'green', failing: [], behaviorChanges: [], mode: 'strict-merge', exitCode: 0 } }))).toBe(0);
    expect(exitCodeFor(upgradeOutcome({ applied: true, postUpgrade: { verdict: 'red', failing: [], behaviorChanges: [], mode: 'strict-merge', exitCode: 1 } }))).toBe(3);
    expect(exitCodeFor(upgradeOutcome({ blocked: true }))).toBe(2);
    expect(exitCodeFor(upgradeOutcome({ error: new Error('digest') }))).toBe(1);
    expect(exitCodeFor(upgradeOutcome({ nothingToApply: true }))).toBe(0);

    const failing = aggregateFailingRules({
      violations: [
        { ruleId: 'INVARIANT_UNCOVERED', file: 'tests/a.test.ts', line: 4, message: 'missing title', failsStrict: true },
        { ruleId: 'INVARIANT_UNCOVERED', file: 'tests/b.test.ts', line: 8, message: 'missing title' },
        { ruleId: 'LAYER_IMPORT_VIOLATION', file: 'src/domain/a.ts', line: 1, message: 'denied', failsStrict: false },
      ],
    });
    expect(failing).toEqual([
      {
        ruleId: 'INVARIANT_UNCOVERED',
        count: 2,
        sample: 'tests/a.test.ts:4 — missing title',
      },
    ]);
  });

  it('ships behavior-change lines that the changelog repeats', () => {
    const changelog = fs.readFileSync(CHANGELOG, 'utf8');
    expect(UPGRADE_BEHAVIOR_CHANGES.map((row) => row.version)).toEqual(['4.8.20', '4.8.21', '4.8.21']);
    for (const row of UPGRADE_BEHAVIOR_CHANGES) {
      expect(changelog).toContain(row.note);
    }
    expect(changelog).toMatch(/Scripts comparing against 1 must switch to 'non-zero'/);
    expect(behaviorChangeLines()).toEqual(
      UPGRADE_BEHAVIOR_CHANGES.map((row) => `${row.version}: ${row.note}`)
    );
    expect(behaviorChangeLines('4.8.20')).toEqual([
      `4.8.20: ${UPGRADE_BEHAVIOR_CHANGES[0].note}`,
    ]);
  });

  it('tells the human to read behaviorChanges before editing code', () => {
    const lines = formatPostUpgradeHuman({
      verdict: 'red',
      failing: [{ ruleId: 'INVARIANT_UNCOVERED', count: 2, sample: 'tests/a.test.ts:4 — missing title' }],
      behaviorChanges: behaviorChangeLines(),
      mode: 'strict-merge',
      exitCode: 1,
    });
    expect(lines.join('\n')).toContain('INVARIANT_UNCOVERED ×2 — tests/a.test.ts:4 — missing title');
    expect(lines.join('\n')).toContain('Read behaviorChanges before editing code.');
    expect(lines.join('\n')).toContain('coverage.symbol now requires a real declaration');
  });

  it('classifies recorded + gitignored + missing as absent-local', () => {
    const recorded = { contentIdentity: `sha256:${'a'.repeat(64)}` };
    const absent = classifyManagedAsset({
      recorded,
      currentContent: null,
      targetContent: 'template\n',
      kind: 'gate',
      gitignored: true,
    });
    expect(absent).toMatchObject({ state: 'absent-local', requiresConsent: false });
    const deleted = classifyManagedAsset({
      recorded,
      currentContent: null,
      targetContent: 'template\n',
      kind: 'gate',
      gitignored: false,
    });
    expect(deleted).toMatchObject({ state: 'missing', requiresConsent: true });
  });
});

describe('upgrade --apply outcomes', () => {
  it('recreates a gitignored missing managed file without consent', () => {
    const root = fixture('absent');
    adopt(root);
    expect(git(root, ['init']).status).toBe(0);
    write(root, '.gitignore', '.mcp.json\n');
    fs.rmSync(path.join(root, '.mcp.json'));

    const preview = run(ARK, [
      'upgrade', '--root', root, '--tools', 'claude', '--no-install', '--no-strict', '--json',
    ]);
    expect(preview.status, preview.stderr || preview.stdout).toBe(0);
    const report = JSON.parse(preview.stdout) as {
      planDigest: string;
      summary: { blocked: number };
      assets: Array<{ path: string; state: string; blocked?: boolean; willApply?: boolean; requiresConsent?: boolean }>;
    };
    expect(report.summary.blocked).toBe(0);
    expect(report.assets).toContainEqual(
      expect.objectContaining({
        path: '.mcp.json',
        state: 'absent-local',
        blocked: false,
        willApply: true,
        requiresConsent: false,
      })
    );

    const applied = run(ARK, [
      'upgrade', '--root', root, '--tools', 'claude', '--no-install', '--no-strict',
      '--apply', '--plan-digest', report.planDigest, '--json',
    ]);
    expect(applied.status, applied.stderr || applied.stdout).toBe(0);
    const body = JSON.parse(applied.stdout) as { applied: boolean; outcome: string };
    expect(body.applied).toBe(true);
    expect(body.outcome).toBe('applied-skipped');
    expect(fs.existsSync(path.join(root, '.mcp.json'))).toBe(true);
    expect(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8').length).toBeGreaterThan(0);
  });

  it('still requires consent, with reason and nextCommand, when a non-gitignored asset was deleted', () => {
    const root = fixture('deleted');
    adopt(root);
    expect(git(root, ['init']).status).toBe(0);
    write(root, '.gitignore', 'node_modules/\n');
    const deleted = path.join(root, '.github/workflows/ark-check.yml');
    fs.rmSync(deleted);

    const preview = run(ARK, [
      'upgrade', '--root', root, '--tools', 'claude', '--no-install', '--no-strict', '--json',
    ]);
    expect(preview.status, preview.stderr || preview.stdout).toBe(0);
    const report = JSON.parse(preview.stdout) as {
      planDigest: string;
      assets: Array<{ path: string; state: string; blocked?: boolean; reason?: string; nextCommand?: string }>;
    };
    const asset = report.assets.find((entry) => entry.path === '.github/workflows/ark-check.yml');
    expect(asset).toMatchObject({
      state: 'missing',
      blocked: true,
    });
    expect(asset?.reason).toMatch(/not gitignored/);
    expect(asset?.reason).toMatch(/consent/);
    expect(asset?.nextCommand).toMatch(/--accept-conflicts/);
    expect(asset?.nextCommand).toContain(report.planDigest);

    const applied = run(ARK, [
      'upgrade', '--root', root, '--tools', 'claude', '--no-install', '--no-strict',
      '--apply', '--plan-digest', report.planDigest, '--json',
    ]);
    expect(applied.status).toBe(2);
    const body = JSON.parse(applied.stdout) as {
      applied: boolean;
      blocked: boolean;
      outcome: string;
      assets: Array<{ path: string; reason?: string; nextCommand?: string }>;
    };
    expect(body.applied).toBe(false);
    expect(body.blocked).toBe(true);
    expect(body.outcome).toBe('blocked');
    const blockedAsset = body.assets.find((entry) => entry.path === '.github/workflows/ark-check.yml');
    expect(blockedAsset?.reason).toMatch(/not gitignored/);
    expect(blockedAsset?.nextCommand).toMatch(/--accept-conflicts/);
    expect(applied.stderr).toMatch(/Apply refused/);
    expect(applied.stderr).toContain(blockedAsset?.reason ?? 'missing-reason');
    expect(applied.stderr).toMatch(/Next:/);
    expect(fs.existsSync(deleted)).toBe(false);
  });

  it('exits 3 when apply lands and the architecture check is red', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-outcome-red-'));
    temps.push(root);
    write(root, 'package.json', '{"name":"outcome-red","private":true}\n');
    write(root, 'package-lock.json', '{}\n');
    write(root, 'tsconfig.json', '{"compilerOptions":{"strict":true}}\n');
    write(root, 'src/ui/widget.ts', 'export const widget = 1;\n');
    write(
      root,
      'src/domain/order.ts',
      'import { widget } from "../ui/widget";\nexport const order = widget;\n'
    );
    write(
      root,
      'ark.config.json',
      `${JSON.stringify({
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'] },
          { name: 'Ui', patterns: ['src/ui/**'] },
        ],
        rules: [{ from: 'DomainModel', to: 'Ui', allowed: false }],
      })}\n`
    );
    const installed = run(ARK_CHECK, ['--root', root, '--install-agent-gates', '--tools', 'claude']);
    expect(installed.status, installed.stderr || installed.stdout).toBe(0);
    adopt(root);

    const skillPath = '.agents/skills/ark-upgrade/SKILL.md';
    const skillFile = path.join(root, skillPath);
    const original = fs.readFileSync(skillFile, 'utf8');
    fs.writeFileSync(skillFile, original.replace(/^arkVersion:.*$/m, 'arkVersion: 0.0.0-old'));

    const preview = run(ARK, [
      'upgrade', '--root', root, '--tools', 'claude', '--no-install', '--json',
    ]);
    expect(preview.status, preview.stderr || preview.stdout).toBe(0);
    const previewReport = JSON.parse(preview.stdout) as {
      planDigest: string;
      summary: { wouldWrite: number };
    };
    expect(previewReport.summary.wouldWrite).toBeGreaterThan(0);

    const applied = run(ARK, [
      'upgrade', '--root', root, '--tools', 'claude', '--no-install',
      '--apply', '--plan-digest', previewReport.planDigest, '--json',
    ]);
    expect(applied.status, applied.stderr || applied.stdout).toBe(3);
    const body = JSON.parse(applied.stdout) as {
      applied: boolean;
      outcome: string;
      postUpgrade: {
        verdict: string;
        failing: Array<{ ruleId: string; count: number; sample: string }>;
        behaviorChanges: string[];
      };
    };
    expect(body.applied).toBe(true);
    expect(body.outcome).toBe('applied-red');
    expect(body.postUpgrade.verdict).toBe('red');
    expect(body.postUpgrade.failing.length).toBeGreaterThan(0);
    for (const row of body.postUpgrade.failing) {
      expect(row.ruleId).toEqual(expect.any(String));
      expect(row.count).toBeGreaterThan(0);
      expect(row.sample.length).toBeGreaterThan(0);
    }
    expect(body.postUpgrade.failing.some((row) => row.ruleId === 'LAYER_IMPORT_VIOLATION')).toBe(true);
    expect(body.postUpgrade.behaviorChanges.join('\n')).toContain(
      'coverage.symbol now requires a real declaration (some green repos turn red)'
    );
    expect(body.postUpgrade.behaviorChanges.join('\n')).toContain(
      "Scripts comparing against 1 must switch to 'non-zero'"
    );
    expect(fs.readFileSync(skillFile, 'utf8')).not.toContain('arkVersion: 0.0.0-old');
  });
});

describe('runPostUpgradeVerification', () => {
  it('reuses injected check JSON instead of treating exit 1 as an empty failure', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-outcome-verify-'));
    temps.push(root);
    const result = runPostUpgradeVerification(root, {
      strict: true,
      checkResult: {
        exitCode: 1,
        stdout: JSON.stringify({
          ok: false,
          valid: false,
          violations: [
            { ruleId: 'INVARIANT_UNCOVERED', file: 'tests/a.test.ts', line: 2, message: 'no title' },
          ],
        }),
      },
    });
    expect(result.verdict).toBe('red');
    expect(result.failing).toEqual([
      { ruleId: 'INVARIANT_UNCOVERED', count: 1, sample: 'tests/a.test.ts:2 — no title' },
    ]);
    expect(result.behaviorChanges.length).toBe(UPGRADE_BEHAVIOR_CHANGES.length);
  });
});
