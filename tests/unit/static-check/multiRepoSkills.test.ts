import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  assessCodexSkillParity,
  detectCodexHomeGap,
  detectSkillGaps,
  isValidSemver,
  isVersionOlder,
  planSkillInstall,
  printSkillAndCodexGapHints,
  skillGapsForActiveHost,
  skillTemplates,
  stampSkill,
} from '../../../bin/lib/skill-install.mjs';
import {
  HOME_SKILL_CATALOG,
  HOME_SKILL_PENDING_CATALOG,
  installRepoSkillFile,
  installSkillCatalog,
  installSkillFile,
  skillInstallLine,
  skillInstallNote,
} from '../../../bin/lib/skill-write.mjs';

const ARK_CHECK = path.resolve('bin/ark-check.mjs');
const PACKAGE_VERSION = JSON.parse(
  fs.readFileSync(path.resolve('package.json'), 'utf8')
).version as string;

function runInstall(root: string, codexHome: string, extra: string[] = []) {
  return spawnSync(
    'node',
    [
      ARK_CHECK,
      '--install-agent-gates',
      '--root',
      root,
      '--tools',
      'codex',
      '--skills-only',
      '--codex-home',
      ...extra,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, CODEX_HOME: codexHome },
    }
  );
}

function homeSkill(codexHome: string, name = 'ark-fix') {
  return path.join(codexHome, 'skills', name, 'SKILL.md');
}

function repoSkill(root: string, name = 'ark-fix') {
  return path.join(root, '.agents', 'skills', name, 'SKILL.md');
}

function catalogSkills(version: string, bodies: Record<string, string>) {
  return Object.entries(bodies).map(([name, body]) => [
    name,
    stampSkill(`---\nname: ${name}\n---\n${body}\n`, version),
  ]);
}

function installCatalog(
  codexHome: string,
  version: string,
  bodies: Record<string, string>,
  force = true
) {
  return installSkillCatalog({
    directory: path.join(codexHome, 'skills'),
    skills: catalogSkills(version, bodies),
    packageVersion: version,
    force,
    scope: 'home',
  });
}

