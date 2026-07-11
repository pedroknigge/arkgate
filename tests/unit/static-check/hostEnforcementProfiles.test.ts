import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARK_CHECK = path.join(REPO, 'bin', 'ark-check.mjs');
const ARK = path.join(REPO, 'bin', 'ark.mjs');
const HOSTS = ['claude', 'grok', 'cursor', 'codex'] as const;

type Host = (typeof HOSTS)[number];

function mk(prefix = 'ark-host-profile-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function envFor(root: string, host: Host): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ARK_ACTIVE_HOST: host,
    CODEX_HOME: path.join(root, '.codex-home'),
  };
}

function run(
  file: string,
  args: string[],
  root: string,
  host: Host
): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [file, ...args], {
    cwd: root,
    env: envFor(root, host),
    encoding: 'utf8',
  });
}

function createFixture(): string {
  const root = mk();
  const version = JSON.parse(
    fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')
  ).version;
  fs.writeFileSync(
    path.join(root, 'package.json'),
    `${JSON.stringify({
      name: 'host-profile-fixture',
      private: true,
      devDependencies: { arkgate: `^${version}` },
    }, null, 2)}\n`
  );
  fs.mkdirSync(path.join(root, 'src', 'domain'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'domain', 'value.ts'), 'export const value = 1;\n');
  const init = run(ARK_CHECK, ['--root', root, '--init'], root, 'claude');
  expect(init.status, init.stderr).toBe(0);
  return root;
}

function install(root: string, tools: string, host: Host, requireHard = false) {
  const args = ['--root', root, '--install-agent-gates', '--tools', tools];
  if (requireHard) args.push('--require-write-hook', host);
  return run(ARK_CHECK, args, root, host);
}

function generatedMergeArgs(root: string): string[] {
  const workflow = fs.readFileSync(
    path.join(root, '.github', 'workflows', 'ark-check.yml'),
    'utf8'
  );
  const command = workflow
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('run:') && /\bark-check\b/.test(line));
  expect(command).toBeDefined();
  const tail = command!.slice(command!.indexOf('ark-check') + 'ark-check'.length).trim();
  return tail.split(/\s+/).filter(Boolean);
}

function doctor(root: string, host: Host) {
  const result = run(
    ARK_CHECK,
    ['--root', root, '--config', 'ark.config.json', '--doctor', '--json', '--no-cache'],
    root,
    host
  );
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(String(result.stdout)).doctor.writePath;
}

function snapshotTree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else {
        out[path.relative(root, absolute).split(path.sep).join('/')] =
          fs.readFileSync(absolute, 'utf8');
      }
    }
  };
  visit(root);
  return out;
}

