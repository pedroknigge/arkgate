/**
 * Shared Claude/Grok home skill catalogs (4.6 PL06–PL07).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  detectAgentHomeGaps,
  installRequestedAgentHomes,
} from '../../../bin/lib/agent-homes.mjs';
import { planSkillInstall } from '../../../bin/lib/skill-install.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = path.join(REPO, 'bin/ark-check.mjs');

function tempRoot(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('agent home catalogs (Claude / Grok)', () => {
  it('planSkillInstall home scope never downgrades a newer stamp', () => {
    const newer = '---\nname: ark-fix\narkVersion: 4.6.0\n---\n# newer\n';
    const older = '---\nname: ark-fix\narkVersion: 4.5.0\n---\n# older body\n';
    const plan = planSkillInstall({
      existingContent: newer,
      targetContent: older,
      packageVersion: '4.5.0',
      force: true,
      scope: 'home',
    });
    expect(plan.action).toBe('skip');
    expect(plan.reason).toBe('newer-home-version');
    expect(plan.downgradeBlocked).toBe(true);
  });

  it('detectAgentHomeGaps is quiet when the home tree has no ark-* skills', () => {
    const root = tempRoot('ark-no-home-');
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# x\n');
    const isolated = tempRoot('ark-empty-claude-');
    const gaps = detectAgentHomeGaps(root, {
      ...process.env,
      CLAUDE_HOME: isolated,
      GROK_HOME: tempRoot('ark-empty-grok-'),
    });
    expect(gaps).toEqual([]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('detectAgentHomeGaps reports stale Claude home skills', () => {
    const root = tempRoot('ark-stale-home-proj-');
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# x\n');
    const claudeHome = tempRoot('ark-stale-claude-');
    const skillDir = path.join(claudeHome, 'skills', 'ark-fix');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: ark-fix\narkVersion: 2.6.1\n---\n# ancient body that will not match the template\n'
    );
    const gaps = detectAgentHomeGaps(root, {
      ...process.env,
      CLAUDE_HOME: claudeHome,
      GROK_HOME: tempRoot('ark-stale-grok-empty-'),
    });
    expect(gaps.some((g) => g.host === 'claude' && g.stale > 0)).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('--claude-home installs SKILL.md under $CLAUDE_HOME/skills', () => {
    const root = tempRoot('ark-claude-home-install-');
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# x\n');
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        layers: { DomainModel: { files: ['src/**'] } },
        rules: [],
      })
    );
    const claudeHome = tempRoot('ark-claude-home-dest-');
    const result = spawnSync(
      process.execPath,
      [
        CLI,
        '--install-agent-gates',
        '--skills-only',
        '--tools',
        'claude',
        '--claude-home',
        '--force',
        '--root',
        root,
      ],
      {
        encoding: 'utf8',
        cwd: REPO,
        env: { ...process.env, CLAUDE_HOME: claudeHome, GROK_HOME: tempRoot('ark-grok-unused-') },
      }
    );
    expect(result.status, result.stderr + result.stdout).toBe(0);
    expect(result.stdout).toMatch(/Claude home skills/i);
    const installed = path.join(claudeHome, 'skills', 'ark-upgrade', 'SKILL.md');
    expect(fs.existsSync(installed)).toBe(true);
    expect(fs.readFileSync(installed, 'utf8')).toMatch(/arkVersion:\s*4\./);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('skips default Claude home when --root is a temp upgrade scratch', () => {
    const root = tempRoot('ark-upgrade-scratch-');
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# x\n');
    const results = installRequestedAgentHomes({
      root,
      version: '4.6.0',
      force: true,
      claudeHome: true,
      json: true,
      env: { ...process.env, CLAUDE_HOME: '' },
    });
    expect(results).toEqual([
      expect.objectContaining({ host: 'claude', skipped: true, reason: 'temp-root-default-home' }),
    ]);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
