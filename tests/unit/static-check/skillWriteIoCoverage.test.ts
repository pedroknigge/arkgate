import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  HOME_SKILL_CATALOG,
  HOME_SKILL_PENDING_CATALOG,
  installRepoSkillFile,
  installSkillCatalog,
} from '../../../bin/lib/skill-write.mjs';

const temporaryRoots = new Set<string>();

function temporaryRoot(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryRoots.add(root);
  return root;
}

function skill(name: string, version: string, body = 'managed body') {
  return `---\nname: ${name}\narkVersion: ${version}\n---\n${body}\n`;
}

function installHome(
  home: string,
  version: string,
  entries: Array<[string, string]>,
  force = true
) {
  return installSkillCatalog({
    directory: path.join(home, 'skills'),
    skills: entries,
    packageVersion: version,
    force,
    scope: 'home',
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of temporaryRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  temporaryRoots.clear();
});

describe('managed skill IO failure boundaries', () => {
  it('writes a repo catalog through a directory link without confusing its root', () => {
    const base = temporaryRoot('ark-skill-linked-root-');
    const real = path.join(base, 'real');
    const linked = path.join(base, 'linked');
    fs.mkdirSync(real);
    fs.symlinkSync(real, linked, process.platform === 'win32' ? 'junction' : 'dir');

    const results = installSkillCatalog({
      directory: linked,
      skills: [
        ['ark-one', skill('ark-one', '2.0.0', 'one')],
        ['ark-two', skill('ark-two', '2.0.0', 'two')],
      ],
      packageVersion: '2.0.0',
      force: true,
      scope: 'repo',
    });

    expect(results).toEqual([
      expect.objectContaining({ displayPath: 'ark-one/SKILL.md', status: 'written' }),
      expect.objectContaining({ displayPath: 'ark-two/SKILL.md', status: 'written' }),
    ]);
    expect(fs.readFileSync(path.join(real, 'ark-one', 'SKILL.md'), 'utf8')).toContain(
      'one'
    );
    expect(fs.readFileSync(path.join(real, 'ark-two', 'SKILL.md'), 'utf8')).toContain(
      'two'
    );
  });

  it('fails closed when an existing skill changes during its safe read', () => {
    const root = temporaryRoot('ark-skill-read-race-');
    const relative = path.join('.agents', 'skills', 'ark-test', 'SKILL.md');
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'operator bytes\n');

    const originalRead = fs.readFileSync;
    let changed = false;
    vi.spyOn(fs, 'readFileSync').mockImplementation(
      ((input: fs.PathOrFileDescriptor, options?: unknown) => {
        const content = originalRead(input, options as never);
        if (!changed && typeof input !== 'number' && path.resolve(String(input)) === file) {
          changed = true;
          fs.appendFileSync(file, 'concurrent bytes\n');
        }
        return content;
      }) as typeof fs.readFileSync
    );

    expect(
      installRepoSkillFile(root, relative, skill('ark-test', '2.0.0'), '2.0.0', true)
    ).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('changed while it was being read'),
    });
    expect(fs.readFileSync(file, 'utf8')).toContain('concurrent bytes');
  });

  it('preserves a concurrent replacement and removes its abandoned staging file', () => {
    const root = temporaryRoot('ark-skill-write-race-');
    const relative = path.join('.agents', 'skills', 'ark-test', 'SKILL.md');
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'old bytes\n');

    const originalOpen = fs.openSync;
    let injected = false;
    vi.spyOn(fs, 'openSync').mockImplementation(
      ((input: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
        if (
          !injected &&
          typeof input !== 'number' &&
          String(input).includes('.SKILL.md.arkgate-') &&
          flags === 'wx'
        ) {
          injected = true;
          fs.writeFileSync(file, 'foreign replacement\n');
        }
        return originalOpen(input, flags, mode);
      }) as typeof fs.openSync
    );

    expect(
      installRepoSkillFile(root, relative, skill('ark-test', '2.0.0'), '2.0.0', true)
    ).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('changed concurrently during write'),
    });
    expect(fs.readFileSync(file, 'utf8')).toBe('foreign replacement\n');
    expect(fs.readdirSync(path.dirname(file)).some((name) => name.endsWith('.tmp'))).toBe(
      false
    );
  });

  it('rejects corrupt staging bytes without publishing a partial skill', () => {
    const root = temporaryRoot('ark-skill-stage-check-');
    const relative = path.join('.agents', 'skills', 'ark-test', 'SKILL.md');
    const file = path.join(root, relative);
    const target = skill('ark-test', '2.0.0');
    const originalOpen = fs.openSync;
    const originalWrite = fs.writeFileSync;
    let stagingDescriptor: number | null = null;

    vi.spyOn(fs, 'openSync').mockImplementation(
      ((input: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
        const descriptor = originalOpen(input, flags, mode);
        if (
          typeof input !== 'number' &&
          String(input).includes('.SKILL.md.arkgate-') &&
          flags === 'wx'
        ) {
          stagingDescriptor = descriptor;
        }
        return descriptor;
      }) as typeof fs.openSync
    );
    vi.spyOn(fs, 'writeFileSync').mockImplementation(
      ((input: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView) => {
        if (typeof input === 'number' && input === stagingDescriptor) {
          return originalWrite(input, `${String(data)}corrupt staging\n`, 'utf8');
        }
        return originalWrite(input, data);
      }) as typeof fs.writeFileSync
    );

    expect(
      installRepoSkillFile(root, relative, target, '2.0.0', true)
    ).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('staging verification failed'),
    });
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.readdirSync(path.dirname(file)).some((name) => name.endsWith('.tmp'))).toBe(
      false
    );
  });

  it('removes a lock file when writing its ownership metadata fails', () => {
    const home = temporaryRoot('ark-skill-lock-write-');
    const lock = path.join(home, 'skills', '.arkgate-install.lock');
    const originalOpen = fs.openSync;
    const originalWrite = fs.writeFileSync;
    let lockDescriptor: number | null = null;

    vi.spyOn(fs, 'openSync').mockImplementation(
      ((input: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
        const descriptor = originalOpen(input, flags, mode);
        if (typeof input !== 'number' && path.resolve(String(input)) === lock) {
          lockDescriptor = descriptor;
        }
        return descriptor;
      }) as typeof fs.openSync
    );
    vi.spyOn(fs, 'writeFileSync').mockImplementation(
      ((input: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView) => {
        if (typeof input === 'number' && input === lockDescriptor) {
          throw Object.assign(new Error('simulated lock metadata failure'), {
            code: 'EIO',
          });
        }
        return originalWrite(input, data);
      }) as typeof fs.writeFileSync
    );

    expect(installHome(home, '2.0.0', [])[0]).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('simulated lock metadata failure'),
    });
    expect(fs.existsSync(lock)).toBe(false);
  });

  it('preserves a foreign journal that replaces the installer-owned pending token', () => {
    const home = temporaryRoot('ark-skill-journal-owner-');
    const first = skill('ark-current', '1.0.0', 'old');
    expect(installHome(home, '1.0.0', [['ark-current', first]])).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'failed' })])
    );

    const skills = path.join(home, 'skills');
    const catalog = path.join(skills, HOME_SKILL_CATALOG);
    const pending = path.join(skills, HOME_SKILL_PENDING_CATALOG);
    const foreignToken = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const originalRename = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      if (path.resolve(String(target)) === catalog) {
        const journal = JSON.parse(fs.readFileSync(pending, 'utf8'));
        fs.writeFileSync(
          pending,
          `${JSON.stringify({ ...journal, token: foreignToken }, null, 2)}\n`
        );
      }
      return originalRename(source, target);
    });

    const result = installHome(home, '2.0.0', [
      ['ark-current', skill('ark-current', '2.0.0', 'new')],
    ]);
    expect(result.at(-1)).toMatchObject({
      displayPath: HOME_SKILL_PENDING_CATALOG,
      status: 'failed',
      message: expect.stringContaining('journal changed'),
    });
    expect(JSON.parse(fs.readFileSync(catalog, 'utf8')).packageVersion).toBe('2.0.0');
    expect(JSON.parse(fs.readFileSync(pending, 'utf8')).token).toBe(foreignToken);
  });

  it('does not advance the catalog when an owned retirement cannot be removed', () => {
    const home = temporaryRoot('ark-skill-retire-fail-');
    installHome(home, '1.0.0', [
      ['ark-current', skill('ark-current', '1.0.0', 'current')],
      ['ark-retired', skill('ark-retired', '1.0.0', 'retired')],
    ]);
    const retired = path.join(home, 'skills', 'ark-retired', 'SKILL.md');
    const catalog = path.join(home, 'skills', HOME_SKILL_CATALOG);
    const originalUnlink = fs.unlinkSync;
    vi.spyOn(fs, 'unlinkSync').mockImplementation((input) => {
      if (path.resolve(String(input)) === retired) {
        throw Object.assign(new Error('simulated retirement permission failure'), {
          code: 'EACCES',
        });
      }
      return originalUnlink(input);
    });

    const result = installHome(home, '2.0.0', [
      ['ark-current', skill('ark-current', '2.0.0', 'current')],
    ]);
    expect(
      result.find((entry) => entry.displayPath === 'ark-retired/SKILL.md')
    ).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('simulated retirement permission failure'),
    });
    expect(fs.existsSync(retired)).toBe(true);
    expect(JSON.parse(fs.readFileSync(catalog, 'utf8')).packageVersion).toBe('1.0.0');
  });
});
