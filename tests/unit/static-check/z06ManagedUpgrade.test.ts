import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  applyManagedUpgrade,
  classifyManagedAsset,
  managedContentIdentity,
  planManagedUpgrade,
} from '../../../bin/lib/managed-upgrade.mjs';
import { codexPrimaryTable } from '../../../bin/lib/codex-home.mjs';

const ARK = path.resolve('bin/ark.mjs');
const ARK_CHECK = path.resolve('bin/ark-check.mjs');
const LEGACY_UPGRADE_SKILL = fs.readFileSync(
  path.resolve('tests/fixtures/managed-upgrade/ark-upgrade-3.7.0.md'),
  'utf8'
);

function run(file: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(process.execPath, [file, ...args], {
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function write(root: string, relativePath: string, content: string) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function digest(file: string) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
}

function contentDigest(content: string) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function applyUpgrade(
  root: string,
  host: string,
  options: { acceptConflicts?: boolean; env?: NodeJS.ProcessEnv } = {}
) {
  const common = [
    'upgrade', '--root', root, '--tools', host, '--no-install', '--no-strict',
    ...(options.acceptConflicts ? ['--accept-conflicts'] : []),
  ];
  const preview = run(ARK, [...common, '--json'], options.env);
  expect(preview.status, preview.stderr || preview.stdout).toBe(0);
  const { planDigest } = JSON.parse(preview.stdout) as { planDigest: string };
  expect(planDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  return run(
    ARK,
    [...common, '--apply', '--plan-digest', planDigest, '--json'],
    options.env
  );
}

function snapshot(root: string) {
  const files: Record<string, string> = {};
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isSymbolicLink()) files[relative] = `link:${fs.readlinkSync(absolute)}`;
      else files[relative] = digest(absolute);
    }
  };
  visit(root);
  return files;
}

const HOST_ASSETS = {
  claude: '.claude/settings.json',
  cursor: '.cursor/mcp.json',
  codex: '.codex/hooks.json',
  grok: '.grok/config.toml',
  windsurf: '.windsurf/rules/ark.md',
  cline: '.clinerules/ark.md',
  copilot: '.github/copilot-instructions.md',
  kiro: '.kiro/steering/ark.md',
  roo: '.roo/rules/ark.md',
  continue: '.continue/rules/ark.md',
  gemini: 'GEMINI.md',
} as const;

const SKILL_PATHS: Partial<Record<keyof typeof HOST_ASSETS, string>> = {
  claude: '.claude/skills/ark-upgrade/SKILL.md',
  cursor: '.cursor/commands/ark-upgrade.md',
  codex: '.agents/skills/ark-upgrade/SKILL.md',
  grok: '.grok/skills/ark-upgrade/SKILL.md',
  windsurf: '.windsurf/workflows/ark-upgrade.md',
  cline: '.clinerules/workflows/ark-upgrade.md',
  copilot: '.github/prompts/ark-upgrade.prompt.md',
};

function fixture(host = 'claude') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z06-upgrade-'));
  write(root, 'package.json', '{"name":"z06-consumer","private":true}\n');
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
    host,
  ]);
  expect(installed.status, installed.stderr || installed.stdout).toBe(0);
  return root;
}

