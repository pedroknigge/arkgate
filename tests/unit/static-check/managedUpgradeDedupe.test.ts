/**
 * Multi-host upgrade must not double-plan shared skill destinations
 * (codex + antigravity both use .agents/skills/<name>/SKILL.md).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildManagedAssetCatalog } from '../../../bin/lib/install-migrate.mjs';
import { applyManagedUpgrade, planManagedUpgrade } from '../../../bin/lib/managed-upgrade.mjs';

const ARK = path.resolve('bin/ark.mjs');
const ARK_CHECK = path.resolve('bin/ark-check.mjs');
const tempDirs: string[] = [];

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

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('managed upgrade multi-host skill dedupe', () => {
  it('buildManagedAssetCatalog emits unique relative paths for codex+antigravity', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-dedupe-catalog-'));
    tempDirs.push(root);
    const catalog = buildManagedAssetCatalog({
      root,
      tools: ['codex', 'antigravity', 'claude', 'cursor', 'grok'],
      compact: false,
    });
    const paths = catalog.assets.map((a: { relativePath: string }) => a.relativePath);
    expect(paths.length).toBe(new Set(paths).size);
    const agentSkills = paths.filter((p: string) => p.startsWith('.agents/skills/'));
    expect(agentSkills.length).toBeGreaterThan(0);
    const skillNames = agentSkills.map((p: string) => p.split('/')[2]);
    expect(skillNames.length).toBe(new Set(skillNames).size);
  });

  it('upgrade apply succeeds when antigravity and codex share .agents/skills', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-dedupe-apply-'));
    tempDirs.push(root);
    write(root, 'package.json', '{"name":"dedupe-consumer","private":true}\n');
    write(root, 'package-lock.json', '{}\n');
    write(root, 'tsconfig.json', '{"compilerOptions":{"strict":true}}\n');
    write(root, 'src/domain/value.ts', 'export const value = 1;\n');
    write(
      root,
      'ark.config.json',
      JSON.stringify({
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        rules: [],
      }) + '\n'
    );

    const installed = run(ARK_CHECK, [
      '--root',
      root,
      '--install-agent-gates',
      '--tools',
      'claude,codex,antigravity,cursor,grok',
    ]);
    expect(installed.status, installed.stderr || installed.stdout).toBe(0);
    expect(fs.existsSync(path.join(root, '.agents/skills/ark-upgrade/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.agents/hooks.json'))).toBe(true);

    const skill = path.join(root, '.agents/skills/ark-upgrade/SKILL.md');
    fs.writeFileSync(
      skill,
      fs.readFileSync(skill, 'utf8').replace(/^arkVersion:.*$/m, 'arkVersion: 0.0.0-old')
    );

    const plan = planManagedUpgrade(root, {
      tools: 'claude,codex,antigravity,cursor,grok',
    });
    const agentSkillAssets = plan.assets.filter((a: { path: string }) =>
      a.path.startsWith('.agents/skills/')
    );
    const paths = agentSkillAssets.map((a: { path: string }) => a.path);
    expect(paths.length).toBe(new Set(paths).size);

    const applied = applyManagedUpgrade(root, plan, plan.planDigest);
    expect(applied.applied).toBe(true);

    const preview = run(ARK, [
      'upgrade',
      '--root',
      root,
      '--tools',
      'claude,codex,antigravity,cursor,grok',
      '--no-install',
      '--no-strict',
      '--json',
    ]);
    expect(preview.status, preview.stderr || preview.stdout).toBe(0);
    const report = JSON.parse(preview.stdout) as {
      planDigest: string;
      assets: Array<{ path: string }>;
      summary: { wouldWrite: number };
    };
    const previewPaths = report.assets.map((a) => a.path);
    expect(previewPaths.length).toBe(new Set(previewPaths).size);

    if (report.summary.wouldWrite > 0) {
      const apply = run(ARK, [
        'upgrade',
        '--root',
        root,
        '--tools',
        'claude,codex,antigravity,cursor,grok',
        '--no-install',
        '--no-strict',
        '--apply',
        '--plan-digest',
        report.planDigest,
        '--json',
      ]);
      expect(apply.status, apply.stderr || apply.stdout).toBe(0);
      const body = JSON.parse(apply.stdout) as { applied: boolean };
      expect(body.applied).toBe(true);
    }
  });
});