describe('multi-repo skill installation', () => {
  it('stamps CRLF skill frontmatter without changing its line ending', () => {
    const crlfSkill = '---\r\nname: ark-test\r\n---\r\nbody\r\n';
    expect(stampSkill(crlfSkill, '4.2.0')).toBe(
      '---\r\nname: ark-test\r\narkVersion: 4.2.0\r\n---\r\nbody\r\n'
    );
  });

  it('uses skill body identity and protects the shared home from downgrade', () => {
    const template = '---\nname: ark-test\n---\nbody\n';
    const currentBodyOldStamp = stampSkill(template, '1.0.0');
    const currentBodyNewStamp = stampSkill(template, '2.0.0');
    expect(
      planSkillInstall({
        existingContent: currentBodyOldStamp,
        targetContent: currentBodyNewStamp,
        packageVersion: '2.0.0',
        force: true,
        scope: 'home',
      })
    ).toMatchObject({ action: 'skip', reason: 'content-current' });

    const futureHome = stampSkill(`${template}\nfuture capability\n`, '9.0.0');
    expect(
      planSkillInstall({
        existingContent: futureHome,
        targetContent: currentBodyNewStamp,
        packageVersion: '2.0.0',
        force: true,
        scope: 'home',
      })
    ).toMatchObject({
      action: 'skip',
      reason: 'newer-home-version',
      downgradeBlocked: true,
    });

    // Repo catalogs are isolated and intentionally follow that repo's package.
    expect(
      planSkillInstall({
        existingContent: futureHome,
        targetContent: currentBodyNewStamp,
        packageVersion: '2.0.0',
        force: true,
        scope: 'repo',
      })
    ).toMatchObject({ action: 'write', reason: 'content-update' });
  });

  it('orders prereleases with SemVer precedence and validates catalog versions strictly', () => {
    expect(isVersionOlder('2.0.0-alpha', '2.0.0-beta')).toBe(true);
    expect(isVersionOlder('2.0.0-beta', '2.0.0-rc.1')).toBe(true);
    expect(isVersionOlder('2.0.0-rc.1', '2.0.0')).toBe(true);
    expect(isVersionOlder('2.0.0-alpha.2', '2.0.0-alpha.10')).toBe(true);
    expect(isVersionOlder('2.0.0+build.1', '2.0.0+build.2')).toBe(false);
    expect(isVersionOlder('2.0.0+build.2', '2.0.0+build.1')).toBe(false);
    expect(isVersionOlder('1.7', '1.7.5')).toBe(true);
    expect(isValidSemver('2.0.0-beta.1+build.7')).toBe(true);
    expect(isValidSemver('2.0')).toBe(false);
    expect(isValidSemver('2.0.0-beta.01')).toBe(false);
  });

  it('keeps repo catalogs isolated and does not rewrite current shared-home bytes', () => {
    const repoA = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-multi-repo-a-'));
    const repoB = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-multi-repo-b-'));
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-multi-home-'));

    const first = runInstall(repoA, codexHome, ['--force']);
    expect(first.status, first.stderr || first.stdout).toBe(0);
    const shared = homeSkill(codexHome);
    const repoAFile = repoSkill(repoA);
    expect(fs.existsSync(shared)).toBe(true);
    expect(fs.existsSync(repoAFile)).toBe(true);

    const repoACustom = `${fs.readFileSync(repoAFile, 'utf8')}\n# repo A customization\n`;
    fs.writeFileSync(repoAFile, repoACustom);
    const stableMtime = new Date('2024-01-02T03:04:05.000Z');
    fs.utimesSync(shared, stableMtime, stableMtime);
    const catalog = path.join(codexHome, 'skills', HOME_SKILL_CATALOG);
    fs.utimesSync(catalog, stableMtime, stableMtime);

    const second = runInstall(repoB, codexHome, ['--force']);
    expect(second.status, second.stderr || second.stdout).toBe(0);
    expect(fs.readFileSync(repoAFile, 'utf8')).toBe(repoACustom);
    expect(fs.existsSync(repoSkill(repoB))).toBe(true);
    expect(Math.trunc(fs.statSync(shared).mtimeMs / 1000)).toBe(
      Math.trunc(stableMtime.getTime() / 1000)
    );
    expect(Math.trunc(fs.statSync(catalog).mtimeMs / 1000)).toBe(
      Math.trunc(stableMtime.getTime() / 1000)
    );
    expect(second.stdout).toContain('scope=home-shared');
    expect(second.stdout).toContain(`source=arkgate@${PACKAGE_VERSION}`);
    expect(second.stdout).toContain('body current');
    expect(second.stdout).toContain('no write');
  });

  it('blocks an older repo from downgrading shared home even with --force', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-multi-old-repo-'));
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-multi-new-home-'));
    const templates = Object.fromEntries(skillTemplates());
    const file = homeSkill(codexHome);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const future = stampSkill(`${templates['ark-fix']}\n# future home capability\n`, '99.0.0');
    fs.writeFileSync(file, future);

    const result = runInstall(root, codexHome, ['--force']);
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(fs.readFileSync(file, 'utf8')).toBe(future);
    expect(result.stdout).toContain('CONFLICT catalog=99.0.0');
    expect(result.stdout).toContain('entire home update and retirements blocked');
  });

  it('preserves a customized shared-home skill without --force', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-multi-custom-repo-'));
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-multi-custom-home-'));
    const file = homeSkill(codexHome);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const custom = `---\nname: ark-fix\narkVersion: ${PACKAGE_VERSION}\n---\ncustom operator workflow\n`;
    fs.writeFileSync(file, custom);

    const result = runInstall(root, codexHome);
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(fs.readFileSync(file, 'utf8')).toBe(custom);
    expect(result.stdout).toContain('CONFLICT body differs');
    expect(result.stdout).toContain('preserved without --force');

    const forced = runInstall(root, codexHome, ['--force']);
    expect(forced.status, forced.stderr || forced.stdout).toBe(0);
    expect(fs.readFileSync(file, 'utf8')).not.toBe(custom);
    expect(fs.readFileSync(file, 'utf8')).toContain('name: ark-fix');
  });

  it('blocks the entire catalog in new-to-old order, including reintroductions', () => {
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-order-new-old-'));
    const newest = installCatalog(codexHome, '9.0.0', {
      'ark-current': 'new capability',
    });
    expect(newest.some((result) => result.status === 'failed')).toBe(false);
    const current = homeSkill(codexHome, 'ark-current');
    const newBytes = fs.readFileSync(current, 'utf8');

    const older = installCatalog(codexHome, '2.0.0', {
      'ark-current': 'old capability',
      'ark-retired': 'old removed capability',
    });
    expect(older).toHaveLength(1);
    expect(older[0]).toMatchObject({ status: 'skipped' });
    expect(older[0].note).toContain('entire home update and retirements blocked');
    expect(fs.readFileSync(current, 'utf8')).toBe(newBytes);
    expect(fs.existsSync(homeSkill(codexHome, 'ark-retired'))).toBe(false);
    expect(
      JSON.parse(
        fs.readFileSync(path.join(codexHome, 'skills', HOME_SKILL_CATALOG), 'utf8')
      ).packageVersion
    ).toBe('9.0.0');
  });

  it('advances old-to-new and removes only identity-proven retired skills', () => {
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-order-old-new-'));
    installCatalog(codexHome, '1.0.0', {
      'ark-current': 'old capability',
      'ark-retired': 'retire me',
    });
    const retired = homeSkill(codexHome, 'ark-retired');
    expect(fs.existsSync(retired)).toBe(true);

    const advanced = installCatalog(codexHome, '2.0.0', {
      'ark-current': 'new capability',
    });
    expect(advanced).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayPath: 'ark-retired/SKILL.md',
          status: 'removed',
        }),
      ])
    );
    expect(fs.existsSync(retired)).toBe(false);
    expect(fs.readFileSync(homeSkill(codexHome, 'ark-current'), 'utf8')).toContain(
      'new capability'
    );
  });

  it('preserves a customized retired skill and releases its managed ownership', () => {
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-retired-custom-'));
    installCatalog(codexHome, '1.0.0', {
      'ark-current': 'old capability',
      'ark-retired': 'retire me',
    });
    const retired = homeSkill(codexHome, 'ark-retired');
    fs.appendFileSync(retired, '# local customization\n');

    const advanced = installCatalog(codexHome, '2.0.0', {
      'ark-current': 'new capability',
    });
    expect(fs.existsSync(retired)).toBe(true);
    expect(
      advanced.find((result) => result.displayPath === 'ark-retired/SKILL.md')
    ).toMatchObject({ status: 'skipped' });
    const catalog = JSON.parse(
      fs.readFileSync(path.join(codexHome, 'skills', HOME_SKILL_CATALOG), 'utf8')
    );
    expect(catalog.skills.some((entry: { name: string }) => entry.name === 'ark-retired')).toBe(
      false
    );
  });

  it('requires --force before removing an identity-proven retired skill', () => {
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-retired-force-'));
    installCatalog(codexHome, '1.0.0', {
      'ark-current': 'same capability',
      'ark-retired': 'retire me',
    });
    const retired = homeSkill(codexHome, 'ark-retired');

    const preserved = installCatalog(
      codexHome,
      '2.0.0',
      { 'ark-current': 'same capability' },
      false
    );
    expect(fs.existsSync(retired)).toBe(true);
    expect(
      preserved.find((result) => result.displayPath === 'ark-retired/SKILL.md')
    ).toMatchObject({ status: 'skipped', note: expect.stringContaining('without --force') });
    const pendingCatalog = JSON.parse(
      fs.readFileSync(path.join(codexHome, 'skills', HOME_SKILL_CATALOG), 'utf8')
    );
    expect(
      pendingCatalog.skills.some((entry: { name: string }) => entry.name === 'ark-retired')
    ).toBe(true);

    installCatalog(codexHome, '2.0.0', { 'ark-current': 'same capability' }, true);
    expect(fs.existsSync(retired)).toBe(false);
  });

  it('fails safe on corrupt catalog metadata before mutating home skills', () => {
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-corrupt-home-'));
    const skillsDir = path.join(codexHome, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, HOME_SKILL_CATALOG), '{not-json\n');

    const result = installCatalog(codexHome, '3.0.0', {
      'ark-current': 'must not be written',
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ status: 'failed' });
    expect(result[0].message).toContain('no home skills changed');
    expect(fs.existsSync(homeSkill(codexHome, 'ark-current'))).toBe(false);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-corrupt-repo-'));
    const cli = runInstall(root, codexHome, ['--force']);
    expect(cli.status).toBe(1);
    expect(cli.stdout).toContain('unreadable or invalid JSON');
    expect(cli.stderr).toContain('INSTALL PARTIAL');
  });

  it('reports every install decision with scope and provenance', () => {
    const base = {
      scope: 'home',
      sourceVersion: '2.0.0',
      installedVersion: '1.0.0',
    };
    expect(skillInstallNote({ ...base, reason: 'content-current' })).toContain('no write');
    expect(
      skillInstallNote({
        ...base,
        installedVersion: '9.0.0',
        reason: 'newer-home-version',
      })
    ).toContain('downgrade blocked');
    expect(
      skillInstallNote({ ...base, sourceVersion: null, reason: 'unknown-source-version' })
    ).toContain('source version unknown');
    expect(skillInstallNote({ ...base, reason: 'existing-preserved' })).toContain(
      'preserved without --force'
    );
    expect(skillInstallNote({ ...base, reason: 'missing' })).toContain('missing');
    expect(skillInstallNote({ ...base, reason: 'content-update' })).toContain('body update');

    expect(
      skillInstallLine({
        displayPath: 'ark-test/SKILL.md',
        status: 'removed',
        note: 'retired',
      })
    ).toContain('removed');
    expect(
      skillInstallLine({
        displayPath: 'ark-test/SKILL.md',
        status: 'failed',
        message: 'permission denied',
      })
    ).toContain('FAILED');
    expect(
      skillInstallLine({
        displayPath: 'ark-test/SKILL.md',
        status: 'written',
        note: 'installed',
      })
    ).toContain('wrote');
    expect(
      skillInstallLine({
        displayPath: 'ark-test/SKILL.md',
        status: 'skipped',
        note: 'current',
      })
    ).toContain('skipped');
  });

  it('applies repo-local force independently and fails closed on non-regular targets', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-repo-skill-file-'));
    const target = stampSkill('---\nname: ark-test\n---\nnew\n', '2.0.0');
    const relativePath = '.agents/skills/ark-test/SKILL.md';
    expect(
      installRepoSkillFile(root, relativePath, target, '2.0.0', false)
    ).toMatchObject({ status: 'written' });
    const repoFile = path.join(root, relativePath);
    const stableMtime = new Date('2024-01-02T03:04:05.000Z');
    fs.utimesSync(repoFile, stableMtime, stableMtime);
    expect(
      installRepoSkillFile(root, relativePath, target, '2.0.0', true)
    ).toMatchObject({ status: 'skipped', skillPlan: { reason: 'content-current' } });
    expect(Math.trunc(fs.statSync(repoFile).mtimeMs / 1000)).toBe(
      Math.trunc(stableMtime.getTime() / 1000)
    );
    fs.writeFileSync(repoFile, 'custom\n');
    expect(
      installRepoSkillFile(root, relativePath, target, '2.0.0', false)
    ).toMatchObject({ status: 'skipped', skillPlan: { reason: 'existing-preserved' } });
    expect(
      installRepoSkillFile(root, relativePath, target, '2.0.0', true)
    ).toMatchObject({ status: 'written' });

    const homeTarget = path.join(root, 'home', 'ark-test', 'SKILL.md');
    fs.mkdirSync(homeTarget, { recursive: true });
    expect(
      installSkillFile({
        root: path.join(root, 'home'),
        file: homeTarget,
        relativePath: homeTarget,
        targetContent: target,
        packageVersion: '2.0.0',
        force: true,
        scope: 'home',
      })
    ).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('not a single-link regular file'),
    });

    const escaped = path.join(
      path.dirname(root),
      `${path.basename(root)}-escaped`,
      'SKILL.md'
    );
    expect(
      installRepoSkillFile(
        root,
        path.relative(root, escaped),
        target,
        '2.0.0',
        true
      )
    ).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('escapes its catalog root'),
    });
    expect(fs.existsSync(escaped)).toBe(false);

    expect(
      installSkillFile({
        root: path.join(root, 'home-valid-version'),
        file: path.join(root, 'home-valid-version', 'ark-test', 'SKILL.md'),
        relativePath: 'ark-test/SKILL.md',
        targetContent: target,
        packageVersion: '2.0',
        force: true,
        scope: 'home',
      })
    ).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('valid SemVer'),
    });
  });

  it('rejects invalid catalog shapes, absent versions, active locks, and write failures', () => {
    const noVersionHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-home-no-version-'));
    expect(
      installSkillCatalog({
        directory: path.join(noVersionHome, 'skills'),
        skills: [],
        packageVersion: null,
        force: true,
        scope: 'home',
      })
    ).toEqual([
      expect.objectContaining({
        status: 'failed',
        message: expect.stringContaining('version is unavailable'),
      }),
    ]);

    const blockedDirectory = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ark-home-bad-dir-')),
      'skills'
    );
    fs.writeFileSync(blockedDirectory, 'not a directory\n');
    expect(
      installSkillCatalog({
        directory: blockedDirectory,
        skills: catalogSkills('2.0.0', { 'ark-test': 'body' }),
        packageVersion: '2.0.0',
        force: true,
        scope: 'home',
      })[0]
    ).toMatchObject({ status: 'failed' });

    const lockedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-home-locked-'));
    const lockedSkills = path.join(lockedHome, 'skills');
    fs.mkdirSync(lockedSkills);
    fs.writeFileSync(path.join(lockedSkills, '.arkgate-install.lock'), 'active\n');
    expect(
      installCatalog(lockedHome, '2.0.0', { 'ark-test': 'body' })[0].message
    ).toContain('another home skill install is active');

    for (const invalid of [
      JSON.stringify({ schemaVersion: '2.0', packageVersion: '2.0.0', skills: [] }),
      JSON.stringify({ schemaVersion: '1.0', packageVersion: '2.0', skills: [] }),
      JSON.stringify({
        schemaVersion: '1.0',
        packageVersion: '2.0.0',
        skills: [{ name: '../escape', contentIdentity: 'bad' }],
      }),
    ]) {
      const invalidHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-home-invalid-'));
      const skillsDir = path.join(invalidHome, 'skills');
      fs.mkdirSync(skillsDir);
      fs.writeFileSync(path.join(skillsDir, HOME_SKILL_CATALOG), invalid);
      const result = installCatalog(invalidHome, '3.0.0', { 'ark-test': 'body' });
      expect(result[0]).toMatchObject({ status: 'failed' });
      expect(fs.existsSync(homeSkill(invalidHome, 'ark-test'))).toBe(false);
    }

    const failedSkillHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-home-failed-skill-'));
    fs.mkdirSync(path.join(failedSkillHome, 'skills'));
    fs.writeFileSync(path.join(failedSkillHome, 'skills', 'ark-test'), 'blocks directory\n');
    expect(
      installCatalog(failedSkillHome, '2.0.0', { 'ark-test': 'body' })[0]
    ).toMatchObject({ status: 'failed' });

    const duplicateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-home-duplicate-'));
    expect(
      installSkillCatalog({
        directory: path.join(duplicateHome, 'skills'),
        skills: [
          ['ark-test', 'first'],
          ['ark-test', 'second'],
        ],
        packageVersion: '2.0.0',
        force: true,
        scope: 'home',
      })[0]
    ).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('invalid or duplicate'),
    });
  });

  it('keeps retired directories with user siblings and makes direct repeats idempotent', () => {
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-retired-sibling-'));
    installCatalog(codexHome, '1.0.0', {
      'ark-current': 'old',
      'ark-retired': 'retire',
    });
    const retiredDir = path.dirname(homeSkill(codexHome, 'ark-retired'));
    fs.writeFileSync(path.join(retiredDir, 'notes.txt'), 'user sibling\n');
    installCatalog(codexHome, '2.0.0', { 'ark-current': 'new' });
    expect(fs.existsSync(path.join(retiredDir, 'notes.txt'))).toBe(true);
    expect(fs.existsSync(homeSkill(codexHome, 'ark-retired'))).toBe(false);

    const catalog = path.join(codexHome, 'skills', HOME_SKILL_CATALOG);
    const stableMtime = new Date('2024-01-02T03:04:05.000Z');
    fs.utimesSync(catalog, stableMtime, stableMtime);
    const repeat = installCatalog(codexHome, '2.0.0', { 'ark-current': 'new' });
    expect(repeat.at(-1)).toMatchObject({
      displayPath: HOME_SKILL_CATALOG,
      status: 'skipped',
    });
    expect(Math.trunc(fs.statSync(catalog).mtimeMs / 1000)).toBe(
      Math.trunc(stableMtime.getTime() / 1000)
    );
  });

  it('rejects parent symlinks for writes and retirements without touching their targets', () => {
    const externalWrite = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-external-write-'));
    const externalWriteSkill = path.join(externalWrite, 'SKILL.md');
    fs.writeFileSync(externalWriteSkill, 'external sentinel\n');
    const writeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-symlink-write-'));
    const writeRoot = path.join(writeHome, 'skills');
    fs.mkdirSync(writeRoot);
    fs.symlinkSync(
      externalWrite,
      path.join(writeRoot, 'ark-test'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );

    const blockedWrite = installCatalog(writeHome, '2.0.0', {
      'ark-test': 'must remain contained',
    });
    expect(blockedWrite[0]).toMatchObject({
      status: 'failed',
      message: expect.stringMatching(/symlink|junction/i),
    });
    expect(fs.readFileSync(externalWriteSkill, 'utf8')).toBe('external sentinel\n');
    expect(fs.existsSync(path.join(writeRoot, HOME_SKILL_CATALOG))).toBe(false);

    const retireHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-symlink-retire-'));
    installCatalog(retireHome, '1.0.0', {
      'ark-current': 'old',
      'ark-retired': 'retire exact body',
    });
    const retired = homeSkill(retireHome, 'ark-retired');
    const exactManagedBytes = fs.readFileSync(retired, 'utf8');
    const retiredDirectory = path.dirname(retired);
    fs.unlinkSync(retired);
    fs.rmdirSync(retiredDirectory);
    const externalRetire = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-external-retire-'));
    const externalRetireSkill = path.join(externalRetire, 'SKILL.md');
    fs.writeFileSync(externalRetireSkill, exactManagedBytes);
    fs.symlinkSync(
      externalRetire,
      retiredDirectory,
      process.platform === 'win32' ? 'junction' : 'dir'
    );

    const blockedRetirement = installCatalog(
      retireHome,
      '2.0.0',
      { 'ark-current': 'new' },
      true
    );
    expect(
      blockedRetirement.find((result) => result.displayPath === 'ark-retired/SKILL.md')
    ).toMatchObject({
      status: 'failed',
      message: expect.stringMatching(/symlink|junction/i),
    });
    expect(fs.readFileSync(externalRetireSkill, 'utf8')).toBe(exactManagedBytes);
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(retireHome, 'skills', HOME_SKILL_CATALOG),
          'utf8'
        )
      ).packageVersion
    ).toBe('1.0.0');
  });

  it.runIf(process.platform !== 'win32')(
    'does not treat an unreadable existing skill as missing',
    () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-unreadable-skill-'));
      const relativePath = '.agents/skills/ark-test/SKILL.md';
      const file = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, 'operator-owned bytes\n');
      fs.chmodSync(file, 0o000);
      try {
        const result = installRepoSkillFile(
          root,
          relativePath,
          stampSkill('---\nname: ark-test\n---\npackage bytes\n', '2.0.0'),
          '2.0.0',
          true
        );
        expect(result).toMatchObject({
          status: 'failed',
          message: expect.stringContaining('unreadable'),
        });
      } finally {
        fs.chmodSync(file, 0o600);
      }
      expect(fs.readFileSync(file, 'utf8')).toBe('operator-owned bytes\n');
    }
  );

  it('keeps the old complete file when an atomic replacement cannot commit', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-atomic-skill-'));
    const relativePath = '.agents/skills/ark-test/SKILL.md';
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'old complete bytes\n');
    const originalRename = fs.renameSync;
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      if (target === file) throw Object.assign(new Error('simulated rename failure'), { code: 'EIO' });
      return originalRename(source, target);
    });
    try {
      expect(
        installRepoSkillFile(
          root,
          relativePath,
          stampSkill('---\nname: ark-test\n---\nnew complete bytes\n', '2.0.0'),
          '2.0.0',
          true
        )
      ).toMatchObject({
        status: 'failed',
        message: expect.stringContaining('simulated rename failure'),
      });
    } finally {
      rename.mockRestore();
    }
    expect(fs.readFileSync(file, 'utf8')).toBe('old complete bytes\n');
    expect(
      fs.readdirSync(path.dirname(file)).some((name) => name.endsWith('.tmp'))
    ).toBe(false);
  });

  it('keeps the prior catalog complete when its atomic replacement cannot commit', () => {
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-atomic-catalog-'));
    installCatalog(codexHome, '1.0.0', { 'ark-test': 'old body' });
    const catalog = path.join(codexHome, 'skills', HOME_SKILL_CATALOG);
    const priorCatalog = fs.readFileSync(catalog, 'utf8');
    const originalRename = fs.renameSync;
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      if (target === catalog) {
        throw Object.assign(new Error('simulated catalog rename failure'), { code: 'EIO' });
      }
      return originalRename(source, target);
    });
    try {
      const result = installCatalog(codexHome, '2.0.0', { 'ark-test': 'new body' });
      expect(result.at(-1)).toMatchObject({
        status: 'failed',
        message: expect.stringContaining('simulated catalog rename failure'),
      });
    } finally {
      rename.mockRestore();
    }
    expect(fs.readFileSync(catalog, 'utf8')).toBe(priorCatalog);
    expect(
      fs.readdirSync(path.dirname(catalog)).some((name) => name.endsWith('.tmp'))
    ).toBe(false);
  });

  it('keeps an interrupted retirement monotonic until a same-version retry commits', () => {
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-journal-recovery-'));
    installCatalog(codexHome, '1.0.0', {
      'ark-current': 'same capability',
      'ark-retired': 'retire me',
    });
    const skillsDir = path.join(codexHome, 'skills');
    const catalog = path.join(skillsDir, HOME_SKILL_CATALOG);
    const pending = path.join(skillsDir, HOME_SKILL_PENDING_CATALOG);
    const retired = homeSkill(codexHome, 'ark-retired');
    const originalRename = fs.renameSync;
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      if (target === catalog) {
        throw Object.assign(new Error('simulated catalog rename failure'), { code: 'EIO' });
      }
      return originalRename(source, target);
    });
    try {
      const interrupted = installCatalog(codexHome, '2.0.0', {
        'ark-current': 'same capability',
      });
      expect(interrupted.at(-1)).toMatchObject({
        displayPath: HOME_SKILL_CATALOG,
        status: 'failed',
        message: expect.stringContaining('simulated catalog rename failure'),
      });
    } finally {
      rename.mockRestore();
    }

    expect(fs.existsSync(retired)).toBe(false);
    expect(JSON.parse(fs.readFileSync(pending, 'utf8'))).toMatchObject({
      schemaVersion: '1.0',
      packageVersion: '2.0.0',
      token: expect.any(String),
    });
    expect(JSON.parse(fs.readFileSync(catalog, 'utf8')).packageVersion).toBe('1.0.0');

    const older = installCatalog(codexHome, '1.0.0', {
      'ark-current': 'same capability',
      'ark-retired': 'retire me',
    });
    expect(older).toHaveLength(1);
    expect(older[0]).toMatchObject({
      status: 'skipped',
      note: expect.stringContaining('catalog=2.0.0'),
    });
    expect(fs.existsSync(retired)).toBe(false);
    expect(fs.existsSync(pending)).toBe(true);

    const recovered = installCatalog(codexHome, '2.0.0', {
      'ark-current': 'same capability',
    });
    expect(recovered.some((result) => result.status === 'failed')).toBe(false);
    expect(JSON.parse(fs.readFileSync(catalog, 'utf8')).packageVersion).toBe('2.0.0');
    expect(fs.existsSync(retired)).toBe(false);
    expect(fs.existsSync(pending)).toBe(false);
  });

  it('does not mutate skills when the durable catalog journal cannot commit', () => {
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-journal-write-fail-'));
    installCatalog(codexHome, '1.0.0', {
      'ark-current': 'old capability',
      'ark-retired': 'retire me',
    });
    const skillsDir = path.join(codexHome, 'skills');
    const catalog = path.join(skillsDir, HOME_SKILL_CATALOG);
    const pending = path.join(skillsDir, HOME_SKILL_PENDING_CATALOG);
    const current = homeSkill(codexHome, 'ark-current');
    const retired = homeSkill(codexHome, 'ark-retired');
    const priorCurrent = fs.readFileSync(current, 'utf8');
    const priorCatalog = fs.readFileSync(catalog, 'utf8');
    const originalRename = fs.renameSync;
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      if (target === pending) {
        throw Object.assign(new Error('simulated journal rename failure'), { code: 'EIO' });
      }
      return originalRename(source, target);
    });
    try {
      const result = installCatalog(codexHome, '2.0.0', {
        'ark-current': 'new capability',
      });
      expect(result).toEqual([
        expect.objectContaining({
          displayPath: HOME_SKILL_PENDING_CATALOG,
          status: 'failed',
          message: expect.stringContaining('no home skills changed'),
        }),
      ]);
    } finally {
      rename.mockRestore();
    }

    expect(fs.readFileSync(current, 'utf8')).toBe(priorCurrent);
    expect(fs.readFileSync(catalog, 'utf8')).toBe(priorCatalog);
    expect(fs.existsSync(retired)).toBe(true);
    expect(fs.existsSync(pending)).toBe(false);
  });

  it('fails safe on a corrupt pending catalog journal before mutating skills', () => {
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-journal-corrupt-'));
    installCatalog(codexHome, '1.0.0', {
      'ark-current': 'old capability',
      'ark-retired': 'retire me',
    });
    const skillsDir = path.join(codexHome, 'skills');
    const catalog = path.join(skillsDir, HOME_SKILL_CATALOG);
    const pending = path.join(skillsDir, HOME_SKILL_PENDING_CATALOG);
    const current = homeSkill(codexHome, 'ark-current');
    const retired = homeSkill(codexHome, 'ark-retired');
    const priorCurrent = fs.readFileSync(current, 'utf8');
    const priorCatalog = fs.readFileSync(catalog, 'utf8');
    const corruptPending =
      '{"schemaVersion":"1.0","packageVersion":"9.0.0","token":"not-a-uuid"}\n';
    fs.writeFileSync(pending, corruptPending);

    const result = installCatalog(codexHome, '2.0.0', {
      'ark-current': 'new capability',
    });
    expect(result).toEqual([
      expect.objectContaining({
        displayPath: HOME_SKILL_PENDING_CATALOG,
        status: 'failed',
        message: expect.stringContaining('no home skills changed'),
      }),
    ]);
    expect(fs.readFileSync(current, 'utf8')).toBe(priorCurrent);
    expect(fs.readFileSync(catalog, 'utf8')).toBe(priorCatalog);
    expect(fs.readFileSync(pending, 'utf8')).toBe(corruptPending);
    expect(fs.existsSync(retired)).toBe(true);
  });

  it('waits for a concurrent healthy home install instead of reporting a false conflict', () => {
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-lock-retry-'));
    const skillsDir = path.join(codexHome, 'skills');
    fs.mkdirSync(skillsDir);
    const lock = path.join(skillsDir, '.arkgate-install.lock');
    const holder = spawn(
      process.execPath,
      [
        '-e',
        [
          "const fs = require('node:fs');",
          'const file = process.argv[1];',
          "fs.writeFileSync(file, `${JSON.stringify({ token: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', pid: process.pid, createdAtMs: Date.now() })}\\n`);",
          'setTimeout(() => { try { fs.unlinkSync(file); } catch {} }, 250);',
        ].join(' '),
        lock,
      ],
      { stdio: 'ignore' }
    );
    const deadline = Date.now() + 1_000;
    while (!fs.existsSync(lock) && Date.now() < deadline) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
    try {
      expect(fs.existsSync(lock)).toBe(true);
      const installed = installCatalog(codexHome, '2.0.0', { 'ark-test': 'body' });
      expect(installed.some((result) => result.status === 'failed')).toBe(false);
      expect(fs.existsSync(lock)).toBe(false);
    } finally {
      if (holder.exitCode === null) holder.kill();
    }
  });

  it('does not misreport non-contention lock creation failures as an active install', () => {
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-lock-permission-'));
    const open = vi.spyOn(fs, 'openSync').mockImplementation(() => {
      throw Object.assign(new Error('simulated lock permission denied'), { code: 'EACCES' });
    });
    try {
      const result = installCatalog(codexHome, '2.0.0', { 'ark-test': 'body' });
      expect(result[0]).toMatchObject({
        status: 'failed',
        message: expect.stringContaining('simulated lock permission denied'),
      });
      expect(result[0].message).not.toContain('another home skill install is active');
    } finally {
      open.mockRestore();
    }
  });

  it('recovers a stale dead-process lock but preserves a foreign replacement lock', () => {
    const staleHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-stale-lock-'));
    const staleSkills = path.join(staleHome, 'skills');
    fs.mkdirSync(staleSkills);
    const deadProcess = spawnSync(process.execPath, [
      '-e',
      'process.stdout.write(String(process.pid))',
    ], { encoding: 'utf8' });
    expect(deadProcess.status).toBe(0);
    const staleLock = path.join(staleSkills, '.arkgate-install.lock');
    fs.writeFileSync(
      staleLock,
      `${JSON.stringify({
        token: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        pid: Number(deadProcess.stdout),
        createdAtMs: Date.now() - 10 * 60 * 1000,
      })}\n`
    );
    const oldTime = new Date(Date.now() - 10 * 60 * 1000);
    fs.utimesSync(staleLock, oldTime, oldTime);
    const recovered = installCatalog(staleHome, '2.0.0', { 'ark-test': 'body' });
    expect(recovered.some((result) => result.status === 'failed')).toBe(false);
    expect(fs.existsSync(staleLock)).toBe(false);

    const foreignHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-foreign-lock-'));
    const foreignSkills = path.join(foreignHome, 'skills');
    const foreignLock = path.join(foreignSkills, '.arkgate-install.lock');
    const catalog = path.join(foreignSkills, HOME_SKILL_CATALOG);
    const foreignToken = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const originalRename = fs.renameSync;
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      if (target === catalog) {
        fs.writeFileSync(
          foreignLock,
          `${JSON.stringify({
            token: foreignToken,
            pid: process.pid,
            createdAtMs: Date.now(),
          })}\n`
        );
      }
      return originalRename(source, target);
    });
    try {
      const installed = installCatalog(foreignHome, '2.0.0', {});
      expect(installed.at(-1)).toMatchObject({ status: 'written' });
    } finally {
      rename.mockRestore();
    }
    expect(JSON.parse(fs.readFileSync(foreignLock, 'utf8')).token).toBe(foreignToken);
  });

  it('safely recovers malformed lock bytes only after they are stale', () => {
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-malformed-stale-lock-'));
    const skillsDir = path.join(codexHome, 'skills');
    fs.mkdirSync(skillsDir);
    const lock = path.join(skillsDir, '.arkgate-install.lock');
    fs.writeFileSync(lock, 'partial crash bytes\n');
    const oldTime = new Date(Date.now() - 10 * 60 * 1000);
    fs.utimesSync(lock, oldTime, oldTime);
    const result = installCatalog(codexHome, '2.0.0', { 'ark-test': 'body' });
    expect(result.some((entry) => entry.status === 'failed')).toBe(false);
    expect(fs.existsSync(lock)).toBe(false);
  });

  it('treats a newer shared catalog as authoritative for older-repo diagnostics', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-newer-parity-repo-'));
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-newer-parity-home-'));
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# consumer\n');
    fs.mkdirSync(path.join(root, '.codex'));
    const skillsDir = path.join(codexHome, 'skills');
    fs.mkdirSync(skillsDir);
    fs.writeFileSync(
      path.join(skillsDir, HOME_SKILL_CATALOG),
      `${JSON.stringify({
        schemaVersion: '1.0',
        packageVersion: '99.0.0',
        skills: [],
      })}\n`
    );
    const previous = process.env.CODEX_HOME;
    process.env.CODEX_HOME = codexHome;
    try {
      const parity = assessCodexSkillParity(root);
      expect(parity?.home).toMatchObject({
        inPlay: true,
        catalogVersion: '99.0.0',
        catalogNewerThanPackage: true,
      });
      expect(parity?.homeNeedsAttention).toBe(false);
      expect(detectCodexHomeGap(root)).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previous;
    }
  });

  it('uses a valid interrupted journal as the diagnostic floor for an older repo', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-pending-parity-old-repo-'));
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-pending-parity-home-'));
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# consumer\n');
    fs.mkdirSync(path.join(root, '.codex'));
    const skillsDir = path.join(codexHome, 'skills');
    fs.mkdirSync(skillsDir);
    fs.writeFileSync(
      path.join(skillsDir, HOME_SKILL_CATALOG),
      `${JSON.stringify({
        schemaVersion: '1.0',
        packageVersion: '1.0.0',
        skills: [],
      })}\n`
    );
    fs.writeFileSync(
      path.join(skillsDir, HOME_SKILL_PENDING_CATALOG),
      `${JSON.stringify({
        schemaVersion: '1.0',
        packageVersion: '99.0.0',
        token: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      })}\n`
    );
    const previous = process.env.CODEX_HOME;
    process.env.CODEX_HOME = codexHome;
    try {
      const parity = assessCodexSkillParity(root);
      expect(parity?.home).toMatchObject({
        inPlay: true,
        catalogVersion: '99.0.0',
        pendingCatalogVersion: '99.0.0',
        catalogNewerThanPackage: true,
        pendingRecoveryRequired: false,
      });
      expect(parity?.homeNeedsAttention).toBe(false);
      expect(detectCodexHomeGap(root)).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previous;
    }
  });

  it('keeps a same-package pending journal actionable for recovery', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-pending-parity-same-repo-'));
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-pending-parity-same-home-'));
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# consumer\n');
    fs.mkdirSync(path.join(root, '.codex'));
    const skillsDir = path.join(codexHome, 'skills');
    fs.mkdirSync(skillsDir);
    fs.writeFileSync(
      path.join(skillsDir, HOME_SKILL_CATALOG),
      `${JSON.stringify({
        schemaVersion: '1.0',
        packageVersion: '1.0.0',
        skills: [],
      })}\n`
    );
    fs.writeFileSync(
      path.join(skillsDir, HOME_SKILL_PENDING_CATALOG),
      `${JSON.stringify({
        schemaVersion: '1.0',
        packageVersion: PACKAGE_VERSION,
        token: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      })}\n`
    );
    for (const [name, body] of skillTemplates()) {
      const file = path.join(skillsDir, name, 'SKILL.md');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, stampSkill(body, PACKAGE_VERSION));
    }
    const previous = process.env.CODEX_HOME;
    process.env.CODEX_HOME = codexHome;
    try {
      const parity = assessCodexSkillParity(root);
      expect(parity?.home).toMatchObject({
        inPlay: true,
        catalogVersion: PACKAGE_VERSION,
        pendingCatalogVersion: PACKAGE_VERSION,
        catalogNewerThanPackage: false,
        pendingRecoveryRequired: true,
        missing: 0,
        stale: 0,
      });
      expect(parity?.homeNeedsAttention).toBe(true);
      expect(detectCodexHomeGap(root)).toMatchObject({
        pendingRecoveryRequired: true,
        catalogStateReason: 'interrupted catalog commit',
      });
    } finally {
      if (previous === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previous;
    }
  });

  it('does not use a corrupt pending journal to suppress home attention', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-pending-parity-corrupt-repo-'));
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-pending-parity-corrupt-home-'));
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# consumer\n');
    fs.mkdirSync(path.join(root, '.codex'));
    const skillsDir = path.join(codexHome, 'skills');
    fs.mkdirSync(skillsDir);
    fs.writeFileSync(
      path.join(skillsDir, HOME_SKILL_CATALOG),
      `${JSON.stringify({
        schemaVersion: '1.0',
        packageVersion: '1.0.0',
        skills: [],
      })}\n`
    );
    fs.writeFileSync(
      path.join(skillsDir, HOME_SKILL_PENDING_CATALOG),
      '{"schemaVersion":"1.0","packageVersion":"99.0.0","token":"corrupt"}\n'
    );
    const previous = process.env.CODEX_HOME;
    process.env.CODEX_HOME = codexHome;
    try {
      const parity = assessCodexSkillParity(root);
      expect(parity?.home).toMatchObject({
        inPlay: true,
        catalogVersion: '1.0.0',
        pendingCatalogVersion: null,
        catalogNewerThanPackage: false,
        catalogMetadataInvalid: true,
      });
      expect(parity?.homeNeedsAttention).toBe(true);
      expect(detectCodexHomeGap(root)).toMatchObject({
        catalogMetadataInvalid: true,
        catalogStateReason: 'invalid catalog metadata',
      });
    } finally {
      if (previous === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previous;
    }
  });

  it('keeps all host gaps in inventory but only prints actions for the active host', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-active-host-gaps-'));
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# consumer\n');
    fs.mkdirSync(path.join(root, '.codex'));
    fs.mkdirSync(path.join(root, '.grok'));
    const templates = skillTemplates();
    for (const [name, body] of templates) {
      const file = repoSkill(root, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, stampSkill(body, PACKAGE_VERSION));
    }
    const gaps = detectSkillGaps(root);
    expect(gaps.some((gap) => gap.tool === 'grok' && gap.missing > 0)).toBe(true);
    expect(
      skillGapsForActiveHost(gaps, { ARK_ACTIVE_HOST: 'codex' } as NodeJS.ProcessEnv)
    ).toEqual([]);

    const lines: string[] = [];
    const prior = console.log;
    console.log = (...parts: unknown[]) => lines.push(parts.map(String).join(' '));
    try {
      printSkillAndCodexGapHints(root, {
        skillGaps: gaps,
        codexHomeGap: null,
        codexRepoSkillGap: null,
        codexSessionActive: true,
        env: { ARK_ACTIVE_HOST: 'codex' },
        color: { dim: (text: string) => text, yellow: (text: string) => text },
      });
    } finally {
      console.log = prior;
    }
    expect(lines.join('\n')).not.toMatch(/grok|install-agent-gates/i);
  });
});