describe('host-specific enforcement profiles', () => {
  it.each(HOSTS)('%s-only install emits a green CI check and a truthful write verdict', (host) => {
    const root = createFixture();
    try {
      const hardHost = host === 'claude' || host === 'grok';
      const first = install(root, host, host, hardHost);
      expect(first.status, first.stderr).toBe(0);
      if (hardHost) {
        expect(first.stdout).toContain(`Hard-write hook verified for ${host}`);
      }

      const mergeArgs = generatedMergeArgs(root);
      expect(mergeArgs).toContain('--strict-merge');
      expect(mergeArgs).not.toContain('--require-write-hook');
      const merge = run(ARK_CHECK, mergeArgs, root, host);
      expect(merge.status, `${merge.stdout}\n${merge.stderr}`).toBe(0);

      const writePath = doctor(root, host);
      expect(writePath.capabilities['merge-gate']).toBe(true);
      expect(writePath.capabilities['advisory-write']).toBe(true);
      expect(writePath.capabilities['hard-write']).toBe(hardHost);
      expect(writePath.capabilities['repair-payload']).toBe(hardHost);
      if (!hardHost) {
        expect(writePath.gap.fix).toContain(`--tools ${host}`);
        expect(writePath.gap.fix).not.toMatch(/--tools (claude|grok)/);
      }

      const hard = run(
        ARK_CHECK,
        [
          '--root',
          root,
          '--config',
          'ark.config.json',
          '--strict-merge',
          '--require-write-hook',
          host,
          '--json',
        ],
        root,
        host
      );
      if (hardHost) {
        expect(hard.status, `${hard.stdout}\n${hard.stderr}`).toBe(0);
      } else {
        expect(hard.status).toBe(2);
        expect(`${hard.stdout}\n${hard.stderr}`).toMatch(
          /advisory-write.*shared CI check/i
        );
      }

      const before = snapshotTree(root);
      const second = install(root, host, host, hardHost);
      expect(second.status, second.stderr).toBe(0);
      expect(snapshotTree(root)).toEqual(before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps every host verdict separate after a mixed install', () => {
    const root = createFixture();
    try {
      const result = install(root, HOSTS.join(','), 'codex');
      expect(result.status, result.stderr).toBe(0);

      expect(
        Object.fromEntries(
          HOSTS.map((host) => {
            const capabilities = doctor(root, host).capabilities;
            return [
              host,
              {
                hardWrite: capabilities['hard-write'],
                advisoryWrite: capabilities['advisory-write'],
                mergeGate: capabilities['merge-gate'],
                repairPayload: capabilities['repair-payload'],
              },
            ];
          })
        )
      ).toEqual({
        claude: {
          hardWrite: true,
          advisoryWrite: true,
          mergeGate: true,
          repairPayload: true,
        },
        grok: {
          hardWrite: true,
          advisoryWrite: true,
          mergeGate: true,
          repairPayload: true,
        },
        cursor: {
          hardWrite: false,
          advisoryWrite: true,
          mergeGate: true,
          repairPayload: false,
        },
        codex: {
          hardWrite: false,
          advisoryWrite: true,
          mergeGate: true,
          repairPayload: false,
        },
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('start rejects an impossible hard-write request before touching the project', () => {
    const root = mk('ark-start-preflight-');
    try {
      const result = run(
        ARK,
        [
          'start',
          '--root',
          root,
          '--yes',
          '--no-install',
          '--tools',
          'codex',
          '--require-write-hook',
          'codex',
        ],
        root,
        'codex'
      );
      expect(result.status).toBe(2);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(
        /codex.*advisory-write.*shared CI check/i
      );
      expect(fs.readdirSync(root)).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('start rejects a hard-write host missing from --tools before touching the project', () => {
    const root = mk('ark-start-host-mismatch-');
    try {
      const result = run(
        ARK,
        [
          'start',
          '--root',
          root,
          '--yes',
          '--no-install',
          '--tools',
          'cursor',
          '--require-write-hook',
          'claude',
        ],
        root,
        'cursor'
      );
      expect(result.status).toBe(2);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        '--tools to include claude'
      );
      expect(fs.readdirSync(root)).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('start rejects an incompatible preserved hook before writing any other file', () => {
    const root = mk('ark-start-hook-conflict-');
    try {
      fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.claude', 'settings.json'),
        '{"hooks":{"PreToolUse":[]}}\n'
      );
      const before = snapshotTree(root);
      const result = run(
        ARK,
        [
          'start',
          '--root',
          root,
          '--yes',
          '--no-install',
          '--tools',
          'claude',
          '--require-write-hook',
          'claude',
        ],
        root,
        'claude'
      );
      expect(result.status).toBe(2);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(
        /\.claude\/settings\.json.*without an Ark hard-write hook.*--force/i
      );
      expect(snapshotTree(root)).toEqual(before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('start installs and verifies a supported hard-write profile', () => {
    const root = mk('ark-start-hard-profile-');
    try {
      const result = run(
        ARK,
        [
          'start',
          '--root',
          root,
          '--yes',
          '--no-install',
          '--tools',
          'claude',
          '--require-write-hook',
          'claude',
        ],
        root,
        'claude'
      );
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(result.stdout).toContain('Hard-write hook verified for claude');
      expect(doctor(root, 'claude').capabilities).toMatchObject({
        'hard-write': true,
        'merge-gate': true,
        'repair-payload': true,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