describe('Z06 managed-content upgrade', () => {
  it('classifies current, missing, stale, customized, and conflicted from identities', () => {
    const target = 'target\n';
    const old = 'old target\n';
    const custom = 'user edit\n';
    const recordedOld = { contentIdentity: managedContentIdentity(old) };
    const recordedTarget = { contentIdentity: managedContentIdentity(target) };

    expect(
      classifyManagedAsset({ recorded: null, currentContent: target, targetContent: target, kind: 'gate' })
    ).toMatchObject({ state: 'current', managed: true });
    expect(
      classifyManagedAsset({ recorded: null, currentContent: null, targetContent: target, kind: 'gate' })
    ).toMatchObject({ state: 'missing', managed: true, requiresConsent: false });
    expect(
      classifyManagedAsset({ recorded: recordedOld, currentContent: null, targetContent: target, kind: 'gate' })
    ).toMatchObject({ state: 'missing', managed: true, requiresConsent: true });
    expect(
      classifyManagedAsset({ recorded: null, currentContent: custom, targetContent: target, kind: 'gate' })
    ).toMatchObject({ state: 'customized', managed: false, requiresConsent: false });
    expect(
      classifyManagedAsset({
        recorded: null,
        currentContent: LEGACY_UPGRADE_SKILL,
        targetContent: target,
        kind: 'skill',
      })
    ).toMatchObject({ state: 'stale', managed: true, requiresConsent: false });
    expect(
      classifyManagedAsset({ recorded: recordedOld, currentContent: old, targetContent: target, kind: 'gate' })
    ).toMatchObject({ state: 'stale', managed: true, requiresConsent: false });
    expect(
      classifyManagedAsset({ recorded: recordedTarget, currentContent: custom, targetContent: target, kind: 'gate' })
    ).toMatchObject({ state: 'customized', managed: true, requiresConsent: false });
    expect(
      classifyManagedAsset({ recorded: recordedOld, currentContent: custom, targetContent: target, kind: 'gate' })
    ).toMatchObject({ state: 'conflicted', managed: true, requiresConsent: true });
  });

  it('defaults to a non-mutating JSON preview and never refreshes Codex home implicitly', () => {
    const root = fixture();
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z06-codex-home-'));
    const skill = path.join(root, '.claude/skills/ark-upgrade/SKILL.md');
    fs.writeFileSync(
      skill,
      fs.readFileSync(skill, 'utf8').replace(/^arkVersion:.*$/m, 'arkVersion: 0.0.0-old')
    );
    write(root, 'src/domain/unrelated.ts', 'export const untouched = true;\n');
    write(codexHome, 'skills/ark-upgrade/SKILL.md', 'user-owned Codex home skill\n');
    const before = snapshot(root);

    const preview = run(
      ARK,
      ['upgrade', '--root', root, '--tools', 'claude', '--no-install', '--no-strict', '--json'],
      { ...process.env, CODEX_HOME: codexHome, ARK_ACTIVE_HOST: 'claude' }
    );

    expect(preview.status, preview.stderr || preview.stdout).toBe(0);
    const report = JSON.parse(preview.stdout) as {
      readOnly: boolean;
      applied: boolean;
      assets: Array<{ path: string; state: string }>;
      summary: {
        wouldWrite: number;
        managedAssets: number;
        customizedPreserved: number;
        metadataRefresh: number;
      };
      nothingToApply?: boolean;
      nextCommand?: string;
    };
    expect(report.readOnly).toBe(true);
    expect(report.applied).toBe(false);
    expect(report.assets.find((asset) => asset.path.endsWith('ark-upgrade/SKILL.md'))?.state).toBe(
      'current'
    );
    // Content matches package — stamp lag alone is not a planned content write.
    expect(report.summary.wouldWrite).toBe(0);
    expect(report.summary.managedAssets).toBeGreaterThan(0);
    expect(typeof report.summary.customizedPreserved).toBe('number');
    expect(report.nothingToApply).toBe(true);
    // nextCommand remains for digest-bound optional apply; human copy does not urge it.
    expect(report.nextCommand).toMatch(/--plan-digest /);
    expect(snapshot(root)).toEqual(before);
    expect(fs.readFileSync(path.join(codexHome, 'skills/ark-upgrade/SKILL.md'), 'utf8')).toBe(
      'user-owned Codex home skill\n'
    );

    const human = run(
      ARK,
      ['upgrade', '--root', root, '--tools', 'claude', '--no-install', '--no-strict'],
      { ...process.env, CODEX_HOME: codexHome, ARK_ACTIVE_HOST: 'claude' }
    );
    expect(human.status, human.stderr || human.stdout).toBe(0);
    expect(human.stdout).toMatch(/Nothing to apply — managed content matches arkgate@/);
    expect(human.stdout).not.toMatch(/Apply the exact preview with:/);
    // Stamp lag is optional only — still print digest-bound apply when metadataRefresh > 0.
    if ((report.summary.metadataRefresh ?? 0) > 0) {
      expect(human.stdout).toMatch(/Optional stamp-only apply \(not required\):/);
      expect(human.stdout).toMatch(/--plan-digest /);
    }
  });

  it('doctor skillGaps.stale is 0 when skill body matches template with lagging arkVersion', () => {
    const root = fixture();
    const skill = path.join(root, '.claude/skills/ark-upgrade/SKILL.md');
    fs.writeFileSync(
      skill,
      fs.readFileSync(skill, 'utf8').replace(/^arkVersion:.*$/m, 'arkVersion: 0.0.0-old')
    );
    const plan = planManagedUpgrade(root, { tools: 'claude' });
    expect(plan.assets.find((a) => a.path === '.claude/skills/ark-upgrade/SKILL.md')?.state).toBe(
      'current'
    );
    expect(plan.summary.wouldWrite).toBe(0);

    const doctor = run(ARK_CHECK, [
      '--root', root, '--config', 'ark.config.json', '--doctor', '--json', '--no-cache',
    ]);
    expect(doctor.status, doctor.stderr || doctor.stdout).toBe(0);
    const gaps = (JSON.parse(doctor.stdout) as {
      doctor: { skillGaps: Array<{ tool: string; stale: number }> };
    }).doctor.skillGaps;
    expect(gaps?.some((gap) => gap.tool === 'claude' && gap.stale > 0) ?? false).toBe(false);
  });

  it('refreshes only stale skill metadata and leaves doctor with no version-only gap', () => {
    const root = fixture();
    const skill = path.join(root, '.claude/skills/ark-upgrade/SKILL.md');
    fs.writeFileSync(
      skill,
      fs.readFileSync(skill, 'utf8').replace(/^arkVersion:.*$/m, 'arkVersion: 0.0.0-old')
    );
    const applied = applyUpgrade(root, 'claude');
    expect(applied.status, applied.stderr || applied.stdout).toBe(0);
    const report = JSON.parse(applied.stdout) as {
      assets: Array<{ path: string; state: string; action: string }>;
    };
    expect(report.assets).toContainEqual(
      expect.objectContaining({ path: '.claude/skills/ark-upgrade/SKILL.md', state: 'current', action: 'refresh-metadata' })
    );
    expect(fs.readFileSync(skill, 'utf8')).not.toContain('arkVersion: 0.0.0-old');

    const doctor = run(ARK_CHECK, [
      '--root', root, '--config', 'ark.config.json', '--doctor', '--json', '--no-cache',
    ]);
    expect(doctor.status, doctor.stderr || doctor.stdout).toBe(0);
    const gaps = (JSON.parse(doctor.stdout) as {
      doctor: { skillGaps: Array<{ tool: string; stale: number }> };
    }).doctor.skillGaps;
    expect(gaps.some((gap) => gap.tool === 'claude' && gap.stale > 0)).toBe(false);
  });

  it('upgrades an exact published 3.7 skill body but preserves any edit to it', () => {
    const root = fixture();
    const skill = path.join(root, '.claude/skills/ark-upgrade/SKILL.md');
    fs.writeFileSync(skill, LEGACY_UPGRADE_SKILL);
    const preview = run(ARK, [
      'upgrade', '--root', root, '--tools', 'claude', '--no-install', '--no-strict', '--json',
    ]);
    expect(preview.status, preview.stderr || preview.stdout).toBe(0);
    const report = JSON.parse(preview.stdout) as {
      planDigest: string;
      assets: Array<{ path: string; state: string; managed: boolean; willApply: boolean }>;
    };
    expect(report.assets).toContainEqual(
      expect.objectContaining({
        path: '.claude/skills/ark-upgrade/SKILL.md',
        state: 'stale',
        managed: true,
        willApply: true,
      })
    );
    const applied = run(ARK, [
      'upgrade', '--root', root, '--tools', 'claude', '--no-install', '--no-strict', '--apply',
      '--plan-digest', report.planDigest, '--json',
    ]);
    expect(applied.status, applied.stderr || applied.stdout).toBe(0);
    expect(fs.readFileSync(skill, 'utf8')).not.toBe(LEGACY_UPGRADE_SKILL);

    expect(
      classifyManagedAsset({
        recorded: null,
        currentContent: `${LEGACY_UPGRADE_SKILL}\nUser edit.\n`,
        targetContent: fs.readFileSync(skill, 'utf8'),
        kind: 'skill',
      })
    ).toMatchObject({ state: 'customized', managed: false, requiresConsent: false });
  });

  it('records exact managed identities on apply and a second preview is empty', () => {
    const root = fixture();
    const applied = applyUpgrade(root, 'claude');
    expect(applied.status, applied.stderr || applied.stdout).toBe(0);
    const first = JSON.parse(applied.stdout) as {
      applied: boolean;
      manifestPath: string;
      summary: { changed: number };
    };
    expect(first.applied).toBe(true);
    expect(first.manifestPath).toBe('ark.managed.json');
    expect(fs.existsSync(path.join(root, first.manifestPath))).toBe(true);

    const second = run(ARK, [
      'upgrade',
      '--root',
      root,
      '--tools',
      'claude',
      '--no-install',
      '--no-strict',
      '--json',
    ]);
    expect(second.status, second.stderr || second.stdout).toBe(0);
    expect((JSON.parse(second.stdout) as { summary: { changed: number } }).summary.changed).toBe(0);
  });

  it('binds apply to the exact preview when package-manager templates change', () => {
    const root = fixture();
    expect(applyUpgrade(root, 'claude').status).toBe(0);
    const preview = run(ARK, [
      'upgrade', '--root', root, '--tools', 'claude', '--no-install', '--no-strict', '--json',
    ]);
    expect(preview.status, preview.stderr || preview.stdout).toBe(0);
    const { planDigest, nextCommand } = JSON.parse(preview.stdout) as {
      planDigest: string;
      nextCommand: string;
    };
    expect(nextCommand).toContain(`--plan-digest ${planDigest}`);

    const settings = path.join(root, '.claude/settings.json');
    const before = digest(settings);
    fs.rmSync(path.join(root, 'package-lock.json'));
    write(root, 'pnpm-lock.yaml', 'lockfileVersion: 9\n');
    const staleApply = run(ARK, [
      'upgrade', '--root', root, '--tools', 'claude', '--no-install', '--no-strict', '--apply',
      '--plan-digest', planDigest, '--json',
    ]);

    expect(staleApply.status).toBe(2);
    expect(staleApply.stderr).toMatch(/plan digest mismatch/);
    expect(digest(settings)).toBe(before);
  });

  it('refuses an unbound apply even when the candidate has no conflicts', () => {
    const root = fixture();
    const result = run(ARK, [
      'upgrade', '--root', root, '--tools', 'claude', '--no-install', '--no-strict', '--apply', '--json',
    ]);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/plan digest mismatch/);
    expect(fs.existsSync(path.join(root, 'ark.managed.json'))).toBe(false);
  });

  it('does not adopt or overwrite an unproven collision', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z06-collision-'));
    write(root, 'package.json', '{"name":"z06-collision","private":true}\n');
    write(root, 'package-lock.json', '{}\n');
    write(root, 'ark.config.json', '{"include":["src"],"layers":[],"rules":[]}\n');
    write(root, 'src/unrelated.ts', 'export const untouched = true;\n');
    write(root, '.claude/settings.json', '{"userOwned":true}\n');
    const collision = path.join(root, '.claude/settings.json');
    const collisionBefore = digest(collision);
    const sourceBefore = snapshot(path.join(root, 'src'));

    const result = applyUpgrade(root, 'claude');
    expect(result.status, result.stderr || result.stdout).toBe(0);
    const report = JSON.parse(result.stdout) as {
      assets: Array<{ path: string; state: string; managed: boolean; requiresConsent: boolean }>;
    };
    expect(report.assets).toContainEqual(
      expect.objectContaining({
        path: '.claude/settings.json',
        state: 'customized',
        managed: false,
        requiresConsent: false,
      })
    );
    expect(digest(collision)).toBe(collisionBefore);
    expect(snapshot(path.join(root, 'src'))).toEqual(sourceBefore);
  });

  it('refuses to adopt a current asset that changes after preview', () => {
    const root = fixture();
    const plan = planManagedUpgrade(root, { tools: 'claude' });
    fs.appendFileSync(path.join(root, '.claude/settings.json'), '\n');

    expect(() => applyManagedUpgrade(root, plan, plan.planDigest)).toThrow(/changed after preview/);
    expect(fs.existsSync(path.join(root, 'ark.managed.json'))).toBe(false);
  });

  it('rejects a hard-linked managed target without changing its external alias', () => {
    const root = fixture();
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z06-hardlink-'));
    const alias = path.join(external, 'shared-agents.md');
    const agents = path.join(root, 'AGENTS.md');
    fs.copyFileSync(agents, alias);
    fs.rmSync(agents);
    fs.linkSync(alias, agents);
    const before = digest(alias);

    const result = run(ARK, [
      'upgrade', '--root', root, '--tools', 'claude', '--no-install', '--no-strict', '--apply', '--json',
    ]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('hard-linked');
    expect(digest(alias)).toBe(before);
    expect(fs.existsSync(path.join(root, 'ark.managed.json'))).toBe(false);
  });

  it.runIf(process.platform !== 'win32')(
    'revalidates each created parent before staging managed bytes',
    () => {
      const root = fixture();
      fs.rmSync(path.join(root, '.github'), { recursive: true, force: true });
      const plan = planManagedUpgrade(root, { tools: 'claude' });
      const external = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z06-parent-swap-'));
      const swappedParent = path.join(root, '.github');
      const mkdirSync = fs.mkdirSync.bind(fs);
      const mkdir = vi.spyOn(fs, 'mkdirSync').mockImplementation((directory, options) => {
        const result = mkdirSync(directory, options);
        if (path.resolve(String(directory)) === swappedParent) {
          fs.rmdirSync(swappedParent);
          fs.symlinkSync(external, swappedParent, 'dir');
        }
        return result;
      });

      try {
        expect(() => applyManagedUpgrade(root, plan, plan.planDigest)).toThrow(/crosses symlink/);
      } finally {
        mkdir.mockRestore();
      }
      expect(fs.readdirSync(external)).toEqual([]);
      expect(fs.existsSync(path.join(root, 'ark.managed.json'))).toBe(false);
    }
  );

  it.runIf(process.platform !== 'win32')(
    'rejects FIFO targets and manifests without blocking on a read',
    () => {
      for (const relativePath of ['ark.managed.json', '.claude/settings.json']) {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z06-fifo-'));
        write(root, 'package.json', '{"name":"z06-fifo","private":true}\n');
        write(root, 'package-lock.json', '{}\n');
        write(root, 'ark.config.json', '{"include":["src"],"layers":[],"rules":[]}\n');
        write(root, 'src/unrelated.ts', 'export const untouched = true;\n');
        const fifo = path.join(root, relativePath);
        fs.mkdirSync(path.dirname(fifo), { recursive: true });
        expect(spawnSync('mkfifo', [fifo]).status).toBe(0);

        const result = spawnSync(
          process.execPath,
          [ARK, 'upgrade', '--root', root, '--no-install', '--no-strict', '--json'],
          { encoding: 'utf8', timeout: 2_000 }
        );
        expect(result.signal).toBeNull();
        expect(result.status).toBe(2);
        expect(result.stderr).toMatch(/regular|managed path/);
      }
    }
  );

  it('updates only the managed Codex table and preserves adjacent user TOML tables', () => {
    const root = fixture('codex');
    const first = applyUpgrade(root, 'codex');
    expect(first.status, first.stderr || first.stdout).toBe(0);

    const configFile = path.join(root, '.codex/config.toml');
    const desired = codexPrimaryTable(fs.readFileSync(configFile, 'utf8'))?.block;
    expect(desired).toBeTruthy();
    const old = desired!.replace(/arkgate-mcp/g, 'ark-mcp');
    const userTable = '[features]\nexperimental = true\n';
    const secondary =
      '["mcp_servers" . "ark_other"]\ncommand = "npx"\nargs = ["other"]\n';
    fs.writeFileSync(
      configFile,
      `# Disabled example: [mcp_servers.ark]\n${old}\n${userTable}\n${secondary}`
    );
    expect(codexPrimaryTable(fs.readFileSync(configFile, 'utf8'))?.block).toBe(old);

    const manifestFile = path.join(root, 'ark.managed.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as {
      assets: Array<{ path: string; baseHash: string; contentIdentity: string }>;
    };
    const entry = manifest.assets.find((asset) => asset.path === '.codex/config.toml');
    expect(entry).toBeTruthy();
    entry!.baseHash = contentDigest(old);
    entry!.contentIdentity = managedContentIdentity(old);
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

    const applied = applyUpgrade(root, 'codex');
    expect(applied.status, applied.stderr || applied.stdout).toBe(0);
    const after = fs.readFileSync(configFile, 'utf8');
    expect(codexPrimaryTable(after)?.block).toBe(desired);
    expect(after).toContain(userTable);
    expect(after).toContain(secondary);
    expect(after).toContain('# Disabled example: [mcp_servers.ark]');
  });

  it.each([
    'mcp_servers.ark.command = "npx"\nmcp_servers.ark.args = ["custom"]\n',
    '[mcp_servers]\nark = { command = "npx", args = ["custom"] }\n',
  ])('preserves an unparsed but plausible Codex Ark definition: %s', (toml) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z06-codex-toml-'));
    write(root, 'package.json', '{"name":"z06-codex-toml","private":true}\n');
    write(root, 'package-lock.json', '{}\n');
    write(root, 'ark.config.json', '{"include":["src"],"layers":[],"rules":[]}\n');
    write(root, 'src/unrelated.ts', 'export const untouched = true;\n');
    write(root, '.codex/config.toml', toml);
    const before = snapshot(root);

    const result = applyUpgrade(root, 'codex', { acceptConflicts: true });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    const report = JSON.parse(result.stdout) as {
      assets: Array<{ path: string; state: string; managed: boolean; reason?: string }>;
    };
    expect(report.assets).toContainEqual(
      expect.objectContaining({
        path: '.codex/config.toml',
        state: 'customized',
        managed: false,
        reason: 'unparsed managed TOML scope preserved',
      })
    );
    expect(fs.readFileSync(path.join(root, '.codex/config.toml'), 'utf8')).toBe(toml);
    expect(snapshot(path.join(root, 'src'))).toEqual(
      Object.fromEntries(
        Object.entries(before)
          .filter(([relativePath]) => relativePath.startsWith('src/'))
          .map(([relativePath, value]) => [relativePath.slice(4), value])
      )
    );
  });

  it.each(Object.entries(HOST_ASSETS))(
    '%s preserves customization, requires deleted-asset consent, and ignores similar user files',
    (host, hostAsset) => {
      const root = fixture(host);
      const skillPath = SKILL_PATHS[host as keyof typeof HOST_ASSETS];
      if (skillPath) {
        const skill = path.join(root, skillPath);
        fs.writeFileSync(
          skill,
          fs.readFileSync(skill, 'utf8').replace(/^arkVersion:.*$/m, 'arkVersion: 0.0.0-old')
        );
      }
      const unrelated = `${hostAsset}.user-owned`;
      write(root, unrelated, 'similarly named user file\n');

      const adopted = applyUpgrade(root, host);
      expect(adopted.status, adopted.stderr || adopted.stdout).toBe(0);

      fs.appendFileSync(path.join(root, 'AGENTS.md'), '\nUser-owned local instructions.\n');
      fs.rmSync(path.join(root, '.github/workflows/ark-check.yml'));
      const sourceBefore = snapshot(path.join(root, 'src'));
      const unrelatedBefore = digest(path.join(root, unrelated));

      const blocked = applyUpgrade(root, host);
      expect(blocked.status).toBe(1);
      const blockedReport = JSON.parse(blocked.stdout) as {
        blocked: boolean;
        assets: Array<{ path: string; state: string; managed: boolean }>;
      };
      expect(blockedReport.blocked).toBe(true);
      expect(blockedReport.assets).toContainEqual(
        expect.objectContaining({ path: 'AGENTS.md', state: 'customized', managed: true })
      );
      expect(blockedReport.assets).toContainEqual(
        expect.objectContaining({ path: '.github/workflows/ark-check.yml', state: 'missing' })
      );
      if (skillPath) {
        expect(blockedReport.assets).toContainEqual(
          expect.objectContaining({ path: skillPath, state: 'current' })
        );
      }

      const accepted = applyUpgrade(root, host, { acceptConflicts: true });
      expect(accepted.status, accepted.stderr || accepted.stdout).toBe(0);
      expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toContain(
        'User-owned local instructions.'
      );
      expect(fs.existsSync(path.join(root, '.github/workflows/ark-check.yml'))).toBe(true);
      expect(digest(path.join(root, unrelated))).toBe(unrelatedBefore);
      expect(snapshot(path.join(root, 'src'))).toEqual(sourceBefore);

      const second = run(ARK, [
        'upgrade', '--root', root, '--tools', host, '--no-install', '--no-strict', '--json',
      ]);
      expect(second.status, second.stderr || second.stdout).toBe(0);
      expect((JSON.parse(second.stdout) as { summary: { changed: number } }).summary.changed).toBe(0);
    }
  );
});
